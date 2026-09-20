// Карточка узла — цепочка наблюдаемости: назначение → проекция, с которой подняли → что опубликовал → чем закончил.

import { useState } from 'react'
import type { Assignment, Fact, Node, Snapshot } from '@agent-office/shared'
import { text } from './api.ts'
import type { Act } from './App.tsx'
import { when } from './Inbox.tsx'
import { FactRow } from './Journal.tsx'

type Props = { node: Node; snapshot: Snapshot; facts: Fact[]; act: Act }

export function NodeCard({ node, snapshot, facts, act }: Props) {
    const [field, setField] = useState({ name: '', value: '' })
    const assignments = snapshot.assignments.filter((a) => a.node === node.id)
    const artifacts = snapshot.artifacts.filter((a) => a.node === node.id)
    const requests = snapshot.requests.filter((r) => r.node === node.id)

    return (
        <>
            <h2>{node.id} · {node.kind} · <span className="state">{node.state}</span></h2>
            {node.parent && <div className="meta">родитель: {node.parent}{node.bornFrom && ` · порождён артефактом ${node.bornFrom.artifact}`}</div>}

            <h3>Поля</h3>
            {Object.entries(node.fields).map(([k, v]) => <div className="kv" key={k}><b>{k}</b><pre>{v}</pre></div>)}
            <div className="row">
                <input placeholder="поле" value={field.name} onChange={(e) => setField({ ...field, name: e.target.value })} />
                <input placeholder="значение" className="grow" value={field.value} onChange={(e) => setField({ ...field, value: e.target.value })} />
                <button disabled={!field.name} onClick={() => act(`/api/nodes/${node.id}/fields`, { fields: { [field.name]: field.value } }).then(() => setField({ name: '', value: '' }))}>записать</button>
            </div>

            <h3>Назначения</h3>
            {assignments.length === 0 && <p className="empty">на узле никто не работал</p>}
            {assignments.map((a) => <AssignmentCard key={a.key} a={a} running={snapshot.running.includes(a.key)} />)}
            <div className="row">
                <span className="meta">вызвать руками:</span>
                {Object.keys(snapshot.manifest.roles).map((role) => <button key={role} onClick={() => act(`/api/nodes/${node.id}/invoke`, { role })}>{role}</button>)}
            </div>

            <h3>Артефакты</h3>
            {artifacts.length === 0 && <p className="empty">нет</p>}
            {artifacts.map((a) => (
                <details className="card" key={a.id}>
                    <summary>{a.id} · <b>{a.kind}</b> · от {a.author.kind === 'agent' ? a.author.key : a.author.kind} → {a.audience.join(', ')}</summary>
                    {Object.keys(a.meta).length > 0 && <pre className="dim">{JSON.stringify(a.meta, null, 2)}</pre>}
                    <pre>{a.body}</pre>
                </details>
            ))}

            {requests.length > 0 && <h3>Запросы</h3>}
            {requests.map((r) => (
                <div className="kv" key={r.id}>
                    <b>{r.id}</b>
                    <span>{r.question} → {r.answer ? `«${r.answer.option}» (${r.answer.by === 'deadline' ? 'по дедлайну' : 'человек'})` : `ждёт до ${when(r.deadline)}, по молчанию «${r.default}»`}</span>
                </div>
            ))}

            <h3>Факты узла</h3>
            <div className="facts">{facts.filter((f) => f.node === node.id).map((f) => <FactRow key={f.id} fact={f} />)}</div>
        </>
    )
}

function AssignmentCard({ a, running }: { a: Assignment; running: boolean }) {
    const [view, setView] = useState<{ what: string; body: string }>()
    const show = async (what: 'повод' | 'транскрипт') => {
        if (view?.what === what) {
            return setView(undefined)
        }
        const raw = await text(`/api/assignments/${encodeURIComponent(a.role)}/${a.node}/${encodeURIComponent(what)}`)
        setView({ what, body: what === 'транскрипт' ? transcript(raw) : raw })
    }
    return (
        <div className="card">
            <div>
                <b>{a.key}</b> · <span className={`agent ${a.status.is}`}>{a.status.is}{running && ' ●'}</span> · заход {a.run.attempt}
                {a.status.is === 'finished' && <> · исход «{a.status.outcome}»</>}
                {a.status.is === 'waiting' && a.status.request && <> · ждёт {a.status.request}</>}
                {a.losses > 0 && <> · потерь подряд {a.losses}</>}
            </div>
            <div className="meta">{when(a.run.started.at)}{a.run.ended && ` → ${when(a.run.ended.at)}`} · {a.executor} · сессия {a.run.session.slice(0, 8)}</div>
            <div className="meta">в проекции: {a.run.projection.join(', ') || 'только узел'}{a.extra.length > 0 && ` · дотянуто: ${a.extra.join(', ')}`}</div>
            <div className="row">
                <button onClick={() => show('повод')}>повод</button>
                <button onClick={() => show('транскрипт')}>транскрипт</button>
            </div>
            {view && <pre className="viewer">{view.body || '(пусто)'}</pre>}
        </div>
    )
}

// stream-json от claude → читаемые строки: что сказал, какой инструмент позвал, чем кончил.
function transcript(raw: string): string {
    return raw.split('\n').filter(Boolean).map((line) => {
        try {
            const e = JSON.parse(line) as { type: string; error?: string; result?: string; message?: { content?: { type: string; text?: string; name?: string; input?: unknown }[] } }
            if (e.type === 'assistant') {
                return (e.message?.content ?? []).map((c) =>
                    c.type === 'text' ? `💬 ${c.text}` : c.type === 'tool_use' ? `🔧 ${c.name} ${JSON.stringify(c.input).slice(0, 200)}` : '').filter(Boolean).join('\n')
            }
            if (e.type === 'result') {
                return `✅ ${e.result ?? ''}`
            }
            if (e.type === 'office') {
                return `⚠️ ${e.error}`
            }
            return ''
        } catch {
            return line
        }
    }).filter(Boolean).join('\n\n')
}
