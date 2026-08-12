"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DotAppFrame, KitStatePanel, dotAppStyles as styles } from "@/components/dot-app-kit";
import { GeneratedAppIframe } from "@/components/generated-app-iframe";
import { useDotAuth } from "@/components/benji-auth-provider";
import {
  executeGeneratedAppV2Action,
  generatedAppV2SharedHandoff,
  GeneratedAppV2ApiError,
  loadGeneratedAppV2,
  queryGeneratedAppV2Records,
  redeemGeneratedAppV2Handoff,
  storeGeneratedAppV2SharedHandoff,
  verifyGeneratedAppV2BrowserBundle,
  type GeneratedAppV2,
  type GeneratedAppV2RuntimeOperation,
  type JsonValue,
} from "@/lib/generated-app-v2";

function buildMessage(app: GeneratedAppV2) {
  if (app.build?.message) return app.build.message;
  return {
    queued: "Dot has it. Your app is waiting for the builder.",
    planning: "Dot’s figuring out how this should work.",
    generating: "Dot’s putting your app together now.",
    testing: "The app is built. Dot’s making sure it actually works.",
    repairing: "Dot spotted something annoying and is fixing it.",
    deploying: "Everything works. Dot’s getting the link ready.",
    failed: "This build hit a problem.",
  }[app.build?.status ?? "generating"];
}

function takeHashHandoff() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(window.location.hash.slice(1));
  const value = params.get("handoff");
  // Query-string tickets can leak through logs and referrers. They are never accepted.
  url.searchParams.delete("ticket");
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  return value && /^[A-Za-z0-9_-]{20,1024}$/.test(value) ? value : null;
}

function entityNames(app: GeneratedAppV2) {
  const entities = app.active_revision?.manifest.entities;
  if (!Array.isArray(entities)) return [];
  return entities.flatMap((entity) => {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) return [];
    return typeof entity.name === "string" ? [entity.name] : [];
  }).slice(0, 12);
}

function pluralKey(entity: string) {
  if (entity.endsWith("s")) return entity;
  if (entity.endsWith("y") && !/[aeiou]y$/.test(entity)) return `${entity.slice(0, -1)}ies`;
  return `${entity}s`;
}

async function hydrateAppRecords(publicId: string, loaded: GeneratedAppV2) {
  if (loaded.access.state !== "granted" || !loaded.active_revision) return loaded;
  const names = entityNames(loaded);
  if (!names.length) return loaded;
  const results = await Promise.allSettled(
    names.map(async (entity) => ({
      entity,
      records: await queryGeneratedAppV2Records({ publicId, appId: loaded.id, entity }),
    })),
  );
  const document = loaded.active_revision.artifact.document;
  const data = { ...(document.data ?? {}) };
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    data[result.value.entity] = result.value.records;
    data[pluralKey(result.value.entity)] = result.value.records;
  }
  return {
    ...loaded,
    active_revision: {
      ...loaded.active_revision,
      artifact: {
        ...loaded.active_revision.artifact,
        document: { ...document, data },
      },
    },
  };
}

