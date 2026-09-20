import type { Manifest, RoleName } from '@agent-office/shared'
import { token } from '../platform/di/container.ts'

/** Манифест проекта — уже прочитанный и проверенный (manifest/load.ts). */
export const ManifestDIToken = token<Manifest>('Manifest')

/** Тексты промптов ролей. */
export const PromptsDIToken = token<Record<RoleName, string>>('Prompts')
