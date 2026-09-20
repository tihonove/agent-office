// Вход агента. Проекция — каталог только на чтение, собранный офисом. Видимость — физика: чего нет в проекции,
// того агент не прочитает.
//
//   содержимое = аудитория артефакта (потолок видимости) ∩ правило роли `sees` (что ей нужно) + дотянутое агентом

import type { Artifact, ArtifactId, Assignment, Manifest, Node, RoleName, SeesRule } from '@agent-office/shared'
import { stringify } from 'yaml'
import { ancestorsOf, childrenOf, type World } from './world.ts'

export type Projection = {
    /** Что вложено — попадёт в факт о подъёме агента. */
    artifacts: ArtifactId[]
    /** Файлы проекции: путь → текст. Разложит их канал. */
    files: Record<string, string>
}

/** Потолок видимости: артефакт адресован этой роли или всем. */
export const mayRead = (a: Artifact, role: RoleName): boolean => a.audience.includes(role) || a.audience.includes('*')

export function planProjection(w: World, m: Manifest, role: RoleName, node: Node, previous?: Assignment): Projection {
    const rules = m.roles[role]?.sees ?? []
    const pulled = previous?.extra ?? []

    const readable = [...w.artifacts.values()].filter((a) => mayRead(a, role))
    const included = readable.filter((a) => pulled.includes(a.id) || rules.some((rule) => matches(rule, a, w, node)))
    const leftOut = readable.filter((a) => !included.includes(a))

    const files: Record<string, string> = { 'узел.md': nodeCard(w, node) }
    if (m.areas) {
        files['области.md'] = `# Карта областей\n\n${stringify(m.areas)}`
    }
    for (const a of included) {
        files[`артефакты/${a.id}-${a.kind}.md`] = artifactFile(a)
    }
    // Что ещё есть под потолком роли, но не вложено: это агент может дотянуть.
    if (leftOut.length) {
        files['артефакты/не-вложено.md'] = `# Можно дотянуть\n\n${leftOut.map(artifactLine).join('\n')}\n`
    }

    return { artifacts: included.map((a) => a.id), files }
}

function matches(rule: SeesRule, a: Artifact, w: World, node: Node): boolean {
    if (rule.kind !== '*' && rule.kind !== a.kind) {
        return false
    }
    const owners = {
        self: [node.id],
        ancestors: ancestorsOf(w, node.id).map((n) => n.id),
        children: childrenOf(w, node.id).map((n) => n.id),
    }
    return (rule.from ?? ['self']).some((from) => owners[from].includes(a.node))
}

function nodeCard(w: World, node: Node): string {
    const line = (n: Node) => `- ${n.id} · ${n.kind} · ${n.state}`
    const up = ancestorsOf(w, node.id)
    const down = childrenOf(w, node.id)
    return [
        `# Узел ${node.id}\n\nрод: ${node.kind}\nсостояние: ${node.state}\n`,
        ...Object.entries(node.fields).map(([name, value]) => `## ${name}\n\n${value}\n`),
        up.length ? `## Выше по дереву\n\n${up.map(line).join('\n')}\n` : '',
        down.length ? `## Дети\n\n${down.map(line).join('\n')}\n` : '',
    ].filter(Boolean).join('\n')
}

function artifactFile(a: Artifact): string {
    const author = a.author.kind === 'agent' ? a.author.key : a.author.kind
    const head = { id: a.id, node: a.node, kind: a.kind, author, audience: a.audience, ...a.meta }
    return `---\n${stringify(head)}---\n${a.body}\n`
}

const artifactLine = (a: Artifact): string => `- ${a.id} · ${a.kind} · узел ${a.node}`
