// Сверка — единственный движок офиса. Тик без памяти: он читает мир заново и сверяет желаемое с фактическим.
//
// Каждый шаг — чистая функция «ситуация → действия». Действие = факты, которые надо записать, + (необязательно)
// подъём агента. Между шагами офис дописывает журнал и сворачивает мир заново, так что шаг видит плоды предыдущего.
// Порядок шагов — в самом низу файла.

import { createHash } from 'node:crypto'
import type {
    AgentKey, Assignment, FactDraft, Manifest, Node, NodeId, Request, RequestDecl, RequestId, RoleName, State,
} from '@agent-office/shared'
import { evaluate, parseDuration } from './conditions.ts'
import { agentKey } from './keys.ts'
import { missingResource } from './resources.ts'
import { asList } from './lists.ts'
import { planProjection } from './projection.ts'
import { assignmentOf, childrenOf, inCurrentEpoch, isLeaf, requestsOf, type World } from './world.ts'

export type Situation = {
    world: World
    manifest: Manifest
    /** Кого исполнители видят запущенным. */
    running: Set<AgentKey>
    now: Date
}

export type Action = {
    facts: FactDraft[]
    /** Эффект: поднять агента. Факт о подъёме уже в `facts` — факт всегда раньше эффекта. */
    raise?: Raise
}

export type Raise = {
    key: AgentKey
    role: RoleName
    node: NodeId
    session: string
    resume: boolean
    /** Повод — почему подняли именно сейчас. */
    reason: string
    /** Файлы проекции. */
    files: Record<string, string>
}

export type Step = (s: Situation) => Action[]

/**
 * После стольких потерь подряд офис перестаёт поднимать роль сам и зовёт человека флагом.
 * Это не бюджет, а предохранитель: бюджеты и рубильник отложены.
 */
export const MAX_LOSSES = 3

const office = { kind: 'office' } as const

// ── 1. Агенты: кого исполнитель больше не видит, а результата нет, — работа возвращается ────────────────────

const lostAgents: Step = ({ world, manifest, running }) => {
    const actions: Action[] = []
    for (const a of world.assignments.values()) {
        if (a.status.is !== 'alive' || running.has(a.key)) {
            continue
        }

        const facts: FactDraft[] = [{ type: 'agent.lost', actor: office, node: a.node, payload: { key: a.key } }]

        // Узел возвращается туда, откуда его увела стрелка start.
        const node = world.nodes.get(a.node)!
        const start = manifest.roles[a.role]?.arrows?.start
        if (node.state === start && a.returnTo !== start) {
            facts.push(moved(node, a.returnTo, `${a.key}: потерян`))
        }

        if (a.losses + 1 >= MAX_LOSSES) {
            const text = `${a.key} пропал без результата ${MAX_LOSSES} раза подряд — сам больше не поднимаю, вызовите роль руками`
            facts.push({ type: 'flag.raised', actor: office, node: a.node, payload: { text } })
        }
        actions.push({ facts })
    }
    return actions
}

// ── 2. Дедлайны: молчание человека — тоже исход, и он объявлен заранее ──────────────────────────────────────

const deadlines: Step = ({ world, now }) =>
    [...world.requests.values()]
        .filter((r) => !r.answer && new Date(r.deadline) <= now)
        .map((r) => ({
            facts: [{ type: 'request.answered', actor: office, node: r.node, payload: { request: r.id, option: r.default, by: 'deadline' } }],
        }))

// ── 3. Ожидание живёт в мире, а не в агенте: дождались — поднимаем тот же ключ ──────────────────────────────

const wakeWaiting: Step = (s) => {
    const actions: Action[] = []
    const raisedNow: RoleName[] = []
    for (const a of s.world.assignments.values()) {
        if (a.status.is !== 'waiting' || s.running.has(a.key)) {
            continue
        }

        const request = a.status.request && s.world.requests.get(a.status.request)
        // Человек ещё не ответил, и дедлайн не вышел
        if (request && !request.answer) {
            continue
        }
        // Ресурсы заняты — дождёмся следующего тика
        if (missingResource(s.manifest, s.world, a.role, raisedNow)) {
            continue
        }

        const reason = request ? answered(request) : `Проекция дополнена тем, что ты просил дотянуть: ${a.extra.join(', ')}`
        actions.push(raise(s, a.role, s.world.nodes.get(a.node)!, reason))
        raisedNow.push(a.role)
    }
    return actions
}

function answered(r: Request): string {
    const how = r.answer!.by === 'deadline' ? 'человек не ответил к дедлайну, принят вариант по умолчанию' : 'человек ответил'
    return `На твой вопрос «${r.question}» ${how}: **${r.answer!.option}**`
}

