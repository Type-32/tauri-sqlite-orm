import {BaseQueryBuilder} from "./query-base";
import Database from "@tauri-apps/plugin-sql";
import {InferInsertModel} from "../orm";
import {AnyTable, InferSelectModel} from "../types";

export class UpdateQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
    private updateData: Partial<InferInsertModel<T>> = {};
    private returningColumns: (keyof T["_"]["columns"])[] = [];

    constructor(db: Database, private table: T) {
        super(db);
        this.query = `UPDATE ${table._.name}`;
    }

    set(data: Partial<InferInsertModel<T>>): this {
        this.updateData = {...this.updateData, ...data};
        return this;
    }

    returning(...columns: (keyof T["_"]["columns"])[]): this {
        this.returningColumns.push(...columns);
        return this;
    }

    private buildUpdateClause(): { sql: string; params: any[] } {
        const finalUpdateData = {...this.updateData};

        // Apply $onUpdateFn for columns that don't have explicit values
        for (const [key, column] of Object.entries(this.table._.columns)) {
            const typedKey = key as keyof T["_"]["columns"];

            if (
                (finalUpdateData as any)[typedKey] === undefined &&
                column.options.$onUpdateFn
            ) {
                (finalUpdateData as any)[typedKey] = column.options.$onUpdateFn();
            }
        }

        const baseQuery = this.query;
        const whereParams = this.params;

        let tablePart = baseQuery;
        let whereClause = "";
        const whereIndex = baseQuery.indexOf(" WHERE ");
        if (whereIndex !== -1) {
            tablePart = baseQuery.substring(0, whereIndex);
            whereClause = baseQuery.substring(whereIndex);
        }

        const entries = Object.entries(finalUpdateData);
        if (entries.length === 0) {
            throw new Error("Cannot execute an update query without a .set() call.");
        }

        const setClause = entries
            .map(([key]) => {
                const column = (this.table._.columns as any)[key];
                if (!column) {
                    throw new Error(
                        `Column ${key} does not exist on table ${this.table._.name}`
                    );
                }
                return `${column._.name} = ?`;
            })
            .join(", ");

        const setParams = entries.map(([, value]) => value);

        const sql = `${tablePart} SET ${setClause}${whereClause}`;
        const params = [...setParams, ...whereParams];

        return {sql, params};
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        const {sql: updateSql, params} = this.buildUpdateClause();

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(", ");
            const sqlWithReturning = `${updateSql} RETURNING ${returningNames}`;
            return this.db.select(sqlWithReturning, params) as any;
        } else {
            const result = await this.db.execute(updateSql, params);
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