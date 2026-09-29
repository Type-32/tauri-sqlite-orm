// Custom error classes for better error handling

export class TauriORMError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TauriORMError';
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export class QueryBuilderError extends TauriORMError {
    constructor(message: string) {
        super(message);
        this.name = 'QueryBuilderError';
    }
}

export class MissingWhereClauseError extends QueryBuilderError {
    constructor(operation: 'UPDATE' | 'DELETE', tableName: string) {
        super(
            `${operation} operation on table "${tableName}" requires a WHERE clause to prevent accidental data loss. ` +
            `Use .where() to specify conditions, or use .allowGlobalOperation() to explicitly allow operations without WHERE.`
        );
        this.name = 'MissingWhereClauseError';
    }
}

export class ValidationError extends TauriORMError {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class InsertValidationError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = 'InsertValidationError';
    }
}

export class UpdateValidationError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = 'UpdateValidationError';
    }
}

export class MigrationError extends TauriORMError {
    constructor(message: string) {
        super(message);
        this.name = 'MigrationError';
    }
}

export class RelationError extends TauriORMError {
    constructor(message: string) {
        super(message);
        this.name = 'RelationError';
    }
}

export class ColumnNotFoundError extends TauriORMError {
    constructor(columnName: string, tableName: string) {
        super(`Column "${columnName}" does not exist on table "${tableName}"`);
        this.name = 'ColumnNotFoundError';
    }
}

export class TableNotFoundError extends TauriORMError {
    constructor(tableName: string) {
        super(`Table "${tableName}" not found in schema`);
        this.name = 'TableNotFoundError';
    }
}

