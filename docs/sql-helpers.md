## SQL Helpers

### Comparisons

eq, ne, gt, gte, lt, lte

### Null & ranges

isNull, isNotNull, between, notBetween

### Membership & exists

inArray, notInArray, exists, notExists

### Like

like, ilike, notIlike (SQLite uses `LOWER()` fallback)

### Logical

and(...), or(...), not(...)

### Raw template

```ts
raw`lower(${users.name})`;
```

### Ordering

asc(col), desc(col)
