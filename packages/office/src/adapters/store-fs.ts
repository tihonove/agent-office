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
        const facts: Fact[] = []
        for (const [i, line] of text.split('\n').entries()) {
            if (!line) {
                continue
            }
            try {
                facts.push(JSON.parse(line) as Fact)
            } catch {
                // Оборванная строка — дозапись, не дошедшая до диска (кончилось место, упало железо).
                // Офис не угадывает потерянный факт: говорит, где смотреть, и ждёт решения человека.
                throw new Error(
                    `журнал ${this.file}, строка ${i + 1}: не разбирается — факт дописан не до конца ` +
                    `(кончилось место на диске?). Факт — это одна строка: обрежьте оборванную и поднимите офис снова.`,
                )
            }
        }
        return facts
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
