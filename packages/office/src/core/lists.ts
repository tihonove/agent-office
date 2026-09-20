import type { OneOrMany } from '@agent-office/shared'

/** В манифесте можно писать и `state: новая`, и `state: [новая, анализ]` — здесь это всегда список. */
export const asList = <T>(v: OneOrMany<T> | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
