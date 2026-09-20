// Всё общение с офисом — здесь. Контракт: packages/shared/src/api.ts.

import type { Fact, Snapshot } from '@agent-office/shared'

export type Mir = { snapshot: Snapshot; facts: Fact[] }

const get = async <T,>(path: string): Promise<T> => (await fetch(path)).json() as Promise<T>

export const load = async (): Promise<Mir> => {
    const [snapshot, facts] = await Promise.all([get<Snapshot>('/api/snapshot'), get<Fact[]>('/api/facts')])
    return { snapshot, facts }
}

export const text = async (path: string): Promise<string> => (await fetch(path)).text()

// Команда человека. Ошибку офиса (например, «уже дан ответ») показываем как есть.
export async function post(path: string, body: unknown): Promise<void> {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const out = (await res.json()) as { ok: boolean; error?: string }
    if (!out.ok) {
        throw new Error(out.error ?? 'офис отказал')
    }
}

// Офис шлёт событие на каждую запись в журнал; дашборда в ответ перечитывает мир целиком.
export function subscribe(onChange: () => void): () => void {
    const es = new EventSource('/api/events')
    es.onmessage = onChange
    return () => es.close()
}
