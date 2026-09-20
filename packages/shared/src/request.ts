import type { AgentKey, FactId, NodeId, RequestId } from './ids.ts'
import type { Timestamp } from './words.ts'

/**
 * Запрос — обращение к человеку. У каждого есть варианты, дедлайн и объявленный исход по молчанию:
 * человек — узел контура, и его молчание — тоже исход.
 */
export type Request = {
    id: RequestId
    node: NodeId
    openedBy: RequestSource
    question: string
    options: string[]

    /** Исход по молчанию — один из `options`. */
    default: string
    deadline: Timestamp

    /** Факт открытия: по нему видно, в какую эпоху состояния узла запрос задан. */
    opened: FactId
    answer?: Answer
}

export type RequestSource =
    /** Запрос объявлен в манифесте (`requests`) и открыт офисом по условию. */
    | { kind: 'manifest'; decl: string }
    /** Вопрос задал агент — и умер; ответ поднимет его под тем же ключом. */
    | { kind: 'agent'; key: AgentKey }

export type Answer = {
    option: string
    /** `deadline` — человек промолчал, офис применил исход по молчанию. */
    by: 'human' | 'deadline'
}
