#!/usr/bin/env node
// Бандл пакета @tihonove/agent-office — офис, который ставится из npm и не тянет ни одной зависимости.
//
//   npm run bundle    → dist/agent-office.js
//
// Один js-файл: офис со всеми зависимостями, схемой манифеста и собранной дашбордой внутри.
// Рядом — та же схема отдельным файлом: на неё ссылается `$schema` в office.yaml чужого проекта (docs/manifest.md).
// Дашборду вшивает подмена модуля adapters/dashboard.ts: из исходников он читает packages/dashboard/dist с диска,
// в бандле — отдаёт файлы из памяти. Остальной офис разницы не видит.
//
// Публикуется корень репозитория: его package.json называет этот файл в bin и files, а хук prepack зовёт
// этот скрипт. Поэтому `npm publish` (и `npm pack`) сами собирают свежий бандл; внутренние workspaces
// (@agent-office/*) остаются приватными.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { build, type Plugin } from 'esbuild'

const REPO = resolve(import.meta.dirname, '..')
const OUT = join(REPO, 'dist')
const OFFICE = join(REPO, 'packages/office')
const DASHBOARD = join(REPO, 'packages/dashboard/dist')
const SCHEMA = join(REPO, 'packages/shared/manifest.schema.json')
const BIN = 'agent-office.js'

async function bundle(): Promise<void> {
    rmSync(OUT, { recursive: true, force: true })

    step('дашборда')
    run('npm', ['run', 'build', '-w', '@agent-office/dashboard'])

    step(`офис одним файлом: ${BIN}`)
    await build({
        entryPoints: [join(OFFICE, 'src/main.ts')],
        outfile: join(OUT, BIN),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        // CommonJS-зависимости (ajv) внутри ESM-бандла зовут require — дадим им настоящий.
        banner: { js: 'import { createRequire } from \'node:module\'; const require = createRequire(import.meta.url);' },
        plugins: [embedDashboard()],
        logLevel: 'warning',
    })

    step('схема манифеста: manifest.schema.json')
    copyFileSync(SCHEMA, join(OUT, 'manifest.schema.json'))

    console.log(`\nготово: ${join(OUT, BIN)}`)
}

/** Подменяет adapters/dashboard.ts модулем, в котором файлы собранной дашборды лежат прямо в коде. */
function embedDashboard(): Plugin {
    const original = join(OFFICE, 'src/adapters/dashboard.ts')
    return {
        name: 'embed-dashboard',
        setup(bundle) {
            bundle.onLoad({ filter: /[/\\]dashboard\.ts$/ }, ({ path }) => {
                if (path !== original) {
                    return undefined
                }
                const files = dashboardFiles()
                step(`вшиваю дашборду: ${Object.keys(files).length} файлов`)
                return { loader: 'js', contents: embeddedDashboard(files) }
            })
        },
    }
}

/** Путь из URL (`/assets/index.js`) → содержимое в base64. */
function dashboardFiles(): Record<string, string> {
    if (!existsSync(join(DASHBOARD, 'index.html'))) {
        fail(`в ${DASHBOARD} нет собранной дашборды`)
    }
    const files: Record<string, string> = {}
    for (const entry of readdirSync(DASHBOARD, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) {
            const file = join(entry.parentPath, entry.name)
            files[`/${relative(DASHBOARD, file).split(sep).join('/')}`] = readFileSync(file).toString('base64')
        }
    }
    return files
}

/** Тот же контракт, что у adapters/dashboard.ts: `loadDashboard()` → `{ file(pathname) }`. */
function embeddedDashboard(files: Record<string, string>): string {
    return [
        `const files = ${JSON.stringify(files)}`,
        'export async function loadDashboard() {',
        '    return { file: async (pathname) => Object.hasOwn(files, pathname) ? Buffer.from(files[pathname], \'base64\') : undefined }',
        '}',
    ].join('\n')
}

// ── мелочи ──────────────────────────────────────────────────────────────────────────────────────────────────

function step(what: string): void {
    console.log(`· ${what}`)
}

function run(command: string, args: string[], cwd = REPO): void {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) {
        fail(`${command} ${args.join(' ')} упал:\n${(result.stdout + result.stderr).split('\n').slice(-30).join('\n')}`)
    }
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

await bundle()
