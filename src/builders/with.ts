import Database from "@tauri-apps/plugin-sql";
import {SelectQueryBuilder} from "./select";
import {InsertQueryBuilder} from "./insert";
import {UpdateQueryBuilder} from "./update";
import {DeleteQueryBuilder} from "./delete";
import {BaseQueryBuilder} from "./query-base";

import {AnyTable} from "../types";

export class WithQueryBuilder {
    private ctes: Array<{ alias: string; query: string; params: any[] }> = [];

    constructor(private db: Database) {
    }

    with(alias: string, query: { sql: string; params: any[] }): this {
        this.ctes.push({alias, query: query.sql, params: query.params});
        return this;
    }

    select<
        T extends AnyTable,
        C extends (keyof T["_"]["columns"])[] | undefined = undefined
    >(table: T, columns?: C): SelectQueryBuilder<T, C> {
        const builder = new SelectQueryBuilder(this.db, table, columns);
        this.applyWithClause(builder);
        return builder;
    }

    insert<T extends AnyTable>(table: T): InsertQueryBuilder<T> {
        const builder = new InsertQueryBuilder(this.db, table);
        this.applyWithClause(builder);
        return builder;
    }

    update<T extends AnyTable>(table: T): UpdateQueryBuilder<T> {
        const builder = new UpdateQueryBuilder(this.db, table);
        this.applyWithClause(builder);
        return builder;
    }

    delete<T extends AnyTable>(table: T): DeleteQueryBuilder<T> {
        const builder = new DeleteQueryBuilder(this.db, table);
        this.applyWithClause(builder);
        return builder;
    }

    private applyWithClause(builder: BaseQueryBuilder): void {
        if (this.ctes.length > 0) {
            const cteSql = this.ctes
                .map((cte) => `${cte.alias} AS (${cte.query})`)
                .join(", ");
            builder["query"] = `WITH ${cteSql} ${builder["query"]}`;

            // Add CTE params to the beginning of the params array
            builder["params"] = [
                ...this.ctes.flatMap((cte) => cte.params),
                ...builder["params"],
            ];
        }
    }
}