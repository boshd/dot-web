import { LoaderCircle } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DotMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block size-3 shrink-0 rounded-full bg-foreground", className)}
    />
  );
}

export function DotBrand({
  className,
  quiet = false,
}: {
  className?: string;
  quiet?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} aria-label="Dot">
      <DotMark className={quiet ? "bg-black/35" : undefined} />
      <span className={cn("text-[15px] font-medium tracking-[-0.02em]", quiet && "text-muted")}>
        Dot
      </span>
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "border-foreground bg-foreground text-white hover:bg-black hover:border-black",
    secondary: "border-black/12 bg-white text-black/72 hover:border-black/25 hover:text-black",
    ghost: "border-transparent bg-transparent text-muted hover:bg-black/5 hover:text-black/72",
    danger: "border-(--danger)/18 bg-white text-(--danger) hover:bg-(--danger)/5",
  };
  const sizes = {
    sm: "h-9 rounded-[10px] px-3.5 text-xs",
    md: "h-11 rounded-[11px] px-4 text-[13px]",
    lg: "h-12 rounded-xl px-5 text-sm",
    icon: "size-10 rounded-[11px]",
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 border font-medium transition-[background-color,border-color,color,transform,opacity] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[18px] border border-black/10 bg-white", className)}
      {...props}
    />
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[10px] font-medium uppercase tracking-[0.16em] text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-black/10 pb-7 sm:pb-9">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-[2.15rem] font-normal leading-[0.98] tracking-[-0.055em] sm:text-[3.65rem]">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-[15px]">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export function Notice({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "border-black/10 bg-white text-black/68",
    success: "border-(--sage)/20 bg-(--sage-soft) text-black/65",
    danger: "border-(--danger)/18 bg-[#f8ebe8] text-(--danger)",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm leading-5", tones[tone], className)}
    >
      {children}
    </div>
  );
}

export function LoadingState({ label = "one sec" }: { label?: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted" role="status">
      <LoaderCircle className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
