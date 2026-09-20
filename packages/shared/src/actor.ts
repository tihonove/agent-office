import type { AgentKey } from './ids.ts'

/** Кто стоит за фактом. Человек — такой же узел контура, как агент и сам офис. */
export type Actor =
    | { kind: 'human' }
    | { kind: 'agent'; key: AgentKey }
    | { kind: 'office' }
