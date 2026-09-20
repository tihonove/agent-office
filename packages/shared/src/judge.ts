import type { FactId, NodeId } from './ids.ts'
import type { ExecutorName } from './words.ts'

/**
 * Суждение — условие, которое нельзя вычислить из мира: его выносит дешёвый агент («код соответствует постановке?»).
 * Чтобы сверка оставалась чистой функцией, суждение становится частью мира — фактом-вердиктом.
 * Пока автозапуска нет, вердикт вносит человек из дашборды.
 */
export type JudgeDecl = {
    /** Имя суждения: по нему вердикт находит своё условие. */
    id: string
    /** Вопрос, на который нужен ответ «да / нет». */
    ask: string
    executor?: ExecutorName
}

/** Вердикт действителен только в той эпохе состояния узла, в которой вынесен. */
export type Verdict = {
    node: NodeId
    judge: string
    epoch: FactId
    verdict: boolean
}

/** Суждение, которого мир ждёт прямо сейчас. */
export type PendingJudgement = {
    node: NodeId
    judge: string
    ask: string
}
