import { Kysely } from 'kysely'
import { SelectQueryBuilder } from './select'
import { InsertQueryBuilder } from './insert'
import { UpdateQueryBuilder } from './update'
import { DeleteQueryBuilder } from './delete'
import { AnyTable } from '../types'

export class WithQueryBuilder {
    private _ctes: Array<{ alias: string; query: any }> = []

    constructor(private readonly kysely: Kysely<any>) {}

    with(alias: string, query: SelectQueryBuilder<any, any>): this {
        this._ctes.push({ alias, query: query.toKyselyExpression() })
        return this
    }

    private applyWith(builder: any): any {
        let b = builder
        for (const { alias, query } of this._ctes) {
            b = b.with(alias, () => query)
        }
        return b
    }

    select<T extends AnyTable, C extends (keyof T['_']['columns'])[] | undefined = undefined>(
        table: T,
        columns?: C
    ): SelectQueryBuilder<T, C> {
        return new SelectQueryBuilder(this.kysely, table, columns)
    }

    insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
        return new InsertQueryBuilder(this.kysely, table)
    }

    update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
        return new UpdateQueryBuilder(this.kysely, table)
    }

    delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
        return new DeleteQueryBuilder(this.kysely, table)
    }
}
