import type { JudgeDecl } from './judge.ts'
import type { ArtifactKind, FieldName, Kind, OneOrMany, Outcome, RoleName, State } from './words.ts'

/**
 * Условие — чистая функция от снимка мира и узла. На условиях стоят предикаты ролей, переходы и запросы человеку;
 * раз они чистые, сверка идемпотентна.
 *
 * Объект — это «И» своих ключей. Ключи вычисляются в порядке записи, до первого невыполненного:
 * поэтому `judge`, записанный последним, запускается только когда остальное уже сошлось.
 *
 * ```yaml
 * when: { kind: заявка, state: приёмка, answer: { request: приёмка, is: принять } }
 * ```
 */
export type Condition = {
    /** Род узла — один из перечисленных. */
    kind?: OneOrMany<Kind>
    /** Состояние узла — одно из перечисленных. */
    state?: OneOrMany<State>
    /** Все эти поля у узла заполнены. */
    fields?: FieldName[]
    /** На узле есть артефакт такого вида. */
    artifact?: ArtifactCondition
    /** Роль заявила исход — в текущую эпоху состояния. */
    result?: ResultCondition
    /** На объявленный запрос получен такой ответ — в текущую эпоху состояния. */
    answer?: AnswerCondition
    /** Состояния детей узла. */
    children?: ChildrenCondition

    all?: Condition[]
    any?: Condition[]
    not?: Condition

    /** Суждение дешёвого агента. Пока вердикта нет, условие не выполнено. */
    judge?: JudgeDecl
}

export type ArtifactCondition = {
    kind: ArtifactKind
    /** …и с такими значениями в шапке: `where: { итог: годно }`. */
    where?: Record<string, string>
}

export type ResultCondition = {
    role: RoleName
    /** Без `outcome` — любой исход. */
    outcome?: Outcome
}

export type AnswerCondition = {
    /** id объявления из раздела `requests`. */
    request: string
    is: string
}

export type ChildrenCondition = {
    /** Дети есть, и все — в одном из этих состояний. */
    all?: OneOrMany<State>
    /** Хотя бы один ребёнок — в одном из этих состояний. */
    any?: OneOrMany<State>
    /** Ни одного ребёнка в этих состояниях. */
    none?: OneOrMany<State>
}
