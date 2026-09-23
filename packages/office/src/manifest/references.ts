// Перекрёстные ссылки манифеста — то, что схема выразить не может: «это состояние есть у этого рода»,
// «этот исполнитель объявлен», «default — один из options». Форма к этому моменту уже проверена схемой.

import type { Condition, Duration, Kind, Manifest, State, Takes } from '@agent-office/shared'
import { parseDuration } from '../core/conditions.ts'
import { asList } from '../core/lists.ts'

export function checkReferences(m: Manifest): string[] {
    const errors: string[] = []
    const complain = (where: string, what: string) => errors.push(`${where}: ${what}`)

    const statesOfAnyKind = new Set(Object.values(m.kinds).flatMap((kind) => kind.states))

    // ── Проверки-кирпичики ──

    const kindExists = (where: string, kind: Kind) => {
        if (!m.kinds[kind]) {
            complain(where, `род «${kind}» не объявлен в kinds`)
        }
    }

    const stateOfKind = (where: string, kind: Kind, state: State) => {
        kindExists(where, kind)
        if (m.kinds[kind] && !m.kinds[kind].states.includes(state)) {
            complain(where, `у рода «${kind}» нет состояния «${state}»`)
        }
    }

    const stateOfAnyKind = (where: string, state: State) => {
        if (!statesOfAnyKind.has(state)) {
            complain(where, `состояния «${state}» нет ни у одного рода`)
        }
    }

    const duration = (where: string, text: Duration | undefined) => {
        try {
            if (text !== undefined) {
                parseDuration(text)
            }
        } catch (e) {
            complain(where, (e as Error).message)
        }
    }

    const condition = (where: string, c: Condition) => {
        asList(c.kind).forEach((kind) => kindExists(where, kind))

        const states = [c.state, c.children?.all, c.children?.any, c.children?.none].flatMap(asList)
        states.forEach((state) => stateOfAnyKind(where, state))

        if (c.result && !m.roles[c.result.role]) {
            complain(where, `роль «${c.result.role}» не объявлена в roles`)
        }
        if (c.answer && !m.requests?.some((r) => r.id === c.answer!.request)) {
            complain(where, `запрос «${c.answer.request}» не объявлен в requests`)
        }

        const nested = [...(c.all ?? []), ...(c.any ?? []), ...(c.not ? [c.not] : [])]
        nested.forEach((sub) => condition(where, sub))
    }

    const takes = (where: string, t: Takes | undefined) => {
        Object.keys(t ?? {}).forEach((resource) => {
            if (m.resources?.[resource] === undefined) {
                complain(where, `ресурс «${resource}» не объявлен в resources`)
            }
        })
    }

    // ── Разделы манифеста ──

    stateOfKind('inbox', m.inbox.kind, m.inbox.state)

    for (const [name, kind] of Object.entries(m.kinds)) {
        kind.closed?.forEach((state) => stateOfKind(`kinds.${name}.closed`, name, state))
    }

    for (const [name, executor] of Object.entries(m.executors)) {
        duration(`executors.${name}.resumeWithin`, executor.resumeWithin)
        takes(`executors.${name}.takes`, executor.takes)
    }

    for (const [name, role] of Object.entries(m.roles)) {
        const where = `roles.${name}`
        if (!m.executors[role.executor]) {
            complain(where, `исполнитель «${role.executor}» не объявлен в executors`)
        }
        condition(`${where}.when`, role.when)
        takes(`${where}.takes`, role.takes)

        const arrowStates = [role.arrows?.start, ...Object.values(role.arrows?.outcomes ?? {})]
        arrowStates.forEach((state) => state !== undefined && stateOfAnyKind(`${where}.arrows`, state))
    }

    for (const [i, t] of (m.transitions ?? []).entries()) {
        const where = `transitions[${i}]`
        const states = [...asList(t.from), t.to]
        states.forEach((state) => stateOfKind(where, t.kind, state))
        condition(`${where}.when`, t.when)
    }

    for (const [i, spawn] of (m.spawns ?? []).entries()) {
        stateOfKind(`spawns[${i}]`, spawn.kind, spawn.state)
    }

    for (const request of m.requests ?? []) {
        const where = `requests.${request.id}`
        condition(`${where}.when`, request.when)
        duration(`${where}.deadline`, request.deadline)
        if (!request.options.includes(request.default)) {
            complain(where, 'default должен быть одним из options')
        }
    }

    duration('askDeadline', m.askDeadline)
    return errors
}
