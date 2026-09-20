// Сердцебиение: будит сверку по таймеру. Команды человека будят её сами (adapters/http.ts), не дожидаясь удара.

import { LogDIToken, type Log } from '../core/ports.ts'
import { token } from '../platform/di/container.ts'
import { Reconciler, ReconcilerDIToken } from './reconciler.ts'

export type HeartbeatConfig = { everyMs: number }

export const HeartbeatConfigDIToken = token<HeartbeatConfig>('HeartbeatConfig')

export class Heartbeat {
    public static dependencies = [HeartbeatConfigDIToken, ReconcilerDIToken, LogDIToken] as const

    private readonly config: HeartbeatConfig
    private readonly reconciler: Reconciler
    private readonly log: Log

    public constructor(config: HeartbeatConfig, reconciler: Reconciler, log: Log) {
        this.config = config
        this.reconciler = reconciler
        this.log = log
    }

    /** Первый удар — сразу, дальше — по таймеру. Возвращает остановку. */
    public async start(): Promise<() => void> {
        await this.beat()
        const timer = setInterval(() => void this.beat(), this.config.everyMs)
        return () => clearInterval(timer)
    }

    private beat(): Promise<void> {
        return this.reconciler.tick().catch((e: unknown) => this.log.error('тик упал', e))
    }
}

export const HeartbeatDIToken = token<Heartbeat>('Heartbeat')
