import { FsStore, MemoryStore } from '../adapters/store-fs.ts'
import { StoreDIToken } from '../core/ports.ts'
import type { ContainerModule } from '../platform/di/container.ts'

/** Журнал в jsonl-файле. */
export const storageModule: ContainerModule<{ journalFile: string }> = (container, { journalFile }) => {
    container.bind(StoreDIToken, () => new FsStore(journalFile))
}

/** Журнал в памяти — для тестов. */
export const storageModuleInMemory: ContainerModule = (container) => {
    container.bind(StoreDIToken, () => new MemoryStore())
}
