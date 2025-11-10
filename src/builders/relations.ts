import {ManyRelation, ManyToManyRelation, OneRelation} from "../orm";
import {AnySQLiteColumn, AnyTable} from "../types";

export type RelationsBuilder = {
    one: <U extends AnyTable>(
        table: U,
        config?: { fields: AnySQLiteColumn[]; references: AnySQLiteColumn[] }
    ) => OneRelation<U>;
    many: <U extends AnyTable>(table: U) => ManyRelation<U>;
    manyToMany: <U extends AnyTable>(
        table: U,
        config: {
            junctionTable: AnyTable
            junctionFields: AnySQLiteColumn[]
            junctionReferences: AnySQLiteColumn[]
        }
    ) => ManyToManyRelation<U>;
};