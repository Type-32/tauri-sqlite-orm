## Relations

The `relations` helper allows you to define relationships between your tables. While the current version of the ORM does not provide a high-level query API to automatically fetch related data, defining relations can be useful for organizing your code and for future compatibility.

### Defining Relations

To define a relationship, use the `relations` helper. It provides `one` and `many` helpers in its callback to define the relationships.

**One-to-Many Relationship**

Here's how you can define a one-to-many relationship where a user can have multiple posts:

```typescript
import {
  sqliteTable,
  text,
  integer,
  relations,
} from "@type32/tauri-sqlite-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name"),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey(),
  content: text("content"),
  authorId: integer("author_id").references(() => users.id),
});

// A user can have many posts
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
```

**One-to-One Relationship**

Here's an example of a one-to-one relationship where each user has one profile:

```typescript
export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey(),
  bio: text("bio"),
  userId: integer("user_id").references(() => users.id),
});

// A user has one profile
export const usersRelations = relations(users, ({ one }) => ({
  profile: one(profiles, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));
```

While you can't automatically fetch these relations with a single query through the ORM at the moment, you can still perform manual joins or separate queries to retrieve the related data.
