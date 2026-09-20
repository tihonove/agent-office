import type { ContainerModule } from '../platform/di/container.ts'
import { AgentLauncher, AgentLauncherDIToken } from '../services/agentLauncher.ts'
import { HumanDesk, HumanDeskDIToken } from '../services/humanDesk.ts'
import { Journal, JournalDIToken } from '../services/journal.ts'
import { Reception, ReceptionDIToken } from '../services/reception.ts'
import { Reconciler, ReconcilerDIToken } from '../services/reconciler.ts'
import { SnapshotService, SnapshotServiceDIToken } from '../services/snapshotService.ts'

/**
 * Сам офис — сервисы вокруг чистого ядра. Внешний мир им нужен только через порты
 * (Store, Clock, AgentChannel, Executors), поэтому модуль один и тот же в production и в тестах.
 *
 *     Journal          журнал фактов, единственный источник правды
 *     Reception        приёмная примитивов агента — шов под MCP
 *     HumanDesk        команды человека
 *     AgentLauncher    подъём агентов и наблюдение за живыми
 *     Reconciler       тик сверки
 *     SnapshotService  снимок мира для дашборды
 */
export const officeModule: ContainerModule = (container) => {
    container
        .bind(JournalDIToken, Journal)
        .bind(ReceptionDIToken, Reception)
        .bind(HumanDeskDIToken, HumanDesk)
        .bind(AgentLauncherDIToken, AgentLauncher)
        .bind(ReconcilerDIToken, Reconciler)
        .bind(SnapshotServiceDIToken, SnapshotService)
}
