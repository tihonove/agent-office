// Дверь для человека: REST + SSE на голом node:http. Контракт — packages/shared/src/api.ts.
// Каждая команда человека — факт; сразу после неё тик, чтобы дашборда увидела последствия.

import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import type {
    AgentKey, AnswerBody, CreateNodeBody, FieldsBody, InvokeBody, NodeId, RequestId, VerdictBody,
} from '@agent-office/shared'
import {
    LogDIToken, WorkplacesDIToken, type Log, type Workplaces,
} from '../core/ports.ts'
import { token } from '../platform/di/container.ts'
import { HumanDesk, HumanDeskDIToken } from '../services/humanDesk.ts'
import { Journal, JournalDIToken } from '../services/journal.ts'
import { Reconciler, ReconcilerDIToken } from '../services/reconciler.ts'
import { SnapshotService, SnapshotServiceDIToken } from '../services/snapshotService.ts'

export type HttpConfig = {
    port: number
    /** Собранная дашборда, если есть. */
    staticDir?: string
}

export const HttpConfigDIToken = token<HttpConfig>('HttpConfig')

/** Параметры пути (`:id`) и тело запроса. */
type Call = { params: Record<string, string>; body: <T>() => Promise<T> }

/** Что вернул обработчик: данные → JSON, текст → как есть, `stream` — обработчик ответил сам. */
type Reply = { json: unknown } | { text: string } | 'stream'

type Handler = (call: Call, req: IncomingMessage, res: ServerResponse) => Promise<Reply>
type Route = [method: string, path: string, handler: Handler]

export class HttpDoor {
    public static dependencies = [
        HttpConfigDIToken, SnapshotServiceDIToken, JournalDIToken, HumanDeskDIToken, ReconcilerDIToken,
        WorkplacesDIToken, LogDIToken,
    ] as const

    private readonly config: HttpConfig
    private readonly snapshots: SnapshotService
    private readonly journal: Journal
    private readonly desk: HumanDesk
    private readonly reconciler: Reconciler
    private readonly workplaces: Workplaces
    private readonly log: Log
    private readonly routes: Route[]

    public constructor(
        config: HttpConfig,
        snapshots: SnapshotService,
        journal: Journal,
        desk: HumanDesk,
        reconciler: Reconciler,
        workplaces: Workplaces,
        log: Log,
    ) {
        this.config = config
        this.snapshots = snapshots
        this.journal = journal
        this.desk = desk
        this.reconciler = reconciler
        this.workplaces = workplaces
        this.log = log
        this.routes = this.declareRoutes()
    }

    public listen(): Server {
        const server = createServer((req, res) => {
            // Ошибку офиса («на запрос уже дан ответ») отдаём человеку как есть.
            this.handle(req, res).catch((e: unknown) => {
                sendJson(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
            })
        })
        // Только локальная машина: у двери нет ни паролей, ни ролей.
        server.listen(this.config.port, '127.0.0.1')
        return server
    }

    private declareRoutes(): Route[] {
        const { desk } = this
        return [
            // ── наблюдаемость ──
            ['GET', '/api/snapshot', async () => ({ json: await this.snapshots.snapshot() })],
            ['GET', '/api/facts', async () => ({ json: this.journal.facts() })],
            ['GET', '/api/events', (_, req, res) => this.streamEvents(req, res)],
            ['GET', '/api/assignments/:role/:node/:what', ({ params }) => this.readWorkplace(params)],

            // ── команды человека ──
            ['POST', '/api/nodes', ({ body }) =>
                this.command(async () => desk.createNode(await body<CreateNodeBody>()))],
            ['POST', '/api/nodes/:id/fields', ({ params, body }) =>
                this.command(async () => desk.setFields(params['id'] as NodeId, (await body<FieldsBody>()).fields))],
            ['POST', '/api/nodes/:id/invoke', ({ params, body }) =>
                this.command(async () => desk.invoke(params['id'] as NodeId, (await body<InvokeBody>()).role))],
            ['POST', '/api/requests/:id/answer', ({ params, body }) =>
                this.command(async () => desk.answer(params['id'] as RequestId, (await body<AnswerBody>()).answer))],
            ['POST', '/api/verdicts', ({ body }) =>
                this.command(async () => {
                    const { node, judge, verdict } = await body<VerdictBody>()
                    await desk.verdict(node, judge, verdict)
                })],
        ]
    }

    /** Команда человека: записать факт и сразу тикнуть, чтобы дашборда увидела последствия. */
    private async command(run: () => Promise<unknown>): Promise<Reply> {
        const result = await run()
        await this.reconciler.tick().catch((e: unknown) => this.log.error('тик упал', e))
        return { json: { ok: true, result } }
    }

    /** SSE: событие на каждую запись в журнал; дашборда в ответ перечитывает снимок. */
    private async streamEvents(req: IncomingMessage, res: ServerResponse): Promise<Reply> {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
        const ping = () => res.write(`data: ${this.journal.facts().length}\n\n`)
        ping()
        req.on('close', this.journal.onFacts(ping))
        return 'stream'
    }

    /** Каталог назначения глазами человека: повод и транскрипт воплощения. */
    private async readWorkplace(params: Record<string, string>): Promise<Reply> {
        const file = { повод: 'повод.md', транскрипт: 'транскрипт.jsonl' }[params['what']!]
        if (!file) {
            throw new Error(`не знаю, что такое «${params['what']}»`)
        }
        const place = this.workplaces.place(`${params['role']}/${params['node']}` as AgentKey)
        return { text: await readFile(join(place, file), 'utf8').catch(() => '') }
    }

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://office')
        const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

        for (const [method, path, handler] of this.routes) {
            const params = method === req.method && matchPath(path, segments)
            if (!params) {
                continue
            }
            const reply = await handler({ params, body: () => readJson(req) }, req, res)
            if (reply === 'stream') {
                return
            }
            if ('text' in reply) {
                res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(reply.text)
                return
            }
            return sendJson(res, 200, reply.json)
        }

        const { staticDir } = this.config
        if (req.method === 'GET' && staticDir && !url.pathname.startsWith('/api/')) {
            return sendStatic(res, staticDir, url.pathname)
        }
        sendJson(res, 404, { ok: false, error: `нет такого: ${req.method} ${url.pathname}` })
    }
}

export const HttpDoorDIToken = token<HttpDoor>('HttpDoor')

/** `/api/nodes/:id/fields` против сегментов пути → параметры или `undefined`. */
function matchPath(pattern: string, segments: string[]): Record<string, string> | undefined {
    const parts = pattern.split('/').filter(Boolean)
    if (parts.length !== segments.length) {
        return undefined
    }
    const params: Record<string, string> = {}
    for (const [i, part] of parts.entries()) {
        if (part.startsWith(':')) {
            params[part.slice(1)] = segments[i]!
        } else if (part !== segments[i]) {
            return undefined
        }
    }
    return params
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
        chunks.push(chunk as Buffer)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
}

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

function sendStatic(res: ServerResponse, dir: string, pathname: string): void {
    const wanted = join(dir, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
    const file = existsSync(wanted) && extname(wanted) ? wanted : join(dir, 'index.html')   // всё прочее — SPA
    res.writeHead(200, { 'content-type': `${MIME[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` })
    createReadStream(file).pipe(res)
}
