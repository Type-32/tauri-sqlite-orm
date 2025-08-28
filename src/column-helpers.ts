// Column helpers
import {SQLiteColumn} from "./orm";
import {Mode} from "./types";

export const columnHelpers = <TName extends string>(name: TName) =>
    new SQLiteColumn(name, "TEXT");
export const integer = <TName extends string, TMode extends Mode = "default">(
    name: TName,
    config?: { mode?: TMode }
) => new SQLiteColumn(name, "INTEGER", {}, config?.mode || "default");
export const real = <TName extends string>(name: TName) =>
    new SQLiteColumn(name, "REAL");
export const blob = <TName extends string>(name: TName) =>
    new SQLiteColumn(name, "BLOB");
export const boolean = <TName extends string>(name: TName) =>
    new SQLiteColumn(name, "BOOLEAN");