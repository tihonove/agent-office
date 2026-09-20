// Язык условий манифеста. evaluate — чистая функция от снимка мира и узла, поэтому сверка идемпотентна.
//
// Значений три. Суждение (judge), по которому ещё нет вердикта, даёт 'unknown': для офиса это «не выполнено»,
// а пара (узел, суждение) попадает в pending — её видно в дашборде, и когда-нибудь её подхватит дешёвый агент.

import type { Condition, Duration, Manifest, Node, PendingJudgement } from '@agent-office/shared'
import { asList } from './lists.ts'
import { artifactsOf, assignmentOf, childrenOf, inCurrentEpoch, requestsOf, type World } from './world.ts'

export type Tri = true | false | 'unknown'

export function evaluate(cond: Condition, w: World, node: Node, pending?: PendingJudgement[]): Tri {
    // Объект — это «И» своих ключей: по порядку записи в манифесте, до первого невыполненного.
    for (const key of Object.keys(cond) as (keyof Condition)[]) {
        const result = check(key, cond, w, node, pending)
        if (result !== true) {
            return result
        }
    }
    return true
}

function check(key: keyof Condition, c: Condition, w: World, node: Node, pending?: PendingJudgement[]): Tri {
    switch (key) {
        case 'kind':
            return asList(c.kind).includes(node.kind)

        case 'state':
            return asList(c.state).includes(node.state)

        case 'fields':
            return c.fields!.every((name) => Boolean(node.fields[name]))

        case 'artifact': {
            const { kind, where = {} } = c.artifact!
            return artifactsOf(w, node.id).some((a) =>
                a.kind === kind && Object.entries(where).every(([name, value]) => String(a.meta[name]) === value))
        }

        case 'result': {
            const { role, outcome } = c.result!
            const a = assignmentOf(w, role, node.id)
            if (a?.status.is !== 'finished' || !inCurrentEpoch(node, a.run.ended!.fact)) {
                return false
            }
            return outcome === undefined || a.status.outcome === outcome
        }

        case 'answer': {
            const { request, is } = c.answer!
            return requestsOf(w, node.id).some((r) =>
                r.openedBy.kind === 'manifest' &&
                r.openedBy.decl === request &&
                inCurrentEpoch(node, r.opened) &&
                r.answer?.option === is)
        }

        case 'children': {
            const states = childrenOf(w, node.id).map((child) => child.state)
            const { all, any, none } = c.children!
            if (all !== undefined && !(states.length > 0 && states.every((s) => asList(all).includes(s)))) {
                return false
            }
            if (any !== undefined && !states.some((s) => asList(any).includes(s))) {
                return false
            }
            if (none !== undefined && states.some((s) => asList(none).includes(s))) {
                return false
            }
            return true
        }

        // all и any тоже идут по порядку и останавливаются, как только ответ ясен: лишнее суждение не запрашивается.
        case 'all': {
            let answer: Tri = true
            for (const sub of c.all!) {
                const result = evaluate(sub, w, node, pending)
                if (result === false) {
                    return false
                }
                if (result === 'unknown') {
                    answer = 'unknown'
                }
            }
            return answer
        }

        case 'any': {
            let answer: Tri = false
            for (const sub of c.any!) {
                const result = evaluate(sub, w, node, pending)
                if (result === true) {
                    return true
                }
                if (result === 'unknown') {
                    answer = 'unknown'
                }
            }
            return answer
        }

        case 'not': {
            const result = evaluate(c.not!, w, node, pending)
            return result === 'unknown' ? 'unknown' : !result
        }

        case 'judge': {
            const { id, ask } = c.judge!
            const verdict = w.verdicts.findLast((v) => v.node === node.id && v.judge === id && v.epoch === node.since)
            if (verdict) {
                return verdict.verdict
            }
            if (pending && !pending.some((p) => p.node === node.id && p.judge === id)) {
                pending.push({ node: node.id, judge: id, ask })
            }
            return 'unknown'
        }

        default:
            return key satisfies never
    }
}

/** Какие суждения сейчас нужны миру. Сегодня их выносит человек из дашборды, завтра — дешёвый агент. */
export function pendingJudgements(w: World, m: Manifest): PendingJudgement[] {
    const pending: PendingJudgement[] = []
    const everywhere = [...Object.values(m.roles), ...(m.requests ?? [])].map((decl) => decl.when)

    for (const node of w.nodes.values()) {
        for (const cond of everywhere) {
            evaluate(cond, w, node, pending)
        }
        for (const t of m.transitions ?? []) {
            if (t.kind === node.kind && asList(t.from).includes(node.state)) {
                evaluate(t.when, w, node, pending)
            }
        }
    }
    return pending
}

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }

export function parseDuration(text: Duration): number {
    const match = /^(\d+)\s*([smhd])$/.exec(text.trim())
    if (!match) {
        throw new Error(`не понимаю длительность «${text}»: жду число и s|m|h|d, например 24h`)
    }
    return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS]
}
