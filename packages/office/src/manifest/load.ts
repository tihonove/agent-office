// Загрузка манифеста. Форму проверяет схема, а не код: packages/shared/manifest.schema.json генерируется
// из типов манифеста (`npm run schema`), так что типы, схема и подсказки редактора в office.yaml — одно и то же.
// Кодом остаётся только то, что схема выразить не может: перекрёстные ссылки (references.ts).
//
// Ошибки — человеческим языком и все сразу: манифест пишет человек, и опечатка в имени состояния
// не должна превращаться в молча стоящий узел.

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Manifest, RoleName } from '@agent-office/shared'
import schema from '@agent-office/shared/manifest.schema.json' with { type: 'json' }
import { Ajv } from 'ajv'
import localizeRu from 'ajv-i18n/localize/ru/index.js'
import { parse } from 'yaml'
import { checkReferences } from './references.ts'

// Модуль на CommonJS: `module.exports` и есть функция, а типы обещают `default`.
const russian = localizeRu as unknown as (errors: unknown) => void

const matchesSchema = new Ajv({ allErrors: true }).compile<Manifest>(schema)

export type Loaded = {
    manifest: Manifest
    /** Тексты промптов ролей, прочитанные с диска. */
    prompts: Record<RoleName, string>
}

export async function loadManifest(file: string): Promise<Loaded> {
    const manifest: unknown = parse(await readFile(file, 'utf8'))

    const errors = validate(manifest)
    if (errors.length) {
        throw new Error(`манифест ${file}:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    }

    const prompts: Record<RoleName, string> = {}
    for (const [name, role] of Object.entries((manifest as Manifest).roles)) {
        prompts[name] = await readFile(join(dirname(file), role.prompt), 'utf8')
    }
    return { manifest: manifest as Manifest, prompts }
}

/** Сначала форма (по схеме), потом смысл (ссылки). Ссылки проверяем только у манифеста правильной формы. */
export function validate(manifest: unknown): string[] {
    if (!matchesSchema(manifest)) {
        russian(matchesSchema.errors)
        return (matchesSchema.errors ?? []).map((e) => `${where(e.instancePath)}: ${e.message}${hint(e.params)}`)
    }
    return checkReferences(manifest)
}

/** `/roles/аналитик/when` → `roles.аналитик.when` */
const where = (instancePath: string): string => instancePath.split('/').filter(Boolean).join('.') || 'манифест'

/** Схема знает, какое именно свойство лишнее или пропущено, — подскажем. */
function hint(params: Record<string, unknown>): string {
    const property = params['additionalProperty'] ?? params['missingProperty']
    return property ? ` («${String(property)}»)` : ''
}
