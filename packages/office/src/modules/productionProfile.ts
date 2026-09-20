import { join } from 'node:path'
import { systemClock } from '../adapters/clock.ts'
import { consoleLog } from '../adapters/log-console.ts'
import { ClockDIToken, LogDIToken } from '../core/ports.ts'
import type { Loaded } from '../manifest/load.ts'
import { Container } from '../platform/di/container.ts'
import { filesChannelModule } from './channelModule.ts'
import { executorsModule } from './executorsModule.ts'
import { heartbeatModule } from './heartbeatModule.ts'
import { httpModule } from './httpModule.ts'
import { manifestModule } from './manifestModule.ts'
import { officeModule } from './officeModule.ts'
import { storageModule } from './storageModule.ts'

export type ProductionProfileContext = {
    /** Прочитанный и проверенный манифест проекта. */
    loaded: Loaded
    /** Корень проекта. Всё состояние офиса — в `<проект>/.office/`. */
    project: string
    fake: boolean
    port: number
    tickMs: number
    /** Собранная дашборда, если есть. */
    dashboard?: string
}

/**
 * Боевой офис: журнал в файле, файловый канал, исполнители по манифесту, HTTP-дверь и сердцебиение.
 *
 *     <проект>/.office/journal.jsonl     журнал фактов
 *     <проект>/.office/назначения/…      каталоги назначений
 */
export function createProductionContainer(ctx: ProductionProfileContext): Container {
    const data = join(ctx.project, '.office')
    const places = join(data, 'назначения')

    return new Container()
        .bind(ClockDIToken, () => systemClock)
        .bind(LogDIToken, () => consoleLog)
        .use(manifestModule, ctx.loaded)
        .use(storageModule, { journalFile: join(data, 'journal.jsonl') })
        .use(filesChannelModule, { places })
        .use(executorsModule, { project: ctx.project, places, fake: ctx.fake })
        .use(officeModule)
        .use(httpModule, { port: ctx.port, staticDir: ctx.dashboard })
        .use(heartbeatModule, { everyMs: ctx.tickMs })
}
