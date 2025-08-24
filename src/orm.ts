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

  // --- Drizzle-style CRUD builders ---
  insert(table: Table<any>) {
    return new (class InsertBuilder {
      _table = table;
      _rows: Record<string, any>[] = [];
      values(rowOrRows: Record<string, any> | Record<string, any>[]) {
        this._rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        return this;
      }
      async execute() {
        const db = getDb();
        for (const data of this._rows) {
          const finalData: Record<string, any> = { ...data };
          const schema = (this._table as any)._schema as Record<
            string,
            Column<any>
          >;
          for (const [key, col] of Object.entries(schema)) {
            if (finalData[key] === undefined && (col as any).defaultFn) {
              finalData[key] = (col as any).defaultFn!();
            }
          }
          const keys = Object.keys(finalData);
          const values = Object.values(finalData);
          const placeholders = values.map(() => "?").join(", ");
          const query = `INSERT INTO ${this._table._tableName} (${keys.join(
            ", "
          )}) VALUES (${placeholders})`;
          await db.execute(query, values);
        }
      }
    })();
  }

  update(table: Table<any>) {
    return new (class UpdateBuilder {
      _table = table;
      _data: Record<string, any> | null = null;
      _where: Record<string, any> | SQL | null = null;
      set(data: Record<string, any>) {
        this._data = data;
        return this;
      }
      where(cond: Record<string, any> | SQL) {
        this._where = cond;
        return this;
      }
      async execute() {
        if (!this._data)
          throw new Error("Update requires set() before execute()");
        const db = getDb();
        const setKeys = Object.keys(this._data);
        const setClause = setKeys.map((k) => `${k} = ?`).join(", ");
        const bindings: any[] = Object.values(this._data);
        let query = `UPDATE ${this._table._tableName} SET ${setClause}`;
        if (this._where) {
          if (typeof (this._where as any).toSQL === "function") {
            const sql = (this._where as SQL).toSQL();
            query += ` WHERE ${sql.clause}`;
            bindings.push(...sql.bindings);
          } else {
            const entries = Object.entries(this._where as Record<string, any>);
            if (entries.length > 0) {
              query += ` WHERE ${entries
                .map(([k]) => `${k} = ?`)
                .join(" AND ")}`;
              bindings.push(...entries.map(([, v]) => v));
            }
          }
        }
        await db.execute(query, bindings);
      }
    })();
  }

  delete(table: Table<any>) {
    return new (class DeleteBuilder {
      _table = table;
      _where: Record<string, any> | SQL | null = null;
      where(cond: Record<string, any> | SQL) {
        this._where = cond;
        return this;
      }
      async execute() {
        const db = getDb();
        let query = `DELETE FROM ${this._table._tableName}`;
        const bindings: any[] = [];
        if (this._where) {
          if (typeof (this._where as any).toSQL === "function") {
            const sql = (this._where as SQL).toSQL();
            query += ` WHERE ${sql.clause}`;
            bindings.push(...sql.bindings);
          } else {
            const entries = Object.entries(this._where as Record<string, any>);
            if (entries.length > 0) {
              query += ` WHERE ${entries
                .map(([k]) => `${k} = ?`)
                .join(" AND ")}`;
              bindings.push(...entries.map(([, v]) => v));
            }
          }
        }
        await db.execute(query, bindings);
      }
    })();
  }

  // legacy direct methods removed in favor of builder APIs

  // legacy direct methods removed in favor of builder APIs

  // legacy direct methods removed in favor of builder APIs

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
      if (col.isPrimaryKey) {
        def += col.autoIncrement
          ? " PRIMARY KEY AUTOINCREMENT"
          : " PRIMARY KEY";
      }
      if (col.isNotNull) def += " NOT NULL";
      if (col.defaultValue !== undefined) {
        const dv: any = col.defaultValue as any;
        if (dv && typeof dv === "object" && "raw" in dv) {
          def += ` DEFAULT ${dv.raw}`;
        } else if (typeof dv === "string") {
          def += ` DEFAULT '${dv.replace(/'/g, "''")}'`;
        } else {
          def += ` DEFAULT ${dv}`;
        }
      }
      // defaultFn is applied at insert-time; not encoded in DDL
      if (col.references && !col.isPrimaryKey) {
        def += ` REFERENCES ${col.references.table} (${col.references.column})`;
        if (col.references.onDelete)
          def += ` ON DELETE ${col.references.onDelete.toUpperCase()}`;
        if (col.references.onUpdate)
          def += ` ON UPDATE ${col.references.onUpdate.toUpperCase()}`;
      }
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

// With-spec for nested relational queries and selective columns
type WithSpec = Record<
  string,
  boolean | { with?: WithSpec; columns?: string[] }
>;

