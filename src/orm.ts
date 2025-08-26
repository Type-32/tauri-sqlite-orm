import Database from "@tauri-apps/plugin-sql";
import type { Table, Column } from "./schema-builder";
import {
  type SQL,
  asc,
  desc,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  like,
  and,
  or,
  not,
  getQualifiedName,
} from "./sql-helpers";

// Helper type extractors for stronger typing
type InferInsert<T> = T extends { $inferInsert: infer I } ? I : never;
type InferSelect<T> = T extends { $inferSelect: infer S } ? S : never;

// --- Query API types ---
type WithSpec = Record<
  string,
  boolean | { with?: WithSpec; columns?: string[] }
>;

type FindManyOptions<TTable extends Table<any>> = {
  with?: WithSpec;
  join?: boolean;
  columns?:
    | (keyof InferSelect<TTable>)[]
    | Record<keyof InferSelect<TTable>, boolean>;
  where?:
    | SQL
    | Partial<InferSelect<TTable>>
    | ((
        table: TTable,
        ops: {
          eq: typeof eq;
          ne: typeof ne;
          gt: typeof gt;
          gte: typeof gte;
          lt: typeof lt;
          lte: typeof lte;
          like: typeof like;
        }
      ) => SQL);
  orderBy?:
    | (keyof InferSelect<TTable>)[]
    | ((
        table: TTable,
        ops: { asc: typeof asc; desc: typeof desc }
      ) => (string | SQL)[]);
  limit?: number;
  offset?: number;
};

type FindFirstOptions<TTable extends Table<any>> = Omit<
  FindManyOptions<TTable>,
  "limit" | "offset"
>;

function getTableName(table: Table<any>): string {
  const anyTable: any = table as any;
  return (anyTable.tableName || anyTable.name || "") as string;
}

class SelectQueryBuilder<T> {
  private _table: Table<any> | null = null;
  private _selectedColumns: Array<{ sql: string; alias?: string }> = [];
  private _joins: string[] = [];
  private _where: SQL[] = [];
  private _orderBy: Array<string | SQL> = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _groupBy: string[] = [];
  private _having: SQL[] = [];
  private _distinct: boolean = false;
  private _dbProvider: () => Promise<Database>;

  constructor(
    dbProvider: () => Promise<Database>,
    fields?: Record<string, Column<any>>
  ) {
    this._dbProvider = dbProvider;
    if (fields) {
      for (const [alias, col] of Object.entries(fields)) {
        const sql = getQualifiedName(col);
        this._selectedColumns.push({ sql, alias });
      }
    }
  }

  distinct(): this {
    this._distinct = true;
    return this;
  }

  select(fields: Record<string, Column<any> | SQL>): this {
    this._selectedColumns = [];
    for (const [alias, expr] of Object.entries(fields)) {
      if (typeof (expr as any).toSQL === "function") {
        const s = (expr as SQL).toSQL();
        this._selectedColumns.push({ sql: s.clause, alias });
      } else {
        this._selectedColumns.push({
          sql: getQualifiedName(expr as Column),
          alias,
        });
      }
    }
    return this;
  }

  from(table: Table<any>): this {
    this._table = table;
    return this;
  }

  where(...conditions: (SQL | undefined)[]): this {
    this._where.push(...(conditions.filter(Boolean) as SQL[]));
    return this;
  }

  leftJoin(otherTable: Table<any>, on: SQL): this {
    const onSql = on.toSQL();
    const joinClause = `LEFT JOIN ${otherTable.tableName} ON ${onSql.clause}`;
    this._joins.push(joinClause);
    return this;
  }

  groupBy(...exprs: (Column | string)[]): this {
    for (const e of exprs) {
      if (!e) continue;
      if (typeof e === "string") this._groupBy.push(e);
      else this._groupBy.push(getQualifiedName(e));
    }
    return this;
  }

  having(...conditions: SQL[]): this {
    this._having.push(...conditions);
    return this;
  }

