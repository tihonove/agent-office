// Дерево работы: род, состояние, кто на узле. Узел с детьми — учётный, ролям не раздаётся.

import type { Node, NodeId, Snapshot } from '@agent-office/shared'

type Props = { snapshot: Snapshot; selected?: NodeId; onSelect: (id: NodeId) => void }

export function Tree({ snapshot, selected, onSelect }: Props) {
    const childrenOf = (id?: NodeId) => snapshot.nodes.filter((n) => n.parent === id)
    const closed = (n: Node) => (snapshot.manifest.kinds[n.kind]?.closed ?? []).includes(n.state)

    const row = (n: Node, depth: number) => {
        const agents = snapshot.assignments.filter((a) => a.node === n.id && (a.status.is === 'alive' || a.status.is === 'waiting'))
        const title = Object.values(n.fields)[0] ?? ''
        return (
            <div key={n.id}>
                <div className={`node${n.id === selected ? ' selected' : ''}${closed(n) ? ' closed' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => onSelect(n.id)}>
                    <span className="id">{n.id}</span>
                    <span className="state">{n.state}</span>
                    <span className="title">{title}</span>
                    {agents.map((a) => (
                        <span key={a.key} className={`agent ${a.status.is}`} title={a.status.is === 'waiting' ? 'ждёт ответа' : snapshot.running.includes(a.key) ? 'работает' : 'поднят'}>
                            {a.role}{a.status.is === 'waiting' ? ' ⏸' : ' ●'}
                        </span>
                    ))}
                </div>
                {childrenOf(n.id).map((c) => row(c, depth + 1))}
            </div>
        )
    }

    return (
        <>
            <h2>Дерево работы</h2>
            {snapshot.nodes.length === 0 && <p className="empty">пусто — вбрось заявку</p>}
            {childrenOf(undefined).map((n) => row(n, 0))}
        </>
    )
}
