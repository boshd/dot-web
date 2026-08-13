"use client";

import { AlertTriangle, ArrowLeft, LoaderCircle, LockKeyhole, RefreshCw, Share2 } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import type { DotAppTone } from "@/lib/generated-app-v2";

import styles from "./dot-app-kit.module.css";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const toneClasses: Record<DotAppTone, string | undefined> = {
  neutral: undefined,
  accent: styles.toneAccent,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
};

export function DotAppFrame({
  title,
  onShare,
  fullBleed = false,
  children,
}: {
  title: string;
  onShare?: () => void;
  fullBleed?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={styles.runtime}
      data-accent="coral"
      data-radius="soft"
      data-density="comfortable"
    >
      <header className={styles.chrome}>
        <div className={styles.brand} aria-label={`${title}, made with Dot`}>
          <span className={styles.brandMark} />
          <span>made with dot</span>
        </div>
        {onShare && (
          <div className={styles.chromeActions}>
            <KitButton variant="plain" icon onClick={onShare} aria-label="Share app" title="Share app">
              <Share2 size={15} />
            </KitButton>
          </div>
        )}
      </header>
      <div className={cx(styles.content, fullBleed && styles.contentFullBleed)}>{children}</div>
    </main>
  );
}

export function KitButton({
  variant = "accent",
  icon = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "plain" | "soft" | "outline" | "accent";
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(styles.button, icon && styles.iconButton, className)}
      data-variant={variant}
      {...props}
    />
  );
}

export function KitCard({
  variant = "outline",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: "plain" | "soft" | "outline" | "elevated" | "accent";
}) {
  return <div className={cx(styles.card, className)} data-variant={variant} {...props} />;
}

export function KitBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: DotAppTone }) {
  return <span className={cx(styles.badge, toneClasses[tone])}>{children}</span>;
}

export function KitCallout({
  title,
  body,
  tone = "neutral",
}: {
  title?: ReactNode;
  body?: ReactNode;
  tone?: DotAppTone;
}) {
  return (
    <div className={cx(styles.callout, toneClasses[tone])}>
      <span className={styles.calloutMark} />
      <div>
        {title && <p className={styles.calloutTitle}>{title}</p>}
        {body && <p className={styles.calloutBody}>{body}</p>}
      </div>
    </div>
  );
}

export function KitProgress({ label, value, detail }: { label?: ReactNode; value: number; detail?: ReactNode }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className={styles.progressMeta}>
        <span>{label}</span>
        <span>{detail ?? `${Math.round(safeValue)}%`}</span>
      </div>
      <div className={styles.progressTrack} role="progressbar" aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.progressFill} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function KitStatePanel({
  kind,
  title,
  body,
  action,
}: {
  kind: "loading" | "building" | "permission" | "error" | "archived";
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  const Icon = kind === "permission" ? LockKeyhole : kind === "error" ? AlertTriangle : kind === "archived" ? ArrowLeft : kind === "loading" ? LoaderCircle : RefreshCw;
  return (
    <main className={cx(styles.runtime, styles.statePage)} data-accent="coral">
      <section className={styles.statePanel} aria-live="polite">
        <div className={styles.stateOrb}>
          <Icon size={21} className={kind === "loading" || kind === "building" ? "animate-spin" : undefined} />
        </div>
        <h1 className={styles.stateTitle}>{title}</h1>
        <p className={styles.stateBody}>{body}</p>
        {kind === "building" && (
          <div className={styles.buildSteps} aria-label="Build in progress">
            <span className={cx(styles.buildStep, styles.buildStepActive)} />
            <span className={cx(styles.buildStep, styles.buildStepActive)} />
            <span className={cx(styles.buildStep, styles.buildStepActive)} />
          </div>
        )}
        {action && (
          <div className={styles.stateActions}>
            <KitButton onClick={action.onClick}>{action.label}</KitButton>
          </div>
        )}
      </section>
    </main>
  );
}

export { cx, styles as dotAppStyles, toneClasses };
