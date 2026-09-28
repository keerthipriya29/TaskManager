import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  description: text("description"),
  scheduleDate: date("schedule_date", { mode: "string" }).notNull(),
  scheduleTime: text("schedule_time").notNull(),
  status: text("status").notNull().default("Upcoming"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reminderTriggered: boolean("reminder_triggered").notNull().default(false),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
});

export const insertTaskSchema = createInsertSchema(tasksTable);

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;