// Снимок мира для человека: всё, что показывает дашборда. Только чтение.

import type { Manifest, Snapshot } from '@agent-office/shared'
import { pendingJudgements } from '../core/conditions.ts'
import { ManifestDIToken } from '../manifest/tokens.ts'
import { token } from '../platform/di/container.ts'
import { AgentLauncher, AgentLauncherDIToken } from './agentLauncher.ts'
import { Journal, JournalDIToken } from './journal.ts'

export class SnapshotService {
    public static dependencies = [JournalDIToken, ManifestDIToken, AgentLauncherDIToken] as const

    private readonly journal: Journal
    private readonly manifest: Manifest
    private readonly launcher: AgentLauncher

    public constructor(journal: Journal, manifest: Manifest, launcher: AgentLauncher) {
        this.journal = journal
        this.manifest = manifest
        this.launcher = launcher
    }

    public async snapshot(): Promise<Snapshot> {
        const world = this.journal.world()
        return {
            manifest: this.manifest,
            nodes: [...world.nodes.values()],
            artifacts: [...world.artifacts.values()],
            assignments: [...world.assignments.values()],
            requests: [...world.requests.values()],
            flags: world.flags,
            pendingJudgements: pendingJudgements(world, this.manifest),
            running: [...(await this.launcher.running())],
        }
    }
}

export const SnapshotServiceDIToken = token<SnapshotService>('SnapshotService')
