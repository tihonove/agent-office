// Слова проекта. Для офиса это непрозрачные строки: он их сравнивает, но не понимает.
// Смысл им даёт манифест — офис не знает ни «заявки», ни «аналитика», ни «приёмки».

/** Род узла: «цель», «заявка», «единица»… */
export type Kind = string

/** Состояние узла: «новая», «в работе», «готово»… Набор состояний у каждого рода свой. */
export type State = string

/** Имя поля узла: «описание», «критерий», «область»… */
export type FieldName = string

/** Поля узла. Их наличие — это зрелость: роль не поднимется, пока нужных полей нет. */
export type Fields = Record<FieldName, string>

/** Имя роли: «аналитик», «реализатор»… */
export type RoleName = string

/** Вид артефакта: «постановка», «отчёт», «декомпозиция»… */
export type ArtifactKind = string

/** Исход, который роль заявляет, закончив заход: «готово», «отказ»… */
export type Outcome = string

/** Имя исполнителя из раздела `executors` манифеста. */
export type ExecutorName = string

/** Адресат артефакта: имя роли или `'*'` — всем. */
export type Reader = RoleName | '*'

/** Длительность в манифесте: `'30m'`, `'24h'`, `'2d'`. */
export type Duration = string

/** Момент времени, ISO 8601. */
export type Timestamp = string

/** В YAML удобно писать и `state: новая`, и `state: [новая, анализ]`. */
export type OneOrMany<T> = T | T[]
