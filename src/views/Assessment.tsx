"use client";

/**
 * Assessment runner — supports both V2 blueprint multi-format assessments (M1-M7)
 * and existing V1 in-progress assessments. Every answer is saved server-side;
 * the client never calculates scores.
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
  isV2Answered,
  MODULE_META,
  ModuleTransition,
  QuestionNavigator,
  QuestionOption,
  V2_MODULE_META,
  V2_MODULE_ORDER,
  V2ItemInput,
  V2QuestionNavigator,
} from "@/components/psych/assessment-ui";
import type {
  AssessmentPayload,
  AssessmentQuestion,
  V2AssessmentPayload,
  V2Item,
  V2ResponseValue,
} from "@/lib/types";

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

type BootResult =
  | { mode: "v2_completed"; assessmentId: number }
  | { mode: "v2"; assessmentId: number; payload: V2AssessmentPayload }
  | { mode: "v1"; assessmentId: number; payload: AssessmentPayload };

export default function Assessment({ navigate }: { navigate: (to: string) => void }) {
  const [forceNewV2, setForceNewV2] = useState(false);

  const boot = useAsyncData(async (): Promise<BootResult> => {
    const list = await api.candidate.listAssessments();
    const assessments = list.assessments ?? [];
    const inProgressV1 = assessments.find(
      (a) => a.status === "in_progress" && a.version_code === "V1"
    );
    const inProgressV2 = assessments.find(
      (a) => a.status === "in_progress" && a.version_code === "V2"
    );
    const completedV2 = assessments.find(
      (a) => a.status === "completed" && a.version_code === "V2"
    );

    // Preserve any in-flight V1 assessment cleanly
    if (!forceNewV2 && inProgressV1) {
      const payload = (await api.assessment.questions(inProgressV1.id)) as unknown as AssessmentPayload;
      return { mode: "v1", assessmentId: inProgressV1.id, payload };
    }

    if (!forceNewV2 && completedV2 && !inProgressV2) {
      return { mode: "v2_completed", assessmentId: completedV2.id };
    }

    const started = await api.v2.start();
    const payload = await api.v2.assessment(started.assessment_id);
    return { mode: "v2", assessmentId: started.assessment_id, payload };
  }, [forceNewV2]);

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

  if (boot.data?.mode === "v2_completed") {
    return (
      <div className="p-6 max-w-xl mx-auto mt-16">
        <Card className="p-8 text-center">
          <Badge tone="ok" dot>Completed</Badge>
          <h2 className="font-display text-[21px] font-bold mt-3">
            You&apos;ve already completed this assessment
          </h2>
          <p className="mt-2 text-[14px] text-ink-2">
            Your career cluster profile and pathway recommendations are ready to explore.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={() => navigate("/results")}>View my profile</Button>
            <Button variant="secondary" onClick={() => setForceNewV2(true)}>
              Start a fresh V2 attempt
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (boot.loading || !boot.data) {
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

  if (boot.data.mode === "v2") {
    return (
      <V2Runner
        key={boot.data.assessmentId}
        initialPayload={boot.data.payload}
        assessmentId={boot.data.assessmentId}
        navigate={navigate}
      />
    );
  }

  const payload = boot.data.payload;
  return (
    <V1Runner
      key={payload.assessment_id}
      payload={payload}
      assessmentId={boot.data.assessmentId}
      questions={sortQuestions(payload.questions)}
      navigate={navigate}
    />
  );
}

/* ============================================================
   V2 RUNNER (MODULES M1-M7 MULTI-FORMAT)
   ============================================================ */

function V2Runner({
  initialPayload,
  assessmentId,
  navigate,
}: {
  initialPayload: V2AssessmentPayload;
  assessmentId: number;
  navigate: (to: string) => void;
}) {
  const { pushToast, refreshProfile } = useApp();
  const [questions, setQuestions] = useState<V2Item[]>(initialPayload.questions);
  const [grade, setGrade] = useState<number>(initialPayload.grade);
  const [accommodations, setAccommodations] = useState(initialPayload.accommodations);
  const [responses, setResponses] = useState<Record<string, V2ResponseValue>>(
    () => initialPayload.responses || {}
  );

  const initialIdx = useMemo(() => {
    const firstOpen = initialPayload.questions.findIndex(
      (q) => !isV2Answered(q, initialPayload.responses?.[String(q.id)])
    );
    if (firstOpen === -1) {
      const savedStep = initialPayload.current_step ? Number(initialPayload.current_step) - 1 : 0;
      return Math.min(Math.max(savedStep, 0), Math.max(initialPayload.questions.length - 1, 0));
    }
    return firstOpen;
  }, [initialPayload]);

  const [idx, setIdx] = useState<number>(initialIdx);
  const [phase, setPhase] = useState<Phase>(() => {
    const q = initialPayload.questions[initialIdx];
    const hasStarted = Object.keys(initialPayload.responses || {}).length > 0;
    if (!hasStarted && q) return "transition";
    return "question";
  });
  const [transitionModule, setTransitionModule] = useState<number | null>(() => {
    const q = initialPayload.questions[initialIdx];
    const hasStarted = Object.keys(initialPayload.responses || {}).length > 0;
    return !hasStarted && q ? q.module : null;
  });

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const itemStartRef = useRef<number>(Date.now());
  const advanceTimer = useRef<number | null>(null);

  useEffect(() => {
    itemStartRef.current = Date.now();
  }, [idx, phase]);

  useEffect(() => {
    if (Object.keys(initialPayload.responses || {}).length > 0) {
      pushToast("Progress restored — your earlier answers are safe.", "success");
    }
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  const answeredCount = useMemo(
    () => questions.filter((q) => isV2Answered(q, responses[String(q.id)])).length,
    [questions, responses]
  );

  const moduleOf = (i: number) => questions[i]?.module;
  const firstOfModule = (m: number) => questions.findIndex((q) => q.module === m);

  const goNext = useCallback(() => {
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
  }, [questions]);

  const goPrev = useCallback(() => {
    setIdx((cur) => {
      if (cur === 0) return cur;
      setPhase("question");
      return cur - 1;
    });
  }, []);

  const jumpTo = (i: number) => {
    setIdx(i);
    setPhase("question");
  };

  const handleSave = async (item: V2Item, body: Record<string, unknown>, autoAdvance: boolean) => {
    const rt = Math.max(0, Date.now() - itemStartRef.current);
    const localVal: V2ResponseValue = {
      answer_key: body.answer_key != null ? String(body.answer_key) : undefined,
      numeric_value: body.numeric_value != null ? Number(body.numeric_value) : undefined,
      response_json: body.response_json,
      response_text: typeof body.response_text === "string" ? body.response_text : undefined,
    };
    setResponses((prev) => ({ ...prev, [String(item.id)]: localVal }));
    setSaveState("saving");

    try {
      const res = await api.v2.saveResponse(assessmentId, {
        item_id: item.id,
        ...body,
        response_time_ms: rt,
        current_step: idx + 1,
      });
      setSaveState("saved");

      if (res.accommodations) setAccommodations(res.accommodations);
      if (res.blueprint_updated && res.grade) {
        setGrade(res.grade);
        const refreshed = await api.v2.assessment(assessmentId);
        setQuestions(refreshed.questions);
        await refreshProfile();
        pushToast(`Pathway adapted for Grade ${res.grade}.`, "info");
      }

      if (autoAdvance) {
        if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
        advanceTimer.current = window.setTimeout(() => goNext(), 260);
      }
    } catch (err) {
      setSaveState("idle");
      pushToast(
        err instanceof ApiError ? err.message : "Couldn't save that answer. Check your connection.",
        "bad"
      );
    }
  };

  const missingByModule = useMemo(() => {
    const missing: Record<number, number> = {};
    for (const q of questions) {
      if (!isV2Answered(q, responses[String(q.id)])) {
        missing[q.module] = (missing[q.module] || 0) + 1;
      }
    }
    return missing;
  }, [questions, responses]);

  const finish = async () => {
    setReviewOpen(false);
    setCompleteError(null);
    setPhase("completing");
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 800);
    const t2 = window.setTimeout(() => setStep(2), 1600);
    try {
      await api.v2.complete(assessmentId);
      window.setTimeout(() => setStep(3), 400);
      window.setTimeout(() => {
        pushToast("Assessment complete — your 16-cluster profile is ready.", "success");
        navigate("/results");
      }, 1300);
    } catch (err) {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (err instanceof ApiError && err.code === "CONFLICT") {
        navigate("/results");
        return;
      }
      setPhase("question");
      setCompleteError(
        err instanceof ApiError && err.code === "ASSESSMENT_INCOMPLETE"
          ? "A few items still need an answer before calculating your profile."
          : err instanceof Error
            ? err.message
            : "Completing the assessment failed. Please try again."
      );
      setReviewOpen(true);
    }
  };

  const q = questions[idx];
  const meta = V2_MODULE_META[q?.module ?? 1] ?? V2_MODULE_META[1];
  const progressPct = Math.round((answeredCount / Math.max(questions.length, 1)) * 100);
  const paceSec = accommodations?.extended_time_pct ? 20 : 16;
  const timeEstimate = `~${Math.max(1, Math.round(((questions.length - answeredCount) * paceSec) / 60))} min left`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 lg:pb-10">
      {/* ---------- header ---------- */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3.5 pb-3 bg-paper/95 backdrop-blur border-b border-line/60">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden"><Wordmark /></span>
            <p className="hidden lg:block text-[13px] font-semibold text-ink-2 truncate">
              Comprehensive Assessment · Grade {grade} Track
            </p>
            {accommodations?.extended_time_pct > 0 && (
              <Badge tone="brand">+{accommodations.extended_time_pct}% extra pacing</Badge>
            )}
          </div>
          <div className="flex items-center gap-3.5 shrink-0">
            <span aria-live="polite" className={`text-[12px] font-semibold flex items-center gap-1.5 ${saveState === "saved" ? "text-ok" : "text-ink-3"}`}>
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
      ) : phase === "transition" && transitionModule != null ? (
        <div className="pt-10 sm:pt-14">
          <ModuleTransition
            meta={{
              key: `m${transitionModule}`,
              index: V2_MODULE_ORDER.indexOf(transitionModule as (typeof V2_MODULE_ORDER)[number]) + 1,
              total: V2_MODULE_ORDER.filter((m) => questions.some((q2) => q2.module === m)).length,
              title: (V2_MODULE_META[transitionModule] ?? V2_MODULE_META[1]).title,
              teaser: (V2_MODULE_META[transitionModule] ?? V2_MODULE_META[1]).teaser,
              description: (V2_MODULE_META[transitionModule] ?? V2_MODULE_META[1]).description,
              count: questions.filter((q2) => q2.module === transitionModule).length,
            }}
            resume={questions.some((q2) => q2.module === transitionModule && isV2Answered(q2, responses[String(q2.id)]))}
            onBegin={() => {
              const first = firstOfModule(transitionModule);
              const firstOpen = questions.findIndex(
                (q2) => q2.module === transitionModule && !isV2Answered(q2, responses[String(q2.id)])
              );
              setIdx(firstOpen === -1 || firstOpen < first ? first : firstOpen);
              setPhase("question");
            }}
          />
        </div>
      ) : q ? (
        <div className="grid lg:grid-cols-[1fr_248px] gap-8 pt-6">
          <div key={q.id} className="fade-in">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge tone="brand">Module {q.module} · {meta.title}</Badge>
              {q.sub && <Badge tone="neutral">{q.sub.replace(/_/g, " ")}</Badge>}
            </div>

            <h1
              id={`q-${q.id}`}
              className="font-display text-[20px] sm:text-[25px] font-bold leading-[1.28] tracking-[-0.015em] mt-4 max-w-2xl"
            >
              {q.stem}
            </h1>

            <div className="mt-6">
              <V2ItemInput
                item={q}
                value={responses[String(q.id)]}
                accommodations={accommodations}
                onSave={(body, auto) => handleSave(q, body, auto)}
              />
            </div>

            <div className="hidden lg:flex items-center justify-between gap-3 mt-8 pt-5 border-t border-line">
              <Button variant="secondary" onClick={goPrev} disabled={idx === 0}>
                Previous
              </Button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="text-[13px] font-semibold text-ink-2 hover:text-ink cursor-pointer px-3 py-2 rounded-[8px] hover:bg-surface-2 transition-colors"
                >
                  Review ({answeredCount}/{questions.length})
                </button>
                <Button onClick={goNext}>
                  {idx === questions.length - 1
                    ? "Review & finish"
                    : isV2Answered(q, responses[String(q.id)])
                      ? "Save & Continue"
                      : "Skip for now"}
                </Button>
              </div>
            </div>

            {completeError && (
              <p role="alert" className="mt-5 rounded-[10px] bg-warn-soft border border-[#EBDDBB] px-4 py-3 text-[13.5px] text-warn font-medium">
                {completeError}
              </p>
            )}
          </div>

          <aside className="hidden lg:block" aria-label="Module progress">
            <Card className="p-4 sticky top-20 max-h-[calc(100vh-6.5rem)] overflow-y-auto">
              <V2QuestionNavigator questions={questions} responses={responses} current={idx} onJump={jumpTo} />
            </Card>
          </aside>
        </div>
      ) : null}

      {phase === "question" && q && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-line px-4 py-3 flex items-center justify-between gap-3 shadow-pop">
          <Button variant="secondary" size="sm" onClick={goPrev} disabled={idx === 0}>
            Previous
          </Button>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="text-[13px] font-semibold text-ink-2 hover:text-ink cursor-pointer px-2"
          >
            Review ({answeredCount}/{questions.length})
          </button>
          <Button size="sm" onClick={goNext}>
            {idx === questions.length - 1
              ? "Finish"
              : isV2Answered(q, responses[String(q.id)])
                ? "Continue"
                : "Skip"}
          </Button>
        </div>
      )}

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
              Every item needs an answer before calculating your profile. Still open:
            </p>
            <div className="mt-3.5 space-y-2.5">
              {V2_MODULE_ORDER.filter((m) => missingByModule[m]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setReviewOpen(false);
                    const firstOpen = questions.findIndex(
                      (q2) => q2.module === m && !isV2Answered(q2, responses[String(q2.id)])
                    );
                    if (firstOpen > -1) jumpTo(firstOpen);
                  }}
                  className="w-full flex items-center justify-between rounded-[10px] border border-line-2 px-4 py-3 hover:border-brand hover:bg-brand-mist transition-colors cursor-pointer"
                >
                  <span className="text-[14px] font-semibold">M{m} · {V2_MODULE_META[m]?.title}</span>
                  <span className="tnum text-[13px] font-bold text-warn">{missingByModule[m]} open</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[14px] text-ink-2 leading-relaxed">
              All <span className="tnum font-bold text-ink">{questions.length}</span> items answered. Your cluster fits, stream options, and learning profile are calculated deterministically from your answers.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================================================
   V1 RUNNER (BACKWARD COMPATIBLE)
   ============================================================ */

function V1Runner({
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

  const [resumedAtMount] = useState(() => Object.keys(payload.responses || {}).length > 0);
  useEffect(() => {
    if (resumedAtMount) pushToast("Progress restored — your earlier answers are safe.", "success");
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  const moduleOf = (i: number) => questions[i]?.module;
  const firstOfModule = (m: string) => questions.findIndex((q) => q.module === m);

  const goNext = useCallback(() => {
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
  }, [questions]);

  const goPrev = useCallback(() => {
    setIdx((cur) => {
      if (cur === 0) return cur;
      setPhase("question");
      return cur - 1;
    });
  }, []);

  const jumpTo = (i: number) => {
    setIdx(i);
    setPhase("question");
  };

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

  const q = questions[idx];
  const meta = MODULE_META[q?.module] ?? MODULE_META.aptitude;
  const progressPct = Math.round((answeredCount / Math.max(questions.length, 1)) * 100);
  const timeEstimate = `~${Math.max(1, Math.round(((questions.length - answeredCount) * 14) / 60))} min left`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 lg:pb-10">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3.5 pb-3 bg-paper/95 backdrop-blur border-b border-line/60">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden"><Wordmark /></span>
            <p className="hidden lg:block text-[13px] font-semibold text-ink-2 truncate">
              Psychometric Assessment · Discover Your Profile
            </p>
          </div>
          <div className="flex items-center gap-3.5 shrink-0">
            <span aria-live="polite" className={`text-[12px] font-semibold flex items-center gap-1.5 ${saveState === "saved" ? "text-ok" : "text-ink-3"}`}>
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
            <h1 id={`q-${q.id}`} className="font-display text-[21px] sm:text-[26px] font-bold leading-[1.25] tracking-[-0.015em] mt-4 max-w-2xl">
              {q.question_text}
            </h1>
            <div role="radiogroup" aria-labelledby={`q-${q.id}`} className="mt-6 grid gap-3">
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
            <div className="hidden lg:flex items-center justify-between gap-3 mt-8 pt-5 border-t border-line">
              <Button variant="secondary" onClick={goPrev} disabled={idx === 0}>
                Previous
              </Button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="text-[13px] font-semibold text-ink-2 hover:text-ink cursor-pointer px-3 py-2 rounded-[8px] hover:bg-surface-2 transition-colors"
                >
                  Review ({answeredCount}/{questions.length})
                </button>
                <Button onClick={goNext}>
                  {idx === questions.length - 1 ? "Review & finish" : responses[q.id] == null ? "Skip for now" : "Save & Continue"}
                </Button>
              </div>
            </div>
            {completeError && (
              <p role="alert" className="mt-5 rounded-[10px] bg-warn-soft border border-[#EBDDBB] px-4 py-3 text-[13.5px] text-warn font-medium">
                {completeError}
              </p>
            )}
          </div>
          <aside className="hidden lg:block" aria-label="Progress detail">
            <Card className="p-4 sticky top-20 max-h-[calc(100vh-6.5rem)] overflow-y-auto">
              <QuestionNavigator questions={questions} responses={Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, { selected_option_id: v }]))} current={idx} onJump={jumpTo} />
            </Card>
          </aside>
        </div>
      ) : null}

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review & finish"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-end">
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>Keep going</Button>
            <Button onClick={finish} disabled={Object.keys(missingByModule).length > 0}>Finish & calculate my profile</Button>
          </div>
        }
      >
        {Object.keys(missingByModule).length > 0 ? (
          <div className="space-y-2.5">
            {MODULE_ORDER.filter((m) => missingByModule[m]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setReviewOpen(false);
                  const firstOpen = questions.findIndex((q2) => q2.module === m && responses[q2.id] == null);
                  if (firstOpen > -1) jumpTo(firstOpen);
                }}
                className="w-full flex items-center justify-between rounded-[10px] border border-line-2 px-4 py-3 hover:border-brand hover:bg-brand-mist transition-colors cursor-pointer"
              >
                <span className="text-[14px] font-semibold">{MODULE_META[m].title}</span>
                <span className="tnum text-[13px] font-bold text-warn">{missingByModule[m]} open</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-ink-2">All {questions.length} questions answered.</p>
        )}
      </Modal>
    </div>
  );
}
