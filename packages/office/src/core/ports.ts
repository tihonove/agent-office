// Порты ядра: всё, что офис знает о внешнем мире. Ядро не знает ни про файлы, ни про Claude, ни про git —
// только эти интерфейсы. Реализации лежат в adapters/, а в контейнер попадают через модули (modules/).

import type { AgentKey, ExecutorDecl, ExecutorName, Fact, NodeId, RoleName } from '@agent-office/shared'
import { token } from '../platform/di/container.ts'
import type { Accepted, AgentCall } from './primitives.ts'

/** Журнал фактов — append-only, единственный источник правды. */
export interface Store {
    append(facts: Fact[]): Promise<void>
    read(): Promise<Fact[]>
}

export interface Clock {
    now(): Date
}

/** Исполнитель поднимает агентов и видит, кто из них жив. Живость наблюдается; аренда приедет со второй машиной. */
export interface Executor {
    spawn(req: SpawnRequest): Promise<void>
    /** Кто запущен прямо сейчас. */
    observe(): Promise<AgentKey[]>
}

export type SpawnRequest = {
    key: AgentKey
    role: RoleName
    node: NodeId
    /** Объявление исполнителя из манифеста: модель, сквозные аргументы. */
    decl: ExecutorDecl
    session: string
    /** Продолжить сессию или начать начисто. */
    resume: boolean
    /** Где канал разложил вход агента: проекцию и повод. */
    place: string
    /** Текст промпта роли. */
    prompt: string
}

/**
 * Канал — как вход попадает к агенту и как его слова попадают в `Reception.accept`.
 * Сегодня это файлы (adapters/channel-files.ts); MCP-сервер станет другим каналом, а ядро не изменится.
 */
export interface AgentChannel {
    /** Разложить вход воплощения: файлы проекции (только чтение) и повод. Возвращает место для исполнителя. */
    prepare(key: AgentKey, files: Record<string, string>, reason: string): Promise<string>
    /** Что завершившийся агент оставил миру. */
    collect(key: AgentKey): Promise<Said[]>
    /** Сказанное обработано: принято или отклонено. */
    settle(key: AgentKey, source: string, accepted: Accepted): Promise<void>
}

/** Сказанное агентом: разобранный примитив либо ошибка разбора. `source` — откуда взято (имя файла). */
export type Said = { source: string; call?: AgentCall; error?: string }

/** Куда офис пишет о себе: старт, упавший тик. Не журнал фактов — просто лог процесса. */
export interface Log {
    info(message: string): void
    error(message: string, cause?: unknown): void
}

/** Где лежат каталоги назначений — чтобы человек мог заглянуть в повод и транскрипт воплощения. */
export interface Workplaces {
    place(key: AgentKey): string
}

// ── Токены ──────────────────────────────────────────────────────────────────────────────────────────────────

export const StoreDIToken = token<Store>('Store')
export const ClockDIToken = token<Clock>('Clock')
export const AgentChannelDIToken = token<AgentChannel>('AgentChannel')
export const WorkplacesDIToken = token<Workplaces>('Workplaces')
export const LogDIToken = token<Log>('Log')

/** Исполнители — по именам из раздела `executors` манифеста. */
export const ExecutorsDIToken = token<Record<ExecutorName, Executor>>('Executors')
