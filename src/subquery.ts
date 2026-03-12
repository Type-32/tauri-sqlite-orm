import { Expression } from 'kysely'
import { SelectQueryBuilder } from './builders/select'
import { AnyTable } from './types'

export const subquery = <T extends AnyTable>(query: SelectQueryBuilder<T, any>): Expression<any> => {
    return query.toKyselyExpression()
}

export const scalarSubquery = <T extends AnyTable>(query: SelectQueryBuilder<T, any>): Expression<any> => {
    return query.toKyselyExpression()
}