function sandboxRecord(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const data = value.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return value;
  return {
    ...data,
    id: typeof value.id === "string" ? value.id : null,
    entity: typeof value.entity === "string" ? value.entity : null,
    version: typeof value.version === "number" ? value.version : 1,
    _record_id: typeof value.id === "string" ? value.id : null,
    _record_version: typeof value.version === "number" ? value.version : 1,
    created_at: typeof value.created_at === "string" ? value.created_at : null,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

function replaceSandboxRecord(
  context: JsonValue,
  operation: GeneratedAppV2RuntimeOperation,
  result: JsonValue,
): JsonValue {
  if (!context || typeof context !== "object" || Array.isArray(context)) return context;
  if (!result || typeof result !== "object" || Array.isArray(result)) return context;
  const entity = typeof result.entity === "string" ? result.entity : null;
  const id = typeof result.id === "string" ? result.id : null;
  if (!entity || !id) return context;
  const record = sandboxRecord(result);
  const keys = [entity, pluralKey(entity)];
  const updated = { ...context };
  for (const key of keys) {
    const current = Array.isArray(updated[key]) ? updated[key] as JsonValue[] : [];
    if (operation === "records.create") updated[key] = [...current, record];
    else if (operation === "records.update") {
      updated[key] = current.map((item) => (
        item && typeof item === "object" && !Array.isArray(item) && item.id === id
          ? record
          : item
      ));
    }
  }
  return updated;
}

export function GeneratedAppV2Runtime({ appId }: { appId: string }) {
  const { initialized: authInitialized } = useDotAuth();
  const [app, setApp] = useState<GeneratedAppV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [failedBundleRevision, setFailedBundleRevision] = useState<string | null>(null);
  const [verifiedBundleKey, setVerifiedBundleKey] = useState<string | null>(null);
  const handoffRef = useRef<string | null | undefined>(undefined);
  const redeemedHandoffRef = useRef<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    // Strip the bearer handoff from browser-visible history before the first request.
    if (handoffRef.current === undefined) handoffRef.current = takeHashHandoff();
    if (!authInitialized) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const ticket = handoffRef.current;
      if (ticket) {
        await redeemGeneratedAppV2Handoff(appId, ticket);
        redeemedHandoffRef.current = ticket;
        handoffRef.current = null;
      }
      const loaded = await loadGeneratedAppV2(appId);
      if (redeemedHandoffRef.current && loaded.access.mode === "shared") {
        storeGeneratedAppV2SharedHandoff(appId, redeemedHandoffRef.current);
      }
      redeemedHandoffRef.current = null;
      setApp(await hydrateAppRecords(appId, loaded));
      setErrorStatus(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dot couldn’t load this app.");
      setErrorStatus(loadError instanceof GeneratedAppV2ApiError ? loadError.status : null);
    } finally {
      setLoading(false);
    }
  }, [appId, authInitialized]);

  useEffect(() => {
    if (!authInitialized) return;
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [authInitialized, load]);

  useEffect(() => {
    if (app?.status !== "building") return;
    const interval = window.setInterval(() => void load(true), 2500);
    return () => window.clearInterval(interval);
  }, [app?.status, load]);

  const document = app?.active_revision?.artifact.document;
  const browserBundle = app?.active_revision?.artifact.browser_bundle;
  const bundleKey = app?.active_revision && browserBundle
    ? `${app.active_revision.id}:${browserBundle.sha256}`
    : null;
  const theme = document?.theme;

  useEffect(() => {
    const candidate = browserBundle;
    const candidateKey = bundleKey;
    if (!candidate || !candidateKey) return;
    let active = true;
    void verifyGeneratedAppV2BrowserBundle(candidate).then((valid) => {
      if (!active) return;
      if (valid) setVerifiedBundleKey(candidateKey);
      else setFailedBundleRevision(app?.active_revision?.id ?? null);
    });
    return () => { active = false; };
  }, [app?.active_revision?.id, browserBundle, bundleKey]);

  const sandboxContext = useMemo<JsonValue>(() => {
    if (!app?.active_revision || !document) return {};
    return {
      ...(document.data ?? {}),
      $app: {
        id: app.id,
        public_id: appId,
        title: app.title,
        description: app.description,
        revision_id: app.active_revision.id,
        revision: app.active_revision.version,
        role: app.access.role,
        can_edit: app.access.can_edit,
        capabilities: app.access.capabilities,
        updated_at: app.updated_at,
      },
      $manifest: app.active_revision.manifest,
    };
  }, [app, appId, document]);

  const state = useMemo(() => {
    if (loading) return { kind: "loading" as const, title: "opening your app", body: "one sec" };
    if (errorStatus === 401 || errorStatus === 403) return { kind: "permission" as const, title: "this app is private", body: error || "Open the original link Dot sent you, or ask the owner for access." };
    if (error) return { kind: "error" as const, title: "app unavailable", body: error };
    if (!app) return { kind: "error" as const, title: "app unavailable", body: "This link may be invalid or expired." };
    if (app.access.state !== "granted") return { kind: "permission" as const, title: "you need access", body: "Open the private link Dot sent you, or ask the owner to share this app." };
    if (app.status === "archived") return { kind: "archived" as const, title: "this app was archived", body: "Nothing was deleted. Ask Dot to bring it back if you still need it." };
    if (app.status === "failed") return { kind: "error" as const, title: "the build didn’t land", body: buildMessage(app) };
    if (app.status === "building") return { kind: "building" as const, title: app.title || "Dot’s building it", body: buildMessage(app) };
    if (!app.active_revision || !document) return { kind: "error" as const, title: "this app needs a rebuild", body: "Dot won’t open an incomplete app." };
    return null;
  }, [app, document, error, errorStatus, loading]);

  const runSandboxAction = useCallback(async (
    operation: GeneratedAppV2RuntimeOperation,
    payload: Record<string, JsonValue>,
    idempotencyKey?: string,
  ): Promise<JsonValue> => {
    if (!app?.active_revision) throw new Error("This app isn't ready yet");
    if (
      operation === "dot.reminder.create" &&
      !app.access.capabilities.includes("dot.reminder.create")
    ) {
      throw new Error("Only a signed-in app owner or editor can create reminders.");
    }
    if (operation !== "records.list" && operation !== "app.data.get" && !app.access.can_edit) {
      throw new Error("You can look around, but you don't have permission to change this app.");
    }
    if (operation === "app.data.get") return sandboxContext;
    const result = await executeGeneratedAppV2Action({
      publicId: appId,
      appId: app.id,
      operation,
      payload,
      idempotencyKey,
    });
    if (operation === "records.list") {
      return {
        data: Array.isArray(result.data) ? result.data.map(sandboxRecord) : [],
        meta: result.meta,
      };
    }
    if (operation === "records.create" || operation === "records.update") {
      const nextData = replaceSandboxRecord(
        app.active_revision.artifact.document.data ?? {},
        operation,
        result.data,
      );
      setApp((current) => {
        if (!current?.active_revision) return current;
        return {
          ...current,
          active_revision: {
            ...current.active_revision,
            artifact: {
              ...current.active_revision.artifact,
              document: {
                ...current.active_revision.artifact.document,
                data: nextData && typeof nextData === "object" && !Array.isArray(nextData)
                  ? nextData
                  : current.active_revision.artifact.document.data,
              },
            },
          },
        };
      });
    } else if (operation === "records.delete" || operation === "dot.reminder.create") {
      void load(true);
    }
    return sandboxRecord(result.data);
  }, [app, appId, load, sandboxContext]);

  async function share() {
    const handoff = app?.access.mode === "shared"
      ? generatedAppV2SharedHandoff(appId)
      : undefined;
    const url = `${window.location.origin}${window.location.pathname}${handoff ? `#handoff=${handoff}` : ""}`;
    if (navigator.share) {
      await navigator.share({ title: app?.title ?? "Dot app", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
  }

  if (state) {
    return <KitStatePanel {...state} action={state.kind === "error" ? { label: "try again", onClick: () => void load() } : undefined} />;
  }

  if (!app || !document) return null;
  if (!browserBundle || !app.active_revision) {
    return <KitStatePanel kind="error" title="this app isn’t ready" body="Dot needs to rebuild it before it can open." />;
  }
  if (failedBundleRevision === app.active_revision.id) {
    return <KitStatePanel kind="error" title="this app couldn’t open" body="Dot needs to repair this build." />;
  }
  if (verifiedBundleKey !== bundleKey) {
    return <KitStatePanel kind="loading" title="opening your app" body="one sec" />;
  }
  const canShare = app.access.mode === "public" || (
    app.access.mode === "shared" && Boolean(generatedAppV2SharedHandoff(appId))
  );
  return (
    <DotAppFrame
      title={app.title}
      theme={theme}
      onShare={canShare ? () => void share() : undefined}
      fullBleed
    >
      <GeneratedAppIframe
        key={bundleKey ?? app.active_revision.id}
        bundle={browserBundle}
        context={sandboxContext}
        title={app.title}
        capabilities={app.access.capabilities}
        onRequest={runSandboxAction}
        onRuntimeError={() => setFailedBundleRevision(app.active_revision?.id ?? null)}
      />
      {error && <div className={styles.runtimeError} role="alert">{error}</div>}
    </DotAppFrame>
  );
}
