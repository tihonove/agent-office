import type { Actor } from './actor.ts'
import type { Moment, NodeId } from './ids.ts'

/** Флаг — «тут что-то не так». Ничего не двигает, только зовёт человека посмотреть. */
export type Flag = {
    node: NodeId
    by: Actor
    text: string
    raised: Moment
}
