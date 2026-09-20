import type { AgentKey, NodeId } from '@agent-office/shared'

// Ключ назначения — «роль на узле». Стабилен между воплощениями: повторный запуск — продолжение, а не второй агент.
export const agentKey = (role: string, node: NodeId): AgentKey => `${role}/${node}` as AgentKey

export function parseAgentKey(key: AgentKey): { role: string; node: NodeId } {
    const at = key.lastIndexOf('/')
    return { role: key.slice(0, at), node: key.slice(at + 1) as NodeId }
}
