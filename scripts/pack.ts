#!/usr/bin/env node
// Пакет @tihonove/agent-office — офис, который ставится из npm и не тянет ни одной зависимости.
//
//   npm run pack      → dist/tihonove-agent-office-<версия>.tgz
//
// В пакете один js-файл: офис со всеми зависимостями, схемой манифеста и собранной дашбордой внутри.
// Дашборду вшивает подмена модуля adapters/dashboard.ts: из исходников он читает packages/dashboard/dist с диска,
// в бандле — отдаёт файлы из памяти. Остальной офис разницы не видит.
//
// Внутренние workspaces (@agent-office/*) остаются приватными: публикуется только собранный результат.
// В реестр пакет кладёт человек (`npm publish dist/package`), этот скрипт наружу не ходит.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { build, type Plugin } from 'esbuild'

const REPO = resolve(import.meta.dirname, '..')
const OUT = join(REPO, 'dist')
const PACKAGE = join(OUT, 'package')
const OFFICE = join(REPO, 'packages/office')
const DASHBOARD = join(REPO, 'packages/dashboard/dist')
const BIN = 'agent-office.js'

async function pack(): Promise<void> {
    const { version } = JSON.parse(readFileSync(join(OFFICE, 'package.json'), 'utf8')) as { version: string }

    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(PACKAGE, { recursive: true })

    step('дашборда')
    run('npm', ['run', 'build', '-w', '@agent-office/dashboard'])

    step(`офис одним файлом: ${BIN}`)
    await build({
        entryPoints: [join(OFFICE, 'src/main.ts')],
        outfile: join(PACKAGE, BIN),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        // CommonJS-зависимости (ajv) внутри ESM-бандла зовут require — дадим им настоящий.
        banner: { js: 'import { createRequire } from \'node:module\'; const require = createRequire(import.meta.url);' },
        plugins: [embedDashboard()],
        logLevel: 'warning',
    })

    step('package.json и README')
    const manifest = {
        name: '@tihonove/agent-office',
        version,
        description: 'Офис агентов: проект объявляет манифест, офис его применяет поверх журнала фактов',
        type: 'module',
        bin: { 'agent-office': BIN },
        engines: { node: '>=24' },
    }
    writeFileSync(join(PACKAGE, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    copyFileSync(join(REPO, 'README.md'), join(PACKAGE, 'README.md'))
    for (const license of ['LICENSE', 'LICENSE.md']) {
        if (existsSync(join(REPO, license))) {
            copyFileSync(join(REPO, license), join(PACKAGE, license))
        }
    }

    step('tarball')
    run('npm', ['pack', '--pack-destination', OUT], PACKAGE)
    console.log(`\nготово: ${join(OUT, `tihonove-agent-office-${version}.tgz`)}`)
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

await pack()
