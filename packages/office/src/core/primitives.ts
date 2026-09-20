// Примитивы — единственный способ агента сказать что-то миру. Он не двигает состояние, не создаёт узлы
// и не пишет другим агентам: он публикует, заявляет, спрашивает — а последствия применяет офис (accept.ts).

import type { ArtifactId, ArtifactKind, Duration, Fields, Outcome, Reader } from '@agent-office/shared'

/** Опубликовать артефакт — знание с адресатом. */
export type Publish = {
    call: 'publish'
    kind: ArtifactKind
    audience: Reader[]
    body: string
    meta: Record<string, unknown>
}

/** Заявить результат захода. Заодно можно дописать узлу поля — так узел дозревает для следующей роли. */
export type ClaimResult = {
    call: 'result'
    outcome: Outcome
    note: string
    fields?: Fields
}

/** Спросить человека. Ждать ответа агент не может: он умирает, а ответ поднимет его под тем же ключом. */
export type AskHuman = {
    call: 'ask'
    question: string
    options: string[]
    /** Исход по молчанию — один из `options`. */
    default: string
    /** Без дедлайна — возьмётся `askDeadline` манифеста. */
    deadline?: Duration
}

/** Поднять флаг: «тут что-то не так, человек, посмотри». */
export type RaiseFlag = {
    call: 'flag'
    text: string
}

/** Дотянуть в проекцию недовложенное — только в пределах своего потолка (аудитории артефактов). */
export type Pull = {
    call: 'pull'
    artifacts: ArtifactId[]
}

export type AgentCall = Publish | ClaimResult | AskHuman | RaiseFlag | Pull

/** Ответ офиса на примитив. `id` — то, что родилось: артефакт или запрос. */
export type Accepted =
    | { ok: true; id?: string }
    | { ok: false; reason: string }
