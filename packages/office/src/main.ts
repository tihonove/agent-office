#!/usr/bin/env node
// agent-office <каталог проекта> [--fake] [--port 4700] [--tick 2000]
// Проект объявляет манифест (office.yaml), офис его применяет. Всё состояние — в <проект>/.office/.
//
// Здесь только старт: прочитать манифест, собрать контейнер (modules/productionProfile.ts), включить офис.

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { loadDashboard } from './adapters/dashboard.ts'
import { HttpDoorDIToken } from './adapters/http.ts'
import { LogDIToken } from './core/ports.ts'
import { loadManifest } from './manifest/load.ts'
import { createProductionContainer } from './modules/productionProfile.ts'
import { HeartbeatDIToken } from './services/heartbeat.ts'
import { JournalDIToken } from './services/journal.ts'

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        fake: { type: 'boolean', default: false },
        port: { type: 'string', default: '4700' },
        tick: { type: 'string', default: '2000' },
    },
})

const project = resolve(positionals[0] ?? '.')
const manifestFile = join(project, 'office.yaml')

if (!existsSync(manifestFile)) {
    console.error(`В ${project} нет манифеста office.yaml.\nЗапуск: agent-office <каталог проекта> [--fake] [--port 4700] [--tick 2000]`)
    process.exit(1)
}

const container = createProductionContainer({
    loaded: await loadManifest(manifestFile),
    project,
    fake: values.fake,
    port: Number(values.port),
    tickMs: Number(values.tick),
    dashboard: await loadDashboard(),
})

const log = container.get(LogDIToken)
const journal = container.get(JournalDIToken)

await journal.load()
journal.onFacts((facts) => {
    for (const fact of facts) {
        log.info(`${fact.ts} ${fact.node} ${fact.type} ${JSON.stringify(fact.payload).slice(0, 160)}`)
    }
})

container.get(HttpDoorDIToken).listen()
await container.get(HeartbeatDIToken).start()

log.info(`офис: ${project}${values.fake ? ' (исполнители-заглушки)' : ''}\nдверь: http://127.0.0.1:${values.port}`)
