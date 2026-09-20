// Модель agent-office. Читать в этом порядке.
//
//   words       слова проекта — непрозрачные для офиса строки: род, состояние, роль, исход…
//   ids         брендированные id и «момент» в журнале
//
//   node        Узел        дерево работы
//   fact        Факт        append-only журнал — единственный источник правды
//   artifact    Артефакт    знание с адресатом
//   role        Роль        предикат, зрелость, проекция, стрелки
//   assignment  Назначение  роль на узле и её воплощения
//   request     Запрос      обращение к человеку: варианты, дефолт, дедлайн
//
//   condition   язык условий манифеста        judge   суждения дешёвого агента
//   manifest    всё, что объявляет проект     flag    «посмотри сюда»
//   api         контракт офис ↔ дашборда

export type * from './words.ts'
export type * from './ids.ts'
export type * from './actor.ts'
export type * from './node.ts'
export type * from './fact.ts'
export type * from './artifact.ts'
export type * from './role.ts'
export type * from './assignment.ts'
export type * from './request.ts'
export type * from './condition.ts'
export type * from './judge.ts'
export type * from './flag.ts'
export type * from './manifest.ts'
export type * from './api.ts'
