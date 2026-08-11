"use client";

import { Check, Landmark, LoaderCircle, RotateCcw } from "lucide-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BenjiApiError,
  createPlaidLinkFromConnectToken,
  exchangePlaidToken,
  IntegrationConnect,
} from "@/lib/api";

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
  const lastConnectToken = useRef<string | undefined>(undefined);
  const connectAttempt = useRef(0);
  const autoOpened = useRef(false);
  const handlerRef = useRef<PlaidHandler | undefined>(undefined);

  const startFromPrivateLink = useCallback(() => {
    const token = takePrivateToken();
    if (!token) {
      if (lastConnectToken.current) return;
      queueMicrotask(() => {
        setStatus("error");
        setMessage(
          "this private link is missing or has already been used. ask Dot for a fresh one.",
        );
      });
      return;
    }
    if (token === lastConnectToken.current) return;
    lastConnectToken.current = token;
    const attempt = ++connectAttempt.current;
    autoOpened.current = false;
    handlerRef.current?.destroy();
    handlerRef.current = undefined;
    queueMicrotask(() => {
      if (connectAttempt.current !== attempt) return;
      setConnection(undefined);
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
        setStatus("ready");
        setMessage("your secure connection is ready.");
      })
      .catch((error) => {
        if (connectAttempt.current !== attempt) return;
        setStatus("error");
        setMessage(
          error instanceof BenjiApiError
            ? error.message
            : "this private link is invalid or expired. ask Dot for a fresh one.",
        );
      });
  }, []);

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
        setMessage("bank connected — finishing the secure handoff to Dot…");
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
  const isBusy =
    status === "starting" ||
    status === "ready" ||
    status === "opening" ||
    status === "exchanging";

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onReady={() => setPlaidReady(true)}
        onError={() => {
          setStatus("error");
          setMessage("Plaid’s secure window couldn’t load. check your connection and try again.");
        }}
      />
      <div className="identity-glow" />
      <section className="relative w-full max-w-md rounded-[32px] border border-black/7 bg-white/80 p-7 text-center shadow-[0_24px_90px_rgba(45,37,28,0.10)] backdrop-blur sm:p-9">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-foreground text-white shadow-sm">
          {status === "connected" ? <Check className="size-6" /> : <Landmark className="size-6" />}
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-(--coral)">
          Dot + Plaid
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">connect your bank</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-black/48">{message}</p>

        {canOpen && (
          <button
            type="button"
            onClick={openPlaid}
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.99]"
          >
            {status === "cancelled" ? (
              <RotateCcw className="size-4" />
            ) : (
              <Landmark className="size-4" />
            )}
            {status === "cancelled" ? "try again" : "open secure connection"}
          </button>
        )}

        {isBusy && !canOpen && (
          <div className="mt-7 flex h-12 items-center justify-center gap-2 text-sm font-medium text-black/44">
            <LoaderCircle className="size-4 animate-spin" /> one sec
          </div>
        )}

        <p className="mt-7 text-[11px] leading-5 text-black/34">
          Your bank login goes directly to Plaid, not Dot. This single-use link only connects the
          Dot account that requested it.
        </p>
      </section>
    </main>
  );
}
