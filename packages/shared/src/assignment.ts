import type { AgentKey, ArtifactId, Moment, NodeId, RequestId } from './ids.ts'
import type { ExecutorName, Outcome, RoleName, State } from './words.ts'

/**
 * Назначение — роль на узле. Ключ (роль, узел) уникален: повторный подъём — это продолжение
 * под тем же ключом (новое воплощение), а не второй агент.
 */
export type Assignment = {
    key: AgentKey
    role: RoleName
    node: NodeId
    executor: ExecutorName

    status: AssignmentStatus

    /** Текущее (последнее) воплощение. */
    run: Run

    /** Потерь подряд. Сбрасывается исходом, вопросом человеку и вызовом роли руками. */
    losses: number

    /** Состояние узла до стрелки `start`: туда он вернётся, если агент пропадёт. */
    returnTo: State

    /** Что агент дотянул в проекцию сверх правила роли — в пределах потолка аудитории. */
    extra: ArtifactId[]
}

export type AssignmentStatus =
    /** Агент поднят и, насколько офис знает, работает. */
    | { is: 'alive' }
    /** Агент умер, а ожидание осталось в мире. Без `request` — ждёт только повторного подъёма (дотянул проекцию). */
    | { is: 'waiting'; request?: RequestId }
    /** Агент заявил результат и умер. */
    | { is: 'finished'; outcome: Outcome }
    /** Исполнитель агента больше не видит, а результата нет: работа вернулась. */
    | { is: 'lost' }

/** Воплощение — один заход агента: поработал, опубликовал, умер. */
export type Run = {
    /** Номер воплощения под этим ключом, с единицы. */
    attempt: number
    /** Сессия исполнителя. Короткий разрыв → продолжение сессии, длинный → начисто от проекции. */
    session: string
    /** Повод: почему подняли именно сейчас. */
    reason: string
    /** Артефакты, вложенные в проекцию этого воплощения. */
    projection: ArtifactId[]
    started: Moment
    ended?: Moment
}
