import Database from "@tauri-apps/plugin-sql";
import {
  AnySQLiteColumn,
  AnyTable,
  InferInsertModel,
  InferSelectModel,
  SQLiteColumn,
} from "./schema";

// Query Helpers
export type SQLCondition = {
  sql: string;
  params: any[];
};

export const eq = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
  sql: `${column._.name} = ?`,
  params: [value],
});

export const and = (...conditions: SQLCondition[]): SQLCondition => ({
  sql: conditions.map((c) => `(${c.sql})`).join(" AND "),
  params: conditions.flatMap((c) => c.params),
});

export const or = (...conditions: SQLCondition[]): SQLCondition => ({
  sql: conditions.map((c) => `(${c.sql})`).join(" OR "),
  params: conditions.flatMap((c) => c.params),
});

export const not = (condition: SQLCondition): SQLCondition => ({
  sql: `NOT (${condition.sql})`,
  params: condition.params,
});

export const gt = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
  sql: `${column._.name} > ?`,
  params: [value],
});

export const gte = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
  sql: `${column._.name} >= ?`,
  params: [value],
});

export const lt = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
  sql: `${column._.name} < ?`,
  params: [value],
});

export const lte = <T>(column: AnySQLiteColumn, value: T): SQLCondition => ({
  sql: `${column._.name} <= ?`,
  params: [value],
});

export const like = (
  column: AnySQLiteColumn,
  pattern: string
): SQLCondition => ({
  sql: `${column._.name} LIKE ?`,
  params: [pattern],
});

export const isNull = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `${column._.name} IS NULL`,
  params: [],
});

export const isNotNull = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `${column._.name} IS NOT NULL`,
  params: [],
});

export const inArray = <T>(
  column: AnySQLiteColumn,
  values: T[]
): SQLCondition => ({
  sql: `${column._.name} IN (${values.map(() => "?").join(",")})`,
  params: values,
});

export const asc = (column: AnySQLiteColumn) => ({
  sql: `${column._.name} ASC`,
  params: [],
});

export const desc = (column: AnySQLiteColumn) => ({
  sql: `${column._.name} DESC`,
  params: [],
});

// Aggregation functions
export const count = (column?: AnySQLiteColumn): SQLCondition => ({
  sql: `COUNT(${column ? column._.name : "*"})`,
  params: [],
});

export const countDistinct = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `COUNT(DISTINCT ${column._.name})`,
  params: [],
});

export const sum = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `SUM(${column._.name})`,
  params: [],
});

export const avg = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `AVG(${column._.name})`,
  params: [],
});

export const max = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `MAX(${column._.name})`,
  params: [],
});

export const min = (column: AnySQLiteColumn): SQLCondition => ({
  sql: `MIN(${column._.name})`,
  params: [],
});

// SQL template tag
export const sql = <T = unknown>(
  strings: TemplateStringsArray,
  ...values: any[]
): { sql: string; params: any[]; mapWith?: (value: any) => T } => {
  const queryParts: string[] = [];
  const params: any[] = [];

  strings.forEach((str, i) => {
    queryParts.push(str);
    if (values[i] !== undefined) {
      if (typeof values[i] === "object" && values[i].sql) {
        queryParts.push(values[i].sql);
        params.push(...values[i].params);
      } else {
        queryParts.push("?");
        params.push(values[i]);
      }
    }
  });

  return {
    sql: queryParts.join(""),
    params,
  };
};

// Query Builders
export class BaseQueryBuilder {
  protected query: string = "";
  protected params: any[] = [];

  constructor(protected db: Database) {}

  build(): { sql: string; params: any[] } {
    return {
      sql: this.query,
      params: this.params,
    };
  }
}

export type SelectedFields = Record<
  string,
  AnySQLiteColumn | { sql: string; params: any[] }
>;

export class SelectQueryBuilder<
  TTable extends AnyTable,
  TSelection extends SelectedFields,
  TResult = InferSelectModel<TTable>
