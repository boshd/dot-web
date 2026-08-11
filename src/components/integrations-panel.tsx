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
import {
  Button,
  Eyebrow,
  LoadingState,
  Notice,
  PageIntro,
} from "@/components/dot-ui";

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
    <div className="dot-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onReady={() => setPlaidReady(true)}
        onError={() => setError("The secure bank connection window couldn’t load.")}
      />
      <div className="dot-enter mx-auto max-w-6xl">
        <PageIntro
          eyebrow="connected context"
          title="Integrations"
          description="Bring the parts of your digital life you want Dot to understand. You stay in control of every connection."
          action={
            <Button
              variant="secondary"
              size="icon"
              onClick={() => void load()}
              disabled={isLoading}
              aria-label="Refresh integrations"
              title="Refresh integrations"
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          }
        />

        {callbackNotice && (
          <Notice
            tone={callbackNotice.kind === "success" ? "success" : "danger"}
            className="mt-6"
          >
            {callbackNotice.text}
          </Notice>
        )}
        {notice && (
          <Notice tone="success" className="mt-6">{notice}</Notice>
        )}
        {error && (
          <Notice tone="danger" className="mt-6">{error}</Notice>
        )}

        {isLoading && integrations.length === 0 ? (
          <LoadingState label="loading your connections" />
        ) : (
          <>
            <div className="mt-7 grid gap-3 md:grid-cols-2">
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

            <section className="mt-12 border-t border-black/10 pt-7 sm:mt-16 sm:pt-9">
              <Eyebrow>coming soon</Eyebrow>
              <div className="mt-5 grid gap-px overflow-hidden rounded-[15px] border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3">
                {comingSoon.map((integration) => (
                  <ComingSoonCard key={integration.key} integration={integration} />
                ))}
              </div>
            </section>
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
    <article className="flex min-h-64 flex-col rounded-[16px] border border-black/10 bg-white p-5 transition hover:border-black/16 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="grid size-9 place-items-center rounded-[10px] bg-foreground text-white">
          <Icon className="size-4" strokeWidth={1.8} />
        </div>
        {isConnected && (
          <span className="flex items-center gap-1.5 rounded-full border border-(--sage)/18 bg-(--sage-soft) px-2.5 py-1 text-[10px] font-medium text-black/55">
            <Check className="size-3" /> connected
          </span>
        )}
      </div>
      <h2 className="mt-7 text-xl font-medium tracking-[-0.03em]">{integration.name}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{integration.description}</p>

      {isConnected && (
        <div className="mt-5 divide-y divide-black/8 overflow-hidden rounded-xl border border-black/8">
          {integration.connections.map((connection) => (
            <div
              key={connection.account_id}
              className="flex items-center justify-between gap-3 bg-[#fafaf7] px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-black/68">{connection.label}</p>
                <p className="mt-0.5 text-[10px] text-black/38">
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
                    className="rounded-full bg-(--coral-soft) px-2.5 py-1 text-[10px] font-medium text-(--danger)"
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
                    className="text-[10px] font-medium text-black/38 transition hover:text-(--danger)"
                  >
                    disconnect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="secondary"
        onClick={onConnect}
        disabled={isConnecting}
        className="mt-auto w-full"
      >
        {isConnecting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <ArrowUpRight className="size-4" />
        )}
        {isConnected ? "connect another account" : "connect"}
      </Button>
    </article>
  );
}

function ComingSoonCard({ integration }: { integration: IntegrationCatalogItem }) {
  const Icon = iconByKey[integration.key as keyof typeof iconByKey] ?? ArrowUpRight;
  return (
    <article className="bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-[9px] border border-black/8 bg-[#fafaf7] text-black/42">
          <Icon className="size-3.5" />
        </div>
        <div>
          <h3 className="text-sm font-medium">{integration.name}</h3>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-black/32">soon</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">{integration.description}</p>
    </article>
  );
}
