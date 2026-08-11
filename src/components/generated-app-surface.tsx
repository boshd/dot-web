"use client";

import {
  Check,
  LoaderCircle,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  addGeneratedAppRecord,
  BenjiApiError,
  deleteGeneratedAppRecord,
  GeneratedAppDetail,
  GeneratedAppRecord,
  loadPublicGeneratedApp,
  updateGeneratedAppRecord,
} from "@/lib/api";

type AppMutation = () => Promise<GeneratedAppDetail>;

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function number(value: unknown) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function dateLabel(value: unknown) {
  if (typeof value !== "string") return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function GeneratedAppSurface({ publicId }: { publicId: string }) {
  const [app, setApp] = useState<GeneratedAppDetail>();
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string>();
  const [shareLabel, setShareLabel] = useState("share");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      setApp(await loadPublicGeneratedApp(publicId));
    } catch (loadError) {
      setError(
        loadError instanceof BenjiApiError
          ? loadError.message
          : "This app couldn’t be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function mutate(action: AppMutation) {
    setIsMutating(true);
    setError(undefined);
    try {
      setApp(await action());
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof BenjiApiError
          ? mutationError.message
          : "That change didn’t save. Try again.",
      );
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: app?.title ?? "Dot app", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setShareLabel("copied");
    window.setTimeout(() => setShareLabel("share"), 1600);
  }

  if (isLoading) {
    return (
      <main className="generated-app-shell grid min-h-dvh place-items-center">
        <LoaderCircle className="size-7 animate-spin opacity-45" />
      </main>
    );
  }

  if (!app) {
    return (
      <main className="generated-app-shell grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-black text-white">
            d
          </div>
          <h1 className="mt-5 text-2xl font-semibold">app unavailable</h1>
          <p className="mt-2 text-sm opacity-55">{error ?? "This link may be invalid."}</p>
        </div>
      </main>
    );
  }

  const template = {
    budget: <BudgetApp app={app} mutate={mutate} busy={isMutating} />,
    expense_splitter: <ExpenseSplitterApp app={app} mutate={mutate} busy={isMutating} />,
    metric_tracker: <MetricTrackerApp app={app} mutate={mutate} busy={isMutating} />,
    checklist: <ChecklistApp app={app} mutate={mutate} busy={isMutating} />,
  }[app.template];

  return (
    <main className={`generated-app-shell theme-${app.theme} min-h-dvh px-4 py-5 sm:px-7 sm:py-8`}>
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid size-9 place-items-center rounded-xl bg-(--app-accent) text-white">
              d
            </span>
            <span>made by dot</span>
          </div>
          <button
            type="button"
            onClick={() => void share()}
            className="flex h-10 items-center gap-2 rounded-full border border-black/8 bg-white/68 px-4 text-xs font-semibold transition hover:bg-white"
          >
            <Share2 className="size-3.5" /> {shareLabel}
          </button>
        </header>

        <section className="py-10 sm:py-14">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--app-accent)">
                {app.template.replaceAll("_", " ")}
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
                {app.title}
              </h1>
              {app.description && (
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-black/52">
                  {app.description}
                </p>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {template}

        <footer className="py-10 text-center text-[11px] text-black/32">
          {app.access_mode === "collaborative_link"
            ? "anyone with this link can add to this app"
            : "private link — anyone with it can view and edit"}
        </footer>
      </div>
    </main>
  );
}

type TemplateProps = {
  app: GeneratedAppDetail;
  mutate: (action: AppMutation) => Promise<boolean>;
  busy: boolean;
};

function BudgetApp({ app, mutate, busy }: TemplateProps) {
  const currency = text(app.specification.settings.currency) || "USD";
  const target = number(app.specification.settings.monthly_budget);
  const expenses = app.records.filter((record) => record.kind === "expense");
  const total = expenses.reduce((sum, record) => sum + number(record.data.amount), 0);
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((totals, record) => {
      const category = text(record.data.category) || "other";
      totals[category] = (totals[category] ?? 0) + number(record.data.amount);
      return totals;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(() =>
      addGeneratedAppRecord({
        publicId: app.public_id,
        kind: "expense",
        data: { amount: Number(amount), category, note, date },
      }),
    );
    if (saved) {
      setAmount("");
      setNote("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="spent" value={money(total, currency)} />
        <Stat label="budget" value={target ? money(target, currency) : "not set"} />
        <Stat
          label={target && total > target ? "over by" : "left"}
          value={target ? money(Math.abs(target - total), currency) : "—"}
          accent={Boolean(target && total > target)}
        />
      </div>
      {target > 0 && <Progress value={Math.min((total / target) * 100, 100)} />}
      <Panel title="add an expense">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Input label={`amount (${currency})`} type="number" value={amount} onChange={setAmount} required />
          <Select
            label="category"
            value={category}
            onChange={setCategory}
            options={["food", "transport", "shopping", "bills", "fun", "health", "other"]}
          />
          <Input label="note" value={note} onChange={setNote} placeholder="optional" />
          <Input label="date" type="date" value={date} onChange={setDate} required />
          <SubmitButton busy={busy} label="add expense" />
        </form>
      </Panel>
      {byCategory.length > 0 && (
        <Panel title="where it went">
          <div className="space-y-3">
            {byCategory.map(([name, value]) => (
              <div key={name}>
                <div className="flex justify-between text-xs font-medium">
                  <span>{name}</span><span>{money(value, currency)}</span>
                </div>
                <Progress value={total ? (value / total) * 100 : 0} compact />
              </div>
            ))}
          </div>
        </Panel>
      )}
      <RecordList
        title="recent expenses"
        records={[...expenses].reverse()}
        render={(record) => (
          <><span>{text(record.data.note) || text(record.data.category)}</span><strong>{money(number(record.data.amount), currency)}</strong></>
        )}
        onDelete={(record) => mutate(() => deleteGeneratedAppRecord({ publicId: app.public_id, recordId: record.id }))}
        busy={busy}
      />
    </div>
  );
}

function ExpenseSplitterApp({ app, mutate, busy }: TemplateProps) {
  const currency = text(app.specification.settings.currency) || "USD";
  const participants = app.records.filter((record) => record.kind === "participant");
  const names = participants.map((record) => text(record.data.name));
  const expenses = app.records.filter((record) => record.kind === "expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState(names[0] ?? "");
  const [date, setDate] = useState(today());
  const effectivePaidBy = names.includes(paidBy) ? paidBy : (names[0] ?? "");

  const balances = useMemo(() => {
    const result = Object.fromEntries(names.map((participant) => [participant, 0]));
    for (const expense of expenses) {
      const payer = text(expense.data.paid_by);
      const split = Array.isArray(expense.data.split_between)
        ? expense.data.split_between.map(String)
        : [];
      const value = number(expense.data.amount);
      if (payer in result) result[payer] += value;
      for (const participant of split) {
        if (participant in result && split.length) result[participant] -= value / split.length;
      }
    }
    return result;
  }, [expenses, names]);

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (await mutate(() => addGeneratedAppRecord({ publicId: app.public_id, kind: "participant", data: { name } }))) setName("");
  }

  async function addExpense(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(() =>
      addGeneratedAppRecord({
        publicId: app.public_id,
        kind: "expense",
        data: { amount: Number(amount), description, paid_by: effectivePaidBy, split_between: names, date },
        actorName: effectivePaidBy,
      }),
    );
    if (saved) { setAmount(""); setDescription(""); }
  }

  return (
    <div className="space-y-5">
      <Panel title="the group">
        <div className="flex flex-wrap gap-2">
          {names.map((participant) => <span key={participant} className="rounded-full bg-(--app-soft) px-3 py-2 text-xs font-semibold">{participant}</span>)}
          {!names.length && <p className="text-sm text-black/42">add everyone splitting the bill.</p>}
        </div>
        <form onSubmit={addPerson} className="mt-4 flex gap-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="name" required className="app-input min-w-0 flex-1" />
          <button disabled={busy} className="app-primary grid size-12 place-items-center rounded-2xl"><Plus className="size-4" /></button>
        </form>
      </Panel>
      {names.length > 0 && (
        <Panel title="add a shared expense">
          <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2">
            <Input label={`amount (${currency})`} type="number" value={amount} onChange={setAmount} required />
            <Select label="paid by" value={effectivePaidBy} onChange={setPaidBy} options={names} />
            <Input label="what was it?" value={description} onChange={setDescription} required />
            <Input label="date" type="date" value={date} onChange={setDate} required />
            <p className="sm:col-span-2 text-xs text-black/38">split equally between everyone</p>
            <SubmitButton busy={busy} label="split it" />
          </form>
        </Panel>
      )}
      {expenses.length > 0 && (
        <Panel title="settle up">
          <div className="space-y-2">
            {Object.entries(balances).map(([participant, balance]) => (
              <div key={participant} className="flex items-center justify-between rounded-2xl bg-(--app-soft) px-4 py-3 text-sm">
                <span className="font-medium">{participant}</span>
                <span className={balance >= 0 ? "text-emerald-700" : "text-red-700"}>
                  {balance >= 0 ? "gets " : "owes "}{money(Math.abs(balance), currency)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <RecordList
        title="expenses"
        records={[...expenses].reverse()}
        render={(record) => <><span>{text(record.data.description)} <small className="block text-black/36">paid by {text(record.data.paid_by)}</small></span><strong>{money(number(record.data.amount), currency)}</strong></>}
        onDelete={(record) => mutate(() => deleteGeneratedAppRecord({ publicId: app.public_id, recordId: record.id }))}
        busy={busy}
      />
    </div>
  );
}

function MetricTrackerApp({ app, mutate, busy }: TemplateProps) {
  const unit = text(app.specification.settings.unit) || "units";
  const target = number(app.specification.settings.target);
  const measurements = app.records.filter((record) => record.kind === "measurement");
  const latest = measurements.at(-1);
  const first = measurements[0];
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const values = measurements.map((record) => number(record.data.value));
  const low = Math.min(...values, target || Infinity);
  const high = Math.max(...values, target || -Infinity);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await mutate(() => addGeneratedAppRecord({ publicId: app.public_id, kind: "measurement", data: { value: Number(value), note, date } }))) {
      setValue(""); setNote("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="latest" value={latest ? `${number(latest.data.value)} ${unit}` : "—"} />
        <Stat label="goal" value={target ? `${target} ${unit}` : "not set"} />
        <Stat label="change" value={latest && first ? `${(number(latest.data.value) - number(first.data.value)).toFixed(1)} ${unit}` : "—"} />
      </div>
      <Panel title="log a measurement">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Input label={unit} type="number" value={value} onChange={setValue} required />
          <Input label="date" type="date" value={date} onChange={setDate} required />
          <Input label="note" value={note} onChange={setNote} placeholder="optional" />
          <SubmitButton busy={busy} label="log it" />
        </form>
      </Panel>
      {measurements.length > 0 && (
        <Panel title="progress">
          <div className="flex h-44 items-end gap-2 overflow-hidden">
            {measurements.slice(-20).map((record) => {
              const current = number(record.data.value);
              const height = high === low ? 70 : 18 + ((current - low) / (high - low)) * 78;
              return <div key={record.id} title={`${current} ${unit}`} className="min-w-2 flex-1 rounded-t-lg bg-(--app-accent) opacity-75" style={{ height: `${height}%` }} />;
            })}
          </div>
        </Panel>
      )}
      <RecordList
        title="history"
        records={[...measurements].reverse()}
        render={(record) => <><span>{text(record.data.note) || dateLabel(record.data.date)}</span><strong>{number(record.data.value)} {unit}</strong></>}
        onDelete={(record) => mutate(() => deleteGeneratedAppRecord({ publicId: app.public_id, recordId: record.id }))}
        busy={busy}
      />
    </div>
  );
}

function ChecklistApp({ app, mutate, busy }: TemplateProps) {
  const items = app.records.filter((record) => record.kind === "item");
  const completed = items.filter((record) => record.data.completed === true).length;
  const [item, setItem] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await mutate(() => addGeneratedAppRecord({ publicId: app.public_id, kind: "item", data: { text: item, completed: false } }))) setItem("");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="done" value={`${completed} of ${items.length}`} />
        <Stat label="progress" value={items.length ? `${Math.round((completed / items.length) * 100)}%` : "0%"} />
      </div>
      <Progress value={items.length ? (completed / items.length) * 100 : 0} />
      <Panel title="the list">
        <form onSubmit={submit} className="flex gap-2">
          <input value={item} onChange={(event) => setItem(event.target.value)} placeholder="add something…" required className="app-input min-w-0 flex-1" />
          <button disabled={busy} className="app-primary grid size-12 place-items-center rounded-2xl"><Plus className="size-4" /></button>
        </form>
        <div className="mt-4 space-y-2">
          {items.map((record) => {
            const done = record.data.completed === true;
            return (
              <div key={record.id} className="group flex items-center gap-3 rounded-2xl bg-(--app-soft) px-3 py-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate(() => updateGeneratedAppRecord({ publicId: app.public_id, recordId: record.id, data: { completed: !done } }))}
                  className={`grid size-7 shrink-0 place-items-center rounded-full border ${done ? "border-(--app-accent) bg-(--app-accent) text-white" : "border-black/13 bg-white"}`}
                >
                  {done && <Check className="size-3.5" />}
                </button>
                <span className={`min-w-0 flex-1 text-sm ${done ? "text-black/35 line-through" : "text-black/68"}`}>{text(record.data.text)}</span>
                <DeleteButton busy={busy} onClick={() => void mutate(() => deleteGeneratedAppRecord({ publicId: app.public_id, recordId: record.id }))} />
              </div>
            );
          })}
          {!items.length && <p className="py-4 text-center text-sm text-black/38">nothing here yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[28px] border border-black/7 bg-white/72 p-5 shadow-[0_15px_55px_rgba(40,32,24,0.045)] sm:p-6"><h2 className="mb-5 text-lg font-semibold tracking-tight">{title}</h2>{children}</section>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-[24px] border border-black/7 bg-white/72 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-black/35">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-red-700" : ""}`}>{value}</p></div>;
}

function Progress({ value, compact = false }: { value: number; compact?: boolean }) {
  return <div className={`${compact ? "mt-2 h-1.5" : "h-3"} overflow-hidden rounded-full bg-black/6`}><div className="h-full rounded-full bg-(--app-accent) transition-all" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} /></div>;
}

function Input({ label, value, onChange, type = "text", placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="text-xs font-semibold text-black/48"><span className="mb-2 block">{label}</span><input type={type} step={type === "number" ? "any" : undefined} min={type === "number" ? "0" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className="app-input w-full" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="text-xs font-semibold text-black/48"><span className="mb-2 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="app-input w-full">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return <button disabled={busy} className="app-primary flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold sm:self-end">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{label}</button>;
}

function DeleteButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return <button type="button" disabled={busy} onClick={onClick} aria-label="Delete" className="grid size-8 shrink-0 place-items-center rounded-full text-black/24 transition hover:bg-red-500/8 hover:text-red-600"><Trash2 className="size-3.5" /></button>;
}

function RecordList({ title, records, render, onDelete, busy }: { title: string; records: GeneratedAppRecord[]; render: (record: GeneratedAppRecord) => React.ReactNode; onDelete: (record: GeneratedAppRecord) => void; busy: boolean }) {
  if (!records.length) return null;
  return <Panel title={title}><div className="space-y-2">{records.map((record) => <div key={record.id} className="flex items-center gap-3 rounded-2xl bg-(--app-soft) px-4 py-3 text-sm"><div className="flex min-w-0 flex-1 items-center justify-between gap-4">{render(record)}</div><DeleteButton busy={busy} onClick={() => onDelete(record)} /></div>)}</div></Panel>;
}
