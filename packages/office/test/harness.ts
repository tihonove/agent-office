// Стенд для сценариев петли: офис из тестового профиля — те же сервисы, что в бою,
// вокруг настоящего файлового канала, заглушки-исполнителя и ручных часов.

import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Manifest, NodeId } from '@agent-office/shared'
import { ManualClock } from '../src/adapters/clock.ts'
import { FakeExecutor, type Script } from '../src/adapters/executor-fake.ts'
import { StoreDIToken } from '../src/core/ports.ts'
import { loadManifest } from '../src/manifest/load.ts'
import { createTestContainer } from '../src/modules/testProfile.ts'
import { HumanDeskDIToken } from '../src/services/humanDesk.ts'
import { JournalDIToken } from '../src/services/journal.ts'
import { ReconcilerDIToken } from '../src/services/reconciler.ts'
import { SnapshotServiceDIToken } from '../src/services/snapshotService.ts'

/** Открыть офис на манифесте. Все исполнители манифеста — одна заглушка со сценарием `script`. */
export async function openOffice(manifestFile: string, script: Script, tweak?: (m: Manifest) => void) {
    const loaded = await loadManifest(manifestFile)
    tweak?.(loaded.manifest)

    const clock = new ManualClock()
    const executor = new FakeExecutor(script)
    const executors = Object.fromEntries(Object.keys(loaded.manifest.executors).map((name) => [name, executor]))
    const places = await mkdtemp(join(tmpdir(), 'office-'))
    const container = createTestContainer({ loaded, places, clock, executors })

    const journal = container.get(JournalDIToken)
    const desk = container.get(HumanDeskDIToken)
    const reconciler = container.get(ReconcilerDIToken)
    const snapshots = container.get(SnapshotServiceDIToken)
    const store = container.get(StoreDIToken)
    await journal.load()

    /** Тикать, пока мир не успокоится. */
    const settle = async () => {
        for (let i = 0; i < 50; i++) {
            const before = journal.facts().length
            await reconciler.tick()
            if (journal.facts().length === before) {
                return
            }
        }
        assert.fail('мир не успокоился за 50 тиков')
    }
    const node = (id: string) => journal.world().nodes.get(id as NodeId)!
    const types = () => journal.facts().map((f) => f.type)
    /** Единственный открытый запрос человеку. */
    const openRequest = () => {
        const open = [...journal.world().requests.values()].filter((r) => !r.answer)
        assert.equal(open.length, 1, `жду один открытый запрос, вижу ${open.length}`)
        return open[0]!
    }

    return { journal, desk, reconciler, snapshots, store, clock, executor, settle, node, types, openRequest }
}

/** Файл для out/: шапка YAML + текст. */
export const file = (head: string, body = ''): string => `---\n${head}\n---\n${body}\n`
