// Стол человека. Человек — узел контура, а не надзиратель: каждая его команда становится фактом в журнале.
// Заявка, ответ на запрос, вызов роли руками, поля узла, суждение.

import type { Fields, Kind, Manifest, NodeId, RequestId, RoleName } from '@agent-office/shared'
import { ManifestDIToken } from '../manifest/tokens.ts'
import { token } from '../platform/di/container.ts'
import { Journal, JournalDIToken } from './journal.ts'

const human = { kind: 'human' } as const

export class HumanDesk {
    public static dependencies = [JournalDIToken, ManifestDIToken] as const

    private readonly journal: Journal
    private readonly manifest: Manifest

    public constructor(journal: Journal, manifest: Manifest) {
        this.journal = journal
        this.manifest = manifest
    }

    /** Вбросить заявку. Без `kind` — род и состояние из `inbox` манифеста. */
    public async createNode(input: { kind?: Kind; parent?: NodeId; fields: Fields }): Promise<NodeId> {
        const { inbox, kinds } = this.manifest
        const kind = input.kind ?? inbox.kind
        const decl = kinds[kind]
        if (!decl) {
            throw new Error(`манифест не объявляет род «${kind}»`)
        }
        const world = this.journal.world()
        if (input.parent && !world.nodes.has(input.parent)) {
            throw new Error(`нет узла ${input.parent}`)
        }

        const id = `n-${world.nodes.size + 1}` as NodeId
        const state = kind === inbox.kind ? inbox.state : decl.states[0]!
        const { parent, fields } = input
        await this.journal.append([{ type: 'node.created', actor: human, node: id, payload: { kind, state, parent, fields } }])
        return id
    }

    /** Ответить на запрос — одним из его вариантов. */
    public async answer(id: RequestId, option: string): Promise<void> {
        const request = this.journal.world().requests.get(id)
        if (!request) {
            throw new Error(`нет запроса ${id}`)
        }
        if (request.answer) {
            throw new Error(`на запрос ${id} уже дан ответ: ${request.answer.option}`)
        }
        if (!request.options.includes(option)) {
            throw new Error(`«${option}» не из вариантов: ${request.options.join(', ')}`)
        }
        const payload = { request: id, option, by: 'human' } as const
        await this.journal.append([{ type: 'request.answered', actor: human, node: request.node, payload }])
    }

    /** Вызвать роль руками: она поднимется, даже если предикат молчит, а предохранитель сработал. */
    public async invoke(node: NodeId, role: RoleName): Promise<void> {
        if (!this.manifest.roles[role]) {
            throw new Error(`манифест не объявляет роль «${role}»`)
        }
        this.mustExist(node)
        await this.journal.append([{ type: 'role.invoked', actor: human, node, payload: { role } }])
    }

    /** Дописать узлу поля — так узел дозревает для роли, которая их ждёт. */
    public async setFields(node: NodeId, fields: Fields): Promise<void> {
        this.mustExist(node)
        await this.journal.append([{ type: 'node.fields', actor: human, node, payload: { fields } }])
    }

    /** Суждение руками — пока дешёвый агент не научился выносить его сам. Вердикт привязан к эпохе состояния. */
    public async verdict(node: NodeId, judge: string, verdict: boolean): Promise<void> {
        const epoch = this.mustExist(node).since
        await this.journal.append([{ type: 'judge.verdict', actor: human, node, payload: { judge, epoch, verdict } }])
    }

    private mustExist(id: NodeId) {
        const node = this.journal.world().nodes.get(id)
        if (!node) {
            throw new Error(`нет узла ${id}`)
        }
        return node
    }
}

export const HumanDeskDIToken = token<HumanDesk>('HumanDesk')
