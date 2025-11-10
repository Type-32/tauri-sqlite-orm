import {BaseQueryBuilder} from "./query-base";
import Database from "@tauri-apps/plugin-sql";
import {InferInsertModel} from "../orm";
import {AnyTable, InferSelectModel} from "../types";
import {MissingWhereClauseError, UpdateValidationError, ColumnNotFoundError} from "../errors";

export class UpdateQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
    private updateData: Partial<InferInsertModel<T>> = {};
    private returningColumns: (keyof T["_"]["columns"])[] = [];
    private hasWhereClause = false;
    private allowGlobal = false;
    private incrementDecrementOps: Array<{column: string; op: 'increment' | 'decrement'; value: number}> = [];

    constructor(db: Database, private table: T) {
        super(db);
        this.query = `UPDATE ${table._.name}`;
    }

    set(data: Partial<InferInsertModel<T>>): this {
        this.updateData = {...this.updateData, ...data};
        return this;
    }

    where(condition: any): this {
        this.hasWhereClause = true;
        return super.where(condition);
    }

    increment(column: keyof T["_"]["columns"], value: number = 1): this {
        const col = this.table._.columns[column as string];
        if (!col) {
            throw new ColumnNotFoundError(String(column), this.table._.name);
        }
        this.incrementDecrementOps.push({column: col._.name, op: 'increment', value});
        return this;
    }

    decrement(column: keyof T["_"]["columns"], value: number = 1): this {
        const col = this.table._.columns[column as string];
        if (!col) {
            throw new ColumnNotFoundError(String(column), this.table._.name);
        }
        this.incrementDecrementOps.push({column: col._.name, op: 'decrement', value});
        return this;
    }

    allowGlobalOperation(): this {
        this.allowGlobal = true;
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
        const hasSetData = entries.length > 0;
        const hasIncrementDecrement = this.incrementDecrementOps.length > 0;

        if (!hasSetData && !hasIncrementDecrement) {
            throw new UpdateValidationError("Cannot execute an update query without a .set(), .increment(), or .decrement() call.");
        }

        const setClauses: string[] = [];
        const setParams: any[] = [];

        // Add regular SET clauses
        if (hasSetData) {
            for (const [key, value] of entries) {
                const column = (this.table._.columns as any)[key];
                if (!column) {
                    throw new ColumnNotFoundError(key, this.table._.name);
                }
                setClauses.push(`${column._.name} = ?`);
                setParams.push(value);
            }
        }

        // Add increment/decrement clauses
        for (const op of this.incrementDecrementOps) {
            const sign = op.op === 'increment' ? '+' : '-';
            setClauses.push(`${op.column} = ${op.column} ${sign} ?`);
            setParams.push(op.value);
        }

        const setClause = setClauses.join(", ");

        const sql = `${tablePart} SET ${setClause}${whereClause}`;
        const params = [...setParams, ...whereParams];

        return {sql, params};
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        // Validate WHERE clause exists unless explicitly allowed
        if (!this.hasWhereClause && !this.allowGlobal) {
            throw new MissingWhereClauseError('UPDATE', this.table._.name);
        }

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

    toSQL(): { sql: string; params: any[] } {
        // Note: toSQL() doesn't validate WHERE clause - it's for debugging only
        const {sql: updateSql, params} = this.buildUpdateClause();

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(", ");
            return {
                sql: `${updateSql} RETURNING ${returningNames}`,
                params,
            };
        }

        return { sql: updateSql, params };
    }
}