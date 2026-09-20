// Файловый канал. Вход агента — каталог назначения: проекция/ (только чтение) и повод.md.
// Выход — файлы в out/: офис забирает их, когда агент завершился, и превращает в вызовы Reception.accept.
// Это транспорт, а не ядро: MCP-сервер заменит collect/settle, зовя тот же accept напрямую.

import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentKey, ArtifactId, Fields } from '@agent-office/shared'
import { parse } from 'yaml'
import type { AgentChannel, Said, Workplaces } from '../core/ports.ts'
import type { Accepted, AgentCall } from '../core/primitives.ts'

// Порядок приёма: сначала знание, потом исход; вопрос — последним (после результата он уже не нужен).
const ORDER = ['артефакт', 'флаг', 'результат', 'дотянуть', 'вопрос']

function byOrderOfAcceptance(a: string, b: string): number {
    const rank = (name: string) => {
        const i = ORDER.findIndex((prefix) => name.startsWith(prefix))
        return i < 0 ? ORDER.length : i
    }
    return rank(a) - rank(b) || a.localeCompare(b)
}

const MEMO = `
---

## Как говорить с офисом

Ты живёшь один заход: поработал, опубликовал, завершился. Ждать ответа нельзя — ожидание живёт в офисе, тебя поднимут снова.
Каталог \`проекция/\` — только для чтения. Всё, что хочешь сказать миру, клади файлами в \`out/\` рядом с этим файлом.
Файл = шапка YAML между строками \`---\` + текст. Офис заберёт файлы, когда ты завершишься.

| Файл | Шапка | Текст |
|---|---|---|
| \`артефакт-<имя>.md\` | \`kind\`, \`audience: [роль, …]\` или \`['*']\`; остальное — на твоё усмотрение | тело артефакта |
| \`результат.md\` | \`outcome\`; необязательно \`fields: {поле: значение}\` — офис допишет их узлу | пояснение |
| \`вопрос.md\` | \`options: [...]\`, \`default\` (из options), необязательно \`deadline: 4h\` | вопрос человеку |
| \`флаг-<имя>.md\` | — | что не так |
| \`дотянуть.md\` | \`artifacts: [a-3, …]\` из \`проекция/артефакты/не-вложено.md\` | — |

Состояние узла ты не двигаешь и узлы не создаёшь — это делает офис по твоим публикациям.
Без \`результат.md\`, \`вопрос.md\` или \`дотянуть.md\` заход считается потерянным, и тебя поднимут заново.
`

export class FilesChannel implements AgentChannel, Workplaces {
    private root: string
    constructor(root: string) {
        this.root = root
    }

    place(key: AgentKey): string {
        return join(this.root, key)
    }

    async prepare(key: AgentKey, files: Record<string, string>, reason: string): Promise<string> {
        const place = this.place(key)
        const projection = join(place, 'проекция')
        await unlock(projection)
        await rm(projection, { recursive: true, force: true })
        for (const [path, text] of Object.entries(files)) {
            await mkdir(dirname(join(projection, path)), { recursive: true })
            await writeFile(join(projection, path), text)
        }
        await lock(projection)
        await mkdir(join(place, 'out'), { recursive: true })
        await writeFile(join(place, 'повод.md'), `# Почему тебя подняли\n\n${reason}\n${MEMO}`)
        return place
    }

    async collect(key: AgentKey): Promise<Said[]> {
        const out = join(this.place(key), 'out')
        const entries = await readdir(out, { withFileTypes: true }).catch(() => [])
        const names = entries.filter((e) => e.isFile()).map((e) => e.name).sort(byOrderOfAcceptance)

        return Promise.all(names.map(async (source): Promise<Said> => {
            try {
                return { source, call: toCall(source, await readFile(join(out, source), 'utf8')) }
            } catch (e) {
                return { source, error: (e as Error).message }
            }
        }))
    }

    async settle(key: AgentKey, source: string, accepted: Accepted): Promise<void> {
        const out = join(this.place(key), 'out')
        const dir = join(out, accepted.ok ? 'принято' : 'отклонено')
        await mkdir(dir, { recursive: true })
        await rename(join(out, source), join(dir, `${Date.now()}-${source}`))
    }
}

/** Файл из out/ → примитив. Вид примитива — по началу имени файла; шапка YAML — его параметры, текст — тело. */
function toCall(name: string, text: string): AgentCall {
    const { head, body } = splitHead(text)
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)])
    const string = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

    if (name.startsWith('артефакт')) {
        const { kind, audience, ...meta } = head
        return { call: 'publish', kind: string(kind), audience: strings(audience), body, meta }
    }
    if (name.startsWith('результат')) {
        return { call: 'result', outcome: string(head['outcome']), note: body, fields: head['fields'] as Fields | undefined }
    }
    if (name.startsWith('вопрос')) {
        return {
            call: 'ask',
            question: body || string(head['question']),
            options: strings(head['options']),
            default: string(head['default']),
            deadline: head['deadline'] === undefined ? undefined : string(head['deadline']),
        }
    }
    if (name.startsWith('флаг')) {
        return { call: 'flag', text: body }
    }
    if (name.startsWith('дотянуть')) {
        return { call: 'pull', artifacts: strings(head['artifacts']) as ArtifactId[] }
    }

    throw new Error(`не знаю, что такое «${name}»: жду артефакт-*.md, результат.md, вопрос.md, флаг-*.md, дотянуть.md`)
}

/** `---\nшапка YAML\n---\nтекст` → шапка и текст. Без шапки — всё текст. */
function splitHead(text: string): { head: Record<string, unknown>; body: string } {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
    if (!match) {
        return { head: {}, body: text.trim() }
    }
    return { head: (parse(match[1]!) ?? {}) as Record<string, unknown>, body: match[2]!.trim() }
}

// Проекция — только на чтение: снимаем право записи с файлов и каталогов.
async function lock(dir: string): Promise<void> {
    await walk(dir, 0o444, 0o555)
}
async function unlock(dir: string): Promise<void> {
    await walk(dir, 0o644, 0o755, true)
}

async function walk(dir: string, fileMode: number, dirMode: number, dirFirst = false): Promise<void> {
    if (dirFirst) {
        await chmod(dir, dirMode).catch(() => {})
    }
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.isDirectory()) {
            await walk(join(dir, e.name), fileMode, dirMode, dirFirst)
        } else {
            await chmod(join(dir, e.name), fileMode)
        }
    }
    if (!dirFirst) {
        await chmod(dir, dirMode).catch(() => {})
    }
}
