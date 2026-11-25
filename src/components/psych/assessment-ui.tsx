"use client";

/**
 * Assessment runner UI parts: option cards, navigator, section transitions
 * and the completion stage indicator. Purely presentational — answers are
 * saved by the backend; this layer never derives or stores score values.
 */
import { useEffect, useState } from "react";
import { Badge, Button, Card, Progress, Textarea } from "./ui";
import type { V2Item, V2ResponseValue } from "@/lib/types";

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
    <div role="navigation" aria-label="Question navigation" className="space-y-3.5">
      {(["aptitude", "riasec", "grit"] as const).map((mod) => {
        const idxs = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.module === mod);
        if (idxs.length === 0) return null;
        const title = mod === "aptitude" ? "Aptitude" : mod === "riasec" ? "Interests" : "Work style";
        const answeredInMod = idxs.filter(({ q }) => responses[q.id]?.selected_option_id != null).length;
        return (
          <div key={mod} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
              <span>{title}</span>
              <span className="tnum font-semibold">{answeredInMod}/{idxs.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
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
                    className={`tnum h-8 rounded-[7px] text-[12px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-ink text-[#F3F1EA] ring-2 ring-ink/30 shadow-sm"
                        : answered
                          ? "bg-brand-soft text-brand-strong hover:bg-brand hover:text-on-brand font-semibold"
                          : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-border font-medium"
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

/* ============================================================
   V2 MULTI-FORMAT ASSESSMENT UI COMPONENTS (MODULES M1-M8)
   ============================================================ */

export const V2_MODULE_ORDER = [1, 2, 3, 4, 5, 6, 7] as const;

export const V2_MODULE_META: Record<number, { title: string; teaser: string; description: string }> = {
  1: {
    title: "Context & Goals",
    teaser: "A bit about your stage",
    description:
      "Your current grade, academic comfort, interests so far, and practical preferences. These never change your skill scores — they tailor pathways cleanly.",
  },
  2: {
    title: "Interests & Flow",
    teaser: "What pulls your attention",
    description:
      "Activities you enjoy, moments when time flies, and how you approach goals and persistence.",
  },
  3: {
    title: "Mind & Work Style",
    teaser: "How you think and work",
    description:
      "Your natural style across teamwork, curiosity, follow-through, thinking preferences, and emotional awareness.",
  },
  4: {
    title: "Reasoning & Creativity",
    teaser: "Your problem-solving toolkit",
    description:
      "A balanced set of verbal, numerical, logical, spatial, perceptual speed, and open-ended creative challenges.",
  },
  5: {
    title: "Practical Judgement",
    teaser: "Real situations at school",
    description:
      "Everyday dilemmas in group work, integrity, leadership, and study trade-offs. Choose what you would most realistically do.",
  },
  6: {
    title: "Core Values",
    teaser: "What matters to you long-term",
    description:
      "Rank or weigh what you want most from work — impact, stability, freedom, growth, craft, or balance.",
  },
  7: {
    title: "Readiness & Reflection",
    teaser: "Calmness & clarity",
    description:
      "A final short reflection on exam comfort, career familiarity, and how you make big choices.",
  },
};

export function isV2Answered(item: V2Item, resp?: V2ResponseValue | null): boolean {
  if (!resp) return false;
  switch (item.item_type) {
    case "likert5":
      return resp.numeric_value != null || resp.answer_key != null;
    case "single_select":
    case "mcq":
    case "forced_choice":
    case "scenario":
    case "sjt":
      return Boolean(resp.answer_key);
    case "best_worst": {
      const bw = resp.response_json as { most?: string; least?: string } | null;
      return Boolean(bw?.most && bw?.least && bw.most !== bw.least);
    }
    case "ranking":
      return Array.isArray(resp.response_json) && resp.response_json.length === item.options.length;
    case "multi_select":
      return Array.isArray(resp.response_json) && resp.response_json.length >= 1;
    case "open_text":
      return typeof resp.response_text === "string" && resp.response_text.trim().length >= 2;
    default:
      return false;
  }
}

export function V2QuestionNavigator({
  questions,
  responses,
  current,
  onJump,
}: {
  questions: V2Item[];
  responses: Record<string, V2ResponseValue>;
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div role="navigation" aria-label="Module navigation" className="space-y-4">
      {V2_MODULE_ORDER.map((mod) => {
        const idxs = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.module === mod);
        if (idxs.length === 0) return null;
        const meta = V2_MODULE_META[mod];
        const answeredInMod = idxs.filter(({ q }) => isV2Answered(q, responses[String(q.id)])).length;
        return (
          <div key={mod} className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
              <span className="truncate pr-2">M{mod} · {meta?.title}</span>
              <span className="tnum font-semibold shrink-0">{answeredInMod}/{idxs.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {idxs.map(({ q, i }) => {
                const answered = isV2Answered(q, responses[String(q.id)]);
                const isCurrent = i === current;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onJump(i)}
                    aria-label={`Go to question ${i + 1}${answered ? " (answered)" : ""}`}
                    aria-current={isCurrent ? "true" : undefined}
                    className={`tnum h-8 rounded-[7px] text-[12px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-ink text-[#F3F1EA] ring-2 ring-ink/30 shadow-sm"
                        : answered
                          ? "bg-brand-soft text-brand-strong hover:bg-brand hover:text-on-brand font-semibold"
                          : "bg-surface-2 text-ink-3 hover:text-ink hover:bg-border font-medium"
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

const LIKERT_DEFAULT_LABELS: Array<{ k: string; text: string }> = [
  { k: "1", text: "Strongly disagree / Not like me" },
  { k: "2", text: "Disagree / Rarely" },
  { k: "3", text: "Neutral / Sometimes" },
  { k: "4", text: "Agree / Often" },
  { k: "5", text: "Strongly agree / Very much like me" },
];

export function V2ItemInput({
  item,
  value,
  onSave,
  accommodations,
  allowAutoAdvance = true,
}: {
  item: V2Item;
  value?: V2ResponseValue | null;
  onSave: (payload: Record<string, unknown>, autoAdvance: boolean) => void;
  accommodations?: { extended_time_pct?: number; simpler_wording?: boolean };
  allowAutoAdvance?: boolean;
}) {
  const [bwState, setBwState] = useState<{ most?: string; least?: string }>(() => {
    const v = value?.response_json as { most?: string; least?: string } | null;
    return { most: v?.most, least: v?.least };
  });
  const [rankOrder, setRankOrder] = useState<string[]>(() =>
    Array.isArray(value?.response_json) ? value.response_json.map(String) : []
  );
  const [multiPicks, setMultiPicks] = useState<string[]>(() =>
    Array.isArray(value?.response_json) ? value.response_json.map(String) : []
  );
  const [textDraft, setTextDraft] = useState<string>(() => value?.response_text ?? "");

  // Pacing timer specifically for timed cognitive/creativity items (M4 CRE)
  const isTimedCreative = item.module === 4 && item.item_type === "open_text" && (item.time_sec ?? 0) > 0;
  const baseTime = item.time_sec || 90;
  const maxSeconds = Math.round(baseTime * (1 + (accommodations?.extended_time_pct ?? 0) / 100));
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const v = value?.response_json as { most?: string; least?: string } | null;
    setBwState({ most: v?.most, least: v?.least });
    setRankOrder(Array.isArray(value?.response_json) ? value.response_json.map(String) : []);
    setMultiPicks(Array.isArray(value?.response_json) ? value.response_json.map(String) : []);
    setTextDraft(value?.response_text ?? "");
    setElapsedSec(0);
  }, [item.id, value?.response_text]);

  useEffect(() => {
    if (!isTimedCreative) return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [isTimedCreative, item.id]);

  // 1. Single-choice / Likert / MCQ / Forced-choice / Scenario / SJT
  if (["likert5", "single_select", "mcq", "forced_choice", "scenario", "sjt"].includes(item.item_type)) {
    const opts = item.options?.length > 0 ? item.options : LIKERT_DEFAULT_LABELS;
    const activeKey = value?.answer_key ?? (value?.numeric_value != null ? String(value.numeric_value) : null);
    return (
      <div role="radiogroup" className="grid gap-3">
        {opts.map((o) => {
          const optKey = String(o.k);
          const selected = activeKey === optKey;
          return (
            <QuestionOption
              key={optKey}
              option={{ id: 0, option_key: optKey, option_text: o.text }}
              selected={selected}
              likert={item.item_type === "likert5"}
              onSelect={() => {
                if (item.item_type === "likert5") {
                  onSave({ numeric_value: Number(optKey), answer_key: optKey }, allowAutoAdvance);
                } else {
                  onSave({ answer_key: optKey }, allowAutoAdvance);
                }
              }}
            />
          );
        })}
      </div>
    );
  }

  // 2. Best-Worst scaling
  if (item.item_type === "best_worst") {
    const pickBw = (side: "most" | "least", key: string) => {
      const next = { ...bwState };
      if (side === "most") {
        next.most = key;
        if (next.least === key) next.least = undefined;
      } else {
        next.least = key;
        if (next.most === key) next.most = undefined;
      }
      setBwState(next);
      if (next.most && next.least && next.most !== next.least) {
        onSave({ response_json: { most: next.most, least: next.least } }, allowAutoAdvance);
      }
    };

    return (
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          Select one statement as <strong>Most like me</strong> and a different one as <strong>Least like me</strong>.
        </p>
        {item.options.map((o) => {
          const k = String(o.k);
          const isMost = bwState.most === k;
          const isLeast = bwState.least === k;
          return (
            <div
              key={k}
              className={`rounded-[14px] border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                isMost || isLeast ? "border-brand bg-brand-mist/50" : "border-line-2 bg-surface"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-[8px] bg-surface-2 text-ink-2 font-display font-bold text-[12px] flex items-center justify-center">
                  {k}
                </span>
                <p className="text-[14.5px] leading-snug text-ink">{o.text}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => pickBw("most", k)}
                  className={`px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border cursor-pointer transition-colors ${
                    isMost
                      ? "bg-brand text-on-brand border-brand"
                      : "bg-paper border-line-2 text-ink-2 hover:border-brand hover:text-brand"
                  }`}
                >
                  Most
                </button>
                <button
                  type="button"
                  onClick={() => pickBw("least", k)}
                  className={`px-3 py-1.5 rounded-[9px] text-[12px] font-semibold border cursor-pointer transition-colors ${
                    isLeast
                      ? "bg-ink text-[#F3F1EA] border-ink"
                      : "bg-paper border-line-2 text-ink-2 hover:border-ink hover:text-ink"
                  }`}
                >
                  Least
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Ranking (click options in priority order #1 -> #N)
  if (item.item_type === "ranking") {
    const toggleRank = (k: string) => {
      const idx = rankOrder.indexOf(k);
      let next: string[];
      if (idx > -1) {
        next = rankOrder.filter((x) => x !== k);
      } else {
        next = [...rankOrder, k];
      }
      setRankOrder(next);
      if (next.length === item.options.length) {
        onSave({ response_json: next }, false);
      }
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] text-ink-3">
            Tap items in order from <strong>#1 (most important)</strong> to <strong>#{item.options.length}</strong>.
          </p>
          {rankOrder.length > 0 && (
            <button
              type="button"
              onClick={() => setRankOrder([])}
              className="text-[12px] font-semibold text-ink-2 hover:text-ink cursor-pointer"
            >
              Reset order
            </button>
          )}
        </div>
        {item.options.map((o) => {
          const k = String(o.k);
          const pos = rankOrder.indexOf(k);
          const isRanked = pos > -1;
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleRank(k)}
              className={`w-full text-left flex items-center gap-4 rounded-[14px] border px-4 py-3.5 transition-all cursor-pointer ${
                isRanked ? "border-brand bg-brand-mist shadow-card" : "border-line-2 bg-surface hover:border-ink-3"
              }`}
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center font-display font-bold text-[14px] ${
                  isRanked ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-3"
                }`}
              >
                {isRanked ? `#${pos + 1}` : o.k}
              </span>
              <span className="flex-1 text-[14.5px] text-ink font-medium">{o.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 4. Multi-select (1..4 selections)
  if (item.item_type === "multi_select") {
    const maxPicks = Math.min(4, item.options.length);
    const togglePick = (k: string) => {
      let next: string[];
      if (multiPicks.includes(k)) {
        next = multiPicks.filter((x) => x !== k);
      } else {
        if (multiPicks.length >= maxPicks) {
          next = [...multiPicks.slice(1), k];
        } else {
          next = [...multiPicks, k];
        }
      }
      setMultiPicks(next);
      if (next.length >= 1) {
        onSave({ response_json: next }, false);
      }
    };

    return (
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-3">
          Select up to {maxPicks} option{maxPicks > 1 ? "s" : ""} that fit best ({multiPicks.length} chosen).
        </p>
        {item.options.map((o) => {
          const k = String(o.k);
          const picked = multiPicks.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={picked}
              onClick={() => togglePick(k)}
              className={`w-full text-left flex items-center gap-4 rounded-[14px] border px-4 py-3.5 transition-all cursor-pointer ${
                picked ? "border-brand bg-brand-mist shadow-card" : "border-line-2 bg-surface hover:border-ink-3"
              }`}
            >
              <span
                className={`shrink-0 w-8 h-8 rounded-[9px] flex items-center justify-center font-display font-bold text-[13px] ${
                  picked ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-2"
                }`}
              >
                {picked ? "✓" : o.k}
              </span>
              <span className="flex-1 text-[14.5px] text-ink">{o.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 5. Open text (M1 goals, M2/M4 CRE with 90s + optional +25% extended timer, M7 reflection)
  const remaining = Math.max(0, maxSeconds - elapsedSec);
  const words = textDraft.trim() ? textDraft.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-4">
      {isTimedCreative && (
        <div className="rounded-[12px] border border-line bg-surface p-3.5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12.5px] font-semibold text-ink">
              Guided creative pacing · {remaining}s remaining
            </p>
            <p className="text-[11.5px] text-ink-3">
              Aim for varied, original ideas{accommodations?.extended_time_pct ? ` (+${accommodations.extended_time_pct}% extra time active)` : ""}. You can still save after the timer finishes.
            </p>
          </div>
          <span className="tnum font-display text-[18px] font-bold text-brand shrink-0">
            {remaining}s
          </span>
        </div>
      )}
      <Textarea
        rows={5}
        value={textDraft}
        onChange={(e) => setTextDraft(e.target.value)}
        placeholder="Write your thoughts honestly in a few words or ideas…"
        aria-label={item.stem}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3 tnum">{words} word{words === 1 ? "" : "s"}</span>
        <Button
          size="sm"
          disabled={textDraft.trim().length < 2}
          onClick={() => onSave({ response_text: textDraft.trim() }, allowAutoAdvance)}
        >
          Save written answer
        </Button>
      </div>
    </div>
  );
}
