import type { Actor } from './actor.ts'
import type { ArtifactId, NodeId } from './ids.ts'
import type { ArtifactKind, Reader } from './words.ts'

/**
 * Артефакт — знание с адресатом. Агенты не переписываются: они публикуют артефакты.
 *
 * `audience` — потолок видимости: в проекцию роли артефакт попадёт, только если адресован ей
 * (или всем) и подходит под правило `sees` этой роли. Человек видит всё.
 */
export type Artifact = {
    id: ArtifactId
    node: NodeId
    kind: ArtifactKind
    audience: Reader[]
    author: Actor
    body: string

    /**
   * Шапка артефакта — структурированная часть знания. Для офиса непрозрачна,
   * кроме одного случая: у порождающего артефакта (см. `SpawnDecl`) офис читает здесь список `nodes`.
   */
    meta: Record<string, unknown>
}
