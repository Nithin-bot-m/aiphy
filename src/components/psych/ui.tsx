"use client";

/**
 * Psychometric AI — component primitives.
 * One visual system: every color/spacing/radius value comes from the design
 * tokens in globals.css. No component invents its own styling.
 */
import { useEffect, useRef } from "react";
import { useApp, type Toast } from "@/lib/AppContext";
import type { Tone } from "@/lib/format";

/* ---------------- logo ---------------- */

export function LogoMark({ size = 28, inverse = false }: { size?: number; inverse?: boolean }) {
  const ink = inverse ? "#F3F1EA" : "var(--accent)";
  const soft = inverse ? "rgba(243,241,234,.35)" : "var(--accent-soft)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 2.5 27.5 9v14L16 29.5 4.5 23V9L16 2.5Z"
        stroke={ink}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.1" fill={ink} />
      <path d="M16 8.2v4.1M16 19.7v4.1M9 12l3.6 2.1M19.4 17.9 23 20M23 12l-3.6 2.1M12.6 17.9 9 20"
        stroke={soft} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <LogoMark inverse={inverse} />
      <span className={`font-display font-bold tracking-tight text-[17px] ${inverse ? "text-[#F3F1EA]" : "text-ink"}`}>
        Psychometric<span className={inverse ? "text-[#9DC3BD]" : "text-brand"}>&nbsp;AI</span>
      </span>
    </span>
  );
}

/* ---------------- button ---------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-strong shadow-[0_1px_2px_rgba(14,114,104,.35)] disabled:bg-ink-3 disabled:shadow-none",
  secondary:
    "bg-surface text-ink border border-line-2 hover:border-ink-3 hover:bg-paper disabled:text-ink-3",
  ghost: "text-brand hover:bg-brand-mist disabled:text-ink-3",
  danger: "bg-bad text-white hover:brightness-90 disabled:bg-ink-3",
  inverse: "bg-[#F3F1EA] text-[#14211F] hover:bg-white",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-[8px] gap-1.5",
  md: "h-10 px-4 text-[14px] rounded-[10px] gap-2",
  lg: "h-12 px-6 text-[15.5px] rounded-[12px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
    >
      {loading && <Spinner className="mr-0.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent opacity-80 animate-spin ${className}`}
    />
  );
}

/* ---------------- surfaces ---------------- */

export function Card({
  className = "",
  children,
  interactive = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...rest}
      className={`bg-surface border border-line rounded-card shadow-card ${
        interactive ? "transition-all duration-200 hover:shadow-pop hover:border-line-2 cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand ${className}`}>{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  inverse = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  inverse?: boolean;
}) {
  return (
    <div className={`${align === "center" ? "text-center mx-auto max-w-2xl" : ""} mb-8`}>
      {eyebrow && <Eyebrow className="mb-2.5">{eyebrow}</Eyebrow>}
      <h2 className={`font-display text-[26px] md:text-[32px] font-bold leading-[1.15] tracking-[-0.02em] ${inverse ? "text-[#F3F1EA]" : "text-ink"}`}>
        {title}
      </h2>
      {description && (
        <p className={`mt-3 text-[15px] leading-relaxed ${inverse ? "text-[#B9C4C1]" : "text-ink-2"}`}>
          {description}
        </p>
      )}
    </div>
  );
}

/* ---------------- badges ---------------- */

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-[#CBE5D5]",
  warn: "bg-warn-soft text-warn border-[#EBDDBB]",
  bad: "bg-bad-soft text-bad border-[#EFCFC9]",
  brand: "bg-brand-soft text-brand-strong border-[#C8E0DB]",
  neutral: "bg-surface-2 text-ink-2 border-line-2",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
  dot = false,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONE_CLASS[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/* ---------------- progress ---------------- */

export function Progress({
  value,
  max = 100,
  tone = "brand",
  className = "",
  label,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "ok" | "warn";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={`h-1.5 w-full rounded-full bg-surface-2 overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full bar-fill ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------- skeletons ---------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="p-6 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i % 2 ? "w-full" : "w-5/6"}`} />
      ))}
    </Card>
  );
}

