// Брендированные id: в рантайме обычные строки, но компилятор не даст подставить один вместо другого.
// У каждого вида id одно место рождения. Снаружи (URL, имена каталогов) строка становится id только явным `as`.

import type { Timestamp } from './words.ts'

declare const brand: unique symbol
type Brand<B extends string> = string & { readonly [brand]: B }

/** `f-000000042` — выдаёт журнал; id монотонны, их можно сравнивать как «раньше / позже». */
export type FactId = Brand<'FactId'>

/** `n-7` — выдаёт офис, создавая узел. */
export type NodeId = Brand<'NodeId'>

/** `a-3` — выдаёт офис, принимая публикацию. */
export type ArtifactId = Brand<'ArtifactId'>

/** `r-2` — выдаёт офис, открывая запрос человеку. */
export type RequestId = Brand<'RequestId'>

/** `аналитик/n-7` — ключ назначения «роль на узле». Собирает `agentKey()` в office/core/keys.ts. */
export type AgentKey = Brand<'AgentKey'>

/** Точка в журнале: каким фактом и когда. */
export type Moment = { fact: FactId; at: Timestamp }
