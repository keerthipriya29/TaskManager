import { and, eq } from "drizzle-orm";
import { db, tasksTable, type Task } from "@workspace/db";
import { logger } from "./logger";

const reminderIds = new Set<number>();
let schedulerStarted = false;

export type TaskStatus = "Upcoming" | "Scheduled" | "Completed";

export function getTaskInstant(task: Pick<Task, "scheduleDate" | "scheduleTime">): Date {
  return new Date(`${task.scheduleDate}T${task.scheduleTime}:00`);
}

export function deriveTaskStatus(
  task: Pick<Task, "scheduleDate" | "scheduleTime" | "status">,
  now = new Date(),
): TaskStatus {
  if (task.status === "Completed") return "Completed";
  const hoursUntilDue =
    (getTaskInstant(task).getTime() - now.getTime()) / (60 * 60 * 1000);
  return hoursUntilDue <= 24 ? "Scheduled" : "Upcoming";
}

export async function syncTaskStatuses(): Promise<void> {
  const tasks = await db.select().from(tasksTable);
  const now = new Date();

  await Promise.all(
    tasks.map(async (task) => {
      if (task.status === "Completed") return;

      const due = getTaskInstant(task) <= now;
      const snoozeExpired = !task.snoozedUntil || task.snoozedUntil <= now;
      const nextStatus = deriveTaskStatus(task, now);

      if (due && snoozeExpired && !task.reminderTriggered) {
        reminderIds.add(task.id);
        await db
          .update(tasksTable)
          .set({ status: "Scheduled", reminderTriggered: true })
          .where(eq(tasksTable.id, task.id));
        return;
      }

      if (task.status !== nextStatus) {
        await db
          .update(tasksTable)
          .set({ status: nextStatus })
          .where(eq(tasksTable.id, task.id));
      }
    }),
  );
}

export function consumeReminderIds(): number[] {
  const ids = [...reminderIds];
  reminderIds.clear();
  return ids;
}

export function clearReminder(id: number): void {
  reminderIds.delete(id);
}

export async function ensureSeedData(): Promise<void> {
  const existing = await db.select({ id: tasksTable.id }).from(tasksTable).limit(1);
  if (existing.length > 0) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const soon = new Date(now.getTime() + 45 * 60 * 1000);
  const soonTime = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;

  await db.insert(tasksTable).values([
    {
      title: "Review incoming inspection samples",
      description: "Verify the first batch against the latest acceptance checklist.",
      scheduleDate: today,
      scheduleTime: soonTime,
      status: "Scheduled",
    },
    {
      title: "Calibrate vision station",
      description: "Run the calibration sequence before the afternoon production window.",
      scheduleDate: tomorrow,
      scheduleTime: "09:30",
      status: "Upcoming",
    },
    {
      title: "Close out last week's audit",
      description: "Archive evidence and share the final findings with the team.",
      scheduleDate: today,
      scheduleTime: "08:00",
      status: "Completed",
    },
  ]);

  logger.info("Seeded QC task manager sample data");
}

export async function initializeTaskSystem(): Promise<void> {
  await ensureSeedData();
  await syncTaskStatuses();

  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(() => {
    void syncTaskStatuses().catch((error: unknown) => {
      logger.error({ error }, "Reminder scheduler tick failed");
    });
  }, 15_000);
  logger.info("Reminder scheduler started");
}