import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Fact } from '@agent-office/shared'
import type { Store } from '../core/ports.ts'

// Журнал — jsonl-файл, по факту на строку.
export class FsStore implements Store {
    private file: string
    constructor(file: string) {
        this.file = file
    }

    async append(facts: Fact[]): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true })
        await appendFile(this.file, facts.map((f) => JSON.stringify(f) + '\n').join(''))
    }

    async read(): Promise<Fact[]> {
        const text = await readFile(this.file, 'utf8').catch(() => '')
        return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Fact)
    }
}

export class MemoryStore implements Store {
    facts: Fact[] = []
    async append(facts: Fact[]): Promise<void> {
        this.facts.push(...facts)
    }
    async read(): Promise<Fact[]> {
        return [...this.facts]
    }
}
