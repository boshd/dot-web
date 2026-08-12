"use client";

import { ArrowUpRight, Check, Copy, Share2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { BenjiApiError, joinWaitlist, type WaitlistJoinResponse } from "@/lib/api";
import styles from "./landing.module.css";

type WaitlistFormProps = {
  compact?: boolean;
};

function campaignContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    referralCode: params.get("ref") || undefined,
    utmSource: params.get("utm_source") || undefined,
    utmMedium: params.get("utm_medium") || undefined,
    utmCampaign: params.get("utm_campaign") || undefined,
  };
}

export function WaitlistForm({ compact = false }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<WaitlistJoinResponse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!result) return "";
    const origin = typeof window === "undefined" ? "https://textdot.co" : window.location.origin;
    return `${origin}/?ref=${encodeURIComponent(result.referral_code)}`;
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      const joined = await joinWaitlist({ email, source: "landing", ...campaignContext() });
      setResult(joined);
    } catch (requestError) {
      setError(
        requestError instanceof BenjiApiError
          ? requestError.message
          : "couldn’t save your spot. give it another shot?",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    await navigator.share({
      title: "Meet Dot",
      text: "i joined the waitlist for dot. it lives in imessage and can actually get things done",
      url: shareUrl,
    });
  }

  if (result) {
    return (
      <div className={`${styles.joinedCard} ${compact ? styles.joinedCardCompact : ""}`}>
        <div className={styles.joinedHeader}>
          <span className={styles.successIcon}><Check size={16} strokeWidth={2.5} /></span>
          <span>{result.joined ? "you’re in" : "you were already in. still counts"}</span>
        </div>
        <div className={styles.positionRow}>
          <span className={styles.positionNumber}>#{result.position}</span>
          <span className={styles.positionCopy}>on the list</span>
        </div>
        <p>
          every friend who joins from your link moves you up. send it to the group chat and make
          this their problem too.
        </p>
        <div className={styles.shareActions}>
          <button type="button" onClick={shareLink} className={styles.primaryShare}>
            <Share2 size={16} /> share with friends
          </button>
          <button type="button" onClick={copyLink} className={styles.copyShare}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "copied" : "copy link"}
          </button>
        </div>
        <div className={styles.referralMeta}>
          <span>{result.referral_count} friends joined</span>
          <span>your link · {result.referral_code}</span>
        </div>
      </div>
    );
  }

  const inputId = compact ? "waitlist-email-bottom" : "waitlist-email";

  return (
    <form className={`${styles.waitlistForm} ${compact ? styles.waitlistFormCompact : ""}`} onSubmit={submit}>
      <label className={styles.srOnly} htmlFor={inputId}>Email address</label>
      <input
        id={inputId}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@email.com"
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      <button type="submit" disabled={loading}>
        {loading ? "saving your spot…" : "join the waitlist"}
        {!loading && <ArrowUpRight size={17} />}
      </button>
      {error && <p id={`${inputId}-error`} className={styles.formError} role="alert">{error}</p>}
    </form>
  );
}
