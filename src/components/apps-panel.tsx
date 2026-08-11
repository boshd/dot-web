"use client";

import {
  ArrowUpRight,
  CheckSquare2,
  CircleDollarSign,
  LoaderCircle,
  RefreshCw,
  Scale,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  BenjiApiError,
  GeneratedAppSummary,
  loadGeneratedApps,
} from "@/lib/api";

type AppsPanelProps = {
  phoneNumber?: string;
  getAuthToken?: () => string | undefined;
  onCreate: (prompt: string) => void;
};

const appIcon = {
  budget: CircleDollarSign,
  expense_splitter: UsersRound,
  metric_tracker: Scale,
  checklist: CheckSquare2,
};

const starters = [
  { label: "spending tracker", prompt: "make me a simple personal spending tracker" },
  { label: "split expenses", prompt: "make an expense splitter i can share with friends" },
  { label: "weight tracker", prompt: "make me a weight loss tracker" },
  { label: "shared checklist", prompt: "make me a simple checklist app" },
];

export function AppsPanel({ phoneNumber, getAuthToken, onCreate }: AppsPanelProps) {
  const [apps, setApps] = useState<GeneratedAppSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const catalog = await loadGeneratedApps({
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      setApps(catalog.apps);
    } catch (loadError) {
      setError(
        loadError instanceof BenjiApiError
          ? loadError.message
          : "Dot couldn’t load your apps.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [getAuthToken, phoneNumber]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--coral)">
              made for you
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
              your apps
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-black/48 sm:text-[15px]">
              Tiny tools Dot makes when a conversation needs more than text. They work on any
              phone and keep their data between visits.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh apps"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-black/8 bg-white/65 text-black/42 transition hover:bg-white disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="mt-7 rounded-2xl border border-(--danger)/15 bg-(--danger)/6 px-4 py-3 text-sm text-(--danger)">
            {error}
          </div>
        )}

        {isLoading && apps.length === 0 ? (
          <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="size-6 animate-spin text-(--coral)" />
          </div>
        ) : apps.length ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-[30px] border border-black/7 bg-white/65 p-6 sm:p-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-foreground text-white">
              <Sparkles className="size-5" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              ask dot to make one
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-black/48">
              Describe what you want in chat. Dot will pick the useful shape, create it, and
              give you a link.
            </p>
          </div>
        )}

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/34">
            quick starts
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {starters.map((starter) => (
              <button
                key={starter.label}
                type="button"
                onClick={() => onCreate(starter.prompt)}
                className="rounded-full border border-black/8 bg-white/70 px-4 py-2.5 text-xs font-semibold text-black/58 transition hover:-translate-y-0.5 hover:border-(--coral)/25 hover:bg-white hover:text-black"
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app }: { app: GeneratedAppSummary }) {
  const Icon = appIcon[app.template];
  return (
    <a
      href={app.app_url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-h-58 flex-col rounded-[28px] border border-black/7 bg-white/72 p-5 shadow-[0_12px_42px_rgba(45,37,28,0.045)] transition hover:-translate-y-0.5 hover:border-black/12 hover:bg-white sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`app-accent-${app.theme} grid size-12 place-items-center rounded-2xl text-white`}>
          <Icon className="size-5" />
        </div>
        <ArrowUpRight className="size-4 text-black/26 transition group-hover:text-black/55" />
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{app.title}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-black/48">
        {app.description || "A personal app made by Dot."}
      </p>
      <div className="mt-auto flex items-center justify-between pt-6 text-[11px] text-black/35">
        <span>{app.template.replaceAll("_", " ")}</span>
        <span>{app.access_mode === "collaborative_link" ? "shareable" : "private link"}</span>
      </div>
    </a>
  );
}
