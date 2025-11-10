# Advanced Queries Guide

This guide covers advanced query features including `.toSQL()`, aggregates, and subqueries.

## Table of Contents
- [Query Debugging with .toSQL()](#query-debugging-with-tosql)
- [Aggregate Functions](#aggregate-functions)
- [Subqueries](#subqueries)

## Query Debugging with .toSQL()

The `.toSQL()` method allows you to inspect the SQL and parameters that will be executed without actually running the query. This is incredibly useful for debugging and logging.

### Basic Usage

```typescript
import { TauriORM, sqliteTable, integer, text, eq } from '@type32/tauri-sqlite-orm'

const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  email: text('email').notNull(),
})

// Build a query but don't execute it
const query = orm.select(users).where(eq(users._.columns.email, 'john@example.com'))

// Get the SQL and parameters
const { sql, params } = query.toSQL()

console.log('SQL:', sql)
// Output: SELECT users.id AS "users.id", users.name AS "users.name", users.email AS "users.email" FROM users users WHERE users.email = ?

console.log('Params:', params)
// Output: ['john@example.com']

// Execute when ready
const results = await query.all()
```

### Works with All Query Builders

```typescript
// SELECT queries
const selectSQL = orm.select(users).where(eq(users._.columns.id, 1)).toSQL()

// INSERT queries
const insertSQL = orm.insert(users)
  .values({ name: 'Alice', email: 'alice@example.com' })
  .toSQL()

// UPDATE queries
const updateSQL = orm.update(users)
  .set({ name: 'Bob' })
  .where(eq(users._.columns.id, 1))
  .toSQL()

// DELETE queries
const deleteSQL = orm.delete(users)
  .where(eq(users._.columns.id, 1))
  .toSQL()
```

### Use Cases

1. **Logging**: Log all queries before execution
2. **Testing**: Verify generated SQL in tests
3. **Debugging**: Understand what SQL is being generated
4. **Performance Analysis**: Copy SQL to analyze with EXPLAIN

```typescript
// Example: Query logger middleware
async function executeWithLogging<T>(query: any): Promise<T> {
  const { sql, params } = query.toSQL()
  console.log(`[${new Date().toISOString()}] Executing:`, sql, params)
  
  const startTime = Date.now()
  const result = await query.execute()
  const duration = Date.now() - startTime
  
  console.log(`[${new Date().toISOString()}] Completed in ${duration}ms`)
  return result
}
```

## Aggregate Functions

Aggregate functions perform calculations on sets of rows and return a single value. The ORM provides type-safe aggregate functions.

### Available Aggregates

```typescript
import { count, countDistinct, sum, avg, max, min, groupConcat } from '@type32/tauri-sqlite-orm'

const products = sqliteTable('products', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  category: text('category').notNull(),
})
```

#### COUNT

```typescript
// Count all rows
const totalCount = count()

// Count specific column
const productCount = count(products._.columns.id)

// Count distinct values
const uniqueCategories = countDistinct(products._.columns.category)
```

#### SUM, AVG, MAX, MIN

```typescript
// Sum of all prices
const totalRevenue = sum(products._.columns.price)

// Average price
const averagePrice = avg(products._.columns.price)

// Highest and lowest price
const highestPrice = max(products._.columns.price)
const lowestPrice = min(products._.columns.price)
```

#### GROUP_CONCAT (SQLite-specific)

```typescript
// Concatenate values with comma separator
const allNames = groupConcat(products._.columns.name)

// Custom separator
const namesList = groupConcat(products._.columns.name, ' | ')
```

### Using Aggregates in Queries

While the current version doesn't have a dedicated aggregate query builder, you can use aggregates with raw SQL:

```typescript
import { sql } from '@type32/tauri-sqlite-orm'

// Example: Get statistics using raw SQL with aggregates
const stats = await orm.db.select(
  `SELECT 
    COUNT(*) as total_products,
    AVG(price) as average_price,
    MAX(price) as max_price,
    MIN(price) as min_price,
    SUM(price) as total_value
  FROM products`
)

console.log(stats[0])
// { total_products: 100, average_price: 49.99, max_price: 199.99, min_price: 9.99, total_value: 4999 }
```

### Aggregates with GROUP BY

```typescript
// Get product count and average price per category
const categoryStats = await orm.db.select(`
  SELECT 
    category,
    COUNT(*) as product_count,
    AVG(price) as avg_price,
    GROUP_CONCAT(name) as products
  FROM products
  GROUP BY category
`)

console.log(categoryStats)
// [
//   { category: 'Electronics', product_count: 25, avg_price: 89.99, products: 'Laptop,Phone,Tablet' },
//   { category: 'Books', product_count: 50, avg_price: 19.99, products: 'Novel,Guide,Manual' }
// ]
```

## Subqueries

Subqueries allow you to use the result of one query within another query. They're powerful for complex filtering and data retrieval.

### Creating Subqueries

```typescript
import { subquery, scalarSubquery } from '@type32/tauri-sqlite-orm'

const users = sqliteTable('users', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  departmentId: integer('department_id').notNull(),
})

const departments = sqliteTable('departments', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
})
```

### Subquery in WHERE with IN

```typescript
import { inArray, eq } from '@type32/tauri-sqlite-orm'

// Find all users in the 'Engineering' department
const engineeringDeptQuery = orm
  .select(departments)
  .where(eq(departments._.columns.name, 'Engineering'))

const engineeringSubquery = subquery(engineeringDeptQuery)

// Use the subquery in the main query
const engineeringUsers = await orm
  .select(users)
  .where(inArray(users._.columns.departmentId, engineeringSubquery))
  .all()

// Generated SQL (simplified):
// SELECT * FROM users WHERE department_id IN (SELECT id FROM departments WHERE name = 'Engineering')
```

### Subquery with NOT IN

```typescript
import { notIn } from '@type32/tauri-sqlite-orm'

// Find users NOT in the 'HR' department
const hrDeptQuery = orm
  .select(departments)
  .where(eq(departments._.columns.name, 'HR'))

const nonHrUsers = await orm
  .select(users)
  .where(notIn(users._.columns.departmentId, subquery(hrDeptQuery)))
  .all()
```

### EXISTS and NOT EXISTS

```typescript
import { exists, notExists } from '@type32/tauri-sqlite-orm'

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey().autoincrement(),
  title: text('title').notNull(),
  authorId: integer('author_id').notNull(),
})

// Find users who have written at least one post
const postsSubquery = subquery(
  orm.select(posts).where(eq(posts._.columns.authorId, users._.columns.id))
)

const usersWithPosts = await orm
  .select(users)
  .where(exists(postsSubquery))
  .all()

// Find users who haven't written any posts
const usersWithoutPosts = await orm
  .select(users)
  .where(notExists(postsSubquery))
  .all()
```

### Scalar Subqueries (Comparison)

```typescript
import { gtSubquery, ltSubquery, eqSubquery } from '@type32/tauri-sqlite-orm'

const orders = sqliteTable('orders', {
  id: integer('id').primaryKey().autoincrement(),
  userId: integer('user_id').notNull(),
  total: integer('total').notNull(),
})

// Find users with orders greater than the average order total
const avgOrderQuery = orm.db.select('SELECT AVG(total) FROM orders')
const avgSubquery = scalarSubquery(avgOrderQuery)

const highValueUsers = await orm
  .select(users)
  .where(
    exists(
      subquery(
        orm.select(orders)
          .where(eq(orders._.columns.userId, users._.columns.id))
          .where(gtSubquery(orders._.columns.total, avgSubquery))
      )
    )
  )
  .all()
```

### Complex Example: Multiple Subqueries

```typescript
const products = sqliteTable('products', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  categoryId: integer('category_id').notNull(),
  price: integer('price').notNull(),
})

const categories = sqliteTable('categories', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
})

// Find categories that have at least one expensive product (price > 100)
const expensiveProductsSubquery = subquery(
  orm.select(products)
    .where(eq(products._.columns.categoryId, categories._.columns.id))
    .where(gt(products._.columns.price, 100))
)

const categoriesWithExpensiveProducts = await orm
  .select(categories)
  .where(exists(expensiveProductsSubquery))
  .all()
```

### Debugging Subqueries

You can use `.toSQL()` on subqueries too:

```typescript
const subq = orm.select(departments).where(eq(departments._.columns.name, 'Engineering'))
const { sql, params } = subq.toSQL()

console.log('Subquery SQL:', sql)
console.log('Subquery Params:', params)

// Then use it in the main query
const mainQuery = orm
  .select(users)
  .where(inArray(users._.columns.departmentId, subquery(subq)))

const { sql: mainSql, params: mainParams } = mainQuery.toSQL()
console.log('Main Query SQL:', mainSql)
console.log('Main Query Params:', mainParams)
```

## Best Practices

### 1. Performance
- Use subqueries judiciously - sometimes JOINs are more efficient
- Test query performance with `.toSQL()` and EXPLAIN
- Index columns used in subquery conditions

### 2. Readability
- Break complex queries into smaller, named subqueries
- Use `.toSQL()` to verify the generated SQL matches your intent
- Add comments explaining complex subquery logic

### 3. Type Safety
- Aggregates are properly typed (count returns number, groupConcat returns string)
- Subqueries maintain parameter type safety
- Use TypeScript's type inference to catch errors early

## Summary

These advanced features give you powerful tools for complex queries:
- **`.toSQL()`**: Debug and log queries without execution
- **Aggregates**: Perform calculations with type safety
- **Subqueries**: Build complex queries with proper composition

All features work together seamlessly and maintain the ORM's focus on type safety and developer experience.

