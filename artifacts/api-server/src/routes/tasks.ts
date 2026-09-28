import { Router, type IRouter } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, tasksTable } from "@workspace/db";
import {
  CheckRemindersResponse,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  DashboardSummary,
  GetDashboardSummaryResponse,
  GetTasksQueryParams,
  GetTasksResponse,
  SnoozeTaskBody,
  SnoozeTaskParams,
  SnoozeTaskResponse,
  Task as TaskSchema,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  clearReminder,
  consumeReminderIds,
  deriveTaskStatus,
  getTaskInstant,
  syncTaskStatuses,
} from "../lib/task-scheduler";

const router: IRouter = Router();

function dateToString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toTaskInputDate(value: Date): string {
  return dateToString(value);
}

function sortBySchedule<T extends { scheduleDate: string; scheduleTime: string }>(
  tasks: T[],
): T[] {
  return tasks.sort(
    (a, b) => getTaskInstant(a).getTime() - getTaskInstant(b).getTime(),
  );
}

router.get("/tasks", async (req, res): Promise<void> => {
  await syncTaskStatuses();
  const query = GetTasksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      query.data.status ? eq(tasksTable.status, query.data.status) : undefined,
    )
    .orderBy(asc(tasksTable.scheduleDate), asc(tasksTable.scheduleTime));
  res.json(GetTasksResponse.parse(tasks));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scheduleDate = toTaskInputDate(parsed.data.scheduleDate);
  const status = deriveTaskStatus({
    scheduleDate,
    scheduleTime: parsed.data.scheduleTime,
    status: "Upcoming",
  });
  const [task] = await db
    .insert(tasksTable)
    .values({
      title: parsed.data.title.trim(),
      description: parsed.data.description ?? null,
      scheduleDate,
      scheduleTime: parsed.data.scheduleTime,
      status,
    })
    .returning();

  res.status(201).json(CreateTaskResponse.parse(task));
});

router.put("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const error = !params.success
      ? params.error.message
      : !parsed.success
        ? parsed.error.message
        : "Invalid request";
    res.status(400).json({
      error,
    });
    return;
  }

  const [current] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const nextDate = parsed.data.scheduleDate
    ? toTaskInputDate(parsed.data.scheduleDate)
    : current.scheduleDate;
  const nextTime = parsed.data.scheduleTime ?? current.scheduleTime;
  const isRescheduled =
    nextDate !== current.scheduleDate || nextTime !== current.scheduleTime;
  const nextStatus =
    parsed.data.status === "Completed"
      ? "Completed"
      : parsed.data.status ?? deriveTaskStatus({
          scheduleDate: nextDate,
          scheduleTime: nextTime,
          status: current.status,
        });

  const [task] = await db
    .update(tasksTable)
    .set({
      ...(parsed.data.title !== undefined
        ? { title: parsed.data.title.trim() }
        : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.scheduleDate !== undefined
        ? { scheduleDate: nextDate }
        : {}),
      ...(parsed.data.scheduleTime !== undefined
        ? { scheduleTime: nextTime }
        : {}),
      status: nextStatus,
      ...(isRescheduled
        ? { reminderTriggered: false, snoozedUntil: null }
        : {}),
      ...(nextStatus === "Completed"
        ? { reminderTriggered: false, snoozedUntil: null }
        : {}),
    })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  clearReminder(params.data.id);
  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, params.data.id))
    .returning({ id: tasksTable.id });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  clearReminder(params.data.id);
  res.sendStatus(204);
});

router.post("/tasks/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set({
      status: "Completed",
      reminderTriggered: false,
      snoozedUntil: null,
    })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  clearReminder(params.data.id);
  res.json(CompleteTaskResponse.parse(task));
});

router.post("/tasks/:id/snooze", async (req, res): Promise<void> => {
  const params = SnoozeTaskParams.safeParse(req.params);
  const parsed = SnoozeTaskBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) {
    const error = !params.success
      ? params.error.message
      : !parsed.success
        ? parsed.error.message
        : "Invalid request";
    res.status(400).json({
      error,
    });
    return;
  }

  const [current] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const snoozedUntil = new Date(
    Date.now() + parsed.data.minutes * 60 * 1000,
  );
  const [task] = await db
    .update(tasksTable)
    .set({
      reminderTriggered: false,
      snoozedUntil,
      status: "Scheduled",
    })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  clearReminder(params.data.id);
  res.json(SnoozeTaskResponse.parse(task));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  await syncTaskStatuses();
  const tasks = await db.select().from(tasksTable);
  const nextTask = sortBySchedule(
    tasks.filter((task) => task.status !== "Completed"),
  )[0] ?? null;
  const summary = {
    scheduled: tasks.filter((task) => task.status === "Scheduled").length,
    upcoming: tasks.filter((task) => task.status === "Upcoming").length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    total: tasks.length,
    nextTask,
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/reminders/check", async (_req, res): Promise<void> => {
  await syncTaskStatuses();
  const ids = consumeReminderIds();
  const reminders =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(tasksTable)
          .where(and(...ids.map((id) => eq(tasksTable.id, id))));
  res.json(
    CheckRemindersResponse.parse({
      reminders,
      serverStatus: "Server Online - 200 OK",
      checkedAt: new Date(),
    }),
  );
});

export default router;