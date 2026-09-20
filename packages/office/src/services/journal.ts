// Журнал — append-only и единственный источник правды. Все факты офиса пишутся только здесь.
// Состояние нигде не хранится: мир каждый раз сворачивается из журнала.

import type { Fact, FactDraft, FactId } from '@agent-office/shared'
import { fold } from '../core/fold.ts'
import { ClockDIToken, StoreDIToken, type Clock, type Store } from '../core/ports.ts'
import type { World } from '../core/world.ts'
import { token } from '../platform/di/container.ts'

export type FactsListener = (facts: Fact[]) => void

export class Journal {
    public static dependencies = [StoreDIToken, ClockDIToken] as const

    private readonly store: Store
    private readonly clock: Clock
    /** Писатель один, поэтому журнал в памяти = журнал на диске. */
    private journal: Fact[] = []
    private listeners = new Set<FactsListener>()

    public constructor(store: Store, clock: Clock) {
        this.store = store
        this.clock = clock
    }

    /** Прочитать журнал из хранилища. Один раз, на старте офиса. */
    public async load(): Promise<void> {
        this.journal = await this.store.read()
    }

    public facts(): readonly Fact[] {
        return this.journal
    }

    /** Мир — свёртка журнала. */
    public world(): World {
        return fold(this.journal)
    }

    /** Записать факты: выдать им id и время, сохранить, оповестить подписчиков. */
    public async append(drafts: FactDraft[]): Promise<void> {
        if (!drafts.length) {
            return
        }
        const ts = this.clock.now().toISOString()
        const facts = drafts.map((draft, i) => ({ ...draft, id: factId(this.journal.length + i + 1), ts }))
        await this.store.append(facts)
        this.journal.push(...facts)
        for (const listener of this.listeners) {
            listener(facts)
        }
    }

    /** Подписаться на новые факты. Возвращает отписку. */
    public onFacts(listener: FactsListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
}

export const JournalDIToken = token<Journal>('Journal')

/** Монотонный и сортируемый как строка: по id видно, что было раньше. */
const factId = (n: number): FactId => `f-${String(n).padStart(9, '0')}` as FactId
