// Документация (docs/) не должна разойтись с офисом. Готовые схемы из docs/recipes/ — это те же манифесты,
// которые агент скопирует в чужой проект: здесь каждая проходит путь заявки до конца на своих же заготовках fake/.
// YAML-примеры из текста docs/ разбираются, а целые манифесты среди них проходят проверку загрузчика.

import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { scriptFromDir } from '../src/adapters/executor-fake.ts'
import { validate } from '../src/manifest/load.ts'
import { openOffice } from './harness.ts'

const DOCS = join(import.meta.dirname, '../../../docs')
const RECIPES = join(DOCS, 'recipes')

/** Офис на готовой схеме: её манифест и её заготовки fake/<роль>/ — как `agent-office <проект> --fake`. */
const openRecipe = (name: string) =>
    openOffice(join(RECIPES, name, 'office.yaml'), scriptFromDir(join(RECIPES, name, 'fake')))

test('конвейер: аналитик → реализатор → человек принимает', async () => {
    const { desk, executor, settle, node, openRequest } = await openRecipe('конвейер')
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()

    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual(executor.spawned.map((r) => r.role), ['аналитик', 'реализатор'])

    await desk.answer(openRequest().id, 'принять')
    await settle()
    assert.equal(node(id).state, 'готово')
})

test('конвейер: «вернуть» отдаёт работу реализатору снова', async () => {
    const { desk, executor, settle, node, openRequest } = await openRecipe('конвейер')
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()

    await desk.setFields(id, { замечания: 'не того цвета' })
    await desk.answer(openRequest().id, 'вернуть')
    await settle()
    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual(executor.spawned.map((r) => r.role), ['аналитик', 'реализатор', 'реализатор'])
})

test('согласование: без «делаем» реализатор не поднимается; «переделать» — снова аналитик', async () => {
    const { desk, executor, settle, node, openRequest } = await openRecipe('согласование')
    const id = await desk.createNode({ fields: { описание: 'хочу кнопку' } })
    await settle()
    assert.equal(node(id).state, 'согласование')
    assert.deepEqual(executor.spawned.map((r) => r.role), ['аналитик'])

    await desk.answer(openRequest().id, 'переделать')
    await settle()
    assert.equal(node(id).state, 'согласование')
    assert.deepEqual(executor.spawned.map((r) => r.role), ['аналитик', 'аналитик'])

    await desk.answer(openRequest().id, 'делаем')
    await settle()
    assert.equal(node(id).state, 'приёмка')

    await desk.answer(openRequest().id, 'принять')
    await settle()
    assert.equal(node(id).state, 'готово')
})

test('декомпозиция: курс штурмана рождает детей, родитель закрывается по детям', async () => {
    const { desk, executor, journal, settle, node } = await openRecipe('декомпозиция')
    const id = await desk.createNode({ fields: { описание: 'большая заявка' } })
    await settle()
    assert.equal(node(id).state, 'разбита')

    const children = () => [...journal.world().nodes.values()].filter((n) => n.parent === id)
    assert.equal(children().length, 2)
    assert.ok(children().every((child) => child.state === 'приёмка'), 'дети идут мимо штурмана: к аналитику и дальше')

    for (const request of [...journal.world().requests.values()]) {
        await desk.answer(request.id, 'принять')
    }
    await settle()
    assert.ok(children().every((child) => child.state === 'готово'))
    assert.equal(node(id).state, 'готово')
    assert.equal(executor.spawned.filter((r) => r.role === 'штурман').length, 1)
})

test('YAML-примеры из docs/ разбираются, целые манифесты проходят проверку', async () => {
    const pages = (await readdir(DOCS)).filter((name) => name.endsWith('.md'))
    let manifests = 0
    for (const page of pages) {
        const text = await readFile(join(DOCS, page), 'utf8')
        for (const [i, [, block]] of [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].entries()) {
            const where = `${page}, yaml-блок №${i + 1}`
            const parsed: unknown = parse(block!)
            if (parsed && typeof parsed === 'object' && 'inbox' in parsed && 'roles' in parsed) {
                assert.deepEqual(validate(parsed), [], where)
                manifests++
            }
        }
    }
    assert.ok(manifests > 0, 'в docs/ есть хотя бы один целый манифест')
})