function getPrimaryKey(table: Table<any>): Column<any> {
  const cols: Column[] = Object.values(table._schema);
  return (
    cols.find((c) => c.isPrimaryKey) ||
    cols.find((c) => c.name === "id") ||
    cols[0]
  );
}

function guessChildFk(
  child: Table<any>,
  base: Table<any>,
  rel?: RelationConfig
): Column<any> | null {
  const childCols: Column[] = Object.values(child._schema);
  if (rel && rel.kind === "one" && rel.cfg?.fields?.[0])
    return rel.cfg.fields[0];
  const basePk = getPrimaryKey(base);
  const guessNames = [
    `${base._tableName}_id`,
    `${base._tableName}Id`,
    `${basePk.name}`,
    `${base._tableName.slice(0, -1)}Id`,
  ];
  return (
    childCols.find((c) => guessNames.includes(c.name)) ||
    childCols.find((c) => /.*_id$/i.test(c.name)) ||
    null
  );
}

function isFlatWith(spec: WithSpec): boolean {
  return Object.values(spec).every((v) => typeof v === "boolean");
}

// Eager loading using simple N+1 strategy for now
export function makeQueryAPI(
  tables: Record<string, Table<any>>,
  relDefs: Record<string, Record<string, RelationConfig>>
) {
  const api: any = {};
  const tableKeyByName: Record<string, string> = {};
  for (const [k, t] of Object.entries(tables)) tableKeyByName[t._tableName] = k;
  for (const [tblKey, tbl] of Object.entries(tables)) {
    api[tblKey] = {
      async findMany(opts?: {
        with?: WithSpec;
        join?: boolean;
        columns?: string[] | Record<string, boolean>;
        where?: SQL | Record<string, any>;
        orderBy?: string[];
        limit?: number;
        offset?: number;
      }) {
        const base = tbl;
        const withSpec = (opts?.with as WithSpec) ?? {};
        const dbi = getDb();

        const rels = relDefs[tblKey] ?? {};

        if (opts?.join && isFlatWith(withSpec)) {
          const baseCols: Column[] = Object.values(base._schema);
          const basePk =
            baseCols.find((c) => c.isPrimaryKey) ||
            baseCols.find((c) => c.name === "id") ||
            baseCols[0];

          const selectParts: string[] = [];
          let baseSelected: string[];
          if (opts?.columns && !Array.isArray(opts.columns)) {
            baseSelected = Object.entries(opts.columns)
              .filter(([, v]) => !!v)
              .map(([k]) => k);
          } else if (
            Array.isArray(opts?.columns) &&
            (opts!.columns as string[]).length > 0
          ) {
            baseSelected = opts!.columns as string[];
          } else {
            baseSelected = baseCols.map((c) => c.name);
          }
          for (const name of baseSelected)
            selectParts.push(`${base._tableName}.${name} AS __base_${name}`);

          const joins: string[] = [];
          const relColsMap: Record<string, string[]> = {};
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
            const childFk = guessChildFk(child, base, rel);
            if (!childFk) continue;
            fkMap[relName] = { childFk, childPk };
            const selected =
              typeof enabled === "object" && (enabled as any).columns?.length
                ? (enabled as any).columns!
                : childCols.map((c) => c.name);
            relColsMap[relName] = selected;
            for (const name of selected)
              selectParts.push(
                `${child._tableName}.${name} AS __rel_${relName}_${name}`
              );
            joins.push(
              `LEFT JOIN ${child._tableName} ON ${child._tableName}.${childFk.name} = ${base._tableName}.${basePk.name}`
            );
          }

          let sqlText = `SELECT ${selectParts.join(", ")} FROM ${
            base._tableName
          }${joins.length ? " " + joins.join(" ") : ""}`;
          const bindings: any[] = [];
          if (opts?.where) {
            if (typeof (opts.where as any).toSQL === "function") {
              const w = (opts.where as SQL).toSQL();
              sqlText += ` WHERE ${w.clause}`;
              bindings.push(...w.bindings);
            } else {
              const entries = Object.entries(opts.where as Record<string, any>);
              if (entries.length > 0) {
                sqlText += ` WHERE ${entries
                  .map(([k]) => `${base._tableName}.${k} = ?`)
                  .join(" AND ")}`;
                bindings.push(...entries.map(([, v]) => v));
              }
            }
          }
          if (opts?.orderBy?.length)
            sqlText += ` ORDER BY ${opts.orderBy.join(", ")}`;
          if (typeof opts?.limit === "number")
            sqlText += ` LIMIT ${opts.limit}`;
          if (typeof opts?.offset === "number")
            sqlText += ` OFFSET ${opts.offset}`;
          const rows = await dbi.select<any[]>(sqlText, bindings);

          const groups = new Map<any, any>();
          for (const row of rows) {
            const baseObj: any = {};
            for (const name of baseSelected)
              baseObj[name] = row[`__base_${name}`];
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
              for (const name of childCols) {
                const v = row[`__rel_${relName}_${name}`];
                childObj[name] = v;
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

        // Recursive nested loading when join is off or spec is nested
        let baseSelected: string[];
        if (opts?.columns && !Array.isArray(opts.columns)) {
          baseSelected = Object.entries(opts.columns)
            .filter(([, v]) => !!v)
            .map(([k]) => k);
        } else if (
          Array.isArray(opts?.columns) &&
          (opts!.columns as string[]).length > 0
        ) {
          baseSelected = opts!.columns as string[];
        } else {
          baseSelected = (Object.values(base._schema) as Column<any>[]).map(
            (c) => c.name
          );
        }
        let baseSql = `SELECT ${baseSelected.join(", ")} FROM ${
          base._tableName
        }`;
        const baseBindings: any[] = [];
        if (opts?.where) {
          if (typeof (opts.where as any).toSQL === "function") {
            const w = (opts.where as SQL).toSQL();
            baseSql += ` WHERE ${w.clause}`;
            baseBindings.push(...w.bindings);
          } else {
            const entries = Object.entries(opts.where as Record<string, any>);
            if (entries.length > 0) {
              baseSql += ` WHERE ${entries
                .map(([k]) => `${k} = ?`)
                .join(" AND ")}`;
              baseBindings.push(...entries.map(([, v]) => v));
            }
          }
        }
        if (opts?.orderBy?.length)
          baseSql += ` ORDER BY ${opts.orderBy.join(", ")}`;
        if (typeof opts?.limit === "number") baseSql += ` LIMIT ${opts.limit}`;
        if (typeof opts?.offset === "number")
          baseSql += ` OFFSET ${opts.offset}`;
        const baseRows = await dbi.select<any[]>(baseSql, baseBindings);
        const result = baseRows.map((r) => ({ ...r }));
        async function loadRelationsFor(
          parents: any[],
          parentTable: Table<any>,
          spec: WithSpec
        ) {
          const parentPk = getPrimaryKey(parentTable);
          const parentIds = parents.map((p) => p[parentPk.name]);
          const relsMap =
            relDefs[
              Object.keys(tables).find(
                (k) => tables[k]._tableName === parentTable._tableName
              )!
            ] || {};
          for (const [relName, v] of Object.entries(spec)) {
            const enabled = v as any;
            const rel = relsMap[relName];
            if (!rel) continue;
            const child = rel.table;
            const childCols: Column[] = Object.values(child._schema);
            const selectCols =
              enabled?.columns && enabled.columns.length > 0
                ? enabled.columns
                : childCols.map((c) => c.name);
            const fkCol = guessChildFk(child, parentTable, rel);
            if (!fkCol) continue;
            if (rel.kind === "many") {
              const sql = `SELECT ${selectCols.join(", ")} FROM ${
                child._tableName
              } WHERE ${fkCol.name} IN (${parentIds
                .map(() => "?")
                .join(", ")})`;
              const rows = await dbi.select<any[]>(sql, parentIds);
              const buckets = new Map<any, any[]>();
              for (const r of rows) {
                const key = r[fkCol.name];
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push(r);
              }
              for (const p of parents)
                (p as any)[relName] = buckets.get(p[parentPk.name]) ?? [];
              if (enabled?.with) {
                const children = parents.flatMap(
                  (p) => (p as any)[relName] as any[]
                );
                if (children.length > 0)
                  await loadRelationsFor(children, child, enabled.with);
              }
            } else {
              const sql = `SELECT ${selectCols.join(", ")} FROM ${
                child._tableName
              } WHERE ${fkCol.name} IN (${parentIds
                .map(() => "?")
                .join(", ")})`;
              const rows = await dbi.select<any[]>(sql, parentIds);
              const mapOne = new Map<any, any>();
              for (const r of rows) mapOne.set(r[fkCol.name], r);
              for (const p of parents)
                (p as any)[relName] = mapOne.get(p[parentPk.name]) ?? null;
              if (enabled?.with) {
                const children = parents
                  .map((p) => (p as any)[relName])
                  .filter(Boolean);
                if (children.length > 0)
                  await loadRelationsFor(children, child, enabled.with);
              }
            }
          }
        }

        if (Object.keys(withSpec).length > 0) {
          await loadRelationsFor(result, base, withSpec);
        }
        return result as any[];
      },
    };
  }

  return api as {
    [K in keyof typeof tables]: {
      findMany: (opts?: {
        with?: WithSpec;
        join?: boolean;
        columns?: string[];
      }) => Promise<any[]>;
    };
  };
}
