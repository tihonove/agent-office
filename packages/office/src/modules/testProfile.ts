import type { ExecutorName } from '@agent-office/shared'
import { ManualClock } from '../adapters/clock.ts'
import { silentLog } from '../adapters/log-console.ts'
import { ClockDIToken, ExecutorsDIToken, LogDIToken, type Executor } from '../core/ports.ts'
import type { Loaded } from '../manifest/load.ts'
import { Container } from '../platform/di/container.ts'
import { filesChannelModule } from './channelModule.ts'
import { manifestModule } from './manifestModule.ts'
import { officeModule } from './officeModule.ts'
import { storageModuleInMemory } from './storageModule.ts'

export type TestProfileContext = {
    loaded: Loaded
    /** Временный каталог под назначения: файловый канал в тестах настоящий. */
    places: string
    /** Ручные часы: тест сам двигает время, и дедлайны протухают мгновенно. */
    clock: ManualClock
    /** Исполнители-заглушки — тест держит их в руках, чтобы видеть, кого и с чем поднимали. */
    executors: Record<ExecutorName, Executor>
}

/**
 * Офис для сценариев петли: тот же `officeModule`, что в бою, но журнал в памяти, время ручное,
 * агенты — заглушки. Ни HTTP, ни сердцебиения: тест тикает сам.
 */
export function createTestContainer(ctx: TestProfileContext): Container {
    return new Container()
        .bind(ClockDIToken, () => ctx.clock)
        .bind(LogDIToken, () => silentLog)
        .bind(ExecutorsDIToken, () => ctx.executors)
        .use(manifestModule, ctx.loaded)
        .use(storageModuleInMemory)
        .use(filesChannelModule, { places: ctx.places })
        .use(officeModule)
}
