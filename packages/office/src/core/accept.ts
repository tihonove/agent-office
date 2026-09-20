// Приём примитива агента: чистая функция «мир + вызов → факты | отказ». Это шов: сегодня сюда приходят файлы
// из out/, завтра — вызовы MCP-сервера. Агент не меняет состояние — он публикует; всё, что из этого следует
// (поля узла, стрелка исхода, запрос человеку), записывает офис.

import type { Actor, AgentKey, ArtifactId, Assignment, FactDraft, Fields, Manifest, RequestId } from '@agent-office/shared'
import { parseDuration } from './conditions.ts'
import type { Accepted, AgentCall, AskHuman, ClaimResult, Publish, Pull, RaiseFlag } from './primitives.ts'
import { mayRead } from './projection.ts'
import type { World } from './world.ts'

export type Acceptance = { facts: FactDraft[]; result: Accepted }

/** Всё, что нужно, чтобы рассудить один вызов. */
type Ctx = { w: World; m: Manifest; a: Assignment; actor: Actor; now: Date }

/** Отказ с причиной. Бросается из разбора примитива, превращается в факт `call.rejected`. */
class Rejected extends Error {}
function reject(reason: string): never {
    throw new Rejected(reason)
}

const office = { kind: 'office' } as const

export function accept(w: World, m: Manifest, key: AgentKey, call: AgentCall, now: Date): Acceptance {
    const a = w.assignments.get(key)
    try {
        if (!a) {
            return reject(`нет назначения ${key}`)
        }
        if (a.status.is !== 'alive') {
            return reject(`назначение ${key} уже не в работе (${a.status.is})`)
        }
        return handle({ w, m, a, actor: { kind: 'agent', key }, now }, call)
    } catch (e) {
        if (!(e instanceof Rejected)) {
            throw e
        }
        const facts: FactDraft[] = a
            ? [{ type: 'call.rejected', actor: office, node: a.node, payload: { key, call: call.call, reason: e.message } }]
            : []
        return { facts, result: { ok: false, reason: e.message } }
    }
}

function handle(ctx: Ctx, call: AgentCall): Acceptance {
    switch (call.call) {
        case 'publish': return publish(ctx, call)
        case 'result': return claimResult(ctx, call)
        case 'ask': return askHuman(ctx, call)
        case 'flag': return raiseFlag(ctx, call)
        case 'pull': return pull(ctx, call)
    }
}

// ── опубликовать ────────────────────────────────────────────────────────────────────────────────────────────

function publish({ w, m, a, actor }: Ctx, call: Publish): Acceptance {
    if (!call.kind) {
        reject('у артефакта нет вида (kind)')
    }
    if (!call.audience.length) {
        reject('у артефакта нет аудитории (audience): имена ролей или "*"')
    }

    // Порождающий артефакт обязан содержать то, из чего офис создаст узлы.
    const spawn = m.spawns?.find((s) => s.artifact === call.kind)
    if (spawn) {
        const nodes = call.meta['nodes']
        if (!Array.isArray(nodes) || nodes.length === 0) {
            return reject(`артефакт «${call.kind}» порождает узлы: в шапке нужен непустой список nodes`)
        }
        for (const [i, fields] of nodes.entries()) {
            if (!isFields(fields)) {
                return reject(`nodes[${i}]: жду набор строковых полей`)
            }
            const missing = (spawn.requires ?? []).filter((name) => !fields[name])
            if (missing.length) {
                reject(`nodes[${i}]: не хватает полей ${missing.join(', ')}`)
            }
        }
    }

    const id = `a-${w.artifacts.size + 1}` as ArtifactId
    const { kind, audience, body, meta } = call
    const artifact = { id, node: a.node, kind, audience, author: actor, body, meta }
    return {
        facts: [{ type: 'artifact.published', actor, node: a.node, payload: artifact }],
        result: { ok: true, id },
    }
}

// ── заявить результат ───────────────────────────────────────────────────────────────────────────────────────

