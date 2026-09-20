import type { Log } from '../core/ports.ts'

export const consoleLog: Log = {
    info: (message) => console.log(message),
    error: (message, cause) => console.error(message, cause ?? ''),
}

/** Для тестов: офис молчит. */
export const silentLog: Log = {
    info: () => {},
    error: () => {},
}
