// Мир — снимок состояния офиса. Он производный: каждый раз сворачивается из журнала (fold.ts) и нигде не хранится.
// Чистые функции ядра — условия, шаги сверки, приём примитивов — смотрят только сюда.

import type {
    AgentKey, Artifact, ArtifactId, Assignment, FactId, Flag, Node, NodeId, Request, RequestId, RoleName, Verdict,
} from '@agent-office/shared'
import { agentKey } from './keys.ts'

export type World = {
    nodes: Map<NodeId, Node>
    artifacts: Map<ArtifactId, Artifact>
    assignments: Map<AgentKey, Assignment>
    requests: Map<RequestId, Request>
    flags: Flag[]
    verdicts: Verdict[]
    /** Что офис не принял от агентов — чтобы объяснить это следующему воплощению. */
    rejections: Rejection[]
    /** Роли, которые человек вызвал руками и которые ещё не подняты. */
    invoked: Set<AgentKey>
}

export type Rejection = { key: AgentKey; call: string; reason: string; fact: FactId }

export const emptyWorld = (): World => ({
    nodes: new Map(), artifacts: new Map(), assignments: new Map(), requests: new Map(),
    flags: [], verdicts: [], rejections: [], invoked: new Set(),
})

// ── Вопросы к миру ──────────────────────────────────────────────────────────────────────────────────────────

export const childrenOf = (w: World, id: NodeId): Node[] => [...w.nodes.values()].filter((n) => n.parent === id)

/** Узел раздаётся ролям, пока он лист. */
export const isLeaf = (w: World, id: NodeId): boolean => childrenOf(w, id).length === 0

/** Предки узла — от родителя к корню. */
export function ancestorsOf(w: World, id: NodeId): Node[] {
    const up: Node[] = []
    for (let n = parentOf(w, id); n; n = parentOf(w, n.id)) {
        up.push(n)
    }
    return up
}

const parentOf = (w: World, id: NodeId): Node | undefined => {
    const parent = w.nodes.get(id)?.parent
    return parent && w.nodes.get(parent)
}

export const artifactsOf = (w: World, id: NodeId): Artifact[] => [...w.artifacts.values()].filter((a) => a.node === id)

export const requestsOf = (w: World, id: NodeId): Request[] => [...w.requests.values()].filter((r) => r.node === id)

export const assignmentOf = (w: World, role: RoleName, node: NodeId): Assignment | undefined =>
    w.assignments.get(agentKey(role, node))

/** Случилось ли это в текущую эпоху состояния узла — то есть после того, как он вошёл в нынешнее состояние. */
export const inCurrentEpoch = (node: Node, fact: FactId): boolean => fact > node.since
