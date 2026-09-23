import type { Condition } from './condition.ts'
import type { Role } from './role.ts'
import type {
    Amount, ArtifactKind, Duration, ExecutorName, FieldName, Kind, OneOrMany, ResourceName, RoleName, State, Takes,
} from './words.ts'

/**
 * Манифест — всё, что проект объявляет офису (`office.yaml`). Офис не знает слов «аналитик» или «приёмка»:
 * он применяет объявления. Эталон формата — examples/toy/office.yaml.
 */
export type Manifest = {
    /** Куда падают заявки человека. */
    inbox: { kind: Kind; state: State }

    /** Роды узлов и их состояния. */
    kinds: Record<Kind, KindDecl>

    /** Кто умеет исполнять роли. */
    executors: Record<ExecutorName, ExecutorDecl>

    roles: Record<RoleName, Role>

    /** Переходы, не привязанные к заходу роли: по ответу человека, по детям, по артефакту. */
    transitions?: TransitionDecl[]

    /** Порождения: какой артефакт создаёт какие узлы. */
    spawns?: SpawnDecl[]

    /** Когда звать человека и что будет, если он промолчит. */
    requests?: RequestDecl[]

    /**
     * Ресурсы: имя → ёмкость. Агент поднимается, только если всё, что он берёт (`takes`), свободно,
     * и держит взятое, пока жив. Кому не хватило — ждёт следующего тика, узел не двигается.
     */
    resources?: Record<ResourceName, Amount>

    /** Карта областей: имя → пути. Офис её не толкует, только кладёт в проекцию. */
    areas?: Record<string, string[]>

    /** Дедлайн вопроса агента, если он не указал свой. По умолчанию 24h. */
    askDeadline?: Duration
}

export type KindDecl = {
    states: State[]
    /** Состояния, в которых узел больше не «открыт» — не занимает место под потолком `maxOpen`. */
    closed?: State[]
}

export type ExecutorDecl = {
    /** Какой адаптер исполняет: `claude`, `fake`… */
    type: string
    model?: string
    /** Аргументы исполнителю насквозь; офис их не толкует (например, `--worktree`). */
    args?: string[]
    /** Разрыв короче — продолжаем сессию, длиннее — начинаем начисто от проекции. По умолчанию 1h. */
    resumeWithin?: Duration
    /** Что берёт из `resources` каждый агент на этом исполнителе. Роль может добавить своё (`roles.*.takes`). */
    takes?: Takes
}

/** Переход: `from → to when …`. На узел — один переход за тик, первый подходящий. */
export type TransitionDecl = {
    kind: Kind
    from: OneOrMany<State>
    to: State
    when: Condition
}

/**
 * Порождение: артефакт вида `artifact` создаёт дочерние узлы — агент узлов не создаёт, он публикует.
 * В шапке такого артефакта обязан быть список `nodes`; каждый элемент — поля будущего узла.
 */
export type SpawnDecl = {
    artifact: ArtifactKind
    /** Род и начальное состояние порождённых узлов. */
    kind: Kind
    state: State
    /** Поля, без которых офис не примет артефакт. */
    requires?: FieldName[]
    /** Потолок открытых детей у узла: остальные ждут своей очереди. Этого хватает, чтобы дерево не взорвалось. */
    maxOpen?: number
}

/** Объявленный запрос человеку: открывается по условию, раз в эпоху состояния узла. */
export type RequestDecl = {
    id: string
    when: Condition
    question: string
    options: string[]
    /** Исход по молчанию — один из `options`. */
    default: string
    deadline: Duration
}
