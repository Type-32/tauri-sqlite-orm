import {ManyRelation, OneRelation} from "../orm";
import {AnySQLiteColumn, AnyTable} from "../types";

export type RelationsBuilder = {
    one: <U extends AnyTable>(
        table: U,
        config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
    ) => OneRelation<U>;
    many: <U extends AnyTable>(table: U) => ManyRelation<U>;
};