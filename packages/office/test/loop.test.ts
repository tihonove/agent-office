// Сценарии петли: настоящий манифест examples/toy, настоящий файловый канал, заглушка-исполнитель и ручные часы.
// Тестируем петлю, а не классы.

import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import type { AgentKey, Manifest, NodeId } from '@agent-office/shared'
import { scriptFromDir, type Script } from '../src/adapters/executor-fake.ts'
import { fold } from '../src/core/fold.ts'
import { file, openOffice } from './harness.ts'

const TOY = join(import.meta.dirname, '../../../examples/toy')
const HOUR = 36e5

const setup = (script: Script = scriptFromDir(join(TOY, 'fake')), tweak?: (m: Manifest) => void) =>
    openOffice(join(TOY, 'office.yaml'), script, tweak)

test('заявка проходит весь конвейер, журнал — единственная правда, тихий тик ничего не пишет', async () => {
    const { journal, desk, reconciler, store, settle, node } = await setup()
    const id = await desk.createNode({ fields: { описание: 'сделай заметку' } })
    await settle()

    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual(node(id).fields, { описание: 'сделай заметку', критерий: 'работает и видно глазами', область: 'заметки' })
    const [request] = [...journal.world().requests.values()]
    assert.deepEqual(request?.openedBy, { kind: 'manifest', decl: 'приёмка' })

    await desk.answer(request!.id, 'принять')
    await settle()
    assert.equal(node(id).state, 'готово')

    assert.deepEqual(fold(await store.read()), journal.world(), 'состояние целиком пересобирается из журнала')
    const before = journal.facts().length
    await reconciler.tick()
    assert.equal(journal.facts().length, before, 'тик на спокойном мире даёт ноль фактов')
})

test('зрелость: без нужных полей роль не поднимается, узел ждёт того, кто их добавит', async () => {
    const { desk, executor, settle, node } = await setup()
    const id = await desk.createNode({ fields: {} })
    await settle()
    assert.equal(node(id).state, 'новая')
    assert.equal(executor.spawned.length, 0)

    await desk.setFields(id, { описание: 'теперь понятно' })
    await settle()
    assert.equal(executor.spawned[0]?.key, `аналитик/${id}`)
})

test('агент пропал без результата: тот же ключ, новая попытка; после трёх потерь — флаг и стоп; человек вызывает руками', async () => {
    const { journal, desk, reconciler, executor, settle, node } = await setup(() => ({}))
    const id = await desk.createNode({ fields: { описание: 'x' } })
    await settle()

    assert.deepEqual(executor.spawned.map((r) => r.key), Array(3).fill(`аналитик/${id}`))
    const a = journal.world().assignments.get(`аналитик/${id}` as AgentKey)!
    assert.deepEqual([a.run.attempt, a.status.is, a.losses], [3, 'lost', 3])
    assert.equal(node(id).state, 'новая', 'работа вернулась')
    assert.equal(journal.world().flags.length, 1)

    await desk.invoke(id, 'аналитик')
    await reconciler.tick()
    assert.equal(executor.spawned.length, 4)
    assert.match(executor.spawned[3]!.place, /аналитик/)
})

test('человек молчит: по дедлайну применяется объявленный исход', async () => {
    const { journal, desk, clock, settle, node } = await setup()
    const id = await desk.createNode({ fields: { описание: 'x' } })
    await settle()
    assert.equal(node(id).state, 'приёмка')

    clock.advance(23 * HOUR)
    await settle()
    assert.equal(node(id).state, 'приёмка')

    clock.advance(2 * HOUR)
    await settle()
    assert.equal(node(id).state, 'готово')
    assert.deepEqual([...journal.world().requests.values()][0]?.answer, { option: 'принять', by: 'deadline' })
})

test('агент спрашивает человека и умирает; ответ поднимает тот же ключ, продолжая сессию', async () => {
    let asked = false
    const { journal, desk, executor, settle, node } = await setup((req): Record<string, string> => {
        if (req.role !== 'аналитик') {
            return {}
        }
        if (!asked) {
            asked = true
            return { 'вопрос.md': file('options: [да, нет]\ndefault: нет\ndeadline: 2h', 'Делать ли вообще?') }
        }
        return { 'результат.md': file('outcome: отказ', 'человек сказал нет') }
    })
    const id = await desk.createNode({ fields: { описание: 'x' } })
    await settle()

    const a = journal.world().assignments.get(`аналитик/${id}` as AgentKey)!
    assert.ok(a.status.is === 'waiting' && a.status.request)
    assert.equal(executor.spawned.length, 1, 'пока ответа нет, никого не поднимаем')

    await desk.answer(a.status.request, 'нет')
    await settle()
    const [first, second] = executor.spawned
    assert.equal(second!.key, first!.key)
    assert.deepEqual([second!.resume, second!.session], [true, first!.session])
    assert.match(await readFile(join(second!.place, 'повод.md'), 'utf8'), /человек ответил: \*\*нет\*\*/)
    assert.equal(node(id).state, 'отклонена')
})

test('порождение: артефакт создаёт детей под потолком открытых; родитель становится учётным и закрывается по детям', async () => {
    const decomposition = file('kind: декомпозиция\naudience: ["*"]\nnodes:\n' + [1, 2, 3, 4].map((i) => `  - { описание: часть ${i} }`).join('\n'))
    const fromDir = scriptFromDir(join(TOY, 'fake'))
    const { journal, desk, executor, settle, node } = await setup((req) =>
        req.key === 'аналитик/n-1' ? { 'артефакт-план.md': decomposition, 'результат.md': file('outcome: разбито') } : fromDir(req))
    const root = await desk.createNode({ fields: { описание: 'большая заявка' } })
    await settle()

    const children = () => [...journal.world().nodes.values()].filter((n) => n.parent === root)
    assert.equal(children().length, 3, 'потолок открытых = 3')
    assert.ok(children().every((n) => n.state === 'приёмка'))
    assert.ok(!executor.spawned.some((r) => r.key === `реализатор/${root}`), 'учётный узел не раздаётся')

    for (const r of journal.world().requests.values()) {
        await desk.answer(r.id, 'принять')
    }
    await settle()
    assert.equal(children().length, 4, 'место освободилось — порождён четвёртый')
    assert.equal(node(root).state, 'анализ', 'родитель не закрылся раньше времени')

    for (const r of journal.world().requests.values()) {
        if (!r.answer) {
            await desk.answer(r.id, 'принять')
        }
    }
    await settle()
    assert.equal(node(root).state, 'готово')
})

test('порождающий артефакт без обязательных полей офис не принимает, и агент узнаёт почему', async () => {
    const bad = file('kind: декомпозиция\naudience: ["*"]\nnodes:\n  - { название: без описания }')
    const { journal, desk, executor, settle, types } = await setup(() => ({ 'артефакт-план.md': bad }))
    await desk.createNode({ fields: { описание: 'x' } })
    await settle()

    assert.ok(types().includes('call.rejected'))
    assert.equal(journal.world().artifacts.size, 0)
    assert.match(await readFile(join(executor.spawned[1]!.place, 'повод.md'), 'utf8'), /не хватает полей описание/)
})

test('проекция = аудитория ∩ правило роли; дотянуть можно только в пределах своего потолка', async () => {
    let pulled = false
    const { journal, desk, executor, settle } = await setup((req): Record<string, string> => {
        if (req.role === 'аналитик') {
            return {
                'артефакт-1.md': file('kind: постановка\naudience: [реализатор]', 'делай так'),
                'артефакт-2.md': file('kind: черновик\naudience: [аналитик]', 'мысли вслух'),
                'артефакт-3.md': file('kind: справка\naudience: ["*"]', 'полезное'),
                'результат.md': file('outcome: готово\nfields: { критерий: к, область: заметки }'),
            }
        }
        if (!pulled) {
            pulled = true
            return { 'дотянуть.md': file('artifacts: [a-3, a-2]') }
        }
        return { 'результат.md': file('outcome: готово') }
    })
    await desk.createNode({ fields: { описание: 'x' } })
    await settle()

    const runs = executor.spawned.filter((r) => r.role === 'реализатор')
    const seen = (place: string) => readdir(join(place, 'проекция/артефакты')).then((l) => l.sort())
    // a-2 адресован не реализатору: просьба дотянуть его отклонена целиком, заход потерян и повторён.
    assert.ok(journal.world().rejections.some((r) => r.call === 'pull'))
    assert.deepEqual(await seen(runs.at(-1)!.place), ['a-1-постановка.md', 'не-вложено.md'])
})

test('дотянутое попадает в проекцию следующего воплощения', async () => {
    let pulled = false
    const { desk, executor, settle } = await setup((req): Record<string, string> => {
        if (req.role === 'аналитик') {
            return {
                'артефакт-1.md': file('kind: постановка\naudience: [реализатор]', 'делай так'),
                'артефакт-3.md': file('kind: справка\naudience: ["*"]', 'полезное'),
                'результат.md': file('outcome: готово\nfields: { критерий: к, область: заметки }'),
            }
        }
        if (!pulled) {
            pulled = true
            return { 'дотянуть.md': file('artifacts: [a-2]') }
        }
        return { 'результат.md': file('outcome: готово') }
    })
    await desk.createNode({ fields: { описание: 'x' } })
    await settle()
    const last = executor.spawned.at(-1)!
    assert.deepEqual((await readdir(join(last.place, 'проекция/артефакты'))).sort(), ['a-1-постановка.md', 'a-2-справка.md'])
})

test('judge: пока вердикта нет, условие не выполнено и суждение видно как ожидающее', async () => {
    const { desk, snapshots, settle, node } = await setup(undefined, (m) => {
        m.requests = []
        m.transitions = [{ kind: 'заявка', from: 'приёмка', to: 'готово', when: { state: 'приёмка', judge: { id: 'код-годен', ask: 'Код соответствует постановке?' } } }]
    })
    const id = await desk.createNode({ fields: { описание: 'x' } })
    await settle()
    assert.equal(node(id).state, 'приёмка')
    assert.deepEqual((await snapshots.snapshot()).pendingJudgements, [{ node: id, judge: 'код-годен', ask: 'Код соответствует постановке?' }])

    await desk.verdict(id, 'код-годен', true)
    await settle()
    assert.equal(node(id).state, 'готово')
    assert.deepEqual((await snapshots.snapshot()).pendingJudgements, [])
})

test('ресурсы: тяжёлые роли делят одну машину; кому не хватило, ждёт, не двигая узел', async () => {
    const fromDir = scriptFromDir(join(TOY, 'fake'))
    const hung = new Set<AgentKey>()
    const { journal, desk, executor, settle, node } = await setup((req) => {
        // Каждый аналитик зависает в первом воплощении, дальше работает по заготовке
        if (req.role === 'аналитик' && !hung.has(req.key)) {
            hung.add(req.key)
            return 'hang'
        }
        return fromDir(req)
    }, (m) => {
        m.resources = { машина: 1 }
        m.roles['аналитик']!.takes = { машина: 1 }
        m.roles['реализатор']!.takes = { машина: 1 }
    })
    const first = await desk.createNode({ fields: { описание: 'первая' } })
    const second = await desk.createNode({ fields: { описание: 'вторая' } })
    await settle()

    assert.deepEqual(executor.spawned.map((r) => r.key), [`аналитик/${first}`], 'вторая ждёт машину')
    assert.deepEqual([node(first).state, node(second).state], ['анализ', 'новая'])

    executor.release(`аналитик/${first}` as AgentKey)
    await settle()
    assert.deepEqual(executor.spawned.map((r) => r.key), [
        `аналитик/${first}`, `аналитик/${first}`, `реализатор/${first}`, `аналитик/${second}`,
    ], 'первая заявка дошла до приёмки, и только потом машину получила вторая')
    assert.deepEqual([node(first).state, node(second).state], ['приёмка', 'анализ'])
    assert.equal([...journal.world().assignments.values()].filter((a) => a.status.is === 'alive').length, 1)
})

test('ресурсы: доля исполнителя, поверх — доля роли; освободилось — заходит следующий по старшинству', async () => {
    const fromDir = scriptFromDir(join(TOY, 'fake'))
    const hung = new Set<AgentKey>()
    const { desk, executor, settle } = await setup((req) => {
        if (req.role === 'аналитик' && !hung.has(req.key)) {
            hung.add(req.key)
            return 'hang'
        }
        return fromDir(req)
    }, (m) => {
        // opus: 3, каждый агент берёт 1, реализатор — 3: ему нужна вся ёмкость
        m.resources = { opus: 3 }
        m.executors['claude']!.takes = { opus: 1 }
        m.roles['реализатор']!.takes = { opus: 3 }
    })
    const ids: NodeId[] = []
    for (const i of [1, 2, 3, 4]) {
        ids.push(await desk.createNode({ fields: { описание: `заявка ${i}` } }))
    }
    await settle()
    assert.deepEqual(executor.spawned.map((r) => r.key), [`аналитик/${ids[0]}`, `аналитик/${ids[1]}`, `аналитик/${ids[2]}`])

    // Первый аналитик отработал: его реализатору нужны все три доли, а две заняты — он ждёт, четвёртый аналитик проходит
    executor.release(`аналитик/${ids[0]}` as AgentKey)
    await settle()
    assert.deepEqual(executor.spawned.map((r) => r.key).slice(3), [`аналитик/${ids[0]}`, `аналитик/${ids[3]}`])

    for (const id of ids.slice(1)) {
        executor.release(`аналитик/${id}` as AgentKey)
    }
    await settle()
    assert.ok(executor.spawned.some((r) => r.key === `реализатор/${ids[0]}`), 'ёмкость освободилась — реализатор поднялся')
})
