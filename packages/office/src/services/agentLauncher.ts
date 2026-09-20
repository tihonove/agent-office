// Подъём агентов. Решение «кого поднять» принимает сверка (core/reconcile.ts) и записывает фактом;
// здесь — только эффект: разложить вход через канал и отдать исполнителю.

import type { AgentKey, ExecutorName, Manifest, RoleName } from '@agent-office/shared'
import {
    AgentChannelDIToken, ExecutorsDIToken, type AgentChannel, type Executor,
} from '../core/ports.ts'
import type { Raise } from '../core/reconcile.ts'
import { ManifestDIToken, PromptsDIToken } from '../manifest/tokens.ts'
import { token } from '../platform/di/container.ts'

export class AgentLauncher {
    public static dependencies = [ManifestDIToken, PromptsDIToken, AgentChannelDIToken, ExecutorsDIToken] as const

    private readonly manifest: Manifest
    private readonly prompts: Record<RoleName, string>
    private readonly channel: AgentChannel
    private readonly executors: Record<ExecutorName, Executor>

    public constructor(
        manifest: Manifest,
        prompts: Record<RoleName, string>,
        channel: AgentChannel,
        executors: Record<ExecutorName, Executor>,
    ) {
        this.manifest = manifest
        this.prompts = prompts
        this.channel = channel
        this.executors = executors
    }

    /** Поднять воплощение: проекция и повод — через канал, запуск — через исполнителя роли. */
    public async launch(raise: Raise): Promise<void> {
        const { key, role, node, session, resume } = raise
        const name = this.manifest.roles[role]!.executor
        const executor = this.executors[name]
        if (!executor) {
            throw new Error(`исполнитель «${name}» объявлен в манифесте, но не подключён`)
        }

        const place = await this.channel.prepare(key, raise.files, raise.reason)
        await executor.spawn({
            key, role, node, session, resume, place,
            decl: this.manifest.executors[name]!,
            prompt: this.prompts[role] ?? '',
        })
    }

    /** Кого исполнители видят запущенным прямо сейчас. */
    public async running(): Promise<Set<AgentKey>> {
        const seen = await Promise.all(Object.values(this.executors).map((executor) => executor.observe()))
        return new Set(seen.flat())
    }
}

export const AgentLauncherDIToken = token<AgentLauncher>('AgentLauncher')
