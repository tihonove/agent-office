// Собранная дашборда — откуда дверь берёт статику.
//
// Из исходников — каталог packages/dashboard/dist, файлы читаются на каждый запрос (пересобрал — обновил страницу).
// В пакете @tihonove/agent-office этого модуля нет: сборка (scripts/bundle.ts) подменяет его модулем с теми же
// экспортами, в котором файлы дашборды вшиты в бандл. Поэтому здесь не должно быть ничего, кроме loadDashboard.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'

/** Собранная дашборда: путь из URL (`/assets/index.js`) → содержимое файла, если такой есть. */
export type Dashboard = {
    file(pathname: string): Promise<Uint8Array | undefined>
}

/** Дашборда рядом с офисом, если собрана. */
export async function loadDashboard(): Promise<Dashboard | undefined> {
    const dir = join(import.meta.dirname, '../../../dashboard/dist')
    if (!existsSync(dir)) {
        return undefined
    }
    return {
        file: (pathname) => readFile(join(dir, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))).catch(() => undefined),
    }
}
