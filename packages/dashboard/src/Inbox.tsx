// Всё, что ждёт человека: вброс заявки, открытые запросы, ожидающие суждения, флаги.

import { useState } from 'react'
import type { NodeId, Snapshot } from '@agent-office/shared'
import type { Act } from './App.tsx'

type Props = { snapshot: Snapshot; act: Act; onSelect: (id: NodeId) => void }

export function Inbox({ snapshot, act, onSelect }: Props) {
    const open = snapshot.requests.filter((r) => !r.answer)
    return (
        <>
            <h2>Вбросить заявку</h2>
            <NewNode snapshot={snapshot} act={act} />

            <h2>Запросы к тебе <Count n={open.length} /></h2>
            {open.length === 0 && <p className="empty">офис ни о чём не спрашивает</p>}
            {open.map((r) => (
                <div className="card" key={r.id}>
                    <div className="meta">
                        <a onClick={() => onSelect(r.node)}>{r.node}</a> · {r.openedBy.kind === 'agent' ? r.openedBy.key : `объявлен: ${r.openedBy.decl}`} · до {when(r.deadline)}
                    </div>
                    <p>{r.question}</p>
                    <div className="row">
                        {r.options.map((o) => (
                            <button key={o} onClick={() => act(`/api/requests/${r.id}/answer`, { answer: o })} title={o === r.default ? 'исход по молчанию' : undefined}>
                                {o}{o === r.default && ' ⏱'}
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {snapshot.pendingJudgements.length > 0 && <h2>Ожидают суждения <Count n={snapshot.pendingJudgements.length} /></h2>}
            {snapshot.pendingJudgements.map((j) => (
                <div className="card" key={`${j.node}/${j.judge}`}>
                    <div className="meta"><a onClick={() => onSelect(j.node)}>{j.node}</a> · {j.judge}</div>
                    <p>{j.ask}</p>
                    <div className="row">
                        <button onClick={() => act('/api/verdicts', { node: j.node, judge: j.judge, verdict: true })}>да</button>
                        <button onClick={() => act('/api/verdicts', { node: j.node, judge: j.judge, verdict: false })}>нет</button>
                    </div>
                </div>
            ))}

            {snapshot.flags.length > 0 && <h2>Флаги <Count n={snapshot.flags.length} /></h2>}
            {snapshot.flags.toReversed().map((f) => (
                <div className="card flag" key={f.raised.fact}>
                    <div className="meta"><a onClick={() => onSelect(f.node)}>{f.node}</a> · {f.by.kind === 'agent' ? f.by.key : f.by.kind} · {when(f.raised.at)}</div>
                    <p>{f.text}</p>
                </div>
            ))}
        </>
    )
}

// Имена полей офису безразличны. Подсказываем те, без которых роли на входе не поднимутся (needs).
function NewNode({ snapshot, act }: { snapshot: Snapshot; act: Act }) {
    const { manifest } = snapshot
    const hint = [...new Set(Object.values(manifest.roles)
        .filter((r) => [r.when.state].flat().includes(manifest.inbox.state))
        .flatMap((r) => r.needs ?? []))]
    const blank = () => (hint.length ? hint : ['']).map((name) => ({ name, value: '' }))
    const [kind, setKind] = useState(manifest.inbox.kind)
    const [rows, setRows] = useState(blank)
    const edit = (i: number, patch: Partial<{ name: string; value: string }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

    const submit = async () => {
        const fields = Object.fromEntries(rows.filter((r) => r.name && r.value).map((r) => [r.name, r.value]))
        await act('/api/nodes', { kind, fields })
        setRows(blank())
    }

    return (
        <div className="card">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.keys(manifest.kinds).map((k) => <option key={k}>{k}</option>)}
            </select>
            {rows.map((r, i) => (
                <div className="field" key={i}>
                    <input placeholder="поле" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
                    <textarea placeholder="значение" rows={3} value={r.value} onChange={(e) => edit(i, { value: e.target.value })} />
                </div>
            ))}
            <div className="row">
                <button onClick={() => setRows([...rows, { name: '', value: '' }])}>+ поле</button>
                <button className="primary" onClick={submit}>вбросить</button>
            </div>
        </div>
    )
}

const Count = ({ n }: { n: number }) => (n ? <span className="count">{n}</span> : null)

export const when = (iso: string): string => new Date(iso).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
