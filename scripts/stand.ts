#!/usr/bin/env node
// Стенд — живой офис из ветки реализатора, на котором человек принимает работу.
//
//   node scripts/stand.ts up <id узла> <путь к worktree> [--live]    поднять (или переподнять) стенд
//   node scripts/stand.ts down <id узла>                             остановить и убрать
//   node scripts/stand.ts list                                       какие стенды живы
//
// Стенд — это офис из кода worktree на свежей копии examples/toy, с собранной дашбордой, на своём порту
// (4800 + номер узла: n-7 → 4807). Исполнители — заглушки; `--live` поднимает живых агентов claude.
// Процесс отвязан от того, кто его запустил: штурман умирает, стенд остаётся.
//
// Офис про стенды ничего не знает: это инструмент роли «штурман-стенд» нашего собственного манифеста (office.yaml).

import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')
const STANDS = join(REPO, '.office', 'стенды')
const BASE_PORT = 4800

type Stand = { node: string; dir: string; port: number; url: string }

function standOf(node: string): Stand {
    const number = Number(/^n-(\d+)$/.exec(node)?.[1])
    if (!Number.isInteger(number)) {
        fail(`жду id узла вида n-7, получил «${node}»`)
    }
    const port = BASE_PORT + number
    return { node, dir: join(STANDS, node), port, url: `http://127.0.0.1:${port}` }
}

// ── up ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function up(node: string, worktreeArg: string, live: boolean): Promise<void> {
    const stand = standOf(node)
    const worktree = resolve(worktreeArg)
    if (!existsSync(join(worktree, 'packages/office/src/main.ts'))) {
        fail(`в ${worktree} нет офиса — это точно worktree реализатора?`)
    }

    down(node)

    step('зависимости')
    run('npm', ['install', '--no-audit', '--no-fund'], worktree)
    step('дашборда')
    run('npm', ['run', 'build', '-w', '@agent-office/dashboard'], worktree)

    step('демо-проект: свежая копия examples/toy')
    const project = join(stand.dir, 'project')
    mkdirSync(stand.dir, { recursive: true })
    cpSync(join(worktree, 'examples/toy'), project, { recursive: true })

    step(`офис из ветки на порту ${stand.port}`)
    const log = openSync(join(stand.dir, 'стенд.log'), 'a')
    const args = [join(worktree, 'packages/office/src/main.ts'), project, '--port', String(stand.port), ...(live ? [] : ['--fake'])]
    const child = spawn(process.execPath, args, { cwd: worktree, detached: true, stdio: ['ignore', log, log] })
    child.unref()
    writeFileSync(join(stand.dir, 'pid'), String(child.pid))

    if (!(await answers(stand.url, 30_000))) {
        const tail = readFileSync(join(stand.dir, 'стенд.log'), 'utf8').split('\n').slice(-30).join('\n')
        down(node)
        fail(`стенд не ответил за 30 секунд. Хвост лога:\n${tail}`)
    }
    console.log(`\nстенд ${node} поднят: ${stand.url}${live ? ' (живые агенты)' : ' (исполнители-заглушки)'}`)
}

async function answers(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const ok = await fetch(`${url}/api/snapshot`).then((res) => res.ok, () => false)
        if (ok) {
            return true
        }
        await new Promise((wake) => setTimeout(wake, 500))
    }
    return false
}

// ── down / list ─────────────────────────────────────────────────────────────────────────────────────────────

function down(node: string): void {
    const stand = standOf(node)
    const pid = pidOf(stand)
    if (pid && isAlive(pid)) {
        process.kill(pid)
        console.log(`стенд ${node} остановлен`)
    }
    if (existsSync(stand.dir)) {
        unlock(stand.dir)
        rmSync(stand.dir, { recursive: true, force: true })
    }
}

function list(): void {
    const nodes = existsSync(STANDS) ? readdirSync(STANDS) : []
    for (const node of nodes) {
        const stand = standOf(node)
        const pid = pidOf(stand)
        console.log(`${node}  ${stand.url}  ${pid && isAlive(pid) ? 'жив' : 'мёртв'}`)
    }
    if (nodes.length === 0) {
        console.log('стендов нет')
    }
}

const pidOf = (stand: Stand): number | undefined => {
    const file = join(stand.dir, 'pid')
    return existsSync(file) ? Number(readFileSync(file, 'utf8')) : undefined
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

/** Проекции агентов защищены от записи — перед удалением стенда права надо вернуть. */
function unlock(dir: string): void {
    chmodSync(dir, 0o755)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            unlock(join(dir, entry.name))
        } else {
            chmodSync(join(dir, entry.name), 0o644)
        }
    }
}

// ── мелочи ──────────────────────────────────────────────────────────────────────────────────────────────────

function step(what: string): void {
    console.log(`· ${what}`)
}

function run(command: string, args: string[], cwd: string): void {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) {
        fail(`${command} ${args.join(' ')} упал:\n${(result.stdout + result.stderr).split('\n').slice(-30).join('\n')}`)
    }
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

// ── вход ────────────────────────────────────────────────────────────────────────────────────────────────────

const [command, node, worktree, ...flags] = process.argv.slice(2)

if (command === 'up' && node && worktree) {
    await up(node, worktree, flags.includes('--live'))
} else if (command === 'down' && node) {
    down(node)
} else if (command === 'list') {
    list()
} else {
    fail('node scripts/stand.ts up <id узла> <worktree> [--live] | down <id узла> | list')
}
