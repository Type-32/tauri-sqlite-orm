import {BaseQueryBuilder} from "./query-base";
import Database from "@tauri-apps/plugin-sql";
import {InferInsertModel} from "../orm";
import {AnySQLiteColumn, AnyTable, InferSelectModel} from "../types";
import {InsertValidationError, ColumnNotFoundError} from "../errors";

export class InsertQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
    private dataSets: InferInsertModel<T>[] = [];
    private returningColumns: (keyof T["_"]["columns"])[] = [];
    private onConflictAction: "nothing" | "update" | null = null;
    private conflictTarget: AnySQLiteColumn[] = [];
    private updateSet: Partial<InferInsertModel<T>> = {};

    constructor(db: Database, private table: T) {
        super(db);
        this.query = `INSERT INTO ${table._.name}`;
    }

    values(data: InferInsertModel<T> | InferInsertModel<T>[]): this {
        const dataArray = Array.isArray(data) ? data : [data];
        this.dataSets.push(...dataArray);
        return this;
    }

    returning(...columns: (keyof T["_"]["columns"])[]): this {
        this.returningColumns.push(...columns);
        return this;
    }

    onConflictDoNothing(target?: AnySQLiteColumn | AnySQLiteColumn[]): this {
        this.onConflictAction = "nothing";
        if (target) {
            this.conflictTarget = Array.isArray(target) ? target : [target];
        }
        return this;
    }

    onConflictDoUpdate(config: {
        target: AnySQLiteColumn | AnySQLiteColumn[];
        set: Partial<InferInsertModel<T>>;
    }): this {
        this.onConflictAction = "update";
        this.conflictTarget = Array.isArray(config.target)
            ? config.target
            : [config.target];
        this.updateSet = config.set;
        return this;
    }

    private processDefaultValues(
        data: InferInsertModel<T>
    ): Partial<InferInsertModel<T>> {
        const finalData: Partial<InferInsertModel<T>> = {...data};

        for (const [key, column] of Object.entries(this.table._.columns)) {
            const typedKey = key as keyof T["_"]["columns"];

            if ((finalData as any)[typedKey] === undefined) {
                if (column.options.$defaultFn) {
                    (finalData as any)[typedKey] = column.options.$defaultFn();
                }
            }
        }

        return finalData;
    }

    private buildConflictClause(): string {
        if (!this.onConflictAction) return "";

        let clause = " ON CONFLICT";

        if (this.conflictTarget.length > 0) {
            const targetNames = this.conflictTarget
                .map((col) => col._.name)
                .join(", ");
            clause += ` (${targetNames})`;
        }

        if (this.onConflictAction === "nothing") {
            clause += " DO NOTHING";
        } else if (this.onConflictAction === "update") {
            const setEntries = Object.entries(this.updateSet);
            if (setEntries.length > 0) {
                const setClause = setEntries.map(([key]) => `${key} = ?`).join(", ");
                clause += ` DO UPDATE SET ${setClause}`;
            }
        }

        return clause;
    }

    async execute(): Promise<
        T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
    > {
        if (this.dataSets.length === 0) {
            throw new InsertValidationError("No data provided for insert. Use .values() to provide data.");
        }

        const processedDataSets = this.dataSets.map((data) =>
            this.processDefaultValues(data)
        );

        // Group data by column sets for batch insertion
        const groups = new Map<string, Partial<InferInsertModel<T>>[]>();
        for (const dataSet of processedDataSets) {
            const keys = Object.keys(dataSet).sort().join(",");
            if (!groups.has(keys)) {
                groups.set(keys, []);
            }
            groups.get(keys)!.push(dataSet);
        }

        let results: any[] = [];
        let lastInsertId: number | undefined;
        let rowsAffected = 0;

        for (const [_, dataSets] of groups) {
            const columns = Object.keys(dataSets[0]) as (keyof T["_"]["columns"])[];
            const columnNames = columns.map(
                (key) => this.table._.columns[key as string]._.name
            );
            const placeholders = `(${columns.map(() => "?").join(", ")})`;
            const valuesSql = dataSets.map(() => placeholders).join(", ");
            const conflictClause = this.buildConflictClause();

            const finalQuery = `${this.query} (${columnNames.join(
                ", "
            )}) VALUES ${valuesSql}${conflictClause}`;

            const params = dataSets.flatMap((data) =>
                columns.map((col) => (data as any)[col] ?? null)
            );

            // Add conflict update params
            if (this.onConflictAction === "update") {
                const setValues = Object.entries(this.updateSet).map(
                    ([, value]) => value
                );
                params.push(...setValues);
            }

            if (this.returningColumns.length > 0) {
                const returningNames = this.returningColumns
                    .map((col) => this.table._.columns[col as string]._.name)
                    .join(", ");
                const queryWithReturning = `${finalQuery} RETURNING ${returningNames}`;
                const rows = await this.db.select(queryWithReturning, params);
                results = results.concat(rows);
            } else {
                const result = await this.db.execute(finalQuery, params);
                lastInsertId = result.lastInsertId;
                rowsAffected += result.rowsAffected;
            }
        }

        if (this.returningColumns.length > 0) {
            return results as any;
        }

        return [{lastInsertId, rowsAffected}] as any;
    }

    async returningAll(): Promise<InferSelectModel<T>[]> {
        const allColumns = Object.keys(
            this.table._.columns
        ) as (keyof T["_"]["columns"])[];
        return this.returning(...allColumns).execute();
    }

    toSQL(): { sql: string; params: any[] } {
        if (this.dataSets.length === 0) {
            throw new InsertValidationError("No data provided for insert. Use .values() to provide data.");
        }

        const processedDataSets = this.dataSets.map((data) =>
            this.processDefaultValues(data)
        );

        // Use first dataset to build the query structure
        const dataSet = processedDataSets[0];
        const columns = Object.keys(dataSet) as (keyof T["_"]["columns"])[];
        const columnNames = columns.map(
            (key) => this.table._.columns[key as string]._.name
        );
        const placeholders = `(${columns.map(() => "?").join(", ")})`;
        const valuesSql = processedDataSets.map(() => placeholders).join(", ");
        const conflictClause = this.buildConflictClause();

        const finalQuery = `${this.query} (${columnNames.join(
            ", "
        )}) VALUES ${valuesSql}${conflictClause}`;

        const params = processedDataSets.flatMap((data) =>
            columns.map((col) => (data as any)[col] ?? null)
        );

        // Add conflict update params
        if (this.onConflictAction === "update") {
            const setValues = Object.entries(this.updateSet).map(
                ([, value]) => value
            );
            params.push(...setValues);
        }

        if (this.returningColumns.length > 0) {
            const returningNames = this.returningColumns
                .map((col) => this.table._.columns[col as string]._.name)
                .join(", ");
            return {
                sql: `${finalQuery} RETURNING ${returningNames}`,
                params,
            };
        }

        return { sql: finalQuery, params };
    }
}