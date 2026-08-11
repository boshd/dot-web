"use client";

import { Check, Landmark, LoaderCircle, LockKeyhole, RotateCcw } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BenjiApiError,
  createPlaidLinkFromConnectToken,
  exchangePlaidToken,
  IntegrationConnect,
} from "@/lib/api";
import { Button, DotBrand, Eyebrow, Surface } from "@/components/dot-ui";

type PlaidMetadata = {
  institution?: { institution_id?: string; name?: string } | null;
};

type PlaidHandler = {
  open: () => void;
  destroy: () => void;
};

type PlaidWindow = Window & {
  Plaid?: {
    create: (config: {
      token: string;
      onSuccess: (publicToken: string, metadata: PlaidMetadata) => void;
      onExit: (error: { display_message?: string } | null) => void;
    }) => PlaidHandler;
  };
};

type FlowStatus =
  | "starting"
  | "ready"
  | "opening"
  | "cancelled"
  | "exchanging"
  | "connected"
  | "error";

function takePrivateToken(): string | undefined {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const token = fragment.get("token") ?? query.get("token") ?? undefined;

  // Remove the bearer capability before loading Plaid or any later navigation.
  window.history.replaceState({}, "", window.location.pathname);
  return token;
}

export function PlaidConnectSurface() {
  const [connection, setConnection] = useState<IntegrationConnect>();
  const [plaidReady, setPlaidReady] = useState(false);
  const [status, setStatus] = useState<FlowStatus>("starting");
  const [message, setMessage] = useState("preparing your secure bank connection…");
  const [retryableConnect, setRetryableConnect] = useState(false);
  const lastConnectToken = useRef<string | undefined>(undefined);
  const connectTokenRef = useRef<string | undefined>(undefined);
  const connectAttempt = useRef(0);
  const autoOpened = useRef(false);
  const handlerRef = useRef<PlaidHandler | undefined>(undefined);

  const requestPlaidSession = useCallback((token: string) => {
    connectTokenRef.current = token;
    const attempt = ++connectAttempt.current;
    autoOpened.current = false;
    handlerRef.current?.destroy();
    handlerRef.current = undefined;
    queueMicrotask(() => {
      if (connectAttempt.current !== attempt) return;
      setConnection(undefined);
      setRetryableConnect(false);
      setStatus("starting");
      setMessage("preparing your secure bank connection…");
    });

    void createPlaidLinkFromConnectToken(token)
      .then((result) => {
        if (connectAttempt.current !== attempt) return;
        if (!result.link_token || !result.exchange_token) {
          throw new Error("Plaid did not return a connection session");
        }
        setConnection(result);
        setRetryableConnect(false);
        setStatus("ready");
        setMessage("your secure connection is ready.");
      })
      .catch((error) => {
        if (connectAttempt.current !== attempt) return;
        setRetryableConnect(error instanceof BenjiApiError && error.status >= 500);
        setStatus("error");
        setMessage(
          error instanceof BenjiApiError
            ? error.message
            : "this private link is invalid or expired. ask Dot for a fresh one.",
        );
      });
  }, []);

  const startFromPrivateLink = useCallback(() => {
    const token = takePrivateToken();
    if (!token) {
      if (lastConnectToken.current) return;
      queueMicrotask(() => {
        setRetryableConnect(false);
        setStatus("error");
        setMessage(
          "this private link is missing or has already been used. ask Dot for a fresh one.",
        );
      });
      return;
    }
    if (token === lastConnectToken.current) return;
    lastConnectToken.current = token;
    requestPlaidSession(token);
  }, [requestPlaidSession]);

  useEffect(() => {
    startFromPrivateLink();
    window.addEventListener("hashchange", startFromPrivateLink);
    return () => window.removeEventListener("hashchange", startFromPrivateLink);
  }, [startFromPrivateLink]);

  useEffect(() => () => handlerRef.current?.destroy(), []);

  const openPlaid = useCallback(() => {
    const plaid = (window as PlaidWindow).Plaid;
    if (!connection?.link_token || !connection.exchange_token || !plaid) return;

    handlerRef.current?.destroy();
    const handler = plaid.create({
      token: connection.link_token,
      onSuccess: (publicToken, metadata) => {
        setStatus("exchanging");
        setMessage("bank connected. finishing the secure handoff to Dot…");
        void exchangePlaidToken({
          publicToken,
          exchangeToken: connection.exchange_token ?? "",
          institutionId: metadata.institution?.institution_id,
          institutionName: metadata.institution?.name,
        })
          .then((result) => {
            setStatus("connected");
            setMessage(`${result.institution_name} is connected. Dot is syncing it now.`);
          })
          .catch((error) => {
            setStatus("error");
            setMessage(
              error instanceof BenjiApiError
                ? error.message
                : "Dot couldn’t finish that connection. ask for a fresh link and try again.",
            );
          })
          .finally(() => {
            handler.destroy();
            if (handlerRef.current === handler) handlerRef.current = undefined;
          });
      },
      onExit: (error) => {
        handler.destroy();
        if (handlerRef.current === handler) handlerRef.current = undefined;
        if (error?.display_message) {
          setStatus("error");
          setMessage(error.display_message);
          return;
        }
        setStatus("cancelled");
        setMessage("connection cancelled. nothing was shared with Dot.");
      },
    });
    handlerRef.current = handler;
    setStatus("opening");
    setMessage("opening Plaid’s secure connection…");
    handler.open();
  }, [connection]);

  useEffect(() => {
    if (!plaidReady || !connection || autoOpened.current) return;
    autoOpened.current = true;
    openPlaid();
  }, [connection, openPlaid, plaidReady]);

  const canOpen =
    plaidReady &&
    connection !== undefined &&
    status !== "exchanging" &&
    status !== "connected" &&
    status !== "error";
  const canRetryConnect = retryableConnect && connection === undefined && status === "error";
  const isBusy =
    status === "starting" ||
    status === "ready" ||
    status === "opening" ||
    status === "exchanging";

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onReady={() => setPlaidReady(true)}
        onError={() => {
          setStatus("error");
          setMessage("Plaid’s secure window couldn’t load. check your connection and try again.");
        }}
      />
      <DotBrand />

      <section className="dot-enter mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-5xl items-center gap-10 py-12 md:grid-cols-[1.1fr_0.9fr] md:gap-20">
        <div>
          <Eyebrow>Dot + Plaid</Eyebrow>
          <h1 className="mt-4 max-w-xl text-[3.2rem] font-normal leading-[0.94] tracking-[-0.06em] sm:text-[4.6rem]">
            Bring your money into the conversation.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">
            Connect a supported bank so Dot can help you understand spending, cash flow, and goals
            from the actual numbers.
          </p>
          <div className="mt-9 flex max-w-md items-start gap-3 border-t border-black/10 pt-5 text-xs leading-5 text-muted">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-black/65" strokeWidth={1.8} />
            <p>Your bank login goes directly to Plaid. Dot never sees or stores your credentials.</p>
          </div>
        </div>

        <Surface className="p-5 shadow-[var(--shadow-float)] sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-black/9 pb-5">
            <div className="grid size-10 place-items-center rounded-[11px] bg-foreground text-white">
              {status === "connected" ? (
                <Check className="size-4.5" />
              ) : (
                <Landmark className="size-4.5" strokeWidth={1.8} />
              )}
            </div>
            <span className="rounded-full border border-black/9 bg-[#fafaf7] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-black/42">
              single-use link
            </span>
          </div>

          <div className="py-7">
            <h2 className="text-2xl font-medium tracking-[-0.04em]">
              {status === "connected" ? "You’re connected" : "Connect your bank"}
            </h2>
            <p className="mt-3 min-h-12 text-sm leading-6 text-muted" aria-live="polite">
              {message}
            </p>
          </div>

          {canOpen && (
            <Button size="lg" onClick={openPlaid} className="w-full">
              {status === "cancelled" ? (
                <RotateCcw className="size-4" />
              ) : (
                <Landmark className="size-4" />
              )}
              {status === "cancelled" ? "try again" : "open secure connection"}
            </Button>
          )}

          {canRetryConnect && (
            <Button
              size="lg"
              onClick={() => {
                if (connectTokenRef.current) requestPlaidSession(connectTokenRef.current);
              }}
              className="w-full"
            >
              <RotateCcw className="size-4" /> try again
            </Button>
          )}

          {isBusy && !canOpen && (
            <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#f4f4ef] text-sm text-black/48" role="status">
              <LoaderCircle className="size-4 animate-spin" /> one sec
            </div>
          )}

          <p className="mt-4 text-center text-[10px] leading-4 text-black/35">
            This link only connects the Dot account that requested it.
          </p>
        </Surface>
      </section>
    </main>
  );
}
