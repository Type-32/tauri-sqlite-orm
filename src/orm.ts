import { getDb } from "./connection";
import type { Table, Column } from "./schema-builder";
import type { SQL } from "./sql-helpers";

class SelectQueryBuilder<T> {
  private _table: Table<any> | null = null;
  private _selectedColumns: string[] = ["*"];
  private _joins: string[] = [];
  private _where: SQL[] = [];
  private _orderBy: string[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _eager: Record<string, RelationConfig> = {};

  constructor(fields?: Record<string, Column<any>>) {
    if (fields) {
      this._selectedColumns = Object.values(fields).map((c) => c.name);
    }
  }

  from(table: Table<any>): this {
    this._table = table;
    return this;
  }

  where(...conditions: SQL[]): this {
    this._where.push(...conditions);
    return this;
  }

  leftJoin(otherTable: Table<any>, on: SQL): this {
    const onSql = on.toSQL();
    // For joins, we assume no bindings in the ON clause (col = col)
    const joinClause = `LEFT JOIN ${otherTable._tableName} ON ${onSql.clause}`;
    this._joins.push(joinClause);
    return this;
  }

  orderBy(...clauses: string[]): this {
    this._orderBy.push(...clauses);
    return this;
  }

  limit(value: number): this {
    this._limit = value;
    return this;
  }

  offset(value: number): this {
    this._offset = value;
    return this;
  }

  // The final execution step
  async execute(): Promise<T[]> {
    if (!this._table) {
      throw new Error("Cannot execute select query without a 'from' table.");
    }

    const db = getDb();
    const bindings: any[] = [];
    let query = `SELECT ${this._selectedColumns.join(", ")} FROM ${
      this._table._tableName
    }`;

    // Add Joins
    if (this._joins.length > 0) {
      query += ` ${this._joins.join(" ")}`;
    }

    // Add Where Clauses
    if (this._where.length > 0) {
      const whereClauses = this._where.map((condition) => {
        const sql = condition.toSQL();
        bindings.push(...sql.bindings);
        return `(${sql.clause})`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    // Add Order By
    if (this._orderBy.length > 0) {
      query += ` ORDER BY ${this._orderBy.join(", ")}`;
    }

    // Add Limit
    if (this._limit !== null) {
      query += ` LIMIT ?`;
      bindings.push(this._limit);
    }

    // Add Offset
    if (this._offset !== null) {
      // LIMIT must be present for OFFSET to work in SQLite
      if (this._limit === null) {
        query += ` LIMIT -1`; // SQLite convention for no limit
      }
      query += ` OFFSET ?`;
      bindings.push(this._offset);
    }

    return db.select<T[]>(query, bindings);
  }
}

// --- Main ORM Class ---

export class TauriORM {
  // Soft relational query API: db.query.users.findMany({ with: { posts: true } })
  query: Record<string, any> = {};
  private _tables: Record<string, Table<any>> | null = null;
  private _relations: Record<string, Record<string, RelationConfig>> | null =
    null;

  // Deprecated: use configure()
  configureQuery(
    tables: Record<string, Table<any>>,
    relations: Record<string, Record<string, RelationConfig>>
  ): void {
    this.configure(tables, relations);
  }
  select<T>(fields?: Record<string, Column<any>>): SelectQueryBuilder<T> {
    return new SelectQueryBuilder<T>(fields);
  }

  async insert<T extends Record<string, any>>(
    table: Table<any>,
    data: T
  ): Promise<void> {
    const db = getDb();

    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => "?").join(", ");

    const query = `INSERT INTO ${table._tableName} (${keys.join(
      ", "
    )}) VALUES (${placeholders})`;

    await db.execute(query, values);
  }

  async update(
    table: Table<any>,
    data: Record<string, any>,
    where?: Record<string, any> | SQL
  ): Promise<void> {
    const db = getDb();
    const setKeys = Object.keys(data);
    const setClause = setKeys.map((k) => `${k} = ?`).join(", ");
    const setValues = Object.values(data);

    let query = `UPDATE ${table._tableName} SET ${setClause}`;
    const bindings: any[] = [...setValues];

    if (where) {
      if (typeof (where as any).toSQL === "function") {
        const sql = (where as SQL).toSQL();
        query += ` WHERE ${sql.clause}`;
        bindings.push(...sql.bindings);
      } else {
        const entries = Object.entries(where as Record<string, any>);
        if (entries.length > 0) {
          query += " WHERE " + entries.map(([k]) => `${k} = ?`).join(" AND ");
          bindings.push(...entries.map(([, v]) => v));
        }
      }
    }

    await db.execute(query, bindings);
  }

  async delete(
    table: Table<any>,
    where?: Record<string, any> | SQL
  ): Promise<void> {
    const db = getDb();
    let query = `DELETE FROM ${table._tableName}`;
    const bindings: any[] = [];

    if (where) {
      if (typeof (where as any).toSQL === "function") {
        const sql = (where as SQL).toSQL();
        query += ` WHERE ${sql.clause}`;
        bindings.push(...sql.bindings);
      } else {
        const entries = Object.entries(where as Record<string, any>);
        if (entries.length > 0) {
          query += " WHERE " + entries.map(([k]) => `${k} = ?`).join(" AND ");
          bindings.push(...entries.map(([, v]) => v));
        }
      }
    }

    await db.execute(query, bindings);
  }

  async run(query: string, bindings: any[] = []): Promise<void> {
    const db = getDb();
    await db.execute(query, bindings);
  }

  // --- Migrations API ---

  private generateCreateTableSql(table: Table<any>): string {
    const tableName = table._tableName;
    const columns: Column<any>[] = Object.values(table._schema);
    const columnDefs = columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.isPrimaryKey) def += " PRIMARY KEY AUTOINCREMENT";
      if (col.isNotNull) def += " NOT NULL";
      if (col.hasDefault) def += " DEFAULT CURRENT_TIMESTAMP";
      return def;
    });
    return `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(
      ", "
    )});`;
  }