/* ---------------- empty & error states ---------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center border border-dashed border-line-2 rounded-card bg-surface ${
        compact ? "py-8 px-6" : "py-16 px-8"
      }`}
    >
      {icon && <div className="mb-4 text-ink-3">{icon}</div>}
      <p className="font-display font-bold text-[17px] text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-md text-[14px] text-ink-2 leading-relaxed">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  tone = "bad",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  tone?: Tone;
}) {
  return (
    <Card className="p-8 text-center" role="alert">
      <div
        className={`mx-auto mb-4 w-11 h-11 rounded-full flex items-center justify-center ${
          tone === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 6.5v4.2M10 13.6v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="10" r="7.6" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      </div>
      <p className="font-display font-bold text-[17px]">{title}</p>
      <p className="mt-1.5 text-[14px] text-ink-2 max-w-md mx-auto">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-[#141B1A]/45 fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-surface w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} rounded-t-[20px] sm:rounded-card shadow-pop outline-none max-h-[92vh] flex flex-col rise`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h3 className="font-display font-bold text-[16.5px]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full hover:bg-surface-2 text-ink-2 cursor-pointer inline-flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line bg-paper rounded-b-card">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- toasts ---------------- */

const TOAST_TONE: Record<Toast["tone"], string> = {
  info: "border-line-2 text-ink",
  success: "border-[#CBE5D5] text-ok",
  warn: "border-[#EBDDBB] text-warn",
  bad: "border-[#EFCFC9] text-bad",
};

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed z-[60] bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 flex flex-col gap-2 w-[calc(100vw-32px)] sm:w-96 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto bg-surface border ${TOAST_TONE[t.tone]} rounded-[12px] shadow-pop px-4 py-3 text-[13.5px] font-medium flex items-start gap-2.5 rise`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => dismissToast(t.id)}
            className="text-ink-3 hover:text-ink cursor-pointer"
          >
            <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 2l10 10M12 2 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- form fields ---------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink mb-1.5">
        {label}
        {required && <span className="text-bad ml-0.5" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full h-11 px-3.5 rounded-[10px] border bg-surface text-[14.5px] text-ink placeholder:text-ink-3 transition-colors duration-150 focus:border-brand focus:outline-none";

export function Input({
  invalid,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${INPUT_CLASS} ${invalid ? "border-bad" : "border-line-2"} ${className}`}
    />
  );
}

export function Select({
  invalid,
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${INPUT_CLASS} appearance-none pr-9 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path d=%22M1 1l4 4 4-4%22 stroke=%22%2357606A%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-no-repeat bg-[position:right_14px_center] ${invalid ? "border-bad" : "border-line-2"} ${className}`}
    >
      {children}
    </select>
  );
}

export function Textarea({
  invalid,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${INPUT_CLASS} h-auto min-h-[88px] py-3 ${invalid ? "border-bad" : "border-line-2"} ${className}`}
    />
  );
}

/* ---------------- tabs ---------------- */

export function Tabs({
  tabs,
  active,
  onChange,
  className = "",
  ariaLabel = "Sections",
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  active: string;
  onChange: (key: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 overflow-x-auto no-scrollbar bg-surface border border-line rounded-[12px] p-1 ${className}`}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`shrink-0 h-9 px-3.5 rounded-[8px] text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
              on ? "bg-ink text-[#F3F1EA]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className={`ml-1.5 tnum text-[11.5px] ${on ? "opacity-70" : "text-ink-3"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- stat ---------------- */

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">{label}</p>
      <p className={`mt-2 font-display text-[28px] font-bold leading-none tnum ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12.5px] text-ink-2">{sub}</p>}
    </Card>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}
