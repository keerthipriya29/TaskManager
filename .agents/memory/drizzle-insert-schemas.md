---
name: Drizzle insert schemas
description: A schema-generation quirk to remember when adding tables to this workspace
---

When using the workspace's current Drizzle and drizzle-zod versions, `createInsertSchema` can already exclude generated identity and default columns. Calling `.omit()` with those absent keys throws at schema-load time.

**Why:** The database schema push imports table modules at runtime, so this failure blocks schema deployment before any SQL is applied.

**How to apply:** Start with `createInsertSchema(table)` and only omit properties confirmed to exist in that generated insert shape.