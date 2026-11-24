"use client";

/**
 * Assessment runner — one question at a time, auto-saved server-side.
 * Answers are sent to the backend on every selection (the server derives all
 * score values from the chosen option — the client never sends or computes
 * scores). Refresh-safe: state is restored from the backend on mount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Modal,
  Progress,
  Skeleton,
  Wordmark,
} from "@/components/psych/ui";
import {
  CompletingStages,
  MODULE_META,
  ModuleTransition,
  QuestionNavigator,
  QuestionOption,
} from "@/components/psych/assessment-ui";
import type { AssessmentPayload, AssessmentQuestion } from "@/lib/types";

const MODULE_ORDER = ["aptitude", "riasec", "grit"] as const;

type Phase = "transition" | "question" | "completing";

function sortQuestions(list: AssessmentQuestion[]): AssessmentQuestion[] {
  return [...list].sort((a, b) => {
    const ma = MODULE_ORDER.indexOf(a.module as (typeof MODULE_ORDER)[number]);
    const mb = MODULE_ORDER.indexOf(b.module as (typeof MODULE_ORDER)[number]);
    if (ma !== mb) return ma - mb;
    return a.id - b.id;
  });
}

function initialResponses(payload: AssessmentPayload): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const [qid, r] of Object.entries(payload.responses || {})) {
    map[Number(qid)] = r.selected_option_id ?? null;
  }
  return map;
}

function initialIndex(payload: AssessmentPayload, questions: AssessmentQuestion[]): number {
  const map = initialResponses(payload);
  const firstUnanswered = questions.findIndex((q) => map[q.id] == null);
  const savedStep = payload.current_step ? Number(payload.current_step) - 1 : 0;
  if (firstUnanswered === -1) return Math.min(Math.max(savedStep, 0), questions.length - 1);
  return firstUnanswered;
}

function initialPhase(
  payload: AssessmentPayload,
  questions: AssessmentQuestion[]
): { phase: Phase; transitionModule: string | null } {
  const map = initialResponses(payload);
  const firstUnanswered = questions.findIndex((q) => map[q.id] == null);
  const savedStep = payload.current_step ? Number(payload.current_step) - 1 : 0;
  if (firstUnanswered === -1) return { phase: "question", transitionModule: null };
  const targetModule = questions[firstUnanswered].module;
  const freshModule =
    firstUnanswered === 0 ||
    (firstUnanswered > 0 && questions[firstUnanswered - 1].module !== targetModule);
  const resumed = Object.keys(map).length > 0;
  if (freshModule && !(resumed && savedStep >= firstUnanswered)) {
    return { phase: "transition", transitionModule: targetModule };
  }
  return { phase: "question", transitionModule: null };
}

export default function Assessment({ navigate }: { navigate: (to: string) => void }) {
  /* ---------- server data ---------- */
  const boot = useAsyncData(async () => {
    const started = await api.assessment.start();
    if (started.assessment.status === "completed") {
      return { completed: true as const, assessmentId: started.assessment.id };
    }
    const payload = (await api.assessment.questions(started.assessment.id)) as unknown as AssessmentPayload;
    return { completed: false as const, assessmentId: started.assessment.id, payload };
  }, []);

  if (boot.error) {
    return (
      <div className="p-6 max-w-xl mx-auto mt-10">
        <ErrorState
          title="The assessment couldn't be opened"
          message={boot.error.message}
          onRetry={boot.reload}
        />
      </div>
    );
  }

  if (boot.data?.completed) {
    return (
      <div className="p-6 max-w-xl mx-auto mt-16">
        <Card className="p-8 text-center">
          <h2 className="font-display text-[20px] font-bold">You've already completed this assessment</h2>
          <p className="mt-2 text-[14px] text-ink-2">Your profile and stream explorer are ready to view.</p>
          <Button className="mt-6" onClick={() => navigate("/results")}>
            View my profile
          </Button>
        </Card>
      </div>
    );
  }

  if (boot.loading || !boot.data || !boot.data.payload || boot.data.payload.questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Skeleton className="h-5 w-52 mb-6" />
        <Skeleton className="h-1.5 w-full mb-8" />
        <Card className="p-8 space-y-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-3/4" />
          <div className="pt-3 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[14px]" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const payload = boot.data.payload;
  return (
    <Runner
      key={payload.assessment_id}
      payload={payload}
      assessmentId={boot.data.assessmentId}
      questions={sortQuestions(payload.questions)}
      navigate={navigate}
    />
  );
}

function Runner({
  payload,
  assessmentId,
  questions,
  navigate,
}: {
  payload: AssessmentPayload;
  assessmentId: number;
  questions: AssessmentQuestion[];
  navigate: (to: string) => void;
}) {
  const { pushToast } = useApp();

  const [phase, setPhase] = useState<Phase>(() => initialPhase(payload, questions).phase);
  const [transitionModule, setTransitionModule] = useState<string | null>(
    () => initialPhase(payload, questions).transitionModule
  );
  const [idx, setIdx] = useState(() => initialIndex(payload, questions));
  const [responses, setResponses] = useState<Record<string, number | null>>(() => initialResponses(payload));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const advanceTimer = useRef<number | null>(null);

  const answeredCount = useMemo(
    () => questions.filter((q) => responses[q.id] != null).length,
    [questions, responses]
  );

  // Restore notice (mount only — external toast system)
  const [resumedAtMount] = useState(() => Object.keys(payload.responses || {}).length > 0);
  useEffect(() => {
    if (resumedAtMount) pushToast("Progress restored — your earlier answers are safe.", "success");
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  /* ---------- navigation helpers ---------- */
  const moduleOf = (i: number) => questions[i]?.module;
  const firstOfModule = (m: string) => questions.findIndex((q) => q.module === m);
  const lastOfModule = (m: string) => {
    let last = -1;
    questions.forEach((q, i) => {
      if (q.module === m) last = i;
    });
    return last;
  };

  const goNext = () => {
    setIdx((cur) => {
      if (cur >= questions.length - 1) {
        setReviewOpen(true);
        return cur;
      }
      const next = cur + 1;
      if (moduleOf(next) !== moduleOf(cur)) {
        setTransitionModule(moduleOf(next));
        setPhase("transition");
      } else {
        setPhase("question");
      }
      return next;
    });
  };

  const goPrev = () => {
    setIdx((cur) => {
      if (cur === 0) return cur;
      const prev = cur - 1;
      setPhase("question");
      return prev;
    });
  };

  const jumpTo = (i: number) => {
    setIdx(i);
    setPhase("question");
  };

  /* ---------- answering (server saves on every selection) ---------- */
  const select = async (q: AssessmentQuestion, optionId: number) => {
    if (!assessmentId) return;
    setResponses((r) => ({ ...r, [q.id]: optionId }));
    setSaveState("saving");
    try {
      await api.assessment.saveResponse(assessmentId, {
        question_id: q.id,
        selected_option_id: optionId,
        current_step: idx + 1,
      });
      setSaveState("saved");
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => goNext(), 240);
    } catch (err) {
      setSaveState("idle");
      pushToast(
        err instanceof ApiError ? err.message : "Couldn't save that answer. Check your connection.",
        "bad"
      );
    }
  };

  /* ---------- completion ---------- */
  const missingByModule = useMemo(() => {
    const missing: Record<string, number> = {};
    for (const q of questions) {
      if (responses[q.id] == null) missing[q.module] = (missing[q.module] || 0) + 1;
    }
    return missing;
  }, [questions, responses]);

  const finish = async () => {
    if (!assessmentId) return;
    setReviewOpen(false);
    setCompleteError(null);
    setPhase("completing");
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 900);
    const t2 = window.setTimeout(() => setStep(2), 1800);
    try {
      await api.assessment.complete(assessmentId);
      window.setTimeout(() => setStep(3), 400);
      window.setTimeout(() => {
        pushToast("Assessment complete — your profile is ready.", "success");
        navigate("/results");
      }, 1500);
    } catch (err) {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (err instanceof ApiError && err.code === "CONFLICT") {
        pushToast("This assessment was already completed.", "info");
        navigate("/results");
        return;
      }
      setPhase("question");
      setCompleteError(
        err instanceof ApiError && err.code === "ASSESSMENT_INCOMPLETE"
          ? "A few questions are still unanswered. Every item is needed before scoring."
          : err instanceof Error
            ? err.message
            : "Completing the assessment failed. Please try again."
      );
      setReviewOpen(true);
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    if (phase !== "question") return;
    const q = questions[idx];
    if (!q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      const letters = ["a", "b", "c", "d", "e"];
      const nums = ["1", "2", "3", "4", "5"];
      let optIdx = letters.indexOf(key);
      if (optIdx === -1) optIdx = nums.indexOf(key);
      if (optIdx > -1 && q.options[optIdx]) {
        e.preventDefault();
        select(q, q.options[optIdx].id);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, questions, idx, select, goNext, goPrev]);

  /* ================= render ================= */

  const q = questions[idx];
  const meta = MODULE_META[q?.module] ?? MODULE_META.aptitude;
  const progressPct = Math.round((answeredCount / Math.max(questions.length, 1)) * 100);
  const timeEstimate = `~${Math.max(1, Math.round(((questions.length - answeredCount) * 14) / 60))} min left`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 lg:pb-10">
      {/* ---------- runner header ---------- */}
      <div className="sticky top-[14px] lg:top-4 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-3 bg-paper/92 backdrop-blur rounded-b-[14px]">
        <div className="flex items-center justify-between gap-4 mb-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden"><Wordmark /></span>
            <span className="sm:hidden font-display font-bold text-[14px]">Your Profile</span>
            <span className="hidden lg:block h-4 w-px bg-line-2" aria-hidden="true" />
            <p className="hidden lg:block text-[13px] font-semibold text-ink-2 truncate">
              Discover Your Profile
            </p>
          </div>
          <div className="flex items-center gap-3.5 shrink-0">
            <span
              aria-live="polite"
              className={`text-[12px] font-semibold flex items-center gap-1.5 ${
                saveState === "saved" ? "text-ok" : saveState === "saving" ? "text-ink-3" : "text-ink-3"
              }`}
            >
              {saveState === "saving" && <span className="w-3 h-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" aria-hidden="true" />}
              {saveState === "saved" ? "✓ Saved" : saveState === "saving" ? "Saving…" : ""}
            </span>
            <p className="tnum text-[12.5px] font-bold text-ink">
              {Math.min(idx + 1, questions.length)} <span className="text-ink-3 font-semibold">/ {questions.length}</span>
            </p>
          </div>
        </div>
        <Progress value={progressPct} label="Assessment progress" />
        <p className="mt-1.5 text-[11.5px] text-ink-3 tnum">
          {answeredCount} answered · {timeEstimate}
        </p>
      </div>

      {/* ---------- body ---------- */}
      {phase === "completing" ? (
        <div className="pt-10">
          <CompletingStages step={step} />
        </div>
      ) : phase === "transition" && transitionModule ? (
        <div className="pt-10 sm:pt-14">
          <ModuleTransition
            meta={{
              key: transitionModule,
              index: MODULE_ORDER.indexOf(transitionModule as (typeof MODULE_ORDER)[number]) + 1,
              total: MODULE_ORDER.filter((m) => questions.some((q2) => q2.module === m)).length,
              title: MODULE_META[transitionModule].title,
              teaser: MODULE_META[transitionModule].teaser,
              description: MODULE_META[transitionModule].description,
              count: questions.filter((q2) => q2.module === transitionModule).length,
            }}
            resume={questions.some((q2) => q2.module === transitionModule && responses[q2.id] != null)}
            onBegin={() => {
              const first = firstOfModule(transitionModule);
              const firstOpen = questions.findIndex((q2) => q2.module === transitionModule && responses[q2.id] == null);
              setIdx(firstOpen === -1 || firstOpen < first ? first : firstOpen);
              setPhase("question");
            }}
          />
        </div>
      ) : q ? (
        <div className="grid lg:grid-cols-[1fr_230px] gap-8 pt-6">
          <div key={q.id} className="fade-in">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge tone="brand">
                Section {MODULE_ORDER.indexOf(q.module as (typeof MODULE_ORDER)[number]) + 1} · {meta.title}
              </Badge>
              <Badge tone="neutral">{q.category}</Badge>
            </div>
            <h1
              id={`q-${q.id}`}
              className="font-display text-[21px] sm:text-[26px] font-bold leading-[1.25] tracking-[-0.015em] mt-4 max-w-2xl"
            >
              {q.question_text}
            </h1>
            <p className="text-[12.5px] text-ink-3 mt-2.5">
              {q.question_type === "likert_5"
                ? "Rate how much this sounds like you."
                : "Pick the option that best answers the question."}
              <span className="hidden lg:inline"> · Keyboard: A–E or 1–5 to select, ← → to move.</span>
            </p>

            <div
              role="radiogroup"
              aria-labelledby={`q-${q.id}`}
              className={`mt-6 gap-3 ${q.question_type === "likert_5" ? "grid sm:grid-cols-2 xl:grid-cols-1" : "grid"}`}
            >
              {q.options.map((o) => (
                <QuestionOption
                  key={o.id}
                  option={o}
                  selected={responses[q.id] === o.id}
                  likert={q.question_type === "likert_5"}
                  onSelect={() => select(q, o.id)}
                />
              ))}
            </div>

            {completeError && (
              <p role="alert" className="mt-5 rounded-[10px] bg-warn-soft border border-[#EBDDBB] px-4 py-3 text-[13.5px] text-warn font-medium">
                {completeError}
              </p>
            )}
          </div>

          {/* desktop rail */}
          <aside className="hidden lg:block" aria-label="Progress detail">
            <Card className="p-4 sticky top-32">
              <QuestionNavigator questions={questions} responses={Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, { selected_option_id: v }]))} current={idx} onJump={jumpTo} />
            </Card>
          </aside>
        </div>
      ) : null}

      {/* ---------- bottom action bar ---------- */}
      {phase === "question" && q && (
        <div className="fixed lg:sticky bottom-0 left-0 right-0 lg:bottom-4 z-30">
          <div className="lg:max-w-5xl lg:mx-auto lg:px-6">
            <div className="bg-surface/95 backdrop-blur border-t lg:border border-line lg:rounded-card lg:shadow-pop px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={goPrev} disabled={idx === 0}>
                <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M7.5 2.5 4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
                </svg>
                Previous
              </Button>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setReviewOpen(true)}
                  className="hidden sm:inline text-[13px] font-semibold text-ink-2 hover:text-ink cursor-pointer px-2"
                >
                  Review
                </button>
                <Button onClick={goNext} aria-label={responses[q.id] == null ? "Skip question" : "Save and continue"}>
                  {idx === questions.length - 1
                    ? (responses[q.id] == null ? "Skip to review" : "Review & finish")
                    : (responses[q.id] == null ? "Skip for now" : "Save & Continue")}
                  <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* mobile navigator drawer trigger */}
      <button
        onClick={() => setReviewOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-ink text-[#F3F1EA] shadow-pop flex items-center justify-center cursor-pointer"
        aria-label="Review progress and finish"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
        </svg>
      </button>

      {/* ---------- review / finish modal ---------- */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review & finish"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-end">
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Keep going
            </Button>
            <Button onClick={finish} disabled={Object.keys(missingByModule).length > 0}>
              Finish & calculate my profile
            </Button>
          </div>
        }
      >
        {Object.keys(missingByModule).length > 0 ? (
          <div>
            <p className="text-[14px] text-ink-2">
              Every question needs an answer before scoring. Still open:
            </p>
            <div className="mt-3.5 space-y-2.5">
              {MODULE_ORDER.filter((m) => missingByModule[m]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setReviewOpen(false);
                    const firstOpen = questions.findIndex((q2) => q2.module === m && responses[q2.id] == null);
                    if (firstOpen > -1) {
                      if (firstOpen === 0 || questions[firstOpen - 1].module !== m) {
                        setTransitionModule(m);
                        setPhase("transition");
                        setIdx(firstOpen);
                      } else {
                        jumpTo(firstOpen);
                      }
                    }
                  }}
                  className="w-full flex items-center justify-between rounded-[10px] border border-line-2 px-4 py-3 hover:border-brand hover:bg-brand-mist transition-colors cursor-pointer"
                >
                  <span className="text-[14px] font-semibold">{MODULE_META[m].title}</span>
                  <span className="tnum text-[13px] font-bold text-warn">{missingByModule[m]} open</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[14px] text-ink-2 leading-relaxed">
              All <span className="tnum font-bold text-ink">{questions.length}</span> questions answered. When you finish, your scores are calculated
              deterministically from your responses — the same answers always produce the same profile.
            </p>
            <p className="mt-3 text-[13px] text-ink-3">
              You'll be able to explore your results, stream fits and a shareable report right after.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
