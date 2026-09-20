// Наш собственный офис (office.yaml в корне репозитория): штурман, аналитик, реализатор.
// Сценарии закрепляют путь заявки: человек дважды в контуре, стенд — всегда, доработка — через аналитика.

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { SpawnRequest } from '../src/core/ports.ts'
import { file, openOffice } from './harness.ts'

const MANIFEST = join(import.meta.dirname, '../../../office.yaml')
const DAY = 864e5

/** Каждая роль делает ровно то, что велит её промпт. */
const obedient = (req: SpawnRequest): Record<string, string> => {
    switch (req.role) {
        case 'штурман':
            return { 'результат.md': file('outcome: в работу') }
        case 'аналитик':
            return {
                'артефакт-постановка.md': file('kind: постановка\naudience: ["*"]', 'что делаем и как проверить'),
                'результат.md': file('outcome: готово\nfields: { критерий: видно на стенде, область: дашборда }'),
            }
        case 'реализатор':
            return {
                'артефакт-отчёт.md': file('kind: отчёт\naudience: ["*"]', 'ветка n-1, worktree .claude/worktrees/n-1'),
                'результат.md': file('outcome: готово'),
            }
        case 'штурман-стенд':
            return {
                'артефакт-стенд.md': file('kind: стенд\naudience: ["*"]', 'http://127.0.0.1:4801'),
                'результат.md': file('outcome: поднят'),
            }
        case 'штурман-вливание':
            return { 'результат.md': file('outcome: влито') }
        default:
            return {}
    }
}

test('заявка идёт курсом: штурман → аналитик → человек → реализатор → стенд → человек → вливание', async () => {
    const { desk, executor, settle, node, openRequest } = await openOffice(MANIFEST, obedient)
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()

    assert.equal(node(id).state, 'согласование', 'без «делаем» от человека реализация не начинается')
    assert.deepEqual(executor.spawned.map((r) => r.role), ['штурман', 'аналитик'])

    await desk.answer(openRequest().id, 'делаем')
    await settle()
    assert.equal(node(id).state, 'приёмка', 'человек принимает живой стенд')
    assert.deepEqual(executor.spawned.map((r) => r.role).slice(2), ['реализатор', 'штурман-стенд'])

    await desk.answer(openRequest().id, 'вливать')
    await settle()
    assert.equal(node(id).state, 'готово')
    assert.equal(executor.spawned.at(-1)?.role, 'штурман-вливание')
})

test('доработка после приёмки идёт через аналитика и снова через стенд', async () => {
    const { desk, executor, settle, node, openRequest } = await openOffice(MANIFEST, obedient)
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()
    await desk.answer(openRequest().id, 'делаем')
    await settle()

    await desk.setFields(id, { замечания: 'кнопка не того цвета' })
    await desk.answer(openRequest().id, 'доработать')
    await settle()
    assert.equal(node(id).state, 'согласование', 'новую редакцию постановки снова подтверждает человек')

    await desk.answer(openRequest().id, 'делаем')
    await settle()
    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual(
        executor.spawned.map((r) => r.role).slice(4),
        ['аналитик', 'реализатор', 'штурман-стенд'],
        'стенд поднимается после каждой реализации',
    )
})

test('молчание человека ничего не вливает: заявка откладывается, вернуть её — вызвать роль руками', async () => {
    const { desk, clock, settle, node, openRequest } = await openOffice(MANIFEST, obedient)
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()
    await desk.answer(openRequest().id, 'делаем')
    await settle()
    assert.equal(node(id).state, 'приёмка')

    clock.advance(3 * DAY + 1)
    await settle()
    assert.equal(node(id).state, 'отложена')

    await desk.invoke(id, 'штурман-стенд')
    await settle()
    assert.equal(node(id).state, 'приёмка', 'стенд переподнят, человек снова спрошен')
    assert.equal(openRequest().node, id)
})

test('стенд не поднялся или ветка не влилась — заявка возвращается реализатору', async () => {
    let standFails = true
    const { desk, executor, settle, node, openRequest } = await openOffice(MANIFEST, (req) => {
        if (req.role === 'штурман-стенд' && standFails) {
            standFails = false
            return {
                'артефакт-замечания.md': file('kind: замечания\naudience: [реализатор]', 'npm install упал'),
                'результат.md': file('outcome: не поднялся'),
            }
        }
        return obedient(req)
    })
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()
    await desk.answer(openRequest().id, 'делаем')
    await settle()

    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual(
        executor.spawned.map((r) => r.role).slice(2),
        ['реализатор', 'штурман-стенд', 'реализатор', 'штурман-стенд'],
    )
})

test('штурман разбивает большую заявку: дети идут сразу аналитику, открыты не больше двух', async () => {
    const course = file('kind: курс\naudience: ["*"]\nnodes:\n' + [1, 2, 3].map((i) => `  - { описание: часть ${i} }`).join('\n'))
    const { journal, desk, settle, node } = await openOffice(MANIFEST, (req) =>
        req.key === 'штурман/n-1' ? { 'артефакт-курс.md': course, 'результат.md': file('outcome: разбито') } : obedient(req))
    const root = await desk.createNode({ fields: { описание: 'большая заявка' } })
    await settle()

    const children = [...journal.world().nodes.values()].filter((n) => n.parent === root)
    assert.equal(node(root).state, 'разбита')
    assert.deepEqual(children.map((n) => n.state), ['согласование', 'согласование'], 'третья часть ждёт места')
})
