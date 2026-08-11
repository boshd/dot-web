"use client";

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  FolderClosed,
  Landmark,
  LoaderCircle,
  Mail,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AuthToken,
  BenjiApiError,
  connectIntegration,
  createPlaidLinkFromConnectToken,
  disconnectPlaidConnection,
  exchangePlaidToken,
  IntegrationConnect,
  IntegrationCatalogItem,
  loadIntegrationCatalog,
  reconnectPlaidConnection,
} from "@/lib/api";

type PlaidMetadata = {
  institution?: { institution_id?: string; name?: string } | null;
};

type PlaidHandler = {
  open: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: PlaidMetadata) => void;
        onExit: (error: { display_message?: string } | null) => void;
      }) => PlaidHandler;
    };
  }
}

type IntegrationsPanelProps = {
  phoneNumber?: string;
  getAuthToken?: () => AuthToken;
};

const iconByKey = {
  google_calendar: CalendarDays,
  gmail: Mail,
  plaid: Landmark,
  google_drive: FolderClosed,
  slack: MessageSquare,
};

export function IntegrationsPanel({ phoneNumber, getAuthToken }: IntegrationsPanelProps) {
  const [integrations, setIntegrations] = useState<IntegrationCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectingKey, setConnectingKey] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [plaidReady, setPlaidReady] = useState(false);
  const consumedConnectToken = useRef<string | undefined>(undefined);

  const callbackNotice = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const account = params.get("account");
    const integrationError = params.get("integration_error");
    if (integrationError) return { kind: "error" as const, text: integrationError };
    if (connected) {
      return {
        kind: "success" as const,
        text: `${account ?? "Google account"} is connected to ${connected === "gmail" ? "Gmail" : "Google Calendar"}.`,
      };
    }
    return null;
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const catalog = await loadIntegrationCatalog({
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      setIntegrations(catalog.integrations);
    } catch (loadError) {
      setError(
        loadError instanceof BenjiApiError
          ? loadError.message
          : "Dot couldn’t load your integrations.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [getAuthToken, phoneNumber]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const openPlaid = useCallback(
    (connection: IntegrationConnect) => {
      if (!connection.link_token || !connection.exchange_token || !window.Plaid) {
        setError("Dot couldn’t open the secure bank connection window.");
        setConnectingKey(undefined);
        return;
      }
      const exchangeToken = connection.exchange_token;
      const handler = window.Plaid.create({
        token: connection.link_token,
        onSuccess: (publicToken, metadata) => {
          void (async () => {
            try {
              const result = await exchangePlaidToken({
                publicToken,
                exchangeToken,
                institutionId: metadata.institution?.institution_id,
                institutionName: metadata.institution?.name,
              });
              setNotice(
                `${result.institution_name} is connected. Dot is syncing its accounts now.`,
              );
              const url = new URL(window.location.href);
              url.searchParams.delete("connect");
              url.searchParams.delete("connect_token");
              window.history.replaceState({}, "", url);
              await load();
            } catch (exchangeError) {
              setError(
                exchangeError instanceof BenjiApiError
                  ? exchangeError.message
                  : "Dot couldn’t finish connecting that institution.",
              );
            } finally {
              handler.destroy();
              setConnectingKey(undefined);
            }
          })();
        },
        onExit: (plaidError) => {
          if (plaidError?.display_message) setError(plaidError.display_message);
          handler.destroy();
          setConnectingKey(undefined);
        },
      });
      handler.open();
    },
    [load],
  );

  useEffect(() => {
    if (!plaidReady) return;
    const params = new URLSearchParams(window.location.search);
    const connectToken = params.get("connect_token");
    if (params.get("connect") !== "plaid" || !connectToken) return;
    if (consumedConnectToken.current === connectToken) return;
    consumedConnectToken.current = connectToken;
    setConnectingKey("plaid");
    void createPlaidLinkFromConnectToken(connectToken)
      .then(openPlaid)
      .catch((connectError) => {
        setError(
          connectError instanceof BenjiApiError
            ? connectError.message
            : "That private bank connection link is invalid or expired.",
        );
        setConnectingKey(undefined);
      });
  }, [openPlaid, plaidReady]);

  async function connect(integrationKey: string) {
    setConnectingKey(integrationKey);
    setError(undefined);
    try {
      const authorization = await connectIntegration({
        integrationKey,
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      if (authorization.flow === "plaid_link") {
        if (!plaidReady) {
          setError("The secure bank connection window is still loading. Try again.");
          setConnectingKey(undefined);
          return;
        }
        openPlaid(authorization);
      } else if (authorization.authorization_url) {
        window.location.assign(authorization.authorization_url);
      } else {
        throw new Error("Missing integration authorization URL");
      }
    } catch (connectError) {
      setError(
        connectError instanceof BenjiApiError
          ? connectError.message
          : "Dot couldn’t start that connection.",
      );
      setConnectingKey(undefined);
    }
  }

  async function reconnect(connectionId: string) {
    setConnectingKey("plaid");
    setError(undefined);
    try {
      const connection = await reconnectPlaidConnection({
        connectionId,
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      openPlaid(connection);
    } catch (connectError) {
      setError(
        connectError instanceof BenjiApiError
          ? connectError.message
          : "Dot couldn’t start that reconnection.",
      );
      setConnectingKey(undefined);
    }
  }

  async function disconnect(connectionId: string, label: string) {
    if (!window.confirm(`Disconnect ${label} and delete its synced data from Dot?`)) return;
    setConnectingKey("plaid");
    setError(undefined);
    try {
      await disconnectPlaidConnection({
        connectionId,
        phoneNumber,
        authToken: getAuthToken?.(),
      });
      setNotice(`${label} was disconnected and its synced data was removed.`);
      await load();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof BenjiApiError
          ? disconnectError.message
          : "Dot couldn’t disconnect that institution.",
      );
    } finally {
      setConnectingKey(undefined);
    }
  }

  const available = integrations.filter((item) => item.availability === "available");
  const comingSoon = integrations.filter((item) => item.availability === "coming_soon");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onReady={() => setPlaidReady(true)}
        onError={() => setError("The secure bank connection window couldn’t load.")}
      />
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--coral)">
              your digital life
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
              integrations
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-black/48 sm:text-[15px]">
              Connect the accounts you want Dot to understand and help with. Add as many
              Google accounts as you use.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            aria-label="Refresh integrations"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-black/8 bg-white/65 text-black/42 transition hover:bg-white disabled:opacity-40"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {callbackNotice && (
          <div
            className={`mt-7 rounded-2xl border px-4 py-3 text-sm ${
              callbackNotice.kind === "success"
                ? "border-(--sage)/25 bg-(--sage)/10 text-black/62"
                : "border-(--danger)/15 bg-(--danger)/6 text-(--danger)"
            }`}
          >
            {callbackNotice.text}
          </div>
        )}
        {notice && (
          <div className="mt-7 rounded-2xl border border-(--sage)/25 bg-(--sage)/10 px-4 py-3 text-sm text-black/62">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-7 rounded-2xl border border-(--danger)/15 bg-(--danger)/6 px-4 py-3 text-sm text-(--danger)">
            {error}
          </div>
        )}

        {isLoading && integrations.length === 0 ? (
          <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="size-6 animate-spin text-(--coral)" />
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {available.map((integration) => (
                <IntegrationCard
                  key={integration.key}
                  integration={integration}
                  isConnecting={connectingKey === integration.key}
                  onConnect={() => void connect(integration.key)}
                  onReconnect={(connectionId) => void reconnect(connectionId)}
                  onDisconnect={(connectionId, label) =>
                    void disconnect(connectionId, label)
                  }
                />
              ))}
            </div>

            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/34">
                coming soon
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {comingSoon.map((integration) => (
                  <ComingSoonCard key={integration.key} integration={integration} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  isConnecting,
  onConnect,
  onReconnect,
  onDisconnect,
}: {
  integration: IntegrationCatalogItem;
  isConnecting: boolean;
  onConnect: () => void;
  onReconnect: (connectionId: string) => void;
  onDisconnect: (connectionId: string, label: string) => void;
}) {
  const Icon = iconByKey[integration.key as keyof typeof iconByKey] ?? ArrowUpRight;
  const isConnected = integration.connections.length > 0;
  return (
    <article className="flex min-h-64 flex-col rounded-[28px] border border-black/7 bg-white/72 p-5 shadow-[0_12px_42px_rgba(45,37,28,0.045)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-foreground text-white">
          <Icon className="size-5" />
        </div>
        {isConnected && (
          <span className="flex items-center gap-1.5 rounded-full bg-(--sage)/12 px-3 py-1.5 text-[11px] font-semibold text-black/54">
            <Check className="size-3.5" /> connected
          </span>
        )}
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{integration.name}</h2>
      <p className="mt-2 text-sm leading-6 text-black/48">{integration.description}</p>

      {isConnected && (
        <div className="mt-5 space-y-2">
          {integration.connections.map((connection) => (
            <div
              key={connection.account_id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-(--paper) px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-black/68">{connection.label}</p>
                <p className="mt-0.5 text-[10px] text-black/36">
                  {integration.key === "plaid"
                    ? connection.subscription_status === "idle"
                      ? `${connection.account_count} account${connection.account_count === 1 ? "" : "s"} · synced`
                      : "connected · syncing"
                    : connection.subscription_status === "active"
                      ? "updates active"
                      : "connected · updates need setup"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {connection.status === "needs_reauthorization" ? (
                  <button
                    type="button"
                    onClick={() => onReconnect(connection.account_id)}
                    className="rounded-full bg-(--coral)/10 px-2.5 py-1 text-[10px] font-semibold text-(--coral)"
                  >
                    reconnect
                  </button>
                ) : (
                  <span className="size-2 rounded-full bg-(--sage)" />
                )}
                {integration.key === "plaid" && (
                  <button
                    type="button"
                    onClick={() => onDisconnect(connection.account_id, connection.label)}
                    className="text-[10px] font-medium text-black/32 hover:text-(--danger)"
                  >
                    disconnect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onConnect}
        disabled={isConnecting}
        className="mt-auto flex h-11 items-center justify-center gap-2 rounded-2xl border border-black/9 bg-white px-4 text-xs font-semibold text-black/62 transition hover:border-black/15 hover:text-black disabled:opacity-45"
      >
        {isConnecting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
        {isConnected ? "connect another account" : "connect"}
      </button>
    </article>
  );
}

function ComingSoonCard({ integration }: { integration: IntegrationCatalogItem }) {
  const Icon = iconByKey[integration.key as keyof typeof iconByKey] ?? ArrowUpRight;
  return (
    <article className="rounded-[24px] border border-black/6 bg-white/42 p-5 opacity-70">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-black/5 text-black/42">
          <Icon className="size-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{integration.name}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-black/32">soon</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-black/42">{integration.description}</p>
    </article>
  );
}