> extends BaseQueryBuilder {
  private isDistinct = false;
  private groupByColumns: AnySQLiteColumn[] = [];
  private havingCondition: SQLCondition | undefined;
  private joinClauses: { type: string; table: AnyTable; on: SQLCondition }[] =
    [];
  private fromTable: TTable;
  private orderByClauses: { sql: string; params: any[] }[] = [];
  private limitCount: number | undefined;
  private offsetCount: number | undefined;
  private whereCondition: SQLCondition | undefined;

  constructor(
    db: Database,
    table: TTable,
    private selection: TSelection | undefined
  ) {
    super(db);
    this.fromTable = table;
    this.query = "";
    this.params = [];
  }

  where(condition: SQLCondition): this {
    this.whereCondition = condition;
    return this;
  }

  leftJoin(table: AnyTable, on: SQLCondition): this {
    this.joinClauses.push({ type: "LEFT JOIN", table, on });
    return this;
  }

  innerJoin(table: AnyTable, on: SQLCondition): this {
    this.joinClauses.push({ type: "INNER JOIN", table, on });
    return this;
  }

  rightJoin(table: AnyTable, on: SQLCondition): this {
    this.joinClauses.push({ type: "RIGHT JOIN", table, on });
    return this;
  }

  fullJoin(table: AnyTable, on: SQLCondition): this {
    this.joinClauses.push({ type: "FULL JOIN", table, on });
    return this;
  }

  distinct(): this {
    this.isDistinct = true;
    return this;
  }

  groupBy(...columns: AnySQLiteColumn[]): this {
    this.groupByColumns.push(...columns);
    return this;
  }

  having(condition: SQLCondition): this {
    this.havingCondition = condition;
    return this;
  }

  orderBy(
    column: AnySQLiteColumn | { sql: string; params: any[] },
    direction: "ASC" | "DESC" = "ASC"
  ): this {
    if ("sql" in column) {
      this.orderByClauses.push({
        sql: `${column.sql} ${direction}`,
        params: column.params,
      });
    } else {
      this.orderByClauses.push({
        sql: `${column._.name} ${direction}`,
        params: [],
      });
    }
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  private buildSelectQuery(): { sql: string; params: any[] } {
    const selectionEntries = this.selection
      ? Object.entries(this.selection)
      : [];
    let columnsClause: string;
    const selectParams: any[] = [];

    if (selectionEntries.length === 0) {
      columnsClause = "*";
    } else {
      columnsClause = selectionEntries
        .map(([alias, col]) => {
          if (col instanceof SQLiteColumn) {
            return `${col._.table._.name}.${col._.name} AS "${alias}"`;
          } else {
            selectParams.push(...col.params);
            return `(${col.sql}) AS "${alias}"`;
          }
        })
        .join(", ");
    }

    let query = `SELECT ${
      this.isDistinct ? "DISTINCT " : ""
    }${columnsClause} FROM ${this.fromTable._.name}`;
    const queryParams: any[] = [...selectParams];

    if (this.joinClauses.length > 0) {
      const joins = this.joinClauses.map((j) => {
        queryParams.push(...j.on.params);
        return `${j.type} ${j.table._.name} ON ${j.on.sql}`;
      });
      query += ` ${joins.join(" ")}`;
    }

    if (this.whereCondition) {
      query += ` WHERE ${this.whereCondition.sql}`;
      queryParams.push(...this.whereCondition.params);
    }

    if (this.groupByColumns.length > 0) {
      const columnNames = this.groupByColumns.map((c) => c._.name).join(", ");
      query += ` GROUP BY ${columnNames}`;
    }

    if (this.havingCondition) {
      query += ` HAVING ${this.havingCondition.sql}`;
      queryParams.push(...this.havingCondition.params);
    }

    if (this.orderByClauses.length > 0) {
      const orderBySql = this.orderByClauses.map((c) => c.sql).join(", ");
      query += ` ORDER BY ${orderBySql}`;
      queryParams.push(...this.orderByClauses.flatMap((c) => c.params));
    }

    if (this.limitCount !== undefined) {
      query += ` LIMIT ${this.limitCount}`;
    }

    if (this.offsetCount !== undefined) {
      query += ` OFFSET ${this.offsetCount}`;
    }

    return {
      sql: query,
      params: queryParams,
    };
  }

  build(): { sql: string; params: any[] } {
    return this.buildSelectQuery();
  }

  async execute(): Promise<TResult[]> {
    const { sql, params } = this.buildSelectQuery();
    return this.db.select(sql, params) as any;
  }

  async all(): Promise<TResult[]> {
    return this.execute();
  }

  async get(): Promise<TResult | undefined> {
    this.limit(1);
    const result = await this.execute();
    return result[0] as any;
  }
}

export class SelectBuilder<
  TSelection extends SelectedFields | undefined = undefined
> {
  constructor(private db: Database, private selection: TSelection) {}

  from<TTable extends AnyTable>(
    table: TTable
  ): SelectQueryBuilder<
    TTable,
    TSelection extends SelectedFields ? TSelection : {},
    TSelection extends SelectedFields
      ? { [K in keyof TSelection]: any }
      : InferSelectModel<TTable>
  > {
    return new SelectQueryBuilder(
      this.db,
      table,
      this.selection as TSelection extends SelectedFields ? TSelection : {}
    );
  }
}

export class InsertQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private dataSets: InferInsertModel<T>[] = [];
  private returningColumns: AnySQLiteColumn[] = [];
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

  returning(...columns: (AnySQLiteColumn | keyof T["_"]["columns"])[]): this {
    for (const col of columns) {
      if (typeof col === "string") {
        this.returningColumns.push(this.table._.columns[col]);
      } else {
        this.returningColumns.push(col as AnySQLiteColumn);
      }
    }
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
    const finalData: Partial<InferInsertModel<T>> = { ...data };

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
      throw new Error("No data provided for insert");
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
          .map((col) => col._.name)
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

    return [{ lastInsertId, rowsAffected }] as any;
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

export class UpdateQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private updateData: Partial<InferInsertModel<T>> = {};
  private returningColumns: AnySQLiteColumn[] = [];

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `UPDATE ${table._.name}`;
  }

  set(data: Partial<InferInsertModel<T>>): this {
    this.updateData = { ...this.updateData, ...data };
    return this;
  }

  returning(...columns: (AnySQLiteColumn | keyof T["_"]["columns"])[]): this {
    for (const col of columns) {
      if (typeof col === "string") {
        this.returningColumns.push(this.table._.columns[col]);
      } else {
        this.returningColumns.push(col as AnySQLiteColumn);
      }
    }
    return this;
  }

  private buildUpdateClause(): { sql: string; params: any[] } {
    const finalUpdateData = { ...this.updateData };

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

    return { sql, params };
  }

  async execute(): Promise<
    T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
  > {
    const { sql: updateSql, params } = this.buildUpdateClause();

    if (this.returningColumns.length > 0) {
      const returningNames = this.returningColumns
        .map((col) => col._.name)
        .join(", ");
      const sqlWithReturning = `${updateSql} RETURNING ${returningNames}`;
      return this.db.select(sqlWithReturning, params) as any;
    } else {
      const result = await this.db.execute(updateSql, params);
      return [{ rowsAffected: result.rowsAffected }] as any;
    }
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

export class DeleteQueryBuilder<T extends AnyTable> extends BaseQueryBuilder {
  private returningColumns: AnySQLiteColumn[] = [];

  constructor(db: Database, private table: T) {
    super(db);
    this.query = `DELETE FROM ${table._.name}`;
  }

  returning(...columns: (AnySQLiteColumn | keyof T["_"]["columns"])[]): this {
    for (const col of columns) {
      if (typeof col === "string") {
        this.returningColumns.push(this.table._.columns[col]);
      } else {
        this.returningColumns.push(col as AnySQLiteColumn);
      }
    }
    return this;
  }

  async execute(): Promise<
    T extends AnyTable ? (InferSelectModel<T> & Record<string, any>)[] : never
  > {
    const { sql, params } = this.build();

    if (this.returningColumns.length > 0) {
      const returningNames = this.returningColumns
        .map((col) => col._.name)
        .join(", ");
      const sqlWithReturning = `${sql} RETURNING ${returningNames}`;
      return this.db.select(sqlWithReturning, params) as any;
    } else {
      const result = await this.db.execute(sql, params);
      return [{ rowsAffected: result.rowsAffected }] as any;
    }
  }

  async returningAll(): Promise<InferSelectModel<T>[]> {
    const allColumns = Object.keys(
      this.table._.columns
    ) as (keyof T["_"]["columns"])[];
    return this.returning(...allColumns).execute();
  }
}

// With clause support
export class WithQueryBuilder {
  private ctes: Array<{ alias: string; query: string; params: any[] }> = [];

  constructor(private db: Database) {}

  with(alias: string, query: { sql: string; params: any[] }): this {
    this.ctes.push({ alias, query: query.sql, params: query.params });
    return this;
  }

  select<
    TTable extends AnyTable,
    TSelection extends SelectedFields | undefined = undefined
  >(
    table: TTable,
    selection?: TSelection
  ): SelectQueryBuilder<
    TTable,
    TSelection extends SelectedFields ? TSelection : {},
    TSelection extends SelectedFields
      ? { [K in keyof TSelection]: any }
      : InferSelectModel<TTable>
  > {
    const builder = new SelectQueryBuilder(
      this.db,
      table,
      selection as TSelection extends SelectedFields ? TSelection : {}
    );
    this.applyWithClause(builder);
    return builder as any;
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
      (builder as any)["query"] = `WITH ${cteSql} ${(builder as any)["query"]}`;

      // Add CTE params to the beginning of the params array
      (builder as any)["params"] = [
        ...this.ctes.flatMap((cte) => cte.params),
        ...(builder as any)["params"],
      ];
    }
  }
}
