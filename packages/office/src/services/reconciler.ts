// Сверка — единственное пробуждение офиса. Тик без памяти и идемпотентен: читает мир заново,
// сверяет желаемое с фактическим, записывает факты и выполняет эффекты.
// Что именно сверяется — чистые шаги core/reconcile.ts; здесь они встречаются с журналом, каналом и исполнителями.

import type { Manifest } from '@agent-office/shared'
import { AgentChannelDIToken, ClockDIToken, type AgentChannel, type Clock } from '../core/ports.ts'
import { steps } from '../core/reconcile.ts'
import { ManifestDIToken } from '../manifest/tokens.ts'
import { token } from '../platform/di/container.ts'
import { AgentLauncher, AgentLauncherDIToken } from './agentLauncher.ts'
import { Journal, JournalDIToken } from './journal.ts'
import { Reception, ReceptionDIToken } from './reception.ts'

export class Reconciler {
    public static dependencies = [
        JournalDIToken, ManifestDIToken, ClockDIToken, AgentChannelDIToken, ReceptionDIToken, AgentLauncherDIToken,
    ] as const

    private readonly journal: Journal
    private readonly manifest: Manifest
    private readonly clock: Clock
    private readonly channel: AgentChannel
    private readonly reception: Reception
    private readonly launcher: AgentLauncher
    private ticking?: Promise<void>

    public constructor(
        journal: Journal,
        manifest: Manifest,
        clock: Clock,
        channel: AgentChannel,
        reception: Reception,
        launcher: AgentLauncher,
    ) {
        this.journal = journal
        this.manifest = manifest
        this.clock = clock
        this.channel = channel
        this.reception = reception
        this.launcher = launcher
    }

    /** Тики не идут внахлёст: второй вызов присоединяется к идущему. Поэтому двух агентов на один ключ не бывает. */
    public tick(): Promise<void> {
        this.ticking ??= this.runTick().finally(() => {
            this.ticking = undefined
        })
        return this.ticking
    }

    private async runTick(): Promise<void> {
        const running = await this.launcher.running()

        await this.collectFromFinishedAgents(running)

        for (const [, step] of steps) {
            const situation = { world: this.journal.world(), manifest: this.manifest, running, now: this.clock.now() }
            for (const action of step(situation)) {
                // Факт раньше эффекта: упадём между ними — агент окажется «не запущен» и будет поднят обычным путём.
                await this.journal.append(action.facts)
                if (action.raise) {
                    await this.launcher.launch(action.raise)
                }
            }
        }
    }

    /** Шаг 0. Приём: что сказали миру агенты, которые уже завершились. */
    private async collectFromFinishedAgents(running: Set<string>): Promise<void> {
        for (const assignment of this.journal.world().assignments.values()) {
            if (assignment.status.is !== 'alive' || running.has(assignment.key)) {
                continue
            }
            for (const { source, call, error } of await this.channel.collect(assignment.key)) {
                const accepted = call
                    ? await this.reception.accept(assignment.key, call)
                    : await this.reception.rejectUnreadable(assignment.key, source, error ?? 'не разобрал')
                await this.channel.settle(assignment.key, source, accepted)
            }
        }
    }
}

export const ReconcilerDIToken = token<Reconciler>('Reconciler')
