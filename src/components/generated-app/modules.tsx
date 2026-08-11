"use client";

import {
  Check,
  LoaderCircle,
  MapPin,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";

import type { GeneratedAppDetail, GeneratedAppRecord } from "@/lib/api";

import styles from "./generated-app.module.css";
import {
  booleanValue,
  moduleAnchor,
  numberValue,
  objectList,
  primaryRecordKind,
  recordsForModule,
  RuntimeModule,
  stringValue,
} from "./model";

export type ModuleActions = {
  busy: boolean;
  add: (
    module: RuntimeModule,
    kind: string,
    data: Record<string, unknown>,
    actorName?: string,
  ) => Promise<boolean>;
  update: (record: GeneratedAppRecord, data: Record<string, unknown>) => Promise<boolean>;
  remove: (record: GeneratedAppRecord) => Promise<boolean>;
};

type ModuleRendererProps = {
  app: GeneratedAppDetail;
  module: RuntimeModule;
  modules: RuntimeModule[];
  index: number;
  actions: ModuleActions;
};

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
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

function dateLabel(value: unknown, options?: Intl.DateTimeFormatOptions) {
  const raw = stringValue(value);
  if (!raw) return "";
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric" }).format(date);
}

function timeLabel(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return "";
  const [hour = "0", minute = "0"] = raw.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recordDate(record: GeneratedAppRecord) {
  return stringValue(record.data.date) || record.created_at;
}

export function GeneratedAppModuleRenderer(props: ModuleRendererProps) {
  return {
    overview: <OverviewModule {...props} />,
    todos: <TodosModule {...props} />,
    guests: <GuestsModule {...props} />,
    planner: <PlannerModule {...props} />,
    expenses: <ExpensesModule {...props} />,
    split: <SplitModule {...props} />,
    metric: <MetricModule {...props} />,
    notes: <NotesModule {...props} />,
    collection: <CollectionModule {...props} />,
    unknown: <UnknownModule {...props} />,
  }[props.module.type];
}

function ModuleFrame({
  module,
  index,
  action,
  children,
}: {
  module: RuntimeModule;
  index: number;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  return (
    <section id={moduleAnchor(module)} className={styles.module} data-module-id={module.id}>
      <header className={styles.moduleHeader}>
        <span className={styles.moduleNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h2 className={styles.moduleTitle}>{module.title}</h2>
          {module.description && <p className={styles.moduleDescription}>{module.description}</p>}
        </div>
        {action && (
          <button
            type="button"
            className={`${styles.smallButton} ${styles.moduleAction}`}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <Plus size={14} strokeWidth={2} />
            {action.label}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function FormSurface({
  title,
  children,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  title: string;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel: string;
}) {
  return (
    <form className={styles.formSurface} onSubmit={onSubmit}>
      <p className={styles.formTitle}>{title}</p>
      <div className={styles.formGrid}>
        {children}
        <div className={styles.formActions}>
          <button type="button" className={styles.textButton} onClick={onCancel} disabled={busy}>
            cancel
          </button>
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ""}`}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

function DeleteButton({ record, actions }: { record: GeneratedAppRecord; actions: ModuleActions }) {
  const recordLabel = [
    record.data.text,
    record.data.name,
    record.data.title,
    record.data.note,
    record.data.description,
    record.data.category,
  ].map((value) => stringValue(value)).find(Boolean) || humanize(record.kind);
  return (
    <button
      type="button"
      className={styles.deleteButton}
      aria-label={`Delete ${recordLabel}`}
      disabled={actions.busy}
      onClick={() => void actions.remove(record)}
    >
      <Trash2 size={14} />
    </button>
  );
}

function Stats({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className={styles.stats}>
      {items.map((item) => (
        <div className={styles.stat} key={item.label}>
          <p className={styles.statLabel}>{item.label}</p>
          <p className={styles.statValue}>{item.value}</p>
          {item.hint && <p className={styles.statHint}>{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  const current = Math.max(0, Math.min(value, 100));
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-label="Progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(current)}
    >
      <div
        className={styles.progressFill}
        style={{ width: `${current}%` }}
      />
    </div>
  );
}

function OverviewModule({ app, module, modules, index }: ModuleRendererProps) {
  const facts = objectList(module.settings.facts);
  const rollups = modules
    .filter((candidate) => candidate.id !== module.id)
    .flatMap((candidate) => {
      const records = recordsForModule(app, candidate, modules);
      if (candidate.type === "todos") {
        const open = records.filter((record) => record.data.completed !== true).length;
        return [{ label: candidate.title, value: `${open}`, hint: open === 1 ? "open item" : "open items" }];
      }
      if (candidate.type === "guests") {
        const going = records
          .filter((record) => record.data.status === "going")
          .reduce((sum, record) => sum + Math.max(1, numberValue(record.data.party_size, 1)), 0);
        return [{ label: candidate.title, value: `${going}`, hint: "confirmed" }];
      }
      if (candidate.type === "planner") {
        return [{ label: candidate.title, value: `${records.length}`, hint: records.length === 1 ? "plan" : "plans" }];
      }
      if (candidate.type === "expenses" || candidate.type === "split") {
        const currency = stringValue(candidate.settings.currency, "USD");
        const total = records
          .filter((record) => record.kind === "expense")
          .reduce((sum, record) => sum + numberValue(record.data.amount), 0);
        return [{ label: candidate.title, value: money(total, currency), hint: "logged" }];
      }
      if (candidate.type === "metric") {
        const latest = records.filter((record) => record.kind === "measurement").at(-1);
        return latest
          ? [{
              label: candidate.title,
              value: `${numberValue(latest.data.value)} ${stringValue(candidate.settings.unit)}`.trim(),
              hint: "latest",
            }]
          : [];
      }
      if (candidate.type === "notes") {
        return [{ label: candidate.title, value: `${records.length}`, hint: records.length === 1 ? "note" : "notes" }];
      }
      if (candidate.type === "collection") {
        return [{ label: candidate.title, value: `${records.length}`, hint: records.length === 1 ? "entry" : "entries" }];
      }
      return [];
    })
    .slice(0, 4);
  const body = stringValue(module.settings.body) || module.description || app.description;

  return (
    <ModuleFrame module={module} index={index}>
      <div className={`${styles.overviewLayout} ${facts.length ? "" : styles.overviewWide}`}>
        <div>
          {body && <p className={styles.overviewBody}>{body}</p>}
          {rollups.length > 0 && <div style={{ marginTop: "2.5rem" }}><Stats items={rollups} /></div>}
        </div>
        {facts.length > 0 && (
          <div className={styles.facts}>
            {facts.map((fact, factIndex) => (
              <div className={styles.fact} key={`${stringValue(fact.label)}-${factIndex}`}>
                <span className={styles.factLabel}>{stringValue(fact.label, "Detail")}</span>
                <span className={styles.factValue}>{stringValue(fact.value, "—")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModuleFrame>
  );
}

function TodosModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const [showForm, setShowForm] = useState(false);
  const [item, setItem] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("normal");
  const complete = records.filter((record) => record.data.completed === true).length;
  const showCompleted = booleanValue(module.settings.show_completed, true);
  const visibleRecords = showCompleted
    ? records
    : records.filter((record) => record.data.completed !== true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await actions.add(module, primaryRecordKind(module), {
      text: item,
      completed: false,
      due_date: dueDate || null,
      assignee: assignee || null,
      priority,
    });
    if (saved) {
      setItem("");
      setDueDate("");
      setAssignee("");
      setPriority("normal");
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add item", onClick: () => setShowForm(true), disabled: showForm }}
    >
      <Stats
        items={[
          { label: "open", value: `${records.length - complete}` },
          { label: "done", value: `${complete}` },
          {
            label: "progress",
            value: records.length ? `${Math.round((complete / records.length) * 100)}%` : "0%",
          },
        ]}
      />
      <div style={{ marginTop: "0.85rem" }}>
        <Progress value={records.length ? (complete / records.length) * 100 : 0} />
      </div>
      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <FormSurface
            title="New item"
            onSubmit={submit}
            onCancel={() => setShowForm(false)}
            busy={actions.busy}
            submitLabel="add item"
          >
            <Field label="What needs doing?" wide>
              <input
                className={styles.input}
                value={item}
                onChange={(event) => setItem(event.target.value)}
                autoFocus
                required
              />
            </Field>
            <Field label="Due date">
              <input className={styles.input} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
            <Field label="Assignee">
              <input className={styles.input} value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="optional" />
            </Field>
            <Field label="Priority">
              <select className={styles.select} value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
              </select>
            </Field>
          </FormSurface>
        </div>
      )}
      {visibleRecords.length ? (
        <div className={styles.list} style={{ marginTop: "1.5rem" }}>
          {visibleRecords.map((record) => {
            const done = record.data.completed === true;
            const meta = [
              dateLabel(record.data.due_date),
              stringValue(record.data.assignee),
              stringValue(record.data.priority) !== "normal" ? stringValue(record.data.priority) : "",
            ].filter(Boolean);
            return (
              <div className={styles.row} key={record.id}>
                <button
                  type="button"
                  aria-label={done ? "Mark incomplete" : "Mark complete"}
                  className={`${styles.check} ${done ? styles.checkDone : ""}`}
                  disabled={actions.busy}
                  onClick={() => void actions.update(record, { completed: !done })}
                >
                  {done && <Check size={13} />}
                </button>
                <div className={styles.rowMain}>
                  <p className={`${styles.rowTitle} ${done ? styles.completedText : ""}`}>
                    {stringValue(record.data.text)}
                  </p>
                  {meta.length > 0 && <p className={styles.rowMeta}>{meta.map((item) => <span key={item}>{item}</span>)}</p>}
                </div>
                <DeleteButton record={record} actions={actions} />
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>{records.length ? "Everything is done." : "Nothing on the list yet."}</Empty>
      )}
    </ModuleFrame>
  );
}

const guestStatuses = ["invited", "going", "maybe", "declined"] as const;

function GuestsModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<(typeof guestStatuses)[number]>("invited");
  const [partySize, setPartySize] = useState("1");
  const [note, setNote] = useState("");
  const going = records.filter((record) => record.data.status === "going");
  const headcount = going.reduce(
    (sum, record) => sum + Math.max(1, numberValue(record.data.party_size, 1)),
    0,
  );
  const maximumPartySize = booleanValue(module.settings.allow_plus_ones) ? 20 : 1;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await actions.add(module, primaryRecordKind(module), {
      name,
      status,
      party_size: Math.max(1, Number(partySize)),
      note,
    });
    if (saved) {
      setName("");
      setStatus("invited");
      setPartySize("1");
      setNote("");
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add guest", onClick: () => setShowForm(true), disabled: showForm }}
    >
      <Stats
        items={[
          { label: "invited", value: `${records.length}` },
          { label: "going", value: `${going.length}` },
          { label: "headcount", value: `${headcount}` },
          { label: "maybe", value: `${records.filter((record) => record.data.status === "maybe").length}` },
        ]}
      />
      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <FormSurface title="New guest" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="add guest">
            <Field label="Name">
              <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
            </Field>
            <Field label="RSVP">
              <select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as (typeof guestStatuses)[number])}>
                {guestStatuses.map((option) => <option value={option} key={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Party size">
              <input className={styles.input} type="number" min="1" max={maximumPartySize} value={partySize} onChange={(event) => setPartySize(event.target.value)} required />
            </Field>
            <Field label="Note">
              <input className={styles.input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
            </Field>
          </FormSurface>
        </div>
      )}
      {records.length ? (
        <div className={styles.list} style={{ marginTop: "1.5rem" }}>
          {records.map((record) => (
            <div className={styles.row} key={record.id}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{stringValue(record.data.name)}</p>
                <p className={styles.rowMeta}>
                  <span>{numberValue(record.data.party_size, 1)} {numberValue(record.data.party_size, 1) === 1 ? "person" : "people"}</span>
                  {stringValue(record.data.note) && <span>{stringValue(record.data.note)}</span>}
                </p>
              </div>
              <div className={styles.statusGroup} aria-label={`RSVP status for ${stringValue(record.data.name)}`}>
                {guestStatuses.map((option) => (
                  <button
                    type="button"
                    key={option}
                    title={option}
                    aria-label={`Mark ${option}`}
                    aria-pressed={record.data.status === option}
                    className={`${styles.statusButton} ${record.data.status === option ? styles.statusButtonActive : ""}`}
                    disabled={actions.busy}
                    onClick={() => void actions.update(record, { status: option })}
                  >
                    {option === "invited" ? "invite" : option}
                  </button>
                ))}
              </div>
              <DeleteButton record={record} actions={actions} />
            </div>
          ))}
        </div>
      ) : (
        <Empty>No guests yet. Add the first person when you’re ready.</Empty>
      )}
    </ModuleFrame>
  );
}

function PlannerModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const sorted = [...records].sort((a, b) => {
    const aKey = `${stringValue(a.data.date, "9999")}-${stringValue(a.data.start_time, "99:99")}`;
    const bKey = `${stringValue(b.data.date, "9999")}-${stringValue(b.data.start_time, "99:99")}`;
    return aKey.localeCompare(bKey);
  });
  const days = new Set(records.map((record) => stringValue(record.data.date)).filter(Boolean)).size;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await actions.add(module, primaryRecordKind(module), {
      title,
      date: date || null,
      start_time: startTime || null,
      end_time: endTime || null,
      location,
      note,
      completed: false,
    });
    if (saved) {
      setTitle("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setNote("");
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add plan", onClick: () => setShowForm(true), disabled: showForm }}
    >
      <Stats
        items={[
          { label: "plans", value: `${records.length}` },
          { label: "days", value: `${days}` },
          { label: "done", value: `${records.filter((record) => record.data.completed === true).length}` },
        ]}
      />
      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <FormSurface title="New plan" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="add to plan">
            <Field label="What’s happening?" wide>
              <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required />
            </Field>
            <Field label="Date">
              <input className={styles.input} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Location">
              <input className={styles.input} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="optional" />
            </Field>
            <Field label="Starts">
              <input className={styles.input} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label="Ends">
              <input className={styles.input} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </Field>
            <Field label="Note" wide>
              <input className={styles.input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
            </Field>
          </FormSurface>
        </div>
      )}
      {sorted.length ? (
        <div className={styles.timeline} style={{ marginTop: "1.75rem" }}>
          {sorted.map((record) => {
            const done = record.data.completed === true;
            const times = [timeLabel(record.data.start_time), timeLabel(record.data.end_time)].filter(Boolean).join(" – ");
            return (
              <article className={styles.timelineItem} key={record.id}>
                <div className={styles.timelineTime}>
                  {[dateLabel(record.data.date, { weekday: "short", month: "short", day: "numeric" }), times].filter(Boolean).join(" · ") || "Time open"}
                </div>
                <div className={styles.noteHeader}>
                  <div>
                    <h3 className={`${styles.timelineTitle} ${done ? styles.completedText : ""}`}>{stringValue(record.data.title)}</h3>
                    {stringValue(record.data.location) && (
                      <p className={styles.rowMeta}><MapPin size={12} /> {stringValue(record.data.location)}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                      type="button"
                      className={`${styles.check} ${done ? styles.checkDone : ""}`}
                      aria-label={done ? "Mark incomplete" : "Mark complete"}
                      disabled={actions.busy}
                      onClick={() => void actions.update(record, { completed: !done })}
                    >
                      {done && <Check size={13} />}
                    </button>
                    <DeleteButton record={record} actions={actions} />
                  </div>
                </div>
                {stringValue(record.data.note) && <p className={styles.timelineNote}>{stringValue(record.data.note)}</p>}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>The plan is wide open.</Empty>
      )}
    </ModuleFrame>
  );
}

function ExpensesModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const expenses = records.filter((record) => record.kind === "expense");
  const participants = records.filter((record) => record.kind === "participant");
  const names = participants.map((record) => stringValue(record.data.name)).filter(Boolean);
  const currency = stringValue(module.settings.currency, "USD").toUpperCase();
  const target = numberValue(module.settings.budget ?? module.settings.monthly_budget);
  const mode = stringValue(module.settings.mode, "personal");
  const total = expenses.reduce((sum, record) => sum + numberValue(record.data.amount), 0);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState("");
  const [participant, setParticipant] = useState("");
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((totals, record) => {
      const key = stringValue(record.data.category, "other");
      totals[key] = (totals[key] ?? 0) + numberValue(record.data.amount);
      return totals;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      amount: Number(amount),
      category,
      note,
      date,
    };
    if (!module.legacy) {
      payload.paid_by = mode === "split" ? (paidBy || names[0] || null) : null;
      payload.split_between = mode === "split" ? names : [];
    }
    const saved = await actions.add(module, "expense", payload, stringValue(payload.paid_by));
    if (saved) {
      setAmount("");
      setNote("");
      setShowForm(false);
    }
  }

  async function addParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await actions.add(module, "participant", { name: participant })) setParticipant("");
  }

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add expense", onClick: () => setShowForm(true), disabled: showForm || (mode === "split" && names.length === 0) }}
    >
      <Stats
        items={[
          { label: "spent", value: money(total, currency) },
          { label: target ? "budget" : "entries", value: target ? money(target, currency) : `${expenses.length}` },
          { label: target && total > target ? "over" : "left", value: target ? money(Math.abs(target - total), currency) : "—" },
        ]}
      />
      {target > 0 && <div style={{ marginTop: "0.85rem" }}><Progress value={(total / target) * 100} /></div>}
      {mode === "split" && (
        <div className={styles.formSurface} style={{ marginTop: "1.5rem" }}>
          <p className={styles.formTitle}>People splitting</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.85rem" }}>
            {participants.map((record) => (
              <span className={styles.participantBadge} key={record.id}>
                {stringValue(record.data.name)}
                <button
                  type="button"
                  className={styles.participantRemove}
                  aria-label={`Remove ${stringValue(record.data.name)}`}
                  disabled={actions.busy}
                  onClick={() => void actions.remove(record)}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
            {!participants.length && <span className={styles.rowMeta}>Add at least one person.</span>}
          </div>
          <form onSubmit={addParticipant} style={{ display: "flex", gap: "0.5rem" }}>
            <input className={styles.input} value={participant} onChange={(event) => setParticipant(event.target.value)} placeholder="name" required />
            <button className={styles.primaryButton} disabled={actions.busy}>add</button>
          </form>
        </div>
      )}
      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <FormSurface title="New expense" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="add expense">
            <Field label={`Amount (${currency})`}>
              <input className={styles.input} type="number" min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required />
            </Field>
            <Field label="Category">
              <input className={styles.input} value={category} onChange={(event) => setCategory(event.target.value)} required />
            </Field>
            <Field label="Note">
              <input className={styles.input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
            </Field>
            <Field label="Date">
              <input className={styles.input} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </Field>
            {mode === "split" && (
              <Field label="Paid by">
                <select className={styles.select} value={paidBy || names[0] || ""} onChange={(event) => setPaidBy(event.target.value)}>
                  {names.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
              </Field>
            )}
          </FormSurface>
        </div>
      )}
      {byCategory.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          {byCategory.map(([name, value]) => (
            <div className={styles.fact} key={name}>
              <span className={styles.factLabel}>{name}</span>
              <span className={styles.factValue}>{money(value, currency)}</span>
            </div>
          ))}
        </div>
      )}
      {expenses.length ? (
        <div className={styles.list} style={{ marginTop: "1.5rem" }}>
          {[...expenses].reverse().map((record) => (
            <div className={styles.row} key={record.id}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{stringValue(record.data.note) || stringValue(record.data.category, "Expense")}</p>
                <p className={styles.rowMeta}>
                  <span>{dateLabel(record.data.date)}</span>
                  {stringValue(record.data.category) && <span>{stringValue(record.data.category)}</span>}
                  {stringValue(record.data.paid_by) && <span>paid by {stringValue(record.data.paid_by)}</span>}
                </p>
              </div>
              <span className={styles.rowValue}>{money(numberValue(record.data.amount), currency)}</span>
              <DeleteButton record={record} actions={actions} />
            </div>
          ))}
        </div>
      ) : (
        <Empty>No expenses logged yet.</Empty>
      )}
    </ModuleFrame>
  );
}

function SplitModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const participants = records.filter((record) => record.kind === "participant");
  const expenses = records.filter((record) => record.kind === "expense");
  const names = participants.map((record) => stringValue(record.data.name)).filter(Boolean);
  const currency = stringValue(module.settings.currency, "USD").toUpperCase();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [date, setDate] = useState(today());
  const balances = (() => {
    const result = Object.fromEntries(names.map((participant) => [participant, 0]));
    for (const expense of expenses) {
      const payer = stringValue(expense.data.paid_by);
      const split = Array.isArray(expense.data.split_between)
        ? expense.data.split_between.map(String)
        : [];
      const value = numberValue(expense.data.amount);
      if (payer in result) result[payer] += value;
      for (const participant of split) {
        if (participant in result && split.length) result[participant] -= value / split.length;
      }
    }
    return result;
  })();

  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await actions.add(module, "participant", { name })) setName("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payer = names.includes(paidBy) ? paidBy : names[0];
    const data = module.legacy
      ? { amount: Number(amount), description, paid_by: payer, split_between: names, date }
      : {
          amount: Number(amount),
          category: "shared",
          note: description,
          date,
          paid_by: payer,
          split_between: names,
        };
    const saved = await actions.add(module, "expense", data, payer);
    if (saved) {
      setAmount("");
      setDescription("");
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add expense", onClick: () => setShowForm(true), disabled: showForm || names.length === 0 }}
    >
      <div className={styles.formSurface}>
        <p className={styles.formTitle}>The group</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.85rem" }}>
          {participants.map((record) => (
            <span className={styles.participantBadge} key={record.id}>
              {stringValue(record.data.name)}
              <button
                type="button"
                className={styles.participantRemove}
                aria-label={`Remove ${stringValue(record.data.name)}`}
                disabled={actions.busy}
                onClick={() => void actions.remove(record)}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {!participants.length && <span className={styles.rowMeta}>Add everyone who’s splitting.</span>}
        </div>
        <form onSubmit={addPerson} style={{ display: "flex", gap: "0.5rem" }}>
          <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="name" required />
          <button className={styles.primaryButton} disabled={actions.busy}>add</button>
        </form>
      </div>
      {showForm && (
        <FormSurface title="New shared expense" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="split it">
          <Field label={`Amount (${currency})`}>
            <input className={styles.input} type="number" min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required />
          </Field>
          <Field label="Paid by">
            <select className={styles.select} value={paidBy || names[0] || ""} onChange={(event) => setPaidBy(event.target.value)}>
              {names.map((person) => <option key={person} value={person}>{person}</option>)}
            </select>
          </Field>
          <Field label="What was it?">
            <input className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} required />
          </Field>
          <Field label="Date">
            <input className={styles.input} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </Field>
        </FormSurface>
      )}
      {expenses.length > 0 && (
        <>
          <div className={styles.facts} style={{ marginTop: "1.75rem" }}>
            {Object.entries(balances).map(([person, balance]) => (
              <div className={styles.fact} key={person}>
                <span className={styles.factLabel}>{person}</span>
                <span className={styles.factValue}>{balance >= 0 ? "gets" : "owes"} {money(Math.abs(balance), currency)}</span>
              </div>
            ))}
          </div>
          <div className={styles.list} style={{ marginTop: "1.5rem" }}>
            {[...expenses].reverse().map((record) => (
              <div className={styles.row} key={record.id}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{stringValue(record.data.description) || stringValue(record.data.note)}</p>
                  <p className={styles.rowMeta}>paid by {stringValue(record.data.paid_by)} · {dateLabel(record.data.date)}</p>
                </div>
                <span className={styles.rowValue}>{money(numberValue(record.data.amount), currency)}</span>
                <DeleteButton record={record} actions={actions} />
              </div>
            ))}
          </div>
        </>
      )}
      {!expenses.length && <Empty>No shared expenses yet.</Empty>}
    </ModuleFrame>
  );
}

function MetricModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules).filter((record) => record.kind === "measurement");
  const unit = stringValue(module.settings.unit, "units");
  const target = numberValue(module.settings.target);
  const hasTarget = typeof module.settings.target === "number";
  const latest = records.at(-1);
  const first = records[0];
  const [showForm, setShowForm] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const values = records.map((record) => numberValue(record.data.value));
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await actions.add(module, primaryRecordKind(module), { value: Number(value), note, date });
    if (saved) {
      setValue("");
      setNote("");
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame module={module} index={index} action={{ label: "log value", onClick: () => setShowForm(true), disabled: showForm }}>
      <Stats
        items={[
          { label: "latest", value: latest ? `${numberValue(latest.data.value)} ${unit}` : "—" },
          { label: "goal", value: hasTarget ? `${target} ${unit}` : "not set" },
          { label: "change", value: latest && first ? `${(numberValue(latest.data.value) - numberValue(first.data.value)).toFixed(1)} ${unit}` : "—" },
        ]}
      />
      {showForm && (
        <div style={{ marginTop: "1.5rem" }}>
          <FormSurface title="New measurement" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="log it">
            <Field label={humanize(unit)}>
              <input className={styles.input} type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} autoFocus required />
            </Field>
            <Field label="Date">
              <input className={styles.input} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </Field>
            <Field label="Note" wide>
              <input className={styles.input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="optional" />
            </Field>
          </FormSurface>
        </div>
      )}
      {records.length > 0 ? (
        <>
          <div className={styles.bars} style={{ marginTop: "1.5rem" }}>
            {records.slice(-24).map((record) => {
              const current = numberValue(record.data.value);
              const height = high === low ? 65 : 18 + ((current - low) / (high - low)) * 82;
              return <div className={styles.bar} key={record.id} title={`${current} ${unit}`} style={{ height: `${height}%` }} />;
            })}
          </div>
          <div className={styles.list} style={{ marginTop: "1.5rem" }}>
            {[...records].reverse().map((record) => (
              <div className={styles.row} key={record.id}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>{stringValue(record.data.note) || dateLabel(record.data.date)}</p>
                  {stringValue(record.data.note) && <p className={styles.rowMeta}>{dateLabel(record.data.date)}</p>}
                </div>
                <span className={styles.rowValue}>{numberValue(record.data.value)} {unit}</span>
                <DeleteButton record={record} actions={actions} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <Empty>No measurements yet.</Empty>
      )}
    </ModuleFrame>
  );
}

function NotesModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const sorted = [...records].sort((a, b) => Number(b.data.pinned === true) - Number(a.data.pinned === true));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await actions.add(module, primaryRecordKind(module), { title, body, pinned });
    if (saved) {
      setTitle("");
      setBody("");
      setPinned(false);
      setShowForm(false);
    }
  }

  return (
    <ModuleFrame module={module} index={index} action={{ label: "add note", onClick: () => setShowForm(true), disabled: showForm }}>
      {showForm && (
        <FormSurface title="New note" onSubmit={submit} onCancel={() => setShowForm(false)} busy={actions.busy} submitLabel="save note">
          <Field label="Title" wide>
            <input className={styles.input} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required />
          </Field>
          <Field label="Note" wide>
            <textarea className={styles.textarea} value={body} onChange={(event) => setBody(event.target.value)} required />
          </Field>
          <Field label="Pin it">
            <select className={styles.select} value={pinned ? "yes" : "no"} onChange={(event) => setPinned(event.target.value === "yes")}>
              <option value="no">no</option>
              <option value="yes">yes</option>
            </select>
          </Field>
        </FormSurface>
      )}
      {sorted.length ? (
        <div className={styles.noteGrid}>
          {sorted.map((record) => {
            const isPinned = record.data.pinned === true;
            return (
              <article className={`${styles.note} ${isPinned ? styles.notePinned : ""}`} key={record.id}>
                <div className={styles.noteHeader}>
                  <h3 className={styles.rowTitle}>{stringValue(record.data.title)}</h3>
                  <div style={{ display: "flex", gap: "0.15rem" }}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={isPinned ? "Unpin note" : "Pin note"}
                      disabled={actions.busy}
                      onClick={() => void actions.update(record, { pinned: !isPinned })}
                    >
                      <Pin size={13} fill={isPinned ? "currentColor" : "none"} />
                    </button>
                    <DeleteButton record={record} actions={actions} />
                  </div>
                </div>
                <p className={styles.noteBody}>{stringValue(record.data.body)}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>No notes yet.</Empty>
      )}
    </ModuleFrame>
  );
}

type CollectionField = {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "date" | "time" | "select" | "boolean";
  required: boolean;
  options: string[];
};

function collectionFields(module: RuntimeModule): CollectionField[] {
  const allowed = new Set(["text", "number", "currency", "date", "time", "select", "boolean"]);
  const seen = new Set<string>();
  return objectList(module.settings.fields)
    .slice(0, 12)
    .flatMap((field) => {
      const key = stringValue(field.key).trim();
      const rawType = stringValue(field.type, "text");
      if (!key || seen.has(key) || !allowed.has(rawType)) return [];
      seen.add(key);
      return [{
        key,
        label: stringValue(field.label) || humanize(key),
        type: rawType as CollectionField["type"],
        required: field.required === true,
        options: Array.isArray(field.options)
          ? field.options.filter((option): option is string => typeof option === "string").slice(0, 20)
          : [],
      }];
    });
}

function collectionValue(field: CollectionField, value: unknown, currency: string) {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "boolean") return value === true ? "yes" : "no";
  if (field.type === "currency") {
    if (currency) return money(numberValue(value), currency);
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numberValue(value));
  }
  if (field.type === "date") return dateLabel(value);
  if (field.type === "time") return timeLabel(value);
  return String(value ?? "");
}

function CollectionModule({ app, module, modules, index, actions }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const fields = collectionFields(module);
  const display = ["list", "table", "cards"].includes(stringValue(module.settings.display))
    ? stringValue(module.settings.display)
    : "list";
  const collectionCurrency = stringValue(module.settings.currency).toUpperCase();
  const configuredPrimary = stringValue(module.settings.primary_field);
  const primaryField = fields.find((field) => field.key === configuredPrimary) ?? fields[0];
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GeneratedAppRecord>();
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  function openNew() {
    setEditing(undefined);
    setValues(Object.fromEntries(fields.map((field) => [
      field.key,
      field.type === "boolean"
        ? false
        : field.type === "select" && field.required
          ? (field.options[0] ?? "")
          : "",
    ])));
    setShowForm(true);
  }

  function openEdit(record: GeneratedAppRecord) {
    setEditing(record);
    setValues(Object.fromEntries(fields.map((field) => [
      field.key,
      field.type === "boolean" ? record.data[field.key] === true : String(record.data[field.key] ?? ""),
    ])));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (field.type === "boolean") {
        data[field.key] = raw === true;
        continue;
      }
      if (raw === "" && !field.required) {
        if (editing) data[field.key] = null;
        continue;
      }
      if (field.type === "number" || field.type === "currency") {
        data[field.key] = Number(raw);
        continue;
      }
      data[field.key] = raw;
    }
    const saved = editing
      ? await actions.update(editing, data)
      : await actions.add(module, "entry", data);
    if (saved) closeForm();
  }

  const controls = (record: GeneratedAppRecord) => (
    <div style={{ display: "flex", gap: "0.15rem" }}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Edit"
        disabled={actions.busy}
        onClick={() => openEdit(record)}
      >
        <Pencil size={13} />
      </button>
      <DeleteButton record={record} actions={actions} />
    </div>
  );

  return (
    <ModuleFrame
      module={module}
      index={index}
      action={{ label: "add entry", onClick: openNew, disabled: showForm || fields.length === 0 }}
    >
      {showForm && (
        <FormSurface
          title={editing ? "Edit entry" : "New entry"}
          onSubmit={submit}
          onCancel={closeForm}
          busy={actions.busy}
          submitLabel={editing ? "save changes" : "add entry"}
        >
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.type === "select" ? (
                <select
                  className={styles.select}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  required={field.required}
                >
                  {!field.required && <option value="">none</option>}
                  {field.options.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              ) : field.type === "boolean" ? (
                <select
                  className={styles.select}
                  value={values[field.key] === true ? "yes" : "no"}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value === "yes" }))}
                >
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              ) : (
                <input
                  className={styles.input}
                  type={field.type === "currency" ? "number" : field.type}
                  step={["number", "currency"].includes(field.type) ? "any" : undefined}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  required={field.required}
                />
              )}
            </Field>
          ))}
        </FormSurface>
      )}
      {!fields.length && <Empty>This collection needs at least one configured field.</Empty>}
      {fields.length > 0 && !records.length && !showForm && <Empty>No entries yet.</Empty>}
      {fields.length > 0 && records.length > 0 && display === "list" && (
        <div className={styles.list}>
          {records.map((record) => (
            <div className={styles.row} key={record.id}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{(primaryField ? collectionValue(primaryField, record.data[primaryField.key], collectionCurrency) : "") || "Entry"}</p>
                <p className={styles.rowMeta}>
                  {fields.filter((field) => field.key !== primaryField?.key).slice(0, 3).map((field) => (
                    <span key={field.key}>{field.label}: {collectionValue(field, record.data[field.key], collectionCurrency)}</span>
                  ))}
                </p>
              </div>
              {controls(record)}
            </div>
          ))}
        </div>
      )}
      {fields.length > 0 && records.length > 0 && display === "cards" && (
        <div className={styles.noteGrid}>
          {records.map((record) => (
            <article className={styles.note} key={record.id}>
              <div className={styles.noteHeader}>
                <h3 className={styles.rowTitle}>{(primaryField ? collectionValue(primaryField, record.data[primaryField.key], collectionCurrency) : "") || "Entry"}</h3>
                {controls(record)}
              </div>
              <div className={styles.facts} style={{ marginTop: "1rem" }}>
                {fields.filter((field) => field.key !== primaryField?.key).map((field) => (
                  <div className={styles.fact} key={field.key}>
                    <span className={styles.factLabel}>{field.label}</span>
                    <span className={styles.factValue}>{collectionValue(field, record.data[field.key], collectionCurrency) || "—"}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {fields.length > 0 && records.length > 0 && display === "table" && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}<th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  {fields.map((field) => (
                    <td key={field.key} data-label={field.label}>
                      {collectionValue(field, record.data[field.key], collectionCurrency) || "—"}
                    </td>
                  ))}
                  <td data-label="Actions">{controls(record)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleFrame>
  );
}

function UnknownModule({ app, module, modules, index }: ModuleRendererProps) {
  const records = recordsForModule(app, module, modules);
  const entries = Object.entries(module.settings).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  );
  return (
    <ModuleFrame module={module} index={index}>
      {entries.length > 0 && (
        <div className={styles.facts}>
          {entries.map(([key, value]) => (
            <div className={styles.unknownData} key={key}>
              <span className={styles.factLabel}>{humanize(key)}</span>
              <span className={styles.factValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
      {records.length > 0 && (
        <div className={styles.list} style={{ marginTop: "1.5rem" }}>
          {records.map((record) => (
            <div className={styles.row} key={record.id}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{humanize(record.kind)}</p>
                <p className={styles.rowMeta}>{dateLabel(recordDate(record))}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {!entries.length && !records.length && <Empty>This section is ready for its first update.</Empty>}
    </ModuleFrame>
  );
}
