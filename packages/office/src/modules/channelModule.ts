import { FilesChannel } from '../adapters/channel-files.ts'
import { AgentChannelDIToken, WorkplacesDIToken } from '../core/ports.ts'
import { token, type ContainerModule } from '../platform/di/container.ts'

const FilesChannelDIToken = token<FilesChannel>('FilesChannel')

/**
 * Файловый канал: вход агента — каталог назначения, выход — файлы в out/. Один объект закрывает два порта:
 * `AgentChannel` для сверки и `Workplaces` для человека, который хочет заглянуть в повод и транскрипт.
 * MCP-сервер придёт сюда же — другим модулем, биндящим тот же `AgentChannelDIToken`.
 */
export const filesChannelModule: ContainerModule<{ places: string }> = (container, { places }) => {
    container
        .bind(FilesChannelDIToken, () => new FilesChannel(places))
        .bind(AgentChannelDIToken, () => container.get(FilesChannelDIToken))
        .bind(WorkplacesDIToken, () => container.get(FilesChannelDIToken))
}
