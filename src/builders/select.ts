import {BaseQueryBuilder} from "./query-base";
import Database from "@tauri-apps/plugin-sql";
import {and, eq} from "../operators";
import {SQLCondition} from "../orm";
import {AnySQLiteColumn, AnyTable} from "../types";

export class SelectQueryBuilder<
    TTable extends AnyTable,
    TSelectedColumns extends | (keyof TTable["_"]["columns"])[]
        | undefined = undefined
> extends BaseQueryBuilder {
    private isDistinct = false;
    private groupByColumns: AnySQLiteColumn[] = [];
    private havingCondition: SQLCondition | null = null;
    private joins: Array<{
        type: "LEFT" | "INNER" | "RIGHT";
        table: AnyTable;
        condition: SQLCondition;
        alias?: string;
    }> = [];
    private includeRelations: Record<string, boolean> = {};

    constructor(
        db: Database,
        private table: TTable,
        private columns?: TSelectedColumns
    ) {
        super(db);
        const columnNames = columns
            ? columns.map((c) => table._.columns[c as string]._.name)
            : ["*"];

        this.query = `SELECT ${columnNames.join(", ")} FROM ${table._.name}`;
    }

    distinct(): this {
        this.isDistinct = true;
        this.query = this.query.replace("SELECT", "SELECT DISTINCT");
        return this;
    }

    groupBy(...columns: AnySQLiteColumn[]): this {
        this.groupByColumns.push(...columns);
        const columnNames = columns.map((col) => col._.name).join(", ");
        this.query += ` GROUP BY ${columnNames}`;
        return this;
    }

    having(condition: SQLCondition): this {
        this.havingCondition = condition;
        this.query += ` HAVING ${condition.sql}`;
        this.params.push(...condition.params);
        return this;
    }

    leftJoin<T extends AnyTable>(
        table: T,
        condition: SQLCondition,
        alias?: string
    ): this {
        this.joins.push({type: "LEFT", table, condition, alias});
        return this;
    }

    innerJoin<T extends AnyTable>(
        table: T,
        condition: SQLCondition,
        alias?: string
    ): this {
        this.joins.push({type: "INNER", table, condition, alias});
        return this;
    }

    include(relations: Record<string, boolean>): this {
        this.includeRelations = {...this.includeRelations, ...relations};
        return this;
    }

    private buildJoins(): { sql: string; params: any[] } {
        let sql = "";
        const params: any[] = [];

        for (const join of this.joins) {
            const tableAlias = join.alias || join.table._.name;
            sql += ` ${join.type} JOIN ${join.table._.name} ${tableAlias} ON ${join.condition.sql}`;
            params.push(...join.condition.params);
        }

        // Handle relations
        for (const [relationName, include] of Object.entries(
            this.includeRelations
        )) {
            if (!include) continue;

            const relation = this.table.relations[relationName];
            if (!relation) continue;

            const foreignTable = relation.foreignTable;
            const foreignAlias = `${this.table._.name}_${relationName}`;

            if (relation.type === "one" && relation.fields && relation.references) {
                // One-to-one or many-to-one
                const conditions = relation.fields.map((field, i) =>
                    eq(field, relation.references![i])
                );
                const condition =
                    conditions.length > 1 ? and(...conditions) : conditions[0];

                sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${condition.sql}`;
                params.push(...condition.params);
            } else if (relation.type === "many") {
                // One-to-many
                const refRelation = Object.values(foreignTable.relations).find(
                    (r) => r.foreignTable === this.table
                );

                if (refRelation && refRelation.fields && refRelation.references) {
                    const conditions = refRelation.fields.map((field, i) =>
                        eq(field, refRelation.references![i])
                    );
                    const condition =
                        conditions.length > 1 ? and(...conditions) : conditions[0];

                    sql += ` LEFT JOIN ${foreignTable._.name} ${foreignAlias} ON ${condition.sql}`;
                    params.push(...condition.params);
                }
            }
        }

        return {sql, params};
    }

    async execute(): Promise<any[]> {
        const {sql: joinSql, params: joinParams} = this.buildJoins();
        this.query += joinSql;
        this.params.push(...joinParams);

        const {sql, params} = this.build();
        return this.db.select(sql, params);
    }

    async all(): Promise<any[]> {
        return this.execute();
    }

    async get(): Promise<any | undefined> {
        this.limit(1);
        const result = await this.execute();
        return result[0];
    }
}