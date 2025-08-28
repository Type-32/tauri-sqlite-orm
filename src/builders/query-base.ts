// Query Builders
import Database from "@tauri-apps/plugin-sql";
import {SQLCondition} from "../orm";
import {AnySQLiteColumn} from "../types";

export class BaseQueryBuilder {
    protected query: string = "";
    protected params: any[] = [];

    constructor(protected db: Database) {
    }

    where(condition: SQLCondition): this {
        this.query += ` WHERE ${condition.sql}`;
        this.params.push(...condition.params);
        return this;
    }

    orderBy(
        column: AnySQLiteColumn | { sql: string; params: any[] },
        direction: "ASC" | "DESC" = "ASC"
    ): this {
        if ("sql" in column) {
            this.query += ` ORDER BY ${column.sql} ${direction}`;
            this.params.push(...column.params);
        } else {
            this.query += ` ORDER BY ${column._.name} ${direction}`;
        }
        return this;
    }

    limit(count: number): this {
        this.query += ` LIMIT ${count}`;
        return this;
    }

    offset(count: number): this {
        this.query += ` OFFSET ${count}`;
        return this;
    }

    build(): { sql: string; params: any[] } {
        return {
            sql: this.query,
            params: this.params,
        };
    }
}