import type { Loaded } from '../manifest/load.ts'
import { ManifestDIToken, PromptsDIToken } from '../manifest/tokens.ts'
import type { ContainerModule } from '../platform/di/container.ts'

/**
 * Манифест проекта и промпты ролей. Приезжают контекстом: манифест читается и проверяется до сборки контейнера
 * (manifest/load.ts) — с битым манифестом офис не стартует вовсе.
 */
export const manifestModule: ContainerModule<Loaded> = (container, { manifest, prompts }) => {
    container.bind(ManifestDIToken, () => manifest)
    container.bind(PromptsDIToken, () => prompts)
}
