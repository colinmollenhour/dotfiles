---
name: drizzle-orm
user-invocable: false
description: 'Use Drizzle ORM for TypeScript schemas, queries, migrations, relations, and transactions.'
---

# Drizzle ORM

Start with the lockfile, dialect, driver, schema exports, and migration scripts. Match the project's installed ORM and Kit versions, particularly for relational queries. Follow an existing table and its callers before choosing a new pattern.

- Preserve SQL table and column names when changing TypeScript properties. Application relations describe how to query related rows. Declare database foreign keys separately when the database must enforce them.
- Derive row and insert types with `typeof table.$inferSelect` and `typeof table.$inferInsert`. For computed fields, `sql<T>` describes the type to TypeScript. Use a driver conversion or `.mapWith()` when the runtime value needs conversion.
- Match projections and write results to the dialect. Check driver support before relying on `.returning()` or a particular upsert syntax. Use the transaction handle for every operation that must commit together.
- Interpolate data through the `sql` template or query operators. Keep user input out of `sql.raw()`.
- Follow the repository's migration workflow. For projects tracking SQL migrations, generate from the schema, inspect the SQL for data loss or accidental renames, and keep the generated metadata together. `push` applies schema changes directly. `pull` introspects a database.

Consult the official guides for [schema declarations](https://orm.drizzle.team/docs/sql-schema-declaration), [queries](https://orm.drizzle.team/docs/data-querying), [transactions](https://orm.drizzle.team/docs/transactions), and [migration workflows](https://orm.drizzle.team/docs/migrations).
