// Исполнитель-заглушка: «агент» — это функция, которая говорит, какие файлы оставить в out/. Поработал, опубликовал, умер —
// всё за один вызов spawn. Нужен тестам петли и прогону дашборды без моделей и без денег.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentKey } from '@agent-office/shared'
import type { Executor, SpawnRequest } from '../core/ports.ts'

// Что агент оставит в out/: имя файла → содержимое. 'hang' — остаться запущенным до release().
export type Script = (req: SpawnRequest) => Record<string, string> | 'hang' | Promise<Record<string, string> | 'hang'>

export class FakeExecutor implements Executor {
    private script: Script
    private hanging = new Set<AgentKey>()
    spawned: SpawnRequest[] = []

    constructor(script: Script) {
        this.script = script
    }

    async spawn(req: SpawnRequest): Promise<void> {
        this.spawned.push(req)
        const out = await this.script(req)
        if (out === 'hang') {
            this.hanging.add(req.key)
            return
        }
        await mkdir(join(req.place, 'out'), { recursive: true })
        for (const [name, text] of Object.entries(out)) {
            await writeFile(join(req.place, 'out', name), text)
        }
    }

    async observe(): Promise<AgentKey[]> {
        return [...this.hanging]
    }

    release(key: AgentKey): void {
        this.hanging.delete(key)
    }
}

// Заготовки из каталога: <dir>/<роль>/*.md копируются в out/ как есть.
export const scriptFromDir = (dir: string): Script => async (req) => {
    const from = join(dir, req.role)
    const out: Record<string, string> = {}
    for (const name of await readdir(from).catch(() => [])) {
        out[name] = await readFile(join(from, name), 'utf8')
    }
    return out
}
