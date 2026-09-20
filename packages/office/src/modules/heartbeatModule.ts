import type { ContainerModule } from '../platform/di/container.ts'
import { Heartbeat, HeartbeatConfigDIToken, HeartbeatDIToken, type HeartbeatConfig } from '../services/heartbeat.ts'

/** Таймер, который будит сверку. */
export const heartbeatModule: ContainerModule<HeartbeatConfig> = (container, config) => {
    container
        .bind(HeartbeatConfigDIToken, () => config)
        .bind(HeartbeatDIToken, Heartbeat)
}
