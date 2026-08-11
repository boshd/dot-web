"use client";

import {
  ArrowUpRight,
  CheckSquare2,
  CircleDollarSign,
  RefreshCw,
  Scale,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  AuthToken,
  BenjiApiError,
  GeneratedAppSummary,
  loadGeneratedApps,
} from "@/lib/api";
import {
  Button,
  Eyebrow,
  LoadingState,
  Notice,
  PageIntro,
  Surface,
} from "@/components/dot-ui";

type AppsPanelProps = {
  phoneNumber?: string;
  getAuthToken?: () => AuthToken;
  onCreate: (prompt: string) => void;
};

const appIcon = {
  budget: CircleDollarSign,
  expense_splitter: UsersRound,
  metric_tracker: Scale,
  checklist: CheckSquare2,
  workspace: Sparkles,
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
    <div className="dot-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="dot-enter mx-auto max-w-6xl">
        <PageIntro
          eyebrow="made in conversation"
          title="Your apps"
          description="Small, useful tools Dot makes around your life. No setup maze, no new software to learn."
          action={
            <Button
              variant="secondary"
              size="icon"
              onClick={() => void load()}
              disabled={isLoading}
              aria-label="Refresh apps"
              title="Refresh apps"
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          }
        />

        {error && (
          <Notice tone="danger" className="mt-6">{error}</Notice>
        )}

        {isLoading && apps.length === 0 ? (
          <LoadingState label="loading your apps" />
        ) : apps.length ? (
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        ) : (
          <Surface className="mt-7 grid min-h-64 gap-8 p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8">
            <div>
              <Sparkles className="size-5 text-(--coral)" strokeWidth={1.7} />
              <h2 className="mt-16 max-w-md text-3xl font-normal leading-[1.02] tracking-[-0.045em]">
                Start with a sentence, not a template.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
                Tell Dot what would make life easier. It will shape the tool and send you the link.
              </p>
            </div>
            <Button onClick={() => onCreate("make me a simple app for something i need")}>ask dot</Button>
          </Surface>
        )}

        <section className="mt-12 border-t border-black/10 pt-7 sm:mt-16 sm:pt-9">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Eyebrow>quick starts</Eyebrow>
              <h2 className="mt-2 text-xl font-normal tracking-[-0.03em]">A few things Dot can make</h2>
            </div>
            <span className="hidden text-xs text-black/35 sm:block">opens in chat</span>
          </div>
          <div className="mt-5 grid gap-px overflow-hidden rounded-[15px] border border-black/10 bg-black/10 sm:grid-cols-2">
            {starters.map((starter) => (
              <button
                key={starter.label}
                type="button"
                onClick={() => onCreate(starter.prompt)}
                className="group flex min-h-16 items-center justify-between bg-white px-4 py-3 text-left text-sm text-muted transition hover:bg-[#fbfbf8] hover:text-black sm:px-5"
              >
                <span>{starter.label}</span>
                <ArrowUpRight className="size-4 text-black/25 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-black/55" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AppCard({ app }: { app: GeneratedAppSummary }) {
  const Icon = appIcon[app.template as keyof typeof appIcon] ?? Sparkles;
  return (
    <a
      href={app.app_url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-h-56 flex-col rounded-[16px] border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[var(--shadow-float)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`app-accent-${app.theme} grid size-9 place-items-center rounded-[10px] text-white`}>
          <Icon className="size-4" strokeWidth={1.8} />
        </div>
        <ArrowUpRight className="size-4 text-black/24 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-black/60" />
      </div>
      <h2 className="mt-7 text-xl font-medium tracking-[-0.03em]">{app.title}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
        {app.description || "A personal app made by Dot."}
      </p>
      <div className="mt-auto flex items-center justify-between border-t border-black/8 pt-4 text-[10px] uppercase tracking-[0.09em] text-black/34">
        <span>{app.template.replaceAll("_", " ")}</span>
        <span>{app.access_mode === "collaborative_link" ? "shareable" : "private link"}</span>
      </div>
    </a>
  );
}
