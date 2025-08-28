import {BaseQueryBuilder} from "./query-base";
import Database from "@tauri-apps/plugin-sql";
import {AnyTable, InferSelectModel} from "../types";

export class DeleteQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
    private returningColumns: (keyof T["_"]["columns"])[] = [];

    constructor(db: Database, private table: T) {
        super(db);
        this.query = `DELETE
                      FROM ${table._.name}`;
    }

    returning(...columns: (keyof T["_"]["columns"])[]): this {
        this.returningColumns.push(...columns);
        return this;
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        const {sql, params} = this.build();

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(", ");
            const sqlWithReturning = `${sql} RETURNING ${returningNames}`;
            return this.db.select(sqlWithReturning, params) as any;
        } else {
            const result = await this.db.execute(sql, params);
            return [{rowsAffected: result.rowsAffected}] as any;
        }
    }

    async returningAll(): Promise<InferSelectModel<T>[]> {
        const allColumns = Object.keys(
            this.table._.columns
        ) as (keyof T["_"]["columns"])[];
        return this.returning(...allColumns).execute();
    }
}