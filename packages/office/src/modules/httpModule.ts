import { HttpConfigDIToken, HttpDoor, HttpDoorDIToken, type HttpConfig } from '../adapters/http.ts'
import type { ContainerModule } from '../platform/di/container.ts'

/** Дверь для человека: REST + SSE для дашборды. */
export const httpModule: ContainerModule<HttpConfig> = (container, config) => {
    container
        .bind(HttpConfigDIToken, () => config)
        .bind(HttpDoorDIToken, HttpDoor)
}
