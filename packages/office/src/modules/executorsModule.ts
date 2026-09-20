import type { ExecutorDecl, ExecutorName } from '@agent-office/shared'
import { ClaudeExecutor } from '../adapters/executor-claude.ts'
import { FakeExecutor, scriptFromDir } from '../adapters/executor-fake.ts'
import { ExecutorsDIToken, type Executor } from '../core/ports.ts'
import { ManifestDIToken } from '../manifest/tokens.ts'
import type { ContainerModule } from '../platform/di/container.ts'

export type ExecutorsModuleContext = {
    /** Корень проекта: там стартует живой агент. */
    project: string
    /** Каталог назначений — чтобы исполнитель находил pid-файлы своих агентов. */
    places: string
    /** Все исполнители — заглушки с заготовками из `<проект>/fake/<роль>/`. Прогон без моделей и без денег. */
    fake: boolean
}

/** Исполнители по объявлениям манифеста: какой `type` — такой адаптер. */
export const executorsModule: ContainerModule<ExecutorsModuleContext> = (container, { project, places, fake }) => {
    const create = (name: ExecutorName, decl: ExecutorDecl): Executor => {
        if (fake || decl.type === 'fake') {
            return new FakeExecutor(scriptFromDir(`${project}/fake`))
        }
        if (decl.type === 'claude') {
            return new ClaudeExecutor({ cwd: project, places })
        }
        throw new Error(`исполнитель «${name}»: не знаю тип «${decl.type}»`)
    }

    container.bind(ExecutorsDIToken, () => {
        const declared = Object.entries(container.get(ManifestDIToken).executors)
        return Object.fromEntries(declared.map(([name, decl]) => [name, create(name, decl)]))
    })
}
