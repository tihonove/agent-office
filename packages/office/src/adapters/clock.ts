import type { Clock } from '../core/ports.ts'

export const systemClock: Clock = { now: () => new Date() }

// Управляемое время для сценариев: дедлайны протухают мгновенно.
export class ManualClock implements Clock {
    private t: number
    constructor(start = '2026-01-01T00:00:00.000Z') {
        this.t = new Date(start).getTime()
    }
    now(): Date {
        return new Date(this.t)
    }
    advance(ms: number): void {
        this.t += ms
    }
}