  orderBy(...clauses: (string | Column<any> | SQL)[]): this {
    for (const c of clauses) {
      if (!c) continue;
      if (typeof c === "string") this._orderBy.push(c);
      else if (typeof (c as any).toSQL === "function")
        this._orderBy.push(c as SQL);
      else this._orderBy.push(getQualifiedName(c as Column));
    }
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

  async execute(): Promise<T[]> {
    if (!this._table) {
      throw new Error("Cannot execute select query without a 'from' table.");
    }

    const db = await this._dbProvider();
    const baseTableName = getTableName(this._table);
    if (!baseTableName) {
      throw new Error(
        "Invalid table passed to select.from(): missing table name"
      );
    }
    const bindings: any[] = [];
    const selectList =
      this._selectedColumns.length > 0
        ? this._selectedColumns
            .map((c) => (c.alias ? `${c.sql} AS ${c.alias}` : c.sql))
            .join(", ")
        : (Object.values(this._table._schema) as Column<any>[])
            .map((c) => `${baseTableName}.${c.name}`)
            .join(", ");
    let query = `SELECT ${
      this._distinct ? "DISTINCT " : ""
    }${selectList} FROM ${baseTableName}`;

    if (this._joins.length > 0) query += ` ${this._joins.join(" ")}`;

    if (this._where.length > 0) {
      const whereClauses = this._where.map((condition) => {
        const sql = condition.toSQL();
        bindings.push(...sql.bindings);
        return `(${sql.clause})`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    if (this._groupBy.length > 0) {
      query += ` GROUP BY ${this._groupBy.join(", ")}`;
    }

    if (this._having.length > 0) {
      const havingClauses = this._having.map((h) => {
        const sql = h.toSQL();
        bindings.push(...sql.bindings);
        return `(${sql.clause})`;
      });
      query += ` HAVING ${havingClauses.join(" AND ")}`;
    }

    if (this._orderBy.length > 0) {
      const ordParts: string[] = [];
      for (const ob of this._orderBy) {
        if (typeof ob === "string") ordParts.push(ob);
        else {
          const s = (ob as SQL).toSQL();
          ordParts.push(s.clause);
          bindings.push(...s.bindings);
        }
      }
      query += ` ORDER BY ${ordParts.join(", ")}`;
    }

    if (this._limit !== null) {
      query += ` LIMIT ?`;
      bindings.push(this._limit);
    }

    if (this._offset !== null) {
      if (this._limit === null) query += ` LIMIT -1`;
      query += ` OFFSET ?`;
      bindings.push(this._offset);
    }

    return db.select<T[]>(query, bindings);
  }

  async iterator(): Promise<AsyncIterableIterator<T>> {
    const rows = await this.execute();
    async function* gen() {
      for (const r of rows) yield r as T;
    }
    return gen();
  }
}

// --- Main ORM Class ---

export class TauriORM {
  // Soft relational query API: db.query.users.findMany({ with: { posts: true } })
  query: Record<string, any> = {};
  private _tables: Record<string, Table<any>> | null = null;
  private _relations: Record<string, Record<string, RelationConfig>> | null =
    null;
  private _dbPromise: Promise<Database>;

  constructor(dbUri: string) {
    this._dbPromise = Database.load(dbUri).then(async (db) => {
      await db.execute("PRAGMA foreign_keys = ON");
      return db;
    });
  }

  private async getDb(): Promise<Database> {
    return this._dbPromise;
  }

  // Deprecated: use configure()
  configureQuery(
    tables: Record<string, Table<any>>,
    relations: Record<string, Record<string, RelationConfig>>
  ): void {
    this.configure(tables, relations);
  }
  // Typed select with column map
  select<TFields extends Record<string, Column<any>>>(
    fields: TFields
  ): SelectQueryBuilder<{ [K in keyof TFields]: TFields[K]["_dataType"] }>;
  select<T = any>(fields?: undefined): SelectQueryBuilder<T>;
  select(fields?: Record<string, Column<any>>): any {
    return new SelectQueryBuilder<any>(this.getDb.bind(this), fields);
  }
  selectDistinct<TFields extends Record<string, Column<any>>>(
    fields: TFields
  ): SelectQueryBuilder<{ [K in keyof TFields]: TFields[K]["_dataType"] }>;
  selectDistinct<T = any>(fields?: undefined): SelectQueryBuilder<T>;
  selectDistinct(fields?: Record<string, Column<any>>): any {
    const qb = new SelectQueryBuilder<any>(this.getDb.bind(this), fields);
    qb.distinct();
    return qb;
  }

  // --- Drizzle-style CRUD builders ---
  insert<TTable extends Table<any>>(table: TTable) {
    const self = this;
    return new (class InsertBuilder {
      _table = table;
      _rows: Array<InferInsert<TTable>> = [];
      _selectSql: { clause: string; bindings: any[] } | null = null;
      _conflict:
        | null
        | { kind: "doNothing"; target?: string | string[]; where?: SQL }
        | {
            kind: "doUpdate";
            target: string | string[];
            targetWhere?: SQL;
            set: Record<string, any>;
            setWhere?: SQL;
          } = null;
      _returning: null | "__RETURNING_ID__" | Record<string, Column<any>> =
        null;
      values(rowOrRows: InferInsert<TTable> | Array<InferInsert<TTable>>) {
        this._rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        return this;
      }
      select(qb: { toSQL?: () => { clause: string; bindings: any[] } } | SQL) {
        if ((qb as any).toSQL) this._selectSql = (qb as any).toSQL();
        else this._selectSql = (qb as SQL).toSQL();
        return this;
      }
      returning(fields?: Record<string, Column<any>>) {
        this._returning = fields ?? {};
        return this as any;
      }
      $returningId() {
        // For SQLite, last_insert_rowid() for single row; for multiple rows, return empty objects
        this._returning = "__RETURNING_ID__";
        return this as any;
      }
      onConflictDoNothing(opts?: {
        target?: Column<any> | Column<any>[];
        where?: SQL;
      }) {
        const target = opts?.target
          ? Array.isArray(opts.target)
            ? opts.target.map((c) => c.name)
            : (opts.target as Column).name
          : undefined;
        this._conflict = {
          kind: "doNothing",
          target,
          where: opts?.where,
        };
        return this;
      }
      onConflictDoUpdate(opts: {
        target: Column<any> | Column<any>[];
        targetWhere?: SQL;
        set: Record<string, any>;
        setWhere?: SQL;
      }) {
        const target = Array.isArray(opts.target)
          ? opts.target.map((c) => c.name)
          : (opts.target as Column).name;
        this._conflict = {
          kind: "doUpdate",
          target,
          targetWhere: opts.targetWhere,
          set: opts.set,
          setWhere: opts.setWhere,
        };
        return this;
      }
      async execute() {
        const db = await self.getDb();
        const tableName = getTableName(this._table);
        if (!tableName)
          throw new Error(
            "Invalid table passed to insert(): missing table name"
          );

        // INSERT ... SELECT path
        if (this._selectSql) {
          const cols = Object.keys((this._table as any)._schema);
          let query = `INSERT INTO ${tableName} (${cols.join(", ")}) ${
            this._selectSql.clause
          }`;
          const bindings = [...this._selectSql.bindings];
          query += this._buildConflictClause();
          const ret = await this._executeWithReturning(db, query, bindings);
          return ret;
        }

        // VALUES path
        for (const data of this._rows) {
          const finalData: Record<string, any> = Object.assign({}, data as any);
          const schema = (this._table as any)._schema as Record<
            string,
            Column<any>
          >;

          function coerceValue(col: Column<any> | undefined, value: any) {
            if (col && (col as any).mode === "boolean") {
              return value ? 1 : 0;
            }
            if (value instanceof Date) {
              if (col && (col as any).mode === "timestamp_ms")
                return value.getTime();
              if (col && (col as any).mode === "timestamp")
                return Math.floor(value.getTime() / 1000);
            }
            return value;
          }

          // Handle default values properly
          for (const [key, col] of Object.entries(schema)) {
            if (finalData[key] === undefined) {
              if ((col as any).defaultFn) {
                finalData[key] = coerceValue(col, (col as any).defaultFn!());
              } else if (
                (col as any).onUpdateFn &&
                !this._rows.includes(data)
              ) {
                // onUpdateFn should only apply to updates, not inserts
                finalData[key] = coerceValue(col, (col as any).onUpdateFn!());
              }
            }
          }

          const entries = Object.entries(finalData).filter(
            ([_, value]) => value !== undefined
          );
          const keys = entries.map(([k]) => {
            const col = schema[k];
            return col?.name ?? k;
          });
          const values = entries.map(([k, v]) => {
            const col = schema[k];
            return coerceValue(col, v);
          });

          if (keys.length === 0) {
            // Handle case where no columns are specified
            let query = `INSERT INTO ${tableName} DEFAULT VALUES`;
            const bindings: any[] = [];
            query += this._buildConflictClause();
            const ret = await this._executeWithReturning(db, query, bindings);
            if (ret !== undefined) return ret;
            continue;
          }

          const placeholders = values.map(() => "?").join(", ");
          let query = `INSERT INTO ${tableName} (${keys.join(
            ", "
          )}) VALUES (${placeholders})`;
          const bindings: any[] = [...values];
          query += this._buildConflictClause();
          const ret = await this._executeWithReturning(db, query, bindings);
          if (ret !== undefined) return ret;
        }
      }
      _buildConflictClause(): string {
        if (!this._conflict) return "";
        if (this._conflict.kind === "doNothing") {
          const tgt = this._conflict.target
            ? Array.isArray(this._conflict.target)
              ? `(${(this._conflict.target as string[]).join(", ")})`
              : `(${this._conflict.target})`
            : "";
          const where = this._conflict.where
            ? ` WHERE ${(this._conflict.where as SQL).toSQL().clause}`
            : "";
          return ` ON CONFLICT ${tgt} DO NOTHING${where}`;
        }
        // do update
        const c = this._conflict;
        const tgt = Array.isArray(c.target)
          ? `(${(c.target as string[]).join(", ")})`
          : `(${c.target})`;
        const setKeys = Object.keys((c as any).set ?? {});
        const setClause = setKeys
          .map((k) => {
            const v = (c as any).set[k];
            return `${k} = ${
              typeof v === "object" && v && typeof v.toSQL === "function"
                ? (v as SQL).toSQL().clause
                : "?"
            }`;
          })
          .join(", ");
        const targetWhere = c.targetWhere
          ? ` WHERE ${(c.targetWhere as SQL).toSQL().clause}`
          : "";
        const setWhere = (c as any).setWhere
          ? ` WHERE ${((c as any).setWhere as SQL).toSQL().clause}`
          : "";
        return ` ON CONFLICT ${tgt}${targetWhere} DO UPDATE SET ${setClause}${setWhere}`;
      }
      async _executeWithReturning(db: any, query: string, bindings: any[]) {
        if (this._returning === null) {
          await db.execute(query, bindings);
          return undefined;
        }
        if (this._returning === "__RETURNING_ID__") {
          // SQLite: return last_insert_rowid() as the primary key name if available
          const rows = await db.select(`SELECT last_insert_rowid() as id`);
          return rows.map((r: any) => ({ id: r.id }));
        }
        if (typeof this._returning === "object") {
          const cols = Object.entries(
            this._returning as Record<string, Column<any>>
          )
            .map(
              ([alias, col]) =>
                `${(col as any).tableName}.${col.name} AS ${alias}`
            )
            .join(", ");
          const retSql = `${query} RETURNING ${cols}`;
          const res = await db.select(retSql, bindings);
          return res;
        }
        return undefined;
      }
    })();
  }

  update<TTable extends Table<any>>(table: TTable) {
    const self = this;
    return new (class UpdateBuilder {
      _table = table;
      _data: Partial<InferInsert<TTable>> | null = null;
      _where: Record<string, any> | SQL | null = null;
      _orderBy: Array<string | SQL> = [];
      _limit: number | null = null;
      _from: Table<any> | null = null;
      _returning: null | Record<string, Column<any>> = null;
      set(data: Partial<InferInsert<TTable>>) {
        this._data = data;
        return this;
      }
      where(cond: Record<string, any> | SQL) {
        this._where = cond;
        return this;
      }
      orderBy(...clauses: (string | Column<any> | SQL)[]) {
        for (const c of clauses) {
          if (!c) continue;
          if (typeof c === "string") this._orderBy.push(c);
          else if (typeof (c as any).toSQL === "function")
            this._orderBy.push(c as SQL);
          else this._orderBy.push(getQualifiedName(c as Column));
        }
        return this;
      }
      limit(n: number) {
        this._limit = n;
        return this;
      }
      from(tbl: Table<any>) {
        this._from = tbl;
        return this;
      }
      returning(fields?: Record<string, Column<any>>) {
        this._returning = fields ?? {};
        return this as any;
      }
      async execute() {
        if (!this._data)
          throw new Error("Update requires set() before execute()");
        const db = await self.getDb();
        const tableName = getTableName(this._table);
        if (!tableName)
          throw new Error(
            "Invalid table passed to update(): missing table name"
          );
        const schema = (this._table as any)._schema as Record<
          string,
          Column<any>
        >;
        const dataToSet: Record<string, any> = { ...this._data };
        // Apply onUpdateFn for columns not explicitly set
        for (const [key, col] of Object.entries(schema)) {
          if (!(key in dataToSet) && (col as any).onUpdateFn) {
            const v = (col as any).onUpdateFn!();
            if ((col as any).mode === "boolean") dataToSet[key] = v ? 1 : 0;
            else if (v instanceof Date) {
              if ((col as any).mode === "timestamp_ms")
                dataToSet[key] = v.getTime();
              else if ((col as any).mode === "timestamp")
                dataToSet[key] = Math.floor(v.getTime() / 1000);
              else dataToSet[key] = v;
            } else dataToSet[key] = v;
          }
        }
        // Build SET with SQL support and undefined filtering
        const setParts: string[] = [];
        const bindings: any[] = [];
        for (const [k, v] of Object.entries(dataToSet)) {
          if (v === undefined) continue; // ignore undefined
          if (
            v &&
            typeof v === "object" &&
            typeof (v as any).toSQL === "function"
          ) {
            const s = (v as SQL).toSQL();
            const colName = schema[k]?.name ?? k;
            setParts.push(`${colName} = ${s.clause}`);
            bindings.push(...s.bindings);
          } else {
            const colName = schema[k]?.name ?? k;
            let val: any = v;
            const col = schema[k];
            if (col && (col as any).mode === "boolean") val = v ? 1 : 0;
            else if (v instanceof Date) {
              if (col && (col as any).mode === "timestamp_ms")
                val = v.getTime();
              else if (col && (col as any).mode === "timestamp")
                val = Math.floor(v.getTime() / 1000);
            }
            setParts.push(`${colName} = ?`);
            bindings.push(val);
          }
        }
        let query = `UPDATE ${tableName} SET ${setParts.join(", ")}`;
        if (this._from) query += ` FROM ${this._from.tableName}`;
        if (this._where) {
          if (typeof (this._where as any).toSQL === "function") {
            const sql = (this._where as SQL).toSQL();
            query += ` WHERE ${sql.clause}`;
            bindings.push(...sql.bindings);
          } else {
            const entries = Object.entries(this._where as Record<string, any>);
            if (entries.length > 0) {
              query += ` WHERE ${entries
                .map(([k]) => `${schema[k]?.name ?? k} = ?`)
                .join(" AND ")}`;
              bindings.push(...entries.map(([, v]) => v));
            }
          }
        }
        if (this._orderBy.length > 0) {
          const ordParts: string[] = [];
          for (const ob of this._orderBy) {
            if (typeof ob === "string") ordParts.push(ob);
            else {
              const s = (ob as SQL).toSQL();
              ordParts.push(s.clause);
              bindings.push(...s.bindings);
            }
          }
          query += ` ORDER BY ${ordParts.join(", ")}`;
        }
        if (this._limit !== null) {
          query += ` LIMIT ?`;
          bindings.push(this._limit);
        }
        if (this._returning) {
          const cols = Object.entries(
            this._returning as Record<string, Column<any>>
          )
            .map(
              ([alias, col]) =>
                `${(col as any).tableName}.${col.name} AS ${alias}`
            )
            .join(", ");
          const retSql = `${query} RETURNING ${cols}`;
          return await db.select(retSql, bindings);
        }
        await db.execute(query, bindings);
      }
    })();
  }

  delete<TTable extends Table<any>>(table: TTable) {
    const self = this;
    return new (class DeleteBuilder {
      _table = table;
      _where: Partial<InferInsert<TTable>> | SQL | null = null;
      _orderBy: Array<string | SQL> = [];
      _limit: number | null = null;
      _returning: null | Record<string, Column<any>> = null;
      where(cond: Partial<InferInsert<TTable>> | SQL) {
        this._where = cond;
        return this;
      }
      orderBy(...clauses: (string | Column<any> | SQL)[]) {
        for (const c of clauses) {
          if (!c) continue;
          if (typeof c === "string") this._orderBy.push(c);
          else if (typeof (c as any).toSQL === "function")
            this._orderBy.push(c as SQL);
          else this._orderBy.push(getQualifiedName(c as Column));
        }
        return this;
      }
      limit(n: number) {
        this._limit = n;
        return this;
      }
      returning(fields?: Record<string, Column<any>>) {
        this._returning = fields ?? {};
        return this as any;
      }
      async execute() {
        const db = await self.getDb();
        const tableName = getTableName(this._table);
        if (!tableName)
          throw new Error(
            "Invalid table passed to delete(): missing table name"
          );
        let query = `DELETE FROM ${tableName}`;
        const bindings: any[] = [];
        if (this._where) {
          if (typeof (this._where as any).toSQL === "function") {
            const sql = (this._where as SQL).toSQL();
            query += ` WHERE ${sql.clause}`;
            bindings.push(...sql.bindings);
          } else {
            const entries = Object.entries(this._where as Record<string, any>);
            if (entries.length > 0) {
              const schema = (this._table as any)._schema as Record<
                string,
                Column<any>
              >;
              query += ` WHERE ${entries
                .map(([k]) => `${schema[k]?.name ?? k} = ?`)
                .join(" AND ")}`;
              bindings.push(...entries.map(([, v]) => v));
            }
          }
        }
        if (this._orderBy.length > 0) {
          const ordParts: string[] = [];
          for (const ob of this._orderBy) {
            if (typeof ob === "string") ordParts.push(ob);
            else {
              const s = (ob as SQL).toSQL();
              ordParts.push(s.clause);
              bindings.push(...s.bindings);
            }
          }
          query += ` ORDER BY ${ordParts.join(", ")}`;
        }
        if (this._limit !== null) {
          query += ` LIMIT ?`;
          bindings.push(this._limit);
        }
        if (this._returning) {
          const cols = Object.entries(
            this._returning as Record<string, Column<any>>
          )
            .map(
              ([alias, col]) =>
                `${(col as any).tableName}.${col.name} AS ${alias}`
            )
            .join(", ");
          const retSql = `${query} RETURNING ${cols}`;
          return await db.select(retSql, bindings);
        }
        await db.execute(query, bindings);
      }
    })();
  }

  // legacy direct methods removed in favor of builder APIs

  // legacy direct methods removed in favor of builder APIs

  // legacy direct methods removed in favor of builder APIs

  async run(query: string, bindings: any[] = []): Promise<void> {
    const db = await this.getDb();
    await db.execute(query, bindings);
  }

  // --- Migrations API ---

  private formatDefaultValue(col: Column<any>): string | null {
    const dv: any = col.defaultValue as any;
    if (dv === undefined) return null;
    // raw SQL expression
    if (dv && typeof dv === "object" && "raw" in dv) {
      return (dv as any).raw as string;
    }
    // Date handling for timestamp modes
    if (dv instanceof Date) {
      const isMs = (col as any).mode === "timestamp_ms";
      const num = isMs ? dv.getTime() : Math.floor(dv.getTime() / 1000);
      return String(num);
    }
    // boolean handling stored as INTEGER 0/1
    if ((col as any).mode === "boolean") {
      return String(dv ? 1 : 0);
    }
    // string literal
    if (typeof dv === "string") {
      return `'${dv.replace(/'/g, "''")}'`;
    }
    // number/bigint or other primitives
    return String(dv);
  }

  private generateCreateTableSql(table: Table<any>): string {
    const tableName = getTableName(table);
    if (!tableName)
      throw new Error("Invalid table passed to DDL: missing table name");
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
        const formatted = this.formatDefaultValue(col);
        if (formatted !== null) def += ` DEFAULT ${formatted}`;
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
    // Table-level constraints and composite indexes/keys
    const tableConstraints: string[] = [];
    const constraints = (table as any)._constraints as Array<any> | undefined;
    // no-op pre-scan removed
    // Render Unique/PK/Check/ForeignKey constraints
    if (constraints && constraints.length) {
      for (const spec of constraints) {
        if ((spec as any).expr) {
          const name = (spec as any).name;
          const expr =
            (spec as any).expr.raw ??
            (spec as any).expr?.raw ??
            String((spec as any).expr);
          tableConstraints.push(
            name ? `CONSTRAINT ${name} CHECK (${expr})` : `CHECK (${expr})`
          );
          continue;
        }
        if ((spec as any).foreignColumns) {
          const name = (spec as any).name as string | undefined;
          const cols = ((spec as any).columns as string[]).join(", ");
          const fTable = (spec as any).foreignTable as string;
          const fCols = ((spec as any).foreignColumns as string[]).join(", ");
          let clause = `${
            name ? `CONSTRAINT ${name} ` : ""
          }FOREIGN KEY (${cols}) REFERENCES ${fTable} (${fCols})`;
          if ((spec as any).onDelete)
            clause += ` ON DELETE ${String(
              (spec as any).onDelete
            ).toUpperCase()}`;
          if ((spec as any).onUpdate)
            clause += ` ON UPDATE ${String(
              (spec as any).onUpdate
            ).toUpperCase()}`;
          tableConstraints.push(clause);
          continue;
        }
        if ((spec as any).columns) {
          const cols = ((spec as any).columns as string[]).join(", ");
          const name = (spec as any).name as string | undefined;
          // Heuristic: if there are multiple columns and name suggests pk, treat as PK; otherwise UNIQUE
          const isPk =
            (spec as any).kind === "primaryKey" ||
            (name && name.toLowerCase().includes("pk"));
          if (isPk) {
            tableConstraints.push(
              name
                ? `CONSTRAINT ${name} PRIMARY KEY (${cols})`
                : `PRIMARY KEY (${cols})`
            );
          } else {
            tableConstraints.push(
              name ? `CONSTRAINT ${name} UNIQUE (${cols})` : `UNIQUE (${cols})`
            );
          }
          continue;
        }
      }
    }
    const parts = [...columnDefs, ...tableConstraints];
    return `CREATE TABLE IF NOT EXISTS ${tableName} (${parts.join(", ")});`;
  }

  async createTableIfNotExists(table: Table<any>): Promise<void> {
    const sql = this.generateCreateTableSql(table);
    await this.run(sql);
    await this.createIndexesForTable(table);
  }

  async createTablesIfNotExist(tables: Table<any>[]): Promise<void> {
    for (const t of tables) {
      await this.createTableIfNotExists(t);
    }
  }

  private generateCreateIndexSqls(table: Table<any>): string[] {
    const tableName = (table as any).tableName as string;
    const indexes = ((table as any)._indexes as Array<any>) || [];
    const stmts: string[] = [];
    for (const idx of indexes) {
      const unique = idx.unique ? "UNIQUE " : "";
      if (!idx.name) continue;
      const colList: string[] = Array.isArray(idx.columns)
        ? (idx.columns as string[])
        : [];
      if (colList.length === 0) continue;
      const cols = `(${colList.join(", ")})`;
      const where = idx.where?.raw ? ` WHERE ${idx.where.raw}` : "";
      stmts.push(
        `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${tableName} ${cols}${where};`
      );
    }
    return stmts;
  }

  private async createIndexesForTable(table: Table<any>): Promise<void> {
    const stmts = this.generateCreateIndexSqls(table);
    for (const s of stmts) await this.run(s);
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.run(
      `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
    );
  }

  private async hasMigration(name: string): Promise<boolean> {
    const db = await this.getDb();
    const rows = await db.select<any[]>(
      `SELECT name FROM _migrations WHERE name = ?`,
      [name]
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async recordMigration(name: string): Promise<void> {
    const db = await this.getDb();
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
    }
    // Always enforce the schema (idempotent)
    await this.forcePushForTables(tables, { preserveData: true });
    if (track) {
      const name =
        options?.name ?? `init:${tables.map((t) => t.tableName).join(",")}`;
      const already = await this.hasMigration(name);
      if (!already) await this.recordMigration(name);
    }
  }

  // Configure schema and relations, and generate db.query automatically
  configure<
    TTables extends Record<string, Table<any>>,
    TRelDefs extends Record<string, Record<string, RelationConfig>> = Record<
      string,
      Record<string, RelationConfig>
    >
  >(
    tables: TTables,
    relDefs?: TRelDefs
  ): this & {
    query: {
      [K in keyof TTables]: {
        findMany: (
          opts?: FindManyOptions<TTables[K]>
        ) => Promise<Array<InferSelect<TTables[K]>>>;
        findFirst: (
          opts?: FindFirstOptions<TTables[K]>
        ) => Promise<InferSelect<TTables[K]> | null>;
      };
    };
  } {
    this._tables = tables as any;
    this._relations = (relDefs as any) ?? {};
    this.query = makeQueryAPI(
      tables as any,
      (this._relations ?? {}) as any,
      this.getDb.bind(this)
    );
    return this as any;
  }

  // Convenience: migrate from configured tables
  async migrateConfigured(options?: { name?: string; track?: boolean }) {
    if (!this._tables)
      throw new Error("No tables configured. Call db.configure({...}) first.");
    await this.migrate(Object.values(this._tables), options);
    await this.setSchemaMeta("schema_signature", this.computeModelSignature());
  }

  // --- Schema diff and CLI-like helpers ---

  async diffSchema(): Promise<{
    extraTables: string[];
    missingTables: string[];
    tables: Record<
      string,
      {
        missingColumns: string[];
        extraColumns: string[];
        changedColumns: Array<{
          name: string;
          diffs: {
            type?: boolean;
            pk?: boolean;
            notNull?: boolean;
            default?: boolean;
          };
        }>;
      }
    >;
  }> {
    if (!this._tables) throw new Error("No tables configured.");
    const dbi = await this.getDb();
    const configuredNames = Object.values(this._tables).map((t) =>
      getTableName(t as any)
    );
    const existing = await dbi.select<any[]>(
      `SELECT name FROM sqlite_master WHERE type='table'`
    );
    const existingNames = existing.map((r) => r.name);
    const extraTables = existingNames.filter(
      (n) => !configuredNames.includes(n)
    );
    const missingTables = configuredNames.filter(
      (n) => !existingNames.includes(n)
    );
    const tables: any = {};
    for (const tbl of Object.values(this._tables)) {
      const tableName = getTableName(tbl as any);
      if (!existingNames.includes(tableName)) {
        tables[tableName] = {
          missingColumns: Object.keys((tbl as any)._schema),
          extraColumns: [],
          changedColumns: [],
        };
        continue;
      }
      const cols = await dbi.select<any[]>(`PRAGMA table_info('${tableName}')`);
      const colMap = new Map(cols.map((c) => [c.name, c]));
      const modelCols = Object.values(
        (tbl as any)._schema as Record<string, Column<any>>
      );
      const missingColumns: string[] = [];
      const extraColumns: string[] = [];
      const changedColumns: Array<{ name: string; diffs: any }> = [];
      const modelNamesSet = new Set(modelCols.map((c) => c.name));
      for (const m of modelCols) {
        const info = colMap.get(m.name);
        if (!info) {
          missingColumns.push(m.name);
          continue;
        }
        const diffs: any = {};
        if ((info.type || "").toUpperCase() !== m.type.toUpperCase())
          diffs.type = true;
        if (!!info.pk !== !!m.isPrimaryKey) diffs.pk = true;
        if (!!info.notnull !== !!m.isNotNull) diffs.notNull = true;
        const modelDv =
          m.defaultValue &&
          typeof m.defaultValue === "object" &&
          (m.defaultValue as any).raw
            ? (m.defaultValue as any).raw
            : m.defaultValue ?? null;
        if ((info.dflt_value ?? null) !== (modelDv as any))
          diffs.default = true;
        if (Object.keys(diffs).length)
          changedColumns.push({ name: m.name, diffs });
      }
      for (const c of cols)
        if (!modelNamesSet.has(c.name)) extraColumns.push(c.name);
      tables[tableName] = { missingColumns, extraColumns, changedColumns };
    }
    return { extraTables, missingTables, tables };
  }

  async generate() {
    if (!this._tables) throw new Error("No tables configured.");
    return {
      statements: Object.values(this._tables).map((t) =>
        this.buildCreateTableSQL(t)
      ),
    };
  }
  async migrateCli(opts?: { name?: string; track?: boolean }) {
    return this.migrateConfigured(opts);
  }
  async push(opts?: { dropExtraColumns?: boolean; preserveData?: boolean }) {
    return this.forcePush(opts);
  }
  async pull() {
    return this.pullSchema();
  }
  async studio() {
    const dbi = (await this.getDb()) as any;
    return { driver: "sqlite", path: dbi.path };
  }

  // --- Schema detection / signature ---
  private async ensureSchemaMeta(): Promise<void> {
    await this.run(
      `CREATE TABLE IF NOT EXISTS _schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
    );
  }

  private async getSchemaMeta(key: string): Promise<string | null> {
    const dbi = await this.getDb();
    await this.ensureSchemaMeta();
    const rows = await dbi.select<any[]>(
      `SELECT value FROM _schema_meta WHERE key = ?`,
      [key]
    );
    return rows?.[0]?.value ?? null;
  }

  private async setSchemaMeta(key: string, value: string): Promise<void> {
    const dbi = await this.getDb();
    await this.ensureSchemaMeta();
    await dbi.execute(
      `INSERT INTO _schema_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  private normalizeColumn(col: Column<any>): any {
    return {
      name: col.name,
      type: col.type,
      pk: !!col.isPrimaryKey,
      ai: !!col.autoIncrement,
      nn: !!col.isNotNull,
      dv:
        col.defaultValue &&
        typeof col.defaultValue === "object" &&
        (col.defaultValue as any).raw
          ? { raw: (col.defaultValue as any).raw }
          : col.defaultValue ?? null,
    };
  }

  private computeModelSignature(): string {
    if (!this._tables) return "";
    const entries = Object.entries(this._tables).map(([k, tbl]) => {
      const cols = Object.values(
        (tbl as any)._schema as Record<string, Column<any>>
      )
        .map((c) => this.normalizeColumn(c))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { table: (tbl as any).tableName as string, columns: cols };
    });
    entries.sort((a, b) => a.table.localeCompare(b.table));
    return JSON.stringify(entries);
  }
  getSchemaSignature(): string {
    return this.computeModelSignature();
  }
  async printSchemaDiff(): Promise<void> {
    const diff = await this.diffSchema();
    // eslint-disable-next-line no-console
    console.log("Schema diff:", JSON.stringify(diff, null, 2));
  }

  async isSchemaDirty(): Promise<{
    dirty: boolean;
    current: string;
    stored: string | null;
  }> {
    const sig = this.computeModelSignature();
    const stored = await this.getSchemaMeta("schema_signature");
    return { dirty: sig !== stored, current: sig, stored };
  }

  async migrateIfDirty(options?: { name?: string; track?: boolean }) {
    const status = await this.isSchemaDirty();
    if (!this._tables) throw new Error("No tables configured.");
    if (status.dirty) {
      // Enforce schema regardless of tracked migrations
      await this.forcePushForTables(Object.values(this._tables), {
        preserveData: true,
      });
      await this.setSchemaMeta(
        "schema_signature",
        this.computeModelSignature()
      );
      return true;
    }
    return false;
  }

  // Pull current DB schema (minimal) for configured tables
  async pullSchema(): Promise<Record<string, any>> {
    if (!this._tables) throw new Error("No tables configured.");
    const dbi = await this.getDb();
    const result: Record<string, any> = {};
    for (const tbl of Object.values(this._tables)) {
      const name = (tbl as any).tableName as string;
      const cols = await dbi.select<any[]>(`PRAGMA table_info('${name}')`);
      result[name] = cols.map((c) => ({
        name: c.name,
        type: c.type,
        notnull: !!c.notnull,
        pk: !!c.pk,
        dflt_value: c.dflt_value ?? null,
      }));
    }
    return result;
  }

  private buildCreateTableSQL(table: Table<any>): string {
    return this.generateCreateTableSql(table);
  }

  private async tableExists(name: string): Promise<boolean> {
    const dbi = await this.getDb();
    const rows = await dbi.select<any[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      [name]
    );
    return rows.length > 0;
  }

  // Force push model to DB: add missing tables/columns, rebuild tables if incompatible
  async forcePush(options?: {
    dropExtraColumns?: boolean;
    preserveData?: boolean;
  }) {
    if (!this._tables) throw new Error("No tables configured.");
    await this.forcePushForTables(Object.values(this._tables), options);
  }

  private async forcePushForTables(
    tables: Table<any>[],
    options?: { dropExtraColumns?: boolean; preserveData?: boolean }
  ) {
    const dbi = await this.getDb();
    const preserve = options?.preserveData !== false;
    for (const tbl of tables) {
      const tableName = getTableName(tbl as any);
      const exists = await this.tableExists(tableName);
      if (!exists) {
        await this.run(this.buildCreateTableSQL(tbl));
        await this.createIndexesForTable(tbl);
        continue;
      }
      // Introspect existing
      const existingCols = await dbi.select<any[]>(
        `PRAGMA table_info('${tableName}')`
      );
      const existingMap = new Map(existingCols.map((c) => [c.name, c]));
      const modelCols = Object.values(
        (tbl as any)._schema as Record<string, Column<any>>
      );
      const missing: Column<any>[] = [];
      let requiresRebuild = false;
      for (const m of modelCols) {
        const info = existingMap.get(m.name);
        if (!info) {
          missing.push(m);
          continue;
        }
        const typeDiff =
          (info.type || "").toUpperCase() !== m.type.toUpperCase();
        const pkDiff = !!info.pk !== !!m.isPrimaryKey;
        const nnDiff = !!info.notnull !== !!m.isNotNull;
        // Default comparison is best-effort
        const modelDv =
          m.defaultValue &&
          typeof m.defaultValue === "object" &&
          (m.defaultValue as any).raw
            ? (m.defaultValue as any).raw
            : m.defaultValue ?? null;
        const defDiff = (info.dflt_value ?? null) !== (modelDv as any);
        if (typeDiff || pkDiff || (nnDiff && !modelDv) || defDiff) {
          requiresRebuild = true;
        }
      }
      if (requiresRebuild) {
        const tmp = `_new_${tableName}`;
        // Create new table
        await this.run(this.buildCreateTableSQL(tbl));
        // But created with original name; create with tmp name instead
        // Workaround: create tmp table explicitly
        await this.run(
          this.buildCreateTableSQL({ ...(tbl as any), tableName: tmp } as any)
        );
        const existingNames = existingCols.map((c) => c.name);
        const modelNames = modelCols.map((c) => c.name);
        const shared = existingNames.filter((n) => modelNames.includes(n));
        if (preserve && shared.length > 0) {
          await this.run(
            `INSERT INTO ${tmp} (${shared.join(", ")}) SELECT ${shared.join(
              ", "
            )} FROM ${tableName}`
          );
        }
        await this.run(`DROP TABLE ${tableName}`);
        await this.run(`ALTER TABLE ${tmp} RENAME TO ${tableName}`);
        await this.createIndexesForTable(tbl);
      } else {
        // Add missing columns
        for (const m of missing) {
          let clause = `${m.name} ${m.type}`;
          if (m.isNotNull) clause += " NOT NULL";
          if (m.defaultValue !== undefined) {
            const formatted = this.formatDefaultValue(m);
            if (formatted !== null) clause += ` DEFAULT ${formatted}`;
          }
          await this.run(`ALTER TABLE ${tableName} ADD COLUMN ${clause}`);
        }
        await this.createIndexesForTable(tbl);
      }
    }
    await this.setSchemaMeta("schema_signature", this.computeModelSignature());
  }
}

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
    `${base.tableName}_id`,
    `${base.tableName}Id`,
    `${basePk.name}`,
    `${base.tableName.slice(0, -1)}Id`,
  ];
  return (
    childCols.find((c) => guessNames.includes(c.name)) ||
    childCols.find((c) => /.*_id$/i.test(c.name)) ||
    null
  );
}

function guessOneRelationJoin(
  base: Table<any>,
  rel: OneRelation
): {
  lhsTable: Table<any>;
  lhsCol: Column<any>;
  rhsTable: Table<any>;
  rhsCol: Column<any>;
} | null {
  const child = rel.table;
  const basePk = getPrimaryKey(base);
  const childCols: Column[] = Object.values(child._schema);
  // If explicit fields/references provided, honor them
  if (
    rel.cfg?.fields &&
    rel.cfg?.references &&
    rel.cfg.fields[0] &&
    rel.cfg.references[0]
  ) {
    const fk = rel.cfg.fields[0];
    const ref = rel.cfg.references[0];
    // If fk is on child: child.fk = base.pk
    if (childCols.some((c) => c.name === fk.name)) {
      return { lhsTable: child, lhsCol: fk, rhsTable: base, rhsCol: ref };
    }
    // If fk is on base: base.fk = child.pk
    const baseCols: Column[] = Object.values(base._schema);
    if (baseCols.some((c) => c.name === fk.name)) {
      return { lhsTable: base, lhsCol: fk, rhsTable: child, rhsCol: ref };
    }
  }
  // Fallback: assume child has FK to base
  const childFk = guessChildFk(child, base, rel);
  if (!childFk) return null;
  return { lhsTable: child, lhsCol: childFk, rhsTable: base, rhsCol: basePk };
}

function isFlatWith(spec: WithSpec): boolean {
  return Object.values(spec).every((v) => typeof v === "boolean");
}

// Eager loading using simple N+1 strategy for now
export function makeQueryAPI(
  tables: Record<string, Table<any>>,
  relDefs: Record<string, Record<string, RelationConfig>>,
  dbProvider: () => Promise<Database>
) {
  const api: any = {};
  const tableKeyByName: Record<string, string> = {};
  for (const [k, t] of Object.entries(tables)) tableKeyByName[t.tableName] = k;
  for (const [tblKey, tbl] of Object.entries(tables)) {
    api[tblKey] = {
      async findMany(opts?: {
        with?: WithSpec;
        join?: boolean;
        columns?: string[] | Record<string, boolean>;
        where?:
          | SQL
          | Record<string, any>
          | ((
              table: Table<any>,
              ops: {
                eq: typeof eq;
                ne: typeof ne;
                gt: typeof gt;
                gte: typeof gte;
                lt: typeof lt;
                lte: typeof lte;
                like: typeof like;
              }
            ) => SQL);
        orderBy?:
          | string[]
          | ((
              table: Table<any>,
              ops: { asc: typeof asc; desc: typeof desc }
            ) => string[]);
        limit?: number;
        offset?: number;
      }) {
        const base = tbl;
        const withSpec = (opts?.with as WithSpec) ?? {};
        const dbi = await dbProvider();

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
            selectParts.push(`${base.tableName}.${name} AS __base_${name}`);

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
            if (rel.kind === "one") {
              const mapping = guessOneRelationJoin(base, rel);
              if (!mapping) continue;
              // If lhs is child (child.fk = base.pk), store fk for grouping
              if (mapping.lhsTable.tableName === child.tableName) {
                fkMap[relName] = { childFk: mapping.lhsCol, childPk };
                joins.push(
                  `LEFT JOIN ${child.tableName} ON ${mapping.lhsTable.tableName}.${mapping.lhsCol.name} = ${mapping.rhsTable.tableName}.${mapping.rhsCol.name}`
                );
              } else {
                // Base has FK to child: base.fk = child.pk
                fkMap[relName] = { childFk: mapping.rhsCol, childPk };
                joins.push(
                  `LEFT JOIN ${child.tableName} ON ${mapping.lhsTable.tableName}.${mapping.lhsCol.name} = ${mapping.rhsTable.tableName}.${mapping.rhsCol.name}`
                );
              }
            } else {
              const childFk = guessChildFk(child, base, rel);
              if (!childFk) continue;
              fkMap[relName] = { childFk, childPk };
              joins.push(
                `LEFT JOIN ${child.tableName} ON ${child.tableName}.${childFk.name} = ${base.tableName}.${basePk.name}`
              );
            }
            const selected =
              typeof enabled === "object" && (enabled as any).columns?.length
                ? (enabled as any).columns!
                : childCols.map((c) => c.name);
            relColsMap[relName] = selected;
            for (const name of selected)
              selectParts.push(
                `${child.tableName}.${name} AS __rel_${relName}_${name}`
              );
          }

          let sqlText = `SELECT ${selectParts.join(", ")} FROM ${
            base.tableName
          }${joins.length ? " " + joins.join(" ") : ""}`;
          const bindings: any[] = [];
          if (opts?.where) {
            if (typeof opts.where === "function") {
              const w = opts
                .where(base, { eq, ne, gt, gte, lt, lte, like })
                .toSQL();
              sqlText += ` WHERE ${w.clause}`;
              bindings.push(...w.bindings);
            } else if (typeof (opts.where as any).toSQL === "function") {
              const w = (opts.where as SQL).toSQL();
              sqlText += ` WHERE ${w.clause}`;
              bindings.push(...w.bindings);
            } else {
              const entries = Object.entries(opts.where as Record<string, any>);
              if (entries.length > 0) {
                sqlText += ` WHERE ${entries
                  .map(([k]) => `${base.tableName}.${k} = ?`)
                  .join(" AND ")}`;
                bindings.push(...entries.map(([, v]) => v));
              }
            }
          }
          const orderByClauses =
            typeof opts?.orderBy === "function"
              ? opts.orderBy(base, { asc, desc })
              : opts?.orderBy;
          if (orderByClauses?.length)
            sqlText += ` ORDER BY ${orderByClauses.join(", ")}`;
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
          base.tableName
        }`;
        const baseBindings: any[] = [];
        if (opts?.where) {
          if (typeof opts.where === "function") {
            const w = opts
              .where(base, { eq, ne, gt, gte, lt, lte, like })
              .toSQL();
            baseSql += ` WHERE ${w.clause}`;
            baseBindings.push(...w.bindings);
          } else if (typeof (opts.where as any).toSQL === "function") {
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
        const orderByClauses2 =
          typeof opts?.orderBy === "function"
            ? opts.orderBy(base, { asc, desc })
            : opts?.orderBy;
        if (orderByClauses2?.length)
          baseSql += ` ORDER BY ${orderByClauses2.join(", ")}`;
        if (typeof opts?.limit === "number") baseSql += ` LIMIT ${opts.limit}`;
        if (typeof opts?.offset === "number")
          baseSql += ` OFFSET ${opts.offset}`;
        const baseRows = await dbi.select<any[]>(baseSql, baseBindings);
        const result = baseRows.map((r: any) => ({ ...r }));
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
                (k) => tables[k].tableName === parentTable.tableName
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
            if (rel.kind === "many") {
              const fkCol = guessChildFk(child, parentTable, rel);
              if (!fkCol) continue;
              const sql = `SELECT ${selectCols.join(", ")} FROM ${
                child.tableName
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
              const mapping = guessOneRelationJoin(parentTable, rel);
              if (!mapping) continue;
              if (mapping.lhsTable.tableName === child.tableName) {
                // child.fk = parent.pk
                const sql = `SELECT ${selectCols.join(", ")} FROM ${
                  child.tableName
                } WHERE ${mapping.lhsCol.name} IN (${parentIds
                  .map(() => "?")
                  .join(", ")})`;
                const rows = await dbi.select<any[]>(sql, parentIds);
                const mapOne = new Map<any, any>();
                for (const r of rows) mapOne.set(r[mapping.lhsCol.name], r);
                for (const p of parents)
                  (p as any)[relName] = mapOne.get(p[parentPk.name]) ?? null;
              } else {
                // parent.fk = child.pk
                // Need to fetch children by their PKs referenced from parents
                const parentFkName = mapping.lhsCol.name; // base fk column
                const childPkName = mapping.rhsCol.name; // child pk column
                const childIds = parents
                  .map((p) => p[parentFkName])
                  .filter((v) => v !== undefined && v !== null);
                if (childIds.length === 0) {
                  for (const p of parents) (p as any)[relName] = null;
                } else {
                  const sql = `SELECT ${selectCols.join(", ")} FROM ${
                    child.tableName
                  } WHERE ${childPkName} IN (${childIds
                    .map(() => "?")
                    .join(", ")})`;
                  const rows = await dbi.select<any[]>(sql, childIds);
                  const mapOne = new Map<any, any>();
                  for (const r of rows) mapOne.set(r[childPkName], r);
                  for (const p of parents)
                    (p as any)[relName] = mapOne.get(p[parentFkName]) ?? null;
                }
              }
              if (enabled?.with) {
                const children = parents
                  .map((p) => (p as any)[relName])
                  .filter((x: any) => Boolean(x));
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
      async findFirst(opts?: {
        with?: WithSpec;
        join?: boolean;
        columns?: string[] | Record<string, boolean>;
        where?:
          | SQL
          | Record<string, any>
          | ((
              table: Table<any>,
              ops: {
                eq: typeof eq;
                ne: typeof ne;
                gt: typeof gt;
                gte: typeof gte;
                lt: typeof lt;
                lte: typeof lte;
                like: typeof like;
              }
            ) => SQL);
        orderBy?:
          | string[]
          | ((
              table: Table<any>,
              ops: { asc: typeof asc; desc: typeof desc }
            ) => string[]);
      }) {
        const rows = await api[tblKey].findMany({ ...(opts as any), limit: 1 });
        return rows?.[0] ?? null;
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
      findFirst: (opts?: {
        with?: WithSpec;
        join?: boolean;
        columns?: string[];
      }) => Promise<any | null>;
    };
  };
}
