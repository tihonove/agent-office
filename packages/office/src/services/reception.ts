// Приёмная — единственная точка, через которую агент что-то говорит миру. Это шов под транспорт:
// сегодня сюда приносит файлы из out/ файловый канал, завтра — напрямую зовёт MCP-сервер.
// Само решение «принять или отклонить» — чистая функция core/accept.ts; здесь она встречается с журналом.

import type { AgentKey, Manifest } from '@agent-office/shared'
import { accept } from '../core/accept.ts'
import { ClockDIToken, type Clock } from '../core/ports.ts'
import type { Accepted, AgentCall } from '../core/primitives.ts'
import { ManifestDIToken } from '../manifest/tokens.ts'
import { token } from '../platform/di/container.ts'
import { Journal, JournalDIToken } from './journal.ts'

export class Reception {
    public static dependencies = [JournalDIToken, ManifestDIToken, ClockDIToken] as const

    private readonly journal: Journal
    private readonly manifest: Manifest
    private readonly clock: Clock

    public constructor(journal: Journal, manifest: Manifest, clock: Clock) {
        this.journal = journal
        this.manifest = manifest
        this.clock = clock
    }

    /** Принять примитив агента: последствия станут фактами, отказ — тоже факт (`call.rejected`). */
    public async accept(key: AgentKey, call: AgentCall): Promise<Accepted> {
        const { facts, result } = accept(this.journal.world(), this.manifest, key, call, this.clock.now())
        await this.journal.append(facts)
        return result
    }

    /** Сказанное агентом не удалось даже разобрать — например, файл в out/ с битой шапкой. */
    public async rejectUnreadable(key: AgentKey, source: string, reason: string): Promise<Accepted> {
        const assignment = this.journal.world().assignments.get(key)
        if (assignment) {
            const payload = { key, call: source, reason }
            await this.journal.append([{ type: 'call.rejected', actor: { kind: 'office' }, node: assignment.node, payload }])
        }
        return { ok: false, reason }
    }
}

export const ReceptionDIToken = token<Reception>('Reception')
