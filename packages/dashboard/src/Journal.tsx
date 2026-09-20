// Хвост журнала фактов — единственного источника правды.

import type { Fact, NodeId } from '@agent-office/shared'

export function Journal({ facts, onSelect }: { facts: Fact[]; onSelect: (id: NodeId) => void }) {
    return (
        <>
            <h2>Журнал</h2>
            <div className="facts">{facts.slice(-200).toReversed().map((f) => <FactRow key={f.id} fact={f} onSelect={onSelect} />)}</div>
        </>
    )
}

export function FactRow({ fact, onSelect }: { fact: Fact; onSelect?: (id: NodeId) => void }) {
    const actor = fact.actor.kind === 'agent' ? fact.actor.key : fact.actor.kind
    return (
        <div className="fact">
            <span className="dim">{new Date(fact.ts).toLocaleTimeString('ru')}</span>
            {onSelect && <a onClick={() => onSelect(fact.node)}>{fact.node}</a>}
            <b>{fact.type}</b>
            <span className="dim">{actor}</span>
            <span className="payload">{brief(fact)}</span>
        </div>
    )
}

function brief(f: Fact): string {
    switch (f.type) {
        case 'node.created': return `${f.payload.kind} · ${f.payload.state}${f.payload.bornFrom ? ` · из ${f.payload.bornFrom.artifact}` : ''}`
        case 'node.state': return `${f.payload.from} → ${f.payload.to} (${f.payload.reason})`
        case 'node.fields': return Object.keys(f.payload.fields).join(', ')
        case 'artifact.published': return `${f.payload.id} · ${f.payload.kind} → ${f.payload.audience.join(', ')}`
        case 'call.rejected': return `${f.payload.call}: ${f.payload.reason}`
        case 'agent.spawned': return `${f.payload.key} · заход ${f.payload.attempt}${f.payload.resume ? ' · продолжение сессии' : ''} · проекция: ${f.payload.projection.join(', ') || '—'}`
        case 'agent.finished': return `${f.payload.key} · ${f.payload.outcome}`
        case 'agent.waiting': return `${f.payload.key}${f.payload.request ? ` ждёт ${f.payload.request}` : ' ждёт подъёма'}`
        case 'agent.lost': return f.payload.key
        case 'projection.extended': return `${f.payload.key} + ${f.payload.artifacts.join(', ')}`
        case 'flag.raised': return f.payload.text
        case 'request.opened': return `${f.payload.id} · ${f.payload.question}`
        case 'request.answered': return `${f.payload.request} → ${f.payload.option}${f.payload.by === 'deadline' ? ' (по дедлайну)' : ''}`
        case 'role.invoked': return f.payload.role
        case 'judge.verdict': return `${f.payload.judge} → ${f.payload.verdict ? 'да' : 'нет'}`
    }
}
