// Тесты контейнера — перенесены из diode вместе с ним.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ContainerModule } from '../src/platform/di/container.ts'
import { Container, token } from '../src/platform/di/container.ts'

class Logger {
    public static dependencies = [] as const
    public readonly tag = 'logger'
}

class Database {
    public static dependencies = [] as const
    public readonly tag = 'db'
}

const LoggerDIToken = token<Logger>('Logger')
const DatabaseDIToken = token<Database>('Database')

class UserService {
    public static dependencies = [LoggerDIToken, DatabaseDIToken] as const

    public readonly logger: Logger
    public readonly db: Database

    public constructor(logger: Logger, db: Database) {
        this.logger = logger
        this.db = db
    }
}

const UserServiceDIToken = token<UserService>('UserService')

describe('DiContainer', () => {
    it('resolves a value from factory function', () => {
        const ValueDIToken = token<number>('Value')
        const container = new Container().bind(ValueDIToken, () => 42)

        assert.equal(container.get(ValueDIToken), 42)
    })

    it('resolves class with dependencies; bind order does not matter (lazy resolution)', () => {
        const container = new Container()
            .bind(UserServiceDIToken, UserService)
            .bind(DatabaseDIToken, Database)
            .bind(LoggerDIToken, Logger)

        const svc = container.get(UserServiceDIToken)

        assert.ok(svc instanceof UserService)
        assert.ok(svc.logger instanceof Logger)
        assert.ok(svc.db instanceof Database)
    })

    it('returns the same instance on repeated get(); dependencies are shared singletons', () => {
        const container = new Container()
            .bind(LoggerDIToken, Logger)
            .bind(DatabaseDIToken, Database)
            .bind(UserServiceDIToken, UserService)

        assert.equal(container.get(LoggerDIToken), container.get(LoggerDIToken))
        assert.equal(container.get(UserServiceDIToken).logger, container.get(LoggerDIToken))
    })

    it('throws on missing binding', () => {
        const MissingDIToken = token<string>('Missing')

        assert.throws(() => new Container().get(MissingDIToken), /No binding for "Missing"/)
    })

    it('throws on circular dependency', () => {
        const XDIToken = token<unknown>('X')
        const YDIToken = token<unknown>('Y')

        const container: Container = new Container()
            .bind(XDIToken, (): unknown => container.get(YDIToken))
            .bind(YDIToken, (): unknown => container.get(XDIToken))

        assert.throws(() => container.get(XDIToken), /Circular dependency detected.*X.*Y/)
    })

    it('class with static dependencies can be constructed directly (no DI)', () => {
        const logger = new Logger()
        const svc = new UserService(logger, new Database())

        assert.equal(svc.logger, logger)
    })

    it('modules: context-less, with typed context, composed via chaining', () => {
        const ValueDIToken = token<number>('Value')
        const loggingModule: ContainerModule = (c) => {
            c.bind(LoggerDIToken, Logger)
        }
        const valueModule: ContainerModule<{ value: number }> = (c, ctx) => {
            c.bind(ValueDIToken, () => ctx.value)
        }

        const container = new Container().use(loggingModule).use(valueModule, { value: 7 })

        assert.ok(container.get(LoggerDIToken) instanceof Logger)
        assert.equal(container.get(ValueDIToken), 7)
    })
})
