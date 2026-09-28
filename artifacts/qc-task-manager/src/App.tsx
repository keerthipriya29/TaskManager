import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Inbox,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getCheckRemindersQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetTasksQueryKey,
  useCheckReminders,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useGetDashboardSummary,
  useGetTasks,
  useHealthCheck,
  useSnoozeTask,
  useUpdateTask,
  type Task,
  type TaskInput,
  type TaskUpdate,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
type Status = 'Upcoming' | 'Scheduled' | 'Completed';
type Filter = 'All' | Status;

const blankForm = {
  title: '',
  description: '',
  scheduleDate: new Date().toISOString().slice(0, 10),
  scheduleTime: '09:00',
};

function formatDate(date: string | Date, includeYear = false) {
  if (!date) return 'No date';
  const parsed = date instanceof Date
    ? date
    : date.includes('T')
      ? new Date(date)
      : new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(parsed);
}

function formatTime(time: string) {
  if (!time) return '—';
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function relativeCheckedAt(value?: string) {
  if (!value) return 'Awaiting first check';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Just checked';
  if (minutes === 1) return 'Checked 1 min ago';
  return `Checked ${minutes} min ago`;
}

function StatusPill({ status }: { status: Status }) {
  const config = {
    Upcoming: { dot: 'bg-sky-500', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    Scheduled: { dot: 'bg-amber-500', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    Completed: { dot: 'bg-teal-600', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${config.className}`} data-testid={`status-task-${status.toLowerCase()}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}

function MetricCard({ label, value, detail, accent, icon: Icon, loading }: {
  label: string; value: number; detail: string; accent: string; icon: typeof Activity; loading?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_hsl(35_30%_30%_/_0.04)] transition-transform duration-200 hover:-translate-y-0.5" data-testid={`metric-${label.toLowerCase()}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          {loading ? <div className="mt-3 h-9 w-16 animate-pulse rounded-lg bg-muted" /> : <p className="mt-2 font-mono text-4xl font-medium tracking-[-0.08em] text-foreground" data-testid={`value-${label.toLowerCase()}`}>{value}</p>}
        </div>
        <span className="rounded-xl bg-muted p-2.5 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"><Icon size={17} strokeWidth={1.8} /></span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function TaskRow({ task, onEdit, onComplete, onDelete }: {
  task: Task; onEdit: (task: Task) => void; onComplete: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const isCompleted = task.status === 'Completed';
  return (
    <div className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/70 px-4 py-4 transition-colors last:border-0 hover:bg-muted/45 sm:grid-cols-[auto_1fr_150px_120px_auto] ${isCompleted ? 'opacity-70' : ''}`} data-testid={`row-task-${task.id}`}>
      <button
        type="button"
        onClick={() => !isCompleted && onComplete(task)}
        disabled={isCompleted}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all ${isCompleted ? 'border-teal-500 bg-teal-500 text-white' : 'border-border bg-card text-transparent hover:border-primary hover:bg-primary/10'}`}
        aria-label={isCompleted ? 'Task completed' : `Complete ${task.title}`}
        data-testid={`button-complete-task-${task.id}`}
      >
        <Check size={15} strokeWidth={3} />
      </button>
      <div className="min-w-0">
        <p className={`truncate text-sm font-bold text-foreground ${isCompleted ? 'line-through' : ''}`} data-testid={`text-task-title-${task.id}`}>{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description || 'No additional notes'}</p>
      </div>
      <div className="hidden sm:block">
        <p className="font-mono text-xs font-medium text-foreground">{formatDate(task.scheduleDate)}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 size={11} /> {formatTime(task.scheduleTime)}</p>
      </div>
      <div className="hidden sm:block"><StatusPill status={task.status as Status} /></div>
      <div className="flex items-center gap-1">
        {task.reminderTriggered && !isCompleted && <span className="mr-1 rounded-full bg-primary/10 p-1.5 text-primary" title="Reminder is active"><Bell size={13} /></span>}
        <button type="button" onClick={() => onEdit(task)} className="rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${task.title}`} data-testid={`button-edit-task-${task.id}`}><Pencil size={15} /></button>
        <button type="button" onClick={() => onDelete(task)} className="rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${task.title}`} data-testid={`button-delete-task-${task.id}`}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: (message: string) => void }) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const client = useQueryClient();
  const [form, setForm] = useState(task ? {
    title: task.title,
    description: task.description || '',
    scheduleDate: task.scheduleDate,
    scheduleTime: task.scheduleTime,
  } : blankForm);
  const [error, setError] = useState('');

  const refresh = () => {
    client.invalidateQueries({ queryKey: getGetTasksQueryKey() });
    client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    client.invalidateQueries({ queryKey: getCheckRemindersQueryKey() });
  };
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) { setError('Give this task a clear title.'); return; }
    if (!form.scheduleDate || !form.scheduleTime) { setError('A date and time are required.'); return; }
    setError('');
    if (task) {
      const data: TaskUpdate = { title: form.title.trim(), description: form.description.trim(), scheduleDate: form.scheduleDate, scheduleTime: form.scheduleTime };
      updateTask.mutate({ id: task.id, data }, { onSuccess: () => { refresh(); onSaved('Task updated'); onClose(); }, onError: () => setError('Could not update this task. Try again.') });
    } else {
      const data: TaskInput = { title: form.title.trim(), description: form.description.trim(), scheduleDate: form.scheduleDate, scheduleTime: form.scheduleTime };
      createTask.mutate({ data }, { onSuccess: () => { refresh(); onSaved('Task added to the runbook'); onClose(); }, onError: () => setError('Could not create this task. Try again.') });
    }
  };
  const pending = createTask.isPending || updateTask.isPending;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" data-testid="dialog-task">
      <div className="animate-rise w-full max-w-lg rounded-t-3xl border border-border bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{task ? 'Edit work order' : 'New work order'}</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{task ? 'Adjust task details' : 'Put work on the board'}</h2></div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close task form" data-testid="button-close-task-dialog"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-foreground">Task title</span><input autoFocus value={form.title} onChange={(e) => change('title', e.target.value)} maxLength={160} placeholder="e.g. Verify batch 24-B labels" className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-task-title" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></span><textarea value={form.description} onChange={(e) => change('description', e.target.value)} maxLength={1000} rows={3} placeholder="Add the context the next operator needs..." className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-task-description" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1.5 block text-xs font-bold text-foreground">Schedule date</span><input type="date" value={form.scheduleDate} onChange={(e) => change('scheduleDate', e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-task-date" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-foreground">Time</span><input type="time" value={form.scheduleTime} onChange={(e) => change('scheduleTime', e.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-task-time" /></label></div>
          {error && <p className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive" data-testid="status-task-form-error"><AlertCircle size={14} />{error}</p>}
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-border text-sm font-bold text-muted-foreground transition-colors hover:bg-muted" data-testid="button-cancel-task">Cancel</button><button type="submit" disabled={pending} className="h-11 flex-[1.5] rounded-xl bg-primary text-sm font-extrabold text-primary-foreground transition-all hover:brightness-105 active:scale-[.98] disabled:cursor-wait disabled:opacity-60" data-testid="button-save-task">{pending ? 'Saving…' : task ? 'Save changes' : 'Add to runbook'}</button></div>
        </form>
      </div>
    </div>
  );
}

function Dashboard() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [modalTask, setModalTask] = useState<Task | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { data: tasks, isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useGetTasks();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: reminders, isLoading: remindersLoading, refetch: checkReminders } = useCheckReminders({ query: { queryKey: getCheckRemindersQueryKey(), refetchInterval: 60000 } });
  const { data: health } = useHealthCheck();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const snoozeTask = useSnoozeTask();
  const list = useMemo(() => (tasks || []).filter((task) => {
    const matchesFilter = filter === 'All' || task.status === filter;
    const term = search.trim().toLowerCase();
    return matchesFilter && (!term || task.title.toLowerCase().includes(term) || (task.description || '').toLowerCase().includes(term));
  }).sort((a, b) => `${a.scheduleDate}T${a.scheduleTime}`.localeCompare(`${b.scheduleDate}T${b.scheduleTime}`)), [tasks, filter, search]);
  const activeReminders = reminders?.reminders || [];
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  const refresh = () => {
    client.invalidateQueries({ queryKey: getGetTasksQueryKey() });
    client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    client.invalidateQueries({ queryKey: getCheckRemindersQueryKey() });
  };
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800); };
  const complete = (task: Task) => completeTask.mutate({ id: task.id }, { onSuccess: () => { refresh(); notify('Task marked complete'); }, onError: () => notify('Could not complete task') });
  const remove = (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    deleteTask.mutate({ id: task.id }, { onSuccess: () => { refresh(); notify('Task removed'); }, onError: () => notify('Could not delete task') });
  };
  const snooze = (task: Task, minutes: number) => snoozeTask.mutate({ id: task.id, data: { minutes } }, { onSuccess: () => { refresh(); notify(`Reminder snoozed for ${minutes} minutes`); }, onError: () => notify('Could not snooze reminder') });

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-[82px] items-center border-b border-sidebar-border px-7"><div className="mr-3 flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck size={20} strokeWidth={2.5} /></div><div><p className="text-[15px] font-extrabold tracking-tight">QC / COMMAND</p><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/50">Operations cockpit</p></div></div>
        <div className="flex-1 px-4 py-7">
          <p className="px-3 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/40">Workspace</p>
          <nav className="mt-3 space-y-1"><button type="button" className="flex w-full items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-left text-sm font-bold text-sidebar-accent-foreground" data-testid="nav-dashboard"><Activity size={17} className="text-sidebar-primary" /> Command center <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" /></button><button type="button" onClick={() => setFilter('All')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" data-testid="nav-all-work"><Inbox size={17} /> All work <span className="ml-auto font-mono text-xs">{summary?.total ?? '—'}</span></button></nav>
          <p className="mt-9 px-3 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/40">Views</p>
          <div className="mt-3 space-y-1">{(['Upcoming', 'Scheduled', 'Completed'] as Status[]).map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${filter === status ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`nav-${status.toLowerCase()}`}><span className={`h-2 w-2 rounded-full ${status === 'Completed' ? 'bg-teal-400' : status === 'Scheduled' ? 'bg-sidebar-primary' : 'bg-sky-400'}`} />{status}<span className="ml-auto font-mono text-xs">{summary?.[status.toLowerCase() as 'upcoming' | 'scheduled' | 'completed'] ?? '—'}</span></button>)}</div>
        </div>
        <div className="border-t border-sidebar-border p-5"><div className="flex items-center gap-2.5"><span className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-emerald-400' : health ? 'bg-amber-400' : 'animate-pulse-soft bg-sidebar-foreground/30'}`} /><div><p className="text-xs font-bold">System {health?.status === 'ok' ? 'nominal' : health ? health.status : 'checking'}</p><p className="mt-0.5 font-mono text-[9px] text-sidebar-foreground/45">API heartbeat / live</p></div></div></div>
      </aside>
      <main className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar text-sidebar-primary lg:hidden"><ShieldCheck size={18} /></div><div><p className="font-mono text-[10px] uppercase tracking-[0.17em] text-muted-foreground">Today / {formatDate(new Date().toISOString().slice(0, 10), true)}</p><p className="text-sm font-extrabold text-foreground sm:hidden">Command center</p></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><span className="hidden text-xs font-semibold text-muted-foreground md:block">{dateLabel}</span><button type="button" onClick={() => checkReminders()} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary" data-testid="button-check-reminders"><RefreshCw size={14} className={remindersLoading ? 'animate-spin' : ''} /><span className="hidden sm:inline">Check reminders</span></button><button type="button" onClick={() => setModalTask(null)} className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:brightness-105 active:scale-95" data-testid="button-new-task"><Plus size={15} strokeWidth={2.5} /><span className="hidden sm:inline">New task</span></button></div>
        </header>
        <div className="control-grid min-h-[calc(100dvh-70px)] px-5 py-7 sm:px-8 sm:py-9">
          <div className="mx-auto max-w-[1420px]">
            <section className="animate-rise flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-primary"><Sparkles size={12} /> Shift overview</div><h1 className="text-3xl font-extrabold tracking-[-0.045em] text-foreground sm:text-[42px]">Keep the line moving.</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">A clear view of scheduled work, active reminders, and the next thing that needs your attention.</p></div><div className="flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-2 text-xs font-semibold text-muted-foreground"><span className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-teal-500' : 'bg-amber-500 animate-pulse'}`} /> Live operations</div></section>
            <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Scheduled" value={summary?.scheduled ?? 0} detail="Due in the active queue" accent="bg-primary" icon={CalendarDays} loading={summaryLoading} /><MetricCard label="Upcoming" value={summary?.upcoming ?? 0} detail="Queued for later" accent="bg-sky-500" icon={Clock3} loading={summaryLoading} /><MetricCard label="Completed" value={summary?.completed ?? 0} detail="Closed this workstream" accent="bg-teal-600" icon={CheckCircle2} loading={summaryLoading} /><MetricCard label="Total tasks" value={summary?.total ?? 0} detail="Across every status" accent="bg-slate-500" icon={ListFilter} loading={summaryLoading} /></section>
            {activeReminders.length > 0 && <section className="animate-rise stagger-1 mt-6 overflow-hidden rounded-2xl border border-primary/35 bg-[hsl(40_90%_94%)] shadow-[0_8px_28px_hsl(32_92%_49%_/_0.09)]" data-testid="panel-reminders"><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><div className="mt-0.5 rounded-xl bg-primary p-2.5 text-primary-foreground"><Bell size={18} /></div><div><div className="flex items-center gap-2"><h2 className="font-extrabold text-foreground">Attention required</h2><span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">{activeReminders.length}</span></div><p className="mt-1 text-xs text-foreground/65">These reminders have reached their trigger time.</p></div></div><div className="flex flex-wrap gap-2 sm:max-w-[55%] sm:justify-end">{activeReminders.slice(0, 3).map((task) => <div key={task.id} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-card/70 px-2.5 py-2 text-xs font-bold text-foreground" data-testid={`reminder-task-${task.id}`}><span className="max-w-[160px] truncate">{task.title}</span><button type="button" onClick={() => snooze(task, 30)} className="rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Snooze 30 minutes" data-testid={`button-snooze-task-${task.id}`}><Clock3 size={14} /></button><button type="button" onClick={() => complete(task)} className="rounded-md p-1 text-teal-700 hover:bg-teal-100" title="Complete task" data-testid={`button-complete-reminder-${task.id}`}><Check size={14} /></button></div>)}</div></div></section>}
            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_hsl(35_30%_30%_/_0.04)]">
                <div className="border-b border-border px-4 py-4 sm:px-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-extrabold tracking-tight text-foreground">Work queue</h2><p className="mt-0.5 text-xs text-muted-foreground">{list.length} visible {list.length === 1 ? 'task' : 'tasks'} <span className="text-border">·</span> sorted by schedule</p></div><div className="flex items-center gap-2"><div className="relative min-w-0 flex-1 sm:w-52"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-search-tasks" /></div><button type="button" onClick={() => setShowFilters((value) => !value)} className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${filter !== 'All' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-input bg-background text-muted-foreground hover:text-foreground'}`} data-testid="button-filter-tasks"><ListFilter size={14} /><span className="hidden sm:inline">{filter === 'All' ? 'Filter' : filter}</span><ChevronDown size={13} /></button></div></div>{showFilters && <div className="mt-3 flex flex-wrap gap-1.5 rounded-xl bg-muted p-1.5">{(['All', 'Upcoming', 'Scheduled', 'Completed'] as Filter[]).map((item) => <button type="button" key={item} onClick={() => { setFilter(item); setShowFilters(false); }} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${filter === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`filter-${item.toLowerCase()}`}>{item}</button>)}</div>}</div>
                <div className="hidden grid-cols-[auto_1fr_150px_120px_auto] gap-3 bg-muted/50 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground sm:grid"><span /><span>Task</span><span>Schedule</span><span>Status</span><span /></div>
                {tasksLoading ? <div className="space-y-1 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 border-b border-border/50 py-4"><div className="h-8 w-8 rounded-full bg-muted" /><div className="flex-1"><div className="h-3 w-2/5 rounded bg-muted" /><div className="mt-2 h-2.5 w-1/4 rounded bg-muted" /></div></div>)}</div> : tasksError ? <div className="flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-tasks-error"><div className="rounded-2xl bg-destructive/10 p-3 text-destructive"><AlertCircle size={22} /></div><h3 className="mt-4 text-sm font-extrabold">Queue unavailable</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">We couldn't reach the task service. Your work is safe; try reconnecting.</p><button type="button" onClick={() => refetchTasks()} className="mt-4 flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background" data-testid="button-retry-tasks"><RefreshCw size={13} /> Retry connection</button></div> : list.length === 0 ? <div className="flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="state-tasks-empty"><div className="rounded-2xl bg-muted p-3 text-muted-foreground"><Inbox size={22} /></div><h3 className="mt-4 text-sm font-extrabold">{search || filter !== 'All' ? 'No matching work' : 'The queue is clear'}</h3><p className="mt-1 max-w-xs text-xs text-muted-foreground">{search || filter !== 'All' ? 'Try another filter or search term.' : 'Add the first task for this workstream and keep the next shift moving.'}</p>{!search && filter === 'All' && <button type="button" onClick={() => setModalTask(null)} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground" data-testid="button-empty-add-task"><Plus size={13} /> Add a task</button>}</div> : list.map((task) => <TaskRow key={task.id} task={task} onEdit={(selected) => setModalTask(selected)} onComplete={complete} onDelete={remove} />)}
              </div>
              <aside className="space-y-6">
                <div className="rounded-2xl border border-border bg-sidebar p-5 text-sidebar-foreground shadow-[0_10px_30px_hsl(224_29%_17%_/_0.12)]" data-testid="panel-next-task"><div className="flex items-center justify-between"><p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/50">Next on deck</p><MoreHorizontal size={17} className="text-sidebar-foreground/40" /></div>{summaryLoading ? <div className="mt-6 space-y-3 animate-pulse"><div className="h-5 w-3/4 rounded bg-sidebar-accent" /><div className="h-3 w-1/2 rounded bg-sidebar-accent" /><div className="h-12 rounded-xl bg-sidebar-accent" /></div> : summary?.nextTask ? <div className="mt-5"><div className="flex items-center gap-2 text-sidebar-primary"><Clock3 size={16} /><span className="font-mono text-xs font-medium">{formatDate(summary.nextTask.scheduleDate)} · {formatTime(summary.nextTask.scheduleTime)}</span></div><h3 className="mt-3 text-xl font-extrabold leading-tight tracking-tight">{summary.nextTask.title}</h3><p className="mt-2 line-clamp-2 text-xs leading-relaxed text-sidebar-foreground/55">{summary.nextTask.description || 'No notes attached to this task.'}</p><button type="button" onClick={() => complete(summary.nextTask!)} disabled={completeTask.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary py-3 text-xs font-extrabold text-sidebar-primary-foreground transition-transform hover:brightness-105 active:scale-[.98] disabled:opacity-60" data-testid="button-complete-next-task"><Check size={14} /> Mark complete</button></div> : <div className="py-8 text-center"><CheckCircle2 size={28} className="mx-auto text-sidebar-primary/70" /><p className="mt-3 text-sm font-bold">Nothing waiting</p><p className="mt-1 text-xs text-sidebar-foreground/50">The next task will appear here.</p></div>}</div>
                <div className="rounded-2xl border border-border bg-card p-5" data-testid="panel-reminder-status"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Bell size={15} className="text-primary" /><h3 className="text-sm font-extrabold">Reminder monitor</h3></div><span className="rounded-full bg-teal-50 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-teal-700">{reminders?.serverStatus || 'standby'}</span></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-xs text-muted-foreground">{relativeCheckedAt(reminders?.checkedAt)}</span><button type="button" onClick={() => checkReminders()} className="text-xs font-bold text-primary hover:underline" data-testid="button-refresh-reminders">Refresh</button></div></div>
              </aside>
            </section>
          </div>
        </div>
      </main>
      {notice && <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-xs font-bold text-background shadow-xl animate-rise" role="status" data-testid="status-action-notice"><CheckCircle2 size={15} className="text-primary" />{notice}</div>}
      {modalTask !== undefined && <TaskModal task={modalTask} onClose={() => setModalTask(undefined)} onSaved={notify} />}
    </div>
  );
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Dashboard} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;