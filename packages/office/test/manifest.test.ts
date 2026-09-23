// Манифест читается по схеме. Схема — производная от типов, и эти тесты не дают им разойтись.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createGenerator } from 'ts-json-schema-generator'
import { parse } from 'yaml'
import { validate } from '../src/manifest/load.ts'

const ROOT = join(import.meta.dirname, '../../..')
const SHARED = join(ROOT, 'packages/shared')

const toy = async () => parse(await readFile(join(ROOT, 'examples/toy/office.yaml'), 'utf8'))

test('схема манифеста соответствует типам (если нет — `npm run schema`)', async () => {
    const generator = createGenerator({
        path: join(SHARED, 'src/manifest.ts'),
        tsconfig: join(SHARED, 'tsconfig.json'),
        type: 'Manifest',
        skipTypeCheck: true,
    })
    const onDisk = JSON.parse(await readFile(join(SHARED, 'manifest.schema.json'), 'utf8'))
    assert.deepEqual(JSON.parse(JSON.stringify(generator.createSchema('Manifest'))), onDisk)
})

test('эталонный манифест проходит проверку', async () => {
    assert.deepEqual(validate(await toy()), [])
})

test('ошибки формы ловит схема — и называет место', async () => {
    const m = await toy()
    m.roles['аналитик'].wen = m.roles['аналитик'].when   // опечатка в ключе
    delete m.roles['аналитик'].when
    m.requests[0].options = 'принять'

    const errors = validate(m).join('\n')
    assert.match(errors, /roles\.аналитик: .*«wen»/)
    assert.match(errors, /roles\.аналитик: .*«when»/)
    assert.match(errors, /requests\.0\.options/)
})

test('ошибки смысла ловит проверка ссылок', async () => {
    const m = await toy()
    m.roles['аналитик'].executor = 'gpt'
    m.roles['аналитик'].arrows.start = 'анализз'
    m.transitions[0].when = { answer: { request: 'приёмкаа', is: 'принять' } }
    m.roles['реализатор'].takes = { машина: 1 }

    assert.deepEqual(validate(m), [
        'roles.аналитик: исполнитель «gpt» не объявлен в executors',
        'roles.аналитик.arrows: состояния «анализз» нет ни у одного рода',
        'roles.реализатор.takes: ресурс «машина» не объявлен в resources',
        'transitions[0].when: запрос «приёмкаа» не объявлен в requests',
    ])
})
