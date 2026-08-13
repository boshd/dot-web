"use client";

import { Check, LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { DotBrand, Eyebrow, Surface } from "@/components/dot-ui";

function integrationLabel(value: string | null) {
  if (value === "gmail") return "Gmail";
  if (value === "google_calendar") return "Google Calendar";
  if (value === "plaid") return "your bank";
  return "that account";
}

export function ConnectDoneSurface() {
  const params = useSearchParams();
  const error = params.get("integration_error");
  const connected = params.get("connected");
  const account = params.get("account");
  const success = !error && Boolean(connected);
  const text = error
    ? error
    : connected
      ? account
        ? `${account} is connected to ${integrationLabel(connected)}. You can close this and go back to Dot.`
        : `${integrationLabel(connected)} is connected. You can close this and go back to Dot.`
      : "this connection link is finished. ask Dot for a fresh one if you still need it.";

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background px-5 py-6 text-foreground sm:px-8 sm:py-8">
      <DotBrand />
      <section className="dot-enter mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-5xl items-center gap-10 py-12 md:grid-cols-[1.1fr_0.9fr] md:gap-20">
        <div>
          <Eyebrow>Dot</Eyebrow>
          <h1 className="mt-4 max-w-xl text-[3.2rem] font-normal leading-[0.94] tracking-[-0.06em] sm:text-[4.6rem]">
            {success ? "You’re set." : "Connection didn’t finish."}
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-muted">
            {success
              ? "Dot can use this connection from your texts. No extra sign-in on the web app."
              : "Nothing was saved. Ask Dot for another private link and try again."}
          </p>
        </div>
        <Surface className="p-5 shadow-[var(--shadow-float)] sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-black/9 pb-5">
            <div className="grid size-10 place-items-center rounded-[11px] bg-foreground text-white">
              {success ? <Check className="size-4.5" /> : <LockKeyhole className="size-4.5" strokeWidth={1.8} />}
            </div>
          </div>
          <div className="py-7">
            <h2 className="text-2xl font-medium tracking-[-0.04em]">
              {success ? "Connected" : "Couldn’t connect"}
            </h2>
            <p className="mt-3 min-h-12 text-sm leading-6 text-muted" aria-live="polite">
              {text}
            </p>
          </div>
        </Surface>
      </section>
    </main>
  );
}