function claimResult({ w, m, a, actor }: Ctx, call: ClaimResult): Acceptance {
    if (!call.outcome) {
        reject('у результата нет исхода (outcome)')
    }
    if (call.fields !== undefined && !isFields(call.fields)) {
        reject('fields: жду набор строковых полей')
    }

    const outcomes = m.roles[a.role]?.arrows?.outcomes
    if (outcomes && !(call.outcome in outcomes)) {
        reject(`роль «${a.role}» не объявляла исход «${call.outcome}»; объявлены: ${Object.keys(outcomes).join(', ')}`)
    }

    const facts: FactDraft[] = []
    if (call.fields && Object.keys(call.fields).length) {
        facts.push({ type: 'node.fields', actor, node: a.node, payload: { fields: call.fields } })
    }
    facts.push({ type: 'agent.finished', actor, node: a.node, payload: { key: a.key, outcome: call.outcome, note: call.note } })

    // Стрелка исхода: агент заявил — офис передвинул.
    const from = w.nodes.get(a.node)!.state
    const to = outcomes?.[call.outcome]
    if (to && to !== from) {
        facts.push({ type: 'node.state', actor: office, node: a.node, payload: { from, to, reason: `${a.key}: ${call.outcome}` } })
    }
    return { facts, result: { ok: true } }
}

// ── спросить человека ───────────────────────────────────────────────────────────────────────────────────────

function askHuman({ w, m, a, actor, now }: Ctx, call: AskHuman): Acceptance {
    // Конституция, п. 6: у обращения к человеку есть дедлайн и объявленный исход по молчанию.
    if (!call.question) {
        reject('у вопроса нет текста')
    }
    if (call.options.length < 2) {
        reject('у вопроса должно быть хотя бы два варианта (options)')
    }
    if (!call.options.includes(call.default)) {
        reject('вариант по умолчанию (default) должен быть одним из options')
    }
    const ms = duration(call.deadline ?? m.askDeadline ?? '24h')

    const id = `r-${w.requests.size + 1}` as RequestId
    const { question, options } = call
    const deadline = new Date(now.getTime() + ms).toISOString()
    return {
        facts: [
            {
                type: 'request.opened', actor, node: a.node,
                payload: { id, openedBy: { kind: 'agent', key: a.key }, question, options, default: call.default, deadline },
            },
            // Ждать живьём агент не может: ожидание остаётся в мире, а он умирает.
            { type: 'agent.waiting', actor, node: a.node, payload: { key: a.key, request: id } },
        ],
        result: { ok: true, id },
    }
}

// ── поднять флаг ────────────────────────────────────────────────────────────────────────────────────────────

function raiseFlag({ a, actor }: Ctx, call: RaiseFlag): Acceptance {
    if (!call.text) {
        reject('у флага нет текста')
    }
    return { facts: [{ type: 'flag.raised', actor, node: a.node, payload: { text: call.text } }], result: { ok: true } }
}

// ── дотянуть недовложенное ──────────────────────────────────────────────────────────────────────────────────

function pull({ w, a, actor }: Ctx, call: Pull): Acceptance {
    // Только в пределах своего потолка — аудитории артефакта.
    for (const id of call.artifacts) {
        const artifact = w.artifacts.get(id)
        if (!artifact || !mayRead(artifact, a.role)) {
            reject(`артефакт ${id} не существует или адресован не роли «${a.role}»`)
        }
    }
    return {
        facts: [
            { type: 'projection.extended', actor, node: a.node, payload: { key: a.key, artifacts: call.artifacts } },
            // Без запроса: агент ждёт только повторного подъёма — уже с дополненной проекцией.
            { type: 'agent.waiting', actor, node: a.node, payload: { key: a.key } },
        ],
        result: { ok: true },
    }
}

// ── мелочи ──────────────────────────────────────────────────────────────────────────────────────────────────

const isFields = (v: unknown): v is Fields =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')

function duration(text: string): number {
    try {
        return parseDuration(text)
    } catch (e) {
        return reject((e as Error).message)
    }
}
