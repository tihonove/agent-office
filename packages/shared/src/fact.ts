// Факт — запись в журнале. Журнал append-only и он единственный источник правды:
// состояние мира — производное, оно каждый раз сворачивается из фактов (office/core/fold.ts).
// Пишет факты только офис. Агент публикует, человек командует — а фактом это становится в офисе.

import type { Actor } from './actor.ts'
import type { Artifact } from './artifact.ts'
import type { AgentKey, ArtifactId, FactId, NodeId, RequestId } from './ids.ts'
import type { Answer, RequestSource } from './request.ts'
import type { ExecutorName, Fields, Kind, Outcome, RoleName, State, Timestamp } from './words.ts'

type FactOf<Type extends string, Payload> = {
    id: FactId
    ts: Timestamp
    /** Кто стоит за фактом. */
    actor: Actor
    /** Узел, о котором факт. У каждого факта он есть: вся работа живёт в дереве. */
    node: NodeId
    type: Type
    payload: Payload
}

// ── Узел ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Узел появился: его вбросил человек или породил артефакт. */
export type NodeCreated = FactOf<'node.created', {
    kind: Kind
    state: State
    parent?: NodeId
    fields: Fields
    /** Если узел порождён: какой артефакт и какой по счёту элемент его списка `nodes`. */
    bornFrom?: { artifact: ArtifactId; index: number }
}>

/** Узел сменил состояние. Двигает только офис: стрелкой роли или переходом манифеста. */
export type NodeStateChanged = FactOf<'node.state', {
    from: State
    to: State
    reason: string
}>

/** Узлу дописали поля — человек из дашборды или роль вместе с результатом. Так узел дозревает. */
export type NodeFieldsSet = FactOf<'node.fields', {
    fields: Fields
}>

// ── Артефакт ────────────────────────────────────────────────────────────────────────────────────────────────

/** Агент опубликовал артефакт, офис его принял. */
export type ArtifactPublished = FactOf<'artifact.published', Artifact>

/** Офис не принял сказанное агентом. Причина попадёт в повод следующего воплощения. */
export type CallRejected = FactOf<'call.rejected', {
    key: AgentKey
    /** Какой примитив (или какой файл из `out/`) отклонён. */
    call: string
    reason: string
}>

// ── Назначение ──────────────────────────────────────────────────────────────────────────────────────────────

/** Офис поднял агента: новое воплощение под ключом (роль, узел). */
export type AgentSpawned = FactOf<'agent.spawned', {
    key: AgentKey
    role: RoleName
    executor: ExecutorName
    attempt: number
    session: string
    /** Продолжаем прежнюю сессию исполнителя или начинаем начисто. */
    resume: boolean
    /** Куда вернуть узел, если агент пропадёт. */
    returnTo: State
    projection: ArtifactId[]
    reason: string
}>

/** Агент заявил результат. Стрелку исхода офис применит отдельным фактом `node.state`. */
export type AgentFinished = FactOf<'agent.finished', {
    key: AgentKey
    outcome: Outcome
    note: string
}>

/** Агент умер, оставив ожидание в мире: ответ на вопрос (`request`) или просто повторный подъём. */
export type AgentWaiting = FactOf<'agent.waiting', {
    key: AgentKey
    request?: RequestId
}>

/** Исполнитель агента больше не видит, а результата нет. Работа возвращается. */
export type AgentLost = FactOf<'agent.lost', {
    key: AgentKey
}>

/** Агент дотянул в проекцию недовложенное — в пределах своего потолка. */
export type ProjectionExtended = FactOf<'projection.extended', {
    key: AgentKey
    artifacts: ArtifactId[]
}>

/** Человек вызвал роль руками: она поднимется, даже если предикат молчит. */
export type RoleInvoked = FactOf<'role.invoked', {
    role: RoleName
}>

// ── Запрос, флаг, суждение ──────────────────────────────────────────────────────────────────────────────────

/** Открыт запрос человеку — по объявлению манифеста или по вопросу агента. */
export type RequestOpened = FactOf<'request.opened', {
    id: RequestId
    openedBy: RequestSource
    question: string
    options: string[]
    default: string
    deadline: Timestamp
}>

/** На запрос получен ответ: от человека или — по дедлайну — объявленный исход по молчанию. */
export type RequestAnswered = FactOf<'request.answered', Answer & {
    request: RequestId
}>

/** Поднят флаг: агент (или сам офис) просит человека посмотреть. */
export type FlagRaised = FactOf<'flag.raised', {
    text: string
}>

/** Вынесен вердикт по условию `judge` — в эпоху состояния `epoch`. */
export type JudgeVerdict = FactOf<'judge.verdict', {
    judge: string
    epoch: FactId
    verdict: boolean
}>

// ── Всё вместе ──────────────────────────────────────────────────────────────────────────────────────────────

export type Fact =
    | NodeCreated | NodeStateChanged | NodeFieldsSet
    | ArtifactPublished | CallRejected
    | AgentSpawned | AgentFinished | AgentWaiting | AgentLost | ProjectionExtended | RoleInvoked
    | RequestOpened | RequestAnswered | FlagRaised | JudgeVerdict

/** Факт до записи в журнал: id и время ему выдаст офис. */
export type FactDraft = Fact extends infer F ? (F extends Fact ? Omit<F, 'id' | 'ts'> : never) : never