// ── 4. Порождения: артефакт создаёт детей, пока у узла есть место под потолком открытых ─────────────────────
// Идут раньше переходов: иначе «все дети закрыты» сработает, пока очередь порождения ещё не пуста.

const spawns: Step = ({ world, manifest }) => {
    const isOpen = (n: Node) => !manifest.kinds[n.kind]?.closed?.includes(n.state)
    const isBorn = (artifact: string, index: number) =>
        [...world.nodes.values()].some((n) => n.bornFrom?.artifact === artifact && n.bornFrom.index === index)

    const facts: FactDraft[] = []
    const bornNow = new Map<NodeId, number>()   // сколько детей узлу добавили на этом шаге

    for (const artifact of world.artifacts.values()) {
        const decl = manifest.spawns?.find((s) => s.artifact === artifact.kind)
        if (!decl) {
            continue
        }
        const parent = artifact.node

        // accept.ts уже проверил, что nodes — непустой список наборов полей с обязательными полями.
        const nodes = artifact.meta['nodes'] as Record<string, string>[]
        for (const [index, fields] of nodes.entries()) {
            if (isBorn(artifact.id, index)) {
                continue
            }

            const open = childrenOf(world, parent).filter(isOpen).length + (bornNow.get(parent) ?? 0)
            // Остальные ждут своей очереди
            if (decl.maxOpen !== undefined && open >= decl.maxOpen) {
                break
            }
            bornNow.set(parent, (bornNow.get(parent) ?? 0) + 1)

            const id = `n-${world.nodes.size + facts.length + 1}` as NodeId
            const { kind, state } = decl
            facts.push({
                type: 'node.created', actor: office, node: id,
                payload: { kind, state, parent, fields, bornFrom: { artifact: artifact.id, index } },
            })
        }
    }
    return facts.length ? [{ facts }] : []
}

// ── 5. Переходы: где условие выполнено. На узел — один переход за шаг, первый подходящий ────────────────────

const transitions: Step = ({ world, manifest }) => {
    const actions: Action[] = []
    for (const node of world.nodes.values()) {
        const transition = (manifest.transitions ?? []).find((t) =>
            t.kind === node.kind &&
            asList(t.from).includes(node.state) &&
            t.to !== node.state &&
            evaluate(t.when, world, node) === true)
        if (transition) {
            actions.push({ facts: [moved(node, transition.to, 'переход по условию')] })
        }
    }
    return actions
}

// ── 6. Объявленные запросы человеку: открываются по условию, раз в эпоху состояния узла ─────────────────────

const openRequests: Step = ({ world, manifest, now }) => {
    const alreadyOpen = (node: Node, decl: RequestDecl) =>
        requestsOf(world, node.id).some((r) =>
            r.openedBy.kind === 'manifest' && r.openedBy.decl === decl.id && inCurrentEpoch(node, r.opened))

    const facts: FactDraft[] = []
    for (const node of world.nodes.values()) {
        for (const decl of manifest.requests ?? []) {
            if (evaluate(decl.when, world, node) !== true || alreadyOpen(node, decl)) {
                continue
            }

            const id = `r-${world.requests.size + facts.length + 1}` as RequestId
            const { question, options } = decl
            const deadline = new Date(now.getTime() + parseDuration(decl.deadline)).toISOString()
            facts.push({
                type: 'request.opened', actor: office, node: node.id,
                payload: { id, openedBy: { kind: 'manifest', decl: decl.id }, question, options, default: decl.default, deadline },
            })
        }
    }
    return facts.length ? [{ facts }] : []
}

// ── 7. Роли: где нужен агент, которого нет, — и хватает ресурсов ────────────────────────────────────────────
// Узлы идут в порядке рождения: кто раньше встал в очередь за местом, тот раньше его получит.

const roles: Step = (s) => {
    const { world, manifest } = s
    const actions: Action[] = []
    const raisedNow: RoleName[] = []

    for (const node of world.nodes.values()) {
        for (const name of Object.keys(manifest.roles)) {
            const a = assignmentOf(world, name, node.id)
            // Ключ занят
            if (a && (a.status.is === 'alive' || a.status.is === 'waiting')) {
                continue
            }

            const reason = world.invoked.has(agentKey(name, node.id))
                ? 'Роль вызвана человеком руками.'
                : isWanted(s, name, node, a) && (a ? whyAgain(world, a) : 'Первый заход на этот узел.')
            if (!reason) {
                continue
            }
            // Ресурсы заняты: узел остаётся где был, попробуем на следующем тике
            if (missingResource(manifest, world, name, raisedNow)) {
                continue
            }

            actions.push(raise(s, name, node, reason))
            raisedNow.push(name)
            break   // одна роль на узел за шаг: стрелка start меняет состояние, остальные предикаты надо считать заново
        }
    }
    return actions
}

