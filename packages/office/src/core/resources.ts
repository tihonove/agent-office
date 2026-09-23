// Ресурсы: именованные ёмкости, которые агент занимает на время жизни. Чистые функции от манифеста и мира —
// сверка спрашивает «хватит ли роли ресурсов» перед каждым подъёмом и сама помнит, кого подняла на этом же шаге.

import type { Manifest, ResourceName, RoleName, Takes } from '@agent-office/shared'
import type { World } from './world.ts'

/** Что берёт агент этой роли: доля исполнителя, поверх неё — доля роли по одноимённым ресурсам. */
export function takesOf(m: Manifest, role: RoleName): Takes {
    const executor = m.roles[role]?.executor
    return { ...(executor !== undefined ? m.executors[executor]?.takes : undefined), ...m.roles[role]?.takes }
}

/** Сколько каждого ресурса держат живые агенты и те, кого подняли на этом шаге. */
export function occupied(m: Manifest, w: World, raisedNow: RoleName[]): Map<ResourceName, number> {
    const alive = [...w.assignments.values()].filter((a) => a.status.is === 'alive').map((a) => a.role)
    const held = new Map<ResourceName, number>()
    for (const role of [...alive, ...raisedNow]) {
        for (const [resource, amount] of Object.entries(takesOf(m, role))) {
            held.set(resource, (held.get(resource) ?? 0) + amount)
        }
    }
    return held
}

/** Первый ресурс, которого роли не хватает: занято плюс её доля больше ёмкости. Нет такого — поднимать можно. */
export function missingResource(m: Manifest, w: World, role: RoleName, raisedNow: RoleName[]): ResourceName | undefined {
    const held = occupied(m, w, raisedNow)
    for (const [resource, amount] of Object.entries(takesOf(m, role))) {
        const capacity = m.resources?.[resource] ?? 0
        if ((held.get(resource) ?? 0) + amount > capacity) {
            return resource
        }
    }
    return undefined
}
