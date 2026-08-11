"use client";

import { Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addGeneratedAppRecord,
  BenjiApiError,
  deleteGeneratedAppRecord,
  GeneratedAppDetail,
  GeneratedAppRecord,
  loadPublicGeneratedApp,
  updateGeneratedAppRecord,
} from "@/lib/api";
import { DotMark } from "@/components/dot-ui";

import styles from "./generated-app/generated-app.module.css";
import { moduleAnchor, runtimeModules, RuntimeModule } from "./generated-app/model";
import {
  GeneratedAppModuleRenderer,
  ModuleActions,
} from "./generated-app/modules";

type AppMutation = () => Promise<GeneratedAppDetail>;

function updatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function GeneratedAppSurface({
  publicId,
  initialApp,
}: {
  publicId: string;
  initialApp?: GeneratedAppDetail | null;
}) {
  const [app, setApp] = useState<GeneratedAppDetail | undefined>(initialApp ?? undefined);
  const [isLoading, setIsLoading] = useState(!initialApp);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string>();
  const [shareLabel, setShareLabel] = useState("share");
  const modules = useMemo(() => (app ? runtimeModules(app) : []), [app]);
  const [activeModuleId, setActiveModuleId] = useState(modules[0]?.id ?? "");
  const navIsLocked = useRef(false);
  const navUnlockTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!initialApp) setIsLoading(true);
    setError(undefined);
    try {
      setApp(await loadPublicGeneratedApp(publicId));
    } catch (loadError) {
      if (!initialApp) {
        setError(
          loadError instanceof BenjiApiError
            ? loadError.message
            : "This app couldn’t be loaded.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [initialApp, publicId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), initialApp ? 500 : 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    return () => window.clearTimeout(timeout);
  }, [initialApp, load]);

  useEffect(() => {
    if (!modules.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (navIsLocked.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const moduleId = visible?.target.getAttribute("data-module-id");
        if (moduleId) setActiveModuleId(moduleId);
      },
      { rootMargin: "-20% 0px -60%", threshold: [0.05, 0.3, 0.7] },
    );
    for (const section of modules) {
      const element = document.getElementById(moduleAnchor(section));
      if (element) observer.observe(element);
    }
    const selectLastAtPageEnd = () => {
      if (navIsLocked.current) return;
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
        setActiveModuleId(modules.at(-1)?.id ?? "");
      }
    };
    window.addEventListener("scroll", selectLastAtPageEnd, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", selectLastAtPageEnd);
      if (navUnlockTimer.current) window.clearTimeout(navUnlockTimer.current);
    };
  }, [modules]);

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

  const actions: ModuleActions = {
    busy: isMutating,
    add: (module, kind, data, actorName) =>
      mutate(() =>
        addGeneratedAppRecord({
          publicId,
          moduleId: module.legacy ? undefined : module.id,
          kind,
          data,
          actorName,
        }),
      ),
    update: (record: GeneratedAppRecord, data) =>
      mutate(() => updateGeneratedAppRecord({ publicId, recordId: record.id, data })),
    remove: (record: GeneratedAppRecord) =>
      mutate(() => deleteGeneratedAppRecord({ publicId, recordId: record.id })),
  };

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

  function goToModule(module: RuntimeModule) {
    navIsLocked.current = true;
    if (navUnlockTimer.current) window.clearTimeout(navUnlockTimer.current);
    navUnlockTimer.current = window.setTimeout(() => {
      navIsLocked.current = false;
    }, 900);
    setActiveModuleId(module.id);
    document.getElementById(moduleAnchor(module))?.scrollIntoView({ behavior: "smooth" });
  }

  if (isLoading) {
    return (
      <main className={styles.loading} aria-label="Loading app">
        <span className={styles.loadingMark} />
      </main>
    );
  }

  if (!app) {
    return (
      <main className={styles.unavailable}>
        <div>
          <DotMark className="mx-auto size-4 bg-black" />
          <h1 className={styles.unavailableTitle}>app unavailable</h1>
          <p className={styles.unavailableCopy}>{error ?? "This link may be invalid or expired."}</p>
        </div>
      </main>
    );
  }

  const currentModuleId = activeModuleId || modules[0]?.id;

  return (
    <main className={styles.shell} data-theme={app.theme}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <DotMark className="size-3 bg-black" />
            <span>made with dot</span>
          </div>
          <button type="button" className={styles.shareButton} onClick={() => void share()}>
            <Share2 size={14} strokeWidth={1.8} />
            {shareLabel}
          </button>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>
              {app.access_mode === "collaborative_link" ? "Shared workspace" : "Personal workspace"}
            </p>
            <h1 className={styles.title}>{app.title}</h1>
            {app.description && <p className={styles.description}>{app.description}</p>}
          </div>
          <div className={styles.heroMeta}>
            <p className={styles.heroMetaLabel}>Last updated</p>
            <p className={styles.heroMetaValue}>{updatedLabel(app.updated_at)}</p>
          </div>
        </section>

        {modules.length > 1 && (
          <div className={styles.navBar}>
            <nav className={styles.nav} aria-label="App sections">
              {modules.map((module) => (
                <button
                  type="button"
                  key={module.id}
                  className={`${styles.navButton} ${currentModuleId === module.id ? styles.navActive : ""}`}
                  aria-current={currentModuleId === module.id ? "location" : undefined}
                  onClick={() => goToModule(module)}
                >
                  {module.title}
                </button>
              ))}
            </nav>
          </div>
        )}

        {error && <div className={styles.alert} role="alert">{error}</div>}

        <div className={styles.modules} aria-busy={isMutating}>
          {modules.map((module, index) => (
            <GeneratedAppModuleRenderer
              key={module.id}
              app={app}
              module={module}
              modules={modules}
              index={index}
              actions={actions}
            />
          ))}
        </div>

        <footer className={styles.footer}>
          <span>{app.access_mode === "collaborative_link" ? "Anyone with this link can contribute." : "Anyone with this private link can view and edit."}</span>
          <span>Built by Dot</span>
        </footer>
      </div>
    </main>
  );
}