/** Нужен ли узлу агент этой роли — по мнению манифеста и здравого смысла офиса. */
function isWanted({ world, manifest }: Situation, name: RoleName, node: Node, a?: Assignment): boolean {
    const role = manifest.roles[name]!

    // Учётный узел не раздаётся: у него есть дети.
    const isAccounting = !isLeaf(world, node.id)
    // Предикат роли молчит.
    const isUnwanted = evaluate(role.when, world, node) !== true
    // Узел не дозрел: ждёт того, кто добавит поля.
    const isImmature = (role.needs ?? []).some((field) => !node.fields[field])
    // Предохранитель сработал: дальше роль поднимает только человек.
    const isFused = a !== undefined && a.losses >= MAX_LOSSES
    // Роль уже отработала в этой эпохе состояния.
    const isDone = a?.status.is === 'finished' && inCurrentEpoch(node, a.run.ended!.fact)

    return !(isAccounting || isUnwanted || isImmature || isFused || isDone)
}

function whyAgain(w: World, a: Assignment): string {
    if (a.status.is === 'finished') {
        return `Узел снова там, где нужна твоя роль. Прошлый заход закончился исходом «${a.status.outcome}».`
    }
    const rejected = w.rejections
        .filter((r) => r.key === a.key && r.fact > a.run.started.fact)
        .map((r) => `- ${r.call}: ${r.reason}`)
    const notAccepted = rejected.length ? `\n\nОфис не принял сказанное им:\n${rejected.join('\n')}` : ''
    return `Прошлое воплощение завершилось без результата.${notAccepted}`
}

// ── Подъём агента ───────────────────────────────────────────────────────────────────────────────────────────

/** Новое воплощение под ключом (роль, узел): факт о назначении с составом проекции + стрелка start. */
function raise({ world, manifest, now }: Situation, roleName: RoleName, node: Node, reason: string): Action {
    const role = manifest.roles[roleName]!
    const key = agentKey(roleName, node.id)
    const previous = world.assignments.get(key)
    const attempt = (previous?.run.attempt ?? 0) + 1

    // Короткий разрыв → продолжение сессии; длинный → начисто от проекции.
    const resumeWithin = parseDuration(manifest.executors[role.executor]?.resumeWithin ?? '1h')
    const endedAt = previous?.run.ended?.at
    const resume = endedAt !== undefined && now.getTime() - new Date(endedAt).getTime() < resumeWithin
    const session = resume ? previous!.run.session : sessionId(key, attempt, now)

    // Ждавший агент будится в состоянии start — возвращаться ему по-прежнему туда, откуда он пришёл впервые.
    const returnTo = previous?.status.is === 'waiting' ? previous.returnTo : node.state

    const { artifacts, files } = planProjection(world, manifest, roleName, node, previous)
    const facts: FactDraft[] = [{
        type: 'agent.spawned', actor: office, node: node.id,
        payload: { key, role: roleName, executor: role.executor, attempt, session, resume, returnTo, projection: artifacts, reason },
    }]

    const start = role.arrows?.start
    if (start && start !== node.state) {
        facts.push(moved(node, start, `${key}: в работе`))
    }

    return { facts, raise: { key, role: roleName, node: node.id, session, resume, reason, files } }
}

const moved = (node: Node, to: State, reason: string): FactDraft =>
    ({ type: 'node.state', actor: office, node: node.id, payload: { from: node.state, to, reason } })

/**
 * Детерминированный uuid: шаг остаётся чистой функцией, а исполнителю нужен именно uuid.
 * Время в соли — чтобы новый журнал в том же проекте не наткнулся на сессии прежнего.
 */
function sessionId(key: AgentKey, attempt: number, now: Date): string {
    const h = createHash('sha256').update(`${key}#${attempt}#${now.toISOString()}`).digest('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// ── Порядок тика ────────────────────────────────────────────────────────────────────────────────────────────

export const steps: [name: string, step: Step][] = [
    ['агенты', lostAgents],
    ['дедлайны', deadlines],
    ['ожидание', wakeWaiting],
    ['порождения', spawns],
    ['переходы', transitions],
    ['запросы', openRequests],
    ['роли', roles],
]
