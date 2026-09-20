// Состояние — производное: свёртка журнала фактов. Никакого другого источника правды нет.
// Здесь видно, что каждый факт значит для мира.

import type { AgentKey, AssignmentStatus, Fact, Moment } from '@agent-office/shared'
import { agentKey } from './keys.ts'
import { emptyWorld, type World } from './world.ts'

export function fold(facts: Iterable<Fact>): World {
    const world = emptyWorld()
    for (const fact of facts) {
        apply(world, fact)
    }
    return world
}

function apply(w: World, f: Fact): void {
    const node = w.nodes.get(f.node)
    const at: Moment = { fact: f.id, at: f.ts }

    switch (f.type) {
        // ── Узел ──
        case 'node.created': {
            const { kind, state, parent, fields, bornFrom } = f.payload
            w.nodes.set(f.node, { id: f.node, kind, state, parent, fields: { ...fields }, bornFrom, since: f.id })
            return
        }
        case 'node.state':
            if (node) {
                node.state = f.payload.to
                node.since = f.id
            }
            return
        case 'node.fields':
            if (node) {
                Object.assign(node.fields, f.payload.fields)
            }
            return

        // ── Артефакт ──
        case 'artifact.published':
            w.artifacts.set(f.payload.id, f.payload)
            return
        case 'call.rejected':
            w.rejections.push({ ...f.payload, fact: f.id })
            return

        // ── Назначение ──
        case 'agent.spawned': {
            const { key, role, executor, returnTo, attempt, session, reason, projection } = f.payload
            const previous = w.assignments.get(key)
            w.assignments.set(key, {
                key, role, node: f.node, executor, returnTo,
                status: { is: 'alive' },
                run: { attempt, session, reason, projection, started: at },
                losses: previous?.losses ?? 0,
                extra: previous?.extra ?? [],
            })
            w.invoked.delete(key)
            return
        }
        case 'agent.finished':
            return endRun(w, f.payload.key, at, { is: 'finished', outcome: f.payload.outcome }, () => 0)
        case 'agent.waiting':
            return endRun(w, f.payload.key, at, { is: 'waiting', request: f.payload.request }, () => 0)
        case 'agent.lost':
            return endRun(w, f.payload.key, at, { is: 'lost' }, (losses) => losses + 1)
        case 'projection.extended': {
            const a = w.assignments.get(f.payload.key)
            if (a) {
                a.extra = [...new Set([...a.extra, ...f.payload.artifacts])]
            }
            return
        }
        case 'role.invoked': {
            const key = agentKey(f.payload.role, f.node)
            w.invoked.add(key)
            const a = w.assignments.get(key)
            // Человек взял ответственность: предохранитель взведён заново
            if (a) {
                a.losses = 0
            }
            return
        }

        // ── Запрос, флаг, суждение ──
        case 'request.opened':
            w.requests.set(f.payload.id, { ...f.payload, node: f.node, opened: f.id })
            return
        case 'request.answered': {
            const request = w.requests.get(f.payload.request)
            if (request) {
                request.answer = { option: f.payload.option, by: f.payload.by }
            }
            return
        }
        case 'flag.raised':
            w.flags.push({ node: f.node, by: f.actor, text: f.payload.text, raised: at })
            return
        case 'judge.verdict':
            w.verdicts.push({ node: f.node, ...f.payload })
            return

        default:
            f satisfies never
    }
}

/** Воплощение закончилось — исходом, ожиданием или потерей. */
function endRun(w: World, key: AgentKey, at: Moment, status: AssignmentStatus, losses: (n: number) => number): void {
    const a = w.assignments.get(key)
    if (!a) {
        return
    }
    a.status = status
    a.run.ended = at
    a.losses = losses(a.losses)
}
