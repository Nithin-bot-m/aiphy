"use client";

/**
 * Assessment runner UI parts: option cards, navigator, section transitions
 * and the completion stage indicator. Purely presentational — answers are
 * saved by the backend; this layer never derives or stores score values.
 */
import { Badge, Button, Card, Progress } from "./ui";

export interface NavOption {
  id: number;
  option_key: string;
  option_text: string;
}

/* ---------------- question option card ---------------- */

export function QuestionOption({
  option,
  selected,
  onSelect,
  likert = false,
}: {
  option: NavOption;
  selected: boolean;
  onSelect: () => void;
  likert?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-4 rounded-[14px] border px-4 sm:px-5 py-4 transition-all duration-150 cursor-pointer ${
        selected
          ? "border-brand bg-brand-mist shadow-card"
          : "border-line-2 bg-surface hover:border-ink-3 hover:bg-paper"
      }`}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center font-display font-bold text-[14px] transition-colors ${
          selected ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-2"
        }`}
      >
        {option.option_key}
      </span>
      <span className={`flex-1 text-[14.5px] sm:text-[15.5px] leading-snug ${selected ? "font-semibold text-ink" : "text-ink"}`}>
        {option.option_text}
      </span>
      <span
        aria-hidden="true"
        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          selected ? "border-brand bg-brand" : "border-line-2"
        }`}
      >
        {selected && (
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M2.5 6.2 5 8.7l4.5-5" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {likert && <span className="sr-only">, scale point {option.option_key} of 5</span>}
    </button>
  );
}

/* ---------------- question navigator ---------------- */

export function QuestionNavigator({
  questions,
  responses,
  current,
  onJump,
}: {
  questions: Array<{ id: number; module: string }>;
  responses: Record<string, { selected_option_id: number | null }>;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div role="navigation" aria-label="Question navigation" className="space-y-3">
      {(["aptitude", "riasec", "grit"] as const).map((mod) => {
        const idxs = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.module === mod);
        if (idxs.length === 0) return null;
        const title = mod === "aptitude" ? "Aptitude" : mod === "riasec" ? "Interests" : "Work style";
        return (
          <div key={mod}>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-1.5">
              {title} · {idxs.filter(({ q }) => responses[q.id]?.selected_option_id != null).length}/{idxs.length}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {idxs.map(({ i }) => {
                const q = questions[i];
                const answered = responses[q.id]?.selected_option_id != null;
                const isCurrent = i === current;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onJump(i)}
                    aria-label={`Go to question ${i + 1}${answered ? " (answered)" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`tnum w-8.5 h-8.5 min-w-[34px] min-h-[34px] sm:min-w-[32px] sm:min-h-[32px] rounded-[8px] text-[12px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-ink text-[#F3F1EA] ring-2 ring-ink-3/30"
                        : answered
                          ? "bg-brand-soft text-brand-strong hover:bg-brand hover:text-on-brand"
                          : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-border"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- section transition ---------------- */

export interface ModuleMeta {
  key: string;
  index: number;
  total: number;
  title: string;
  teaser: string;
  description: string;
  count: number;
}

export const MODULE_META: Record<string, { title: string; teaser: string; description: string }> = {
  aptitude: {
    title: "Aptitude",
    teaser: "How you naturally approach problems",
    description:
      "Short reasoning items across six areas — numerical, logical, verbal, spatial, abstract and data. There are no trick questions; answer as accurately as you can.",
  },
  riasec: {
    title: "Interests",
    teaser: "What you enjoy working with",
    description:
      "Statements about activities and work settings. Rate how much each sounds like you — honest answers make the profile more useful.",
  },
  grit: {
    title: "Work style",
    teaser: "How you work and persist",
    description:
      "How you approach focus, practice, setbacks and follow-through. There are no right answers — this describes your style, not your worth.",
  },
};

export function ModuleTransition({
  meta,
  onBegin,
  resume = false,
}: {
  meta: ModuleMeta;
  onBegin: () => void;
  resume?: boolean;
}) {
  return (
    <Card className="max-w-xl mx-auto p-8 sm:p-10 text-center rise">
      <Badge tone="brand">
        Section {meta.index} of {meta.total}
      </Badge>
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3 mt-6">
        {resume ? "Up next" : "Next"}
      </p>
      <h2 className="font-display text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] mt-2">
        {meta.teaser}
      </h2>
      <p className="text-[14.5px] text-ink-2 leading-relaxed mt-3 max-w-md mx-auto">{meta.description}</p>
      <p className="text-[12.5px] text-ink-3 mt-4 tnum">
        {meta.count} questions · {meta.title}
      </p>
      <Button size="lg" className="mt-7" onClick={onBegin}>
        {resume ? "Continue section" : "Begin section"}
      </Button>
    </Card>
  );
}

/* ---------------- completion stages ---------------- */

/**
 * The three steps shown here mirror what the backend actually does on
 * /complete: deterministic scoring → explanation/report build → persist.
 * Nothing is faked: steps advance while the real request is in flight.
 */
export function CompletingStages({ step }: { step: 0 | 1 | 2 | 3 }) {
  const stages = [
    "Calculating your assessment profile",
    "Preparing your explanation",
    "Building your report",
  ];
  return (
    <Card className="max-w-md mx-auto p-8 sm:p-10 rise" aria-live="polite">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Preparing your results</p>
      <h2 className="font-display text-[24px] font-bold mt-2">Almost there</h2>
      <div className="mt-7 space-y-4">
        {stages.map((s, i) => {
          const done = step > i;
          const active = step === i;
          return (
            <div key={s} className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                  done ? "bg-ok-soft text-ok" : active ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-3"
                }`}
              >
                {done ? (
                  <svg width="13" height="13" viewBox="0 0 12 12">
                    <path d="M2.5 6.2 5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="tnum text-[12px] font-bold">{i + 1}</span>
                )}
              </span>
              <span className={`text-[14.5px] ${done ? "text-ink-2" : active ? "font-semibold text-ink" : "text-ink-3"}`}>
                {s}
              </span>
              {active && <span className="ml-auto w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <Progress value={Math.min(step, 3) * 33 + 1} className="mt-7" label="Completion progress" />
      <p className="text-[12px] text-ink-3 mt-4">
        Your scores are calculated deterministically from your responses — the same answers always
        produce the same profile.
      </p>
    </Card>
  );
}
