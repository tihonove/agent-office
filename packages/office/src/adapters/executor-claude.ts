// Живой агент: headless `claude -p` в корне проекта. Офис не знает про git и worktree — где и как работать с кодом,
// агенту говорит промпт роли (и сквозные args из манифеста). Каталог назначения подключается через --add-dir.

import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentKey } from '@agent-office/shared'
import type { Executor, Log, SpawnRequest } from '../core/ports.ts'

export class ClaudeExecutor implements Executor {
    private cwd: string     // корень проекта
    private places: string  // каталог назначений файлового канала: <places>/<роль>/<узел>
    private log: Log        // куда сказать, если писать транскрипт стало некуда
    constructor(opts: { cwd: string; places: string; log: Log }) {
        this.cwd = opts.cwd
        this.places = opts.places
        this.log = opts.log
    }

    async spawn(req: SpawnRequest): Promise<void> {
        const prompt = `${req.prompt}\n\n---\n\nТвоё назначение: \`${req.place}\`.\n` +
            `Сначала прочитай \`${req.place}/повод.md\` — там, почему тебя подняли именно сейчас и как говорить с офисом. ` +
            `Затем \`${req.place}/проекция/\`. Исходящие клади в \`${req.place}/out/\`.`
        // Продолжить можно только сессию, которая действительно есть у claude; иначе — начисто.
        const resume = req.resume && existsSync(this.sessionFile(req.session))
        const args = [
            '-p', prompt, '--output-format', 'stream-json', '--verbose', '--add-dir', req.place,
            ...(resume ? ['--resume', req.session] : ['--session-id', req.session]),
            ...(req.decl.model ? ['--model', req.decl.model] : []),
            ...(req.decl.args ?? []),
        ]
        const transcript = createWriteStream(join(req.place, 'транскрипт.jsonl'), { flags: 'a' })
        const child = spawn('claude', args, { cwd: this.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OFFICE_PLACE: req.place } })
        child.stdout.pipe(transcript, { end: false })
        child.stderr.pipe(transcript, { end: false })
        // Транскрипт — удобство человека, а не работа офиса: если писать стало некуда (кончилось место,
        // снесли каталог), офис не падает вместе с записью. Агент работает дальше, его вывод уходит в никуда.
        transcript.once('error', (e) => {
            child.stdout.unpipe(transcript)
            child.stderr.unpipe(transcript)
            child.stdout.resume()  // без слушателя вывод копится в трубе и агент встаёт на записи — сливаем
            child.stderr.resume()
            transcript.destroy()
            this.log.error(`${req.key}: транскрипт не пишется, агент работает без него`, e)
        })
        const say = (line: object) => {
            if (!transcript.destroyed) {
                transcript.write(JSON.stringify(line) + '\n')
            }
        }
        const pidFile = join(req.place, 'pid')
        child.on('error', (e) => say({ type: 'office', error: String(e) }))
        child.on('close', () => {
            if (!transcript.destroyed) {
                transcript.end()
            }
            void rm(pidFile, { force: true })
        })
        if (child.pid) {
            await writeFile(pidFile, String(child.pid))
        }
    }

    // pid-файлы переживают рестарт офиса: агент, поднятый прошлым процессом, остаётся наблюдаемым.
    async observe(): Promise<AgentKey[]> {
        const alive: AgentKey[] = []
        for (const role of await readdir(this.places).catch(() => [])) {
            for (const node of await readdir(join(this.places, role)).catch(() => [])) {
                const pid = Number(await readFile(join(this.places, role, node, 'pid'), 'utf8').catch(() => ''))
                if (pid && isAlive(pid)) {
                    alive.push(`${role}/${node}` as AgentKey)
                }
            }
        }
        return alive
    }

    private sessionFile(session: string): string {
        const config = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
        return join(config, 'projects', this.cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${session}.jsonl`)
    }
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}
