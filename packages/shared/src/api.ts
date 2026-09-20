// Контракт между офисом и дашбордой.

import type { Artifact } from './artifact.ts'
import type { Assignment } from './assignment.ts'
import type { Flag } from './flag.ts'
import type { AgentKey, NodeId } from './ids.ts'
import type { PendingJudgement } from './judge.ts'
import type { Manifest } from './manifest.ts'
import type { Node } from './node.ts'
import type { Request } from './request.ts'
import type { Fields, Kind, RoleName } from './words.ts'

/** `GET /api/snapshot` — мир, свёрнутый из журнала. Сами факты — `GET /api/facts`. */
export type Snapshot = {
    manifest: Manifest
    nodes: Node[]
    artifacts: Artifact[]
    assignments: Assignment[]
    requests: Request[]
    flags: Flag[]
    pendingJudgements: PendingJudgement[]
    /** Агенты, которых исполнители видят живыми прямо сейчас. */
    running: AgentKey[]
}

// ── Команды человека ────────────────────────────────────────────────────────────────────────────────────────

/** `POST /api/nodes` — вбросить заявку. Без `kind` — род из `inbox` манифеста. */
export type CreateNodeBody = { kind?: Kind; parent?: NodeId; fields: Fields }

/** `POST /api/requests/:id/answer` */
export type AnswerBody = { answer: string }

/** `POST /api/nodes/:id/invoke` — вызвать роль руками. */
export type InvokeBody = { role: RoleName }

/** `POST /api/nodes/:id/fields` — дописать узлу поля. */
export type FieldsBody = { fields: Fields }

/** `POST /api/verdicts` — вынести суждение руками. */
export type VerdictBody = { node: NodeId; judge: string; verdict: boolean }