  async createTableIfNotExists(table: Table<any>): Promise<void> {
    const sql = this.generateCreateTableSql(table);
    await this.run(sql);
  }

  async createTablesIfNotExist(tables: Table<any>[]): Promise<void> {
    for (const t of tables) {
      await this.createTableIfNotExists(t);
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.run(
      `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
    );
  }

  private async hasMigration(name: string): Promise<boolean> {
    const db = getDb();
    const rows = await db.select<any[]>(
      `SELECT name FROM _migrations WHERE name = ?`,
      [name]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async recordMigration(name: string): Promise<void> {
    const db = getDb();
    await db.execute(
      `INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`,
      [name, Date.now()]
    );
  }

  async migrate(
    tables: Table<any>[],
    options?: { name?: string; track?: boolean }
  ): Promise<void> {
    const track = options?.track ?? true;
    if (track) {
      await this.ensureMigrationsTable();
      const name =
        options?.name ?? `init:${tables.map((t) => t._tableName).join(",")}`;
      const already = await this.hasMigration(name);
      if (already) return;
      await this.createTablesIfNotExist(tables);
      await this.recordMigration(name);
      return;
    }
    await this.createTablesIfNotExist(tables);
  }

  // Configure schema and relations, and generate db.query automatically
  configure(
    tables: Record<string, Table<any>>,
    relDefs?: Record<string, Record<string, RelationConfig>>
  ) {
    this._tables = tables;
    this._relations = relDefs ?? {};
    this.query = makeQueryAPI(tables, this._relations);
    return this;
  }

  // Convenience: migrate from configured tables
  async migrateConfigured(options?: { name?: string; track?: boolean }) {
    if (!this._tables)
      throw new Error("No tables configured. Call db.configure({...}) first.");
    await this.migrate(Object.values(this._tables), options);
  }
}

// Export a singleton instance for easy use
export const db = new TauriORM();

// --- Soft relations API ---

type OneConfig = {
  fields?: Column[];
  references?: Column[];
  relationName?: string;
};

type ManyConfig = {
  relationName?: string;
};

type RelationBuilderCtx = {
  one: (table: Table<any>, cfg?: OneConfig) => OneRelation;
  many: (table: Table<any>, cfg?: ManyConfig) => ManyRelation;
};

export type OneRelation = { kind: "one"; table: Table<any>; cfg?: OneConfig };
export type ManyRelation = {
  kind: "many";
  table: Table<any>;
  cfg?: ManyConfig;
};

export function relations(
  baseTable: Table<any>,
  builder: (
    ctx: RelationBuilderCtx
  ) => Record<string, OneRelation | ManyRelation>
) {
  const ctx: RelationBuilderCtx = {
    one: (table, cfg) => ({ kind: "one", table, cfg }),
    many: (table, cfg) => ({ kind: "many", table, cfg }),
  };
  const rels = builder(ctx);
  return rels;
}

type RelationConfig = OneRelation | ManyRelation;

// Eager loading using simple N+1 strategy for now
export function makeQueryAPI(
  tables: Record<string, Table<any>>,
  relDefs: Record<string, Record<string, RelationConfig>>
) {
  const api: any = {};
  for (const [tblKey, tbl] of Object.entries(tables)) {
    api[tblKey] = {
      async findMany(opts?: {
        with?: Record<string, boolean>;
        join?: boolean;
      }) {
        const base = tbl;
        const withSpec = opts?.with ?? {};
        const dbi = getDb();

        const rels = relDefs[tblKey] ?? {};

        if (opts?.join) {
          const baseCols: Column[] = Object.values(base._schema);
          const basePk =
            baseCols.find((c) => c.isPrimaryKey) ||
            baseCols.find((c) => c.name === "id") ||
            baseCols[0];

          const selectParts: string[] = [];
          for (const c of baseCols) {
            selectParts.push(
              `${base._tableName}.${c.name} AS __base_${c.name}`
            );
          }

          const joins: string[] = [];
          const relColsMap: Record<string, Column<any>[]> = {};
          const fkMap: Record<
            string,
            { childFk: Column<any>; childPk: Column<any> | null }
          > = {};

          for (const [relName, enabled] of Object.entries(withSpec)) {
            if (!enabled) continue;
            const rel = rels[relName];
            if (!rel) continue;
            const child = rel.table;
            const childCols: Column[] = Object.values(child._schema);
            const childPk =
              childCols.find((c) => c.isPrimaryKey) ||
              childCols.find((c) => c.name === "id") ||
              null;
            let childFk: Column | undefined =
              rel.kind === "one" && rel.cfg?.fields?.[0]
                ? rel.cfg.fields[0]
                : undefined;
            if (!childFk) {
              const guessNames = [
                `${base._tableName}_id`,
                `${base._tableName}Id`,
                `${basePk.name}`,
                `${base._tableName.slice(0, -1)}Id`,
              ];
              childFk =
                childCols.find((c) => guessNames.includes(c.name)) ||
                childCols.find((c) => /.*_id$/i.test(c.name));
            }
            if (!childFk) continue;

            fkMap[relName] = { childFk, childPk };
            relColsMap[relName] = childCols;

            for (const c of childCols) {
              selectParts.push(
                `${child._tableName}.${c.name} AS __rel_${relName}_${c.name}`
              );
            }
            joins.push(
              `LEFT JOIN ${child._tableName} ON ${child._tableName}.${childFk.name} = ${base._tableName}.${basePk.name}`
            );
          }

          const sql = `SELECT ${selectParts.join(", ")} FROM ${
            base._tableName
          }${joins.length ? " " + joins.join(" ") : ""}`;
          const rows = await dbi.select<any[]>(sql);

          const groups = new Map<any, any>();
          for (const row of rows) {
            const baseObj: any = {};
            for (const c of baseCols) baseObj[c.name] = row[`__base_${c.name}`];
            const baseKey = baseObj[basePk.name];
            if (!groups.has(baseKey)) {
              const seed: any = { ...baseObj };
              for (const [relName, enabled] of Object.entries(withSpec)) {
                if (!enabled) continue;
                const rel = rels[relName];
                if (!rel) continue;
                seed[relName] = rel.kind === "many" ? [] : null;
              }
              groups.set(baseKey, seed);
            }
            const acc = groups.get(baseKey);
            for (const [relName, enabled] of Object.entries(withSpec)) {
              if (!enabled) continue;
              const rel = rels[relName];
              if (!rel) continue;
              const childCols = relColsMap[relName];
              const childObj: any = {};
              let allNull = true;
              for (const c of childCols) {
                const v = row[`__rel_${relName}_${c.name}`];
                childObj[c.name] = v;
                if (v !== null && v !== undefined) allNull = false;
              }
              if (allNull) continue;
              if (rel.kind === "many") {
                const childPk = fkMap[relName].childPk;
                if (childPk) {
                  if (!acc[relName]) acc[relName] = [];
                  const exists = acc[relName].some(
                    (r: any) => r[childPk!.name] === childObj[childPk!.name]
                  );
                  if (!exists) acc[relName].push(childObj);
                } else {
                  acc[relName].push(childObj);
                }
              } else {
                acc[relName] = childObj;
              }
            }
          }
          return Array.from(groups.values());
        }

        // Fallback N+1
        const baseRows = await dbi.select<any[]>(
          `SELECT * FROM ${base._tableName}`
        );
        const result = baseRows.map((r) => ({ ...r }));
        for (const [relName, enabled] of Object.entries(withSpec)) {
          if (!enabled) continue;
          const rel = rels[relName];
          if (!rel) continue;
          if (rel.kind === "many") {
            const child = rel.table;
            const baseCols: Column[] = Object.values(base._schema);
            const basePk =
              baseCols.find((c) => c.isPrimaryKey) ||
              baseCols.find((c) => c.name === "id") ||
              baseCols[0];
            const childCols: Column[] = Object.values(child._schema);
            let childFk: Column | undefined = undefined;
            if (!childFk) {
              childFk =
                childCols.find((c) => c.name === `${base._tableName}_id`) ||
                childCols.find((c) => c.name === `${base._tableName}Id`) ||
                childCols.find((c) => /.*_id$/i.test(c.name));
            }
            if (!childFk) continue;
            const childRows = await dbi.select<any[]>(
              `SELECT * FROM ${child._tableName} WHERE ${
                childFk.name
              } IN (${baseRows.map(() => "?").join(", ")})`,
              baseRows.map((r) => r[basePk!.name])
            );
            const buckets = new Map<any, any[]>();
            for (const row of childRows) {
              const key = row[childFk.name];
              if (!buckets.has(key)) buckets.set(key, []);
              buckets.get(key)!.push(row);
            }
            for (const r of result) {
              const key = r[basePk!.name];
              (r as any)[relName] = buckets.get(key) ?? [];
            }
          } else if (rel.kind === "one") {
            const child = rel.table;
            const baseCols: Column[] = Object.values(base._schema);
            const basePk =
              baseCols.find((c) => c.isPrimaryKey) ||
              baseCols.find((c) => c.name === "id") ||
              baseCols[0];
            const childCols: Column[] = Object.values(child._schema);
            const fk =
              rel.cfg?.fields?.[0] ||
              childCols.find((c) => /.*_id$/i.test(c.name));
            if (!fk) continue;
            const childRows = await dbi.select<any[]>(
              `SELECT * FROM ${child._tableName} WHERE ${fk.name} IN (${baseRows
                .map(() => "?")
                .join(", ")})`,
              baseRows.map((r) => r[basePk!.name])
            );
            const buckets = new Map<any, any>();
            for (const row of childRows) buckets.set(row[fk.name], row);
            for (const r of result)
              (r as any)[relName] = buckets.get(r[basePk!.name]) ?? null;
          }
        }
        return result as any[];
      },
    };
  }

  return api as {
    [K in keyof typeof tables]: {
      findMany: (opts?: {
        with?: Record<string, boolean>;
        join?: boolean;
      }) => Promise<any[]>;
    };
  };
}
