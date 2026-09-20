// Дашборда: наблюдаемость + три действия человека (вбросить заявку, ответить на запрос, вызвать роль).
// Никакого своего состояния мира: всё, что видно, — снимок офиса и его журнал.

import { useEffect, useState } from 'react'
import type { NodeId } from '@agent-office/shared'
import { load, post, subscribe, type Mir } from './api.ts'
import { Inbox } from './Inbox.tsx'
import { Journal } from './Journal.tsx'
import { NodeCard } from './NodeCard.tsx'
import { Tree } from './Tree.tsx'

export type Act = (path: string, body: unknown) => Promise<void>

export function App() {
    const [mir, setMir] = useState<Mir>()
    const [selected, setSelected] = useState<NodeId>()
    const [error, setError] = useState<string>()

    useEffect(() => {
        const refresh = () => load().then(setMir, (e: Error) => setError(`офис недоступен: ${e.message}`))
        const off = subscribe(refresh)
        const timer = setInterval(refresh, 5000)   // кто из агентов жив, журнал не сообщает — перечитываем
        return () => {
            off()
            clearInterval(timer)
        }
    }, [])

    const act: Act = async (path, body) => {
        try {
            await post(path, body)
            setError(undefined)
        } catch (e) {
            setError((e as Error).message)
        }
    }

    if (!mir) {
        return <p className="empty">{error ?? 'читаю журнал…'}</p>
    }
    const { snapshot, facts } = mir
    const node = snapshot.nodes.find((n) => n.id === selected)

    return (
        <div className="layout">
            <header>
                <h1>agent-office</h1>
                <span>узлов {snapshot.nodes.length} · агентов в работе {snapshot.running.length} · фактов {facts.length}</span>
                {error && <span className="error" onClick={() => setError(undefined)}>{error}</span>}
            </header>
            <section className="col"><Inbox snapshot={snapshot} act={act} onSelect={setSelected} /></section>
            <section className="col"><Tree snapshot={snapshot} selected={selected} onSelect={setSelected} /></section>
            <section className="col wide">
                {node ? <NodeCard key={node.id} node={node} snapshot={snapshot} facts={facts} act={act} /> : <p className="empty">выбери узел в дереве</p>}
            </section>
            <footer><Journal facts={facts} onSelect={setSelected} /></footer>
        </div>
    )
}
