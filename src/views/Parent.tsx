"use client";

/**
 * Parent experience — calm, professional, discussion-focused.
 * Home (children + linking) · Child dashboard · Alignment (perspective
 * inventory + neutral comparison) · Reports. Visually differentiated from
 * the student UI via a calmer surface treatment and a distinct header band.
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  SkeletonCard,
  Textarea,
  Eyebrow,
} from "@/components/psych/ui";
import { AlignmentCard } from "@/components/psych/dataviz";
import { fmtDateTime } from "@/lib/format";
import type { ParentChildDashboard, ParentChildRow, Congruence } from "@/lib/types";
import ReportReader from "./Report";

const STREAM_LABELS: Record<string, string> = {
  pcm: "Science · PCM",
  pcb: "Science · PCB",
  commerce_math: "Commerce with Mathematics",
  commerce_no_math: "Commerce without Mathematics",
  humanities_law: "Humanities / Arts / Law",
  design: "Design / Creative Arts",
  vocational: "Vocational / Applied Technology",
};

const PRIORITY_LABELS: Record<string, string> = {
  stability: "Financial stability and job security",
  prestige: "Professional prestige and recognition",
  fulfillment: "Passion, creativity and self-expression",
  entrepreneurship: "Building something of their own",
  balanced: "A balanced mix of the above",
  exploration: "Keeping options open and exploring first",
};

const PERCEPTION_ITEMS: Array<{ key: string; label: string; blurb: string }> = [
  { key: "observed_analytical", label: "Analytical thinking", blurb: "How they work through problems day to day" },
  { key: "observed_creative", label: "Creative expression", blurb: "Ideas, making, imagination at home" },
  { key: "observed_study_habits", label: "Study discipline", blurb: "Routine, follow-through, self-organisation" },
  { key: "observed_stress_resilience", label: "Resilience", blurb: "How they handle pressure and setbacks" },
];

/* ---------------- shared pieces ---------------- */

function ParentHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-card bg-inverse px-6 py-7 sm:px-8 rise">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FB5AF]">Parent space</p>
      <h1 className="font-display text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] text-[#F3F1EA] mt-1.5">
        {title}
      </h1>
      <p className="text-[13.5px] text-[#B9C4C1] mt-1.5 max-w-2xl leading-relaxed">{sub}</p>
    </div>
  );
}

function useChildren() {
  return useAsyncData(async () => {
    const data = (await api.parent.children()) as { children: ParentChildRow[] };
    return data.children ?? [];
  }, []);
}

function ChildPicker({
  children_,
  activeId,
  onSelect,
}: {
  children_: ParentChildRow[];
  activeId: number | null;
  onSelect: (id: number, assessmentId: number | null) => void;
}) {
  const linked = children_.filter((c) => c.link_status === "linked");
  if (linked.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="tablist" aria-label="Choose child">
      {linked.map((c) => {
        const on = c.latest_assessment_id != null && activeId === c.latest_assessment_id;
        return (
          <button
            key={c.student_id}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(c.student_id, c.latest_assessment_id)}
            className={`shrink-0 h-9 px-4 rounded-full border text-[13px] font-semibold transition-all cursor-pointer ${
              on ? "bg-ink text-[#F3F1EA] border-ink" : "bg-surface border-line-2 text-ink-2 hover:text-ink"
            }`}
          >
            {c.full_name}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   PARENT HOME — children & linking
   ============================================================ */

export function ParentHome() {
  const { pushToast } = useApp();
  const { data, error, loading, reload } = useChildren();
  const [code, setCode] = useState("");
  const [linking, setLinking] = useState(false);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^PC-[A-Z0-9]+$/i.test(trimmed)) {
      pushToast("Student codes look like PC-XXXXXXXX — please check and retry.", "warn");
      return;
    }
    setLinking(true);
    try {
      await api.parent.linkRequest(trimmed.toUpperCase());
      pushToast("Request sent. Your child needs to approve it before anything is shared.", "success");
      setCode("");
      reload();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Couldn't send the request.", "bad");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
      <ParentHeader
        title="Understanding your child's profile"
        sub="A calm space to see your child's strengths and interests, share your perspective, and prepare for a good conversation."
      />

      {error ? (
        <div className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      ) : loading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      ) : (
        <>
          {/* -------- children -------- */}
          <section className="mt-8 space-y-4" aria-label="Linked children">
            {(data ?? []).length === 0 ? (
              <EmptyState
                title="No children linked yet"
                body="Ask your child for their student code (they'll find it in their Profile tab) and send a linking request below."
              />
            ) : (
              (data ?? []).map((c) => {
                const pending = c.link_status !== "linked";
                const done = c.assessment_status === "completed";
                return (
                  <Card key={c.mapping_id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-display font-bold text-[17px]">{c.full_name}</p>
                          <Badge tone={pending ? "warn" : "ok"} dot>
                            {pending ? "Waiting for approval" : "Linked"}
                          </Badge>
                        </div>
                        <p className="text-[13px] text-ink-2 mt-1.5">
                          {[
                            c.grade != null ? `Grade ${c.grade}` : null,
                            c.school_name || null,
                            c.board || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        <p className="text-[13px] text-ink-2 mt-2.5">
                          {pending
                            ? "You'll see their profile here once they approve the request."
                            : done
                              ? `Assessment completed${c.completed_at ? ` ${fmtDateTime(c.completed_at)}` : ""} — open the Child tab to see their profile.`
                              : "Assessment not completed yet. You'll be able to share your perspective once it's done."}
                        </p>
                      </div>
                      {!pending && done && c.latest_assessment_id != null && (
                        <Button variant="secondary" onClick={() => (window.location.hash = "/parent/child")}>
                          View profile
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </section>

          {/* -------- link by code -------- */}
          <section className="mt-8" aria-label="Link a student">
            <Card className="p-5 sm:p-6">
              <p className="font-semibold text-[15px]">Link to your child</p>
              <p className="text-[13.5px] text-ink-2 mt-1.5 leading-relaxed max-w-xl">
                Enter the student code your child shares with you. They will review and approve the
                connection — their results are theirs to share.
              </p>
              <form onSubmit={link} className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <Field label="Student code" htmlFor="student-code" hint="Format: PC-XXXXXXXX">
                    <Input
                      id="student-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="PC-DEMOSTU1"
                      autoComplete="off"
                    />
                  </Field>
                </div>
                <Button type="submit" loading={linking} className="mb-[26px] sm:mb-[26px]">
                  Send request
                </Button>
              </form>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

/* ============================================================
   CHILD DASHBOARD
   ============================================================ */

export function ParentChild() {
  const { data: children_, error: childrenError, loading: childrenLoading, reload } = useChildren();
  const [selected, setSelected] = useState<number | null>(null);

  const activeAssessment = useMemo(() => {
    const linked = (children_ ?? []).filter((c) => c.link_status === "linked" && c.latest_assessment_id != null);
    return linked.find((c) => c.latest_assessment_id === selected)?.latest_assessment_id ?? linked[0]?.latest_assessment_id ?? null;
  }, [children_, selected]);

  const dash = useAsyncData(async () => {
    if (activeAssessment == null) return null;
    return (await api.parent.child(activeAssessment)) as unknown as ParentChildDashboard;
  }, [activeAssessment]);

  if (childrenError) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <ErrorState message={childrenError.message} onRetry={reload} />
      </div>
    );
  }
  if (childrenLoading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-4">
        <Skeleton className="h-32 w-full rounded-card" />
        <SkeletonCard />
      </div>
    );
  }

  const linkedWithResults = (children_ ?? []).filter((c) => c.link_status === "linked" && c.assessment_status === "completed");
  if (linkedWithResults.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-8">
        <ParentHeader title="Child profile" sub="See your child's strengths and stream possibilities here once their assessment is complete." />
        <div className="mt-8">
          <EmptyState
            title="No completed assessment yet"
            body="When your child completes their assessment, their strengths, interest patterns and stream directions will appear here."
          />
        </div>
      </div>
    );
  }

  const d = dash.data;

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
      <ParentHeader
        title="Understanding your child's profile"
        sub="A structured picture of strengths, interests and stream directions — designed for discussion, not comparison."
      />

      <div className="mt-6">
        <ChildPicker children_={children_ ?? []} activeId={activeAssessment} onSelect={(_sid, aid) => setSelected(aid)} />
      </div>

      {dash.loading || !d ? (
        <div className="mt-8 space-y-4">
          <SkeletonCard />
          <SkeletonCard lines={4} />
        </div>
      ) : dash.error ? (
        <div className="mt-6">
          <ErrorState message={dash.error.message} onRetry={dash.reload} />
        </div>
      ) : (
        <div className="mt-8 space-y-5 fade-in">
          {/* summary */}
          <Card className="p-6">
            <Eyebrow>Student</Eyebrow>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display font-bold text-[19px]">{d.student.first_name}</p>
                <p className="text-[13px] text-ink-2 mt-0.5">
                  {d.student.grade != null ? `Grade ${d.student.grade} · ` : ""}
                  {d.student.board ?? ""}
                  {d.assessment ? ` · Version ${d.assessment.version_code}` : ""}
                </p>
              </div>
              {d.assessment?.completed_at && (
                <Badge tone="ok" dot>Completed {fmtDateTime(d.assessment.completed_at)}</Badge>
              )}
            </div>
          </Card>

          {/* top streams */}
          <Card className="p-6">
            <p className="font-semibold text-[15px]">Stream directions</p>
            <p className="text-[12.5px] text-ink-3 mt-0.5 mb-4">
              Fit indices from their responses — possibilities to explore together, not conclusions.
            </p>
            <div className="space-y-2.5">
              {d.top_streams.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-[10px] border border-line px-4 py-3">
                  <span className="text-[14px] font-semibold">{s.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="tnum text-[15px] font-bold">{s.score === null ? "—" : Number(s.score).toFixed(1).replace(/\.0$/, "")}</span>
                    <Badge tone={s.band?.includes("Strong") ? "ok" : s.band?.includes("Possible") ? "warn" : "neutral"}>
                      {s.band ?? "—"}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="mt-4 -ml-2" onClick={() => (window.location.hash = "/parent/reports")}>
              Open the full report
            </Button>
          </Card>

          {/* alignment preview */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-[15px]">Your perspective</p>
                <p className="text-[13px] text-ink-2 mt-1 max-w-md leading-relaxed">
                  {d.my_expectations?.submitted
                    ? "You've shared your perspective — see the alignment summary and the areas worth a conversation."
                    : "Share what you hope for and what you observe. Alignment is computed from both perspectives, in neutral language."}
                </p>
              </div>
              <Button onClick={() => (window.location.hash = "/parent/alignment")}>
                {d.my_expectations?.submitted ? "View alignment" : "Share your perspective"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ALIGNMENT — inventory + congruence
   ============================================================ */

export function ParentAlignment() {
  const { pushToast } = useApp();
  const { data: children_, loading: childrenLoading } = useChildren();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    expected_stream: "pcm",
    outcome_priority: "balanced",
    observed_analytical: "3",
    observed_creative: "3",
    observed_study_habits: "3",
    observed_stress_resilience: "3",
    comments: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const activeAssessment = useMemo(() => {
    const linked = (children_ ?? []).filter((c) => c.link_status === "linked" && c.latest_assessment_id != null);
    return linked.find((c) => c.latest_assessment_id === selected)?.latest_assessment_id ?? linked[0]?.latest_assessment_id ?? null;
  }, [children_, selected]);

  const dash = useAsyncData(async () => {
    if (activeAssessment == null) return null;
    return (await api.parent.child(activeAssessment)) as unknown as ParentChildDashboard;
  }, [activeAssessment]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (activeAssessment == null) return;
    const perceptions = {
      observed_analytical: Number(form.observed_analytical),
      observed_creative: Number(form.observed_creative),
      observed_study_habits: Number(form.observed_study_habits),
      observed_stress_resilience: Number(form.observed_stress_resilience),
    };
    if (Object.values(perceptions).some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
      setFormError("All four observations are needed (1–5). Nothing is assumed on your behalf.");
      return;
    }
    setBusy(true);
    try {
      await api.parent.submitInventory({
        assessment_id: activeAssessment,
        expected_stream: form.expected_stream,
        outcome_priority: form.outcome_priority,
        perceptions,
        comments: form.comments.trim() || undefined,
      });
      pushToast("Perspective saved — alignment updated.", "success");
      setEditing(false);
      dash.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save your perspective.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    const p = dash.data?.my_perceptions;
    setForm((f) => ({
      ...f,
      expected_stream: dash.data?.my_expectations?.expected_stream ?? f.expected_stream,
      outcome_priority: dash.data?.my_expectations?.outcome_priority ?? f.outcome_priority,
      observed_analytical: String(p?.observed_analytical ?? 3),
      observed_creative: String(p?.observed_creative ?? 3),
      observed_study_habits: String(p?.observed_study_habits ?? 3),
      observed_stress_resilience: String(p?.observed_stress_resilience ?? 3),
    }));
    setEditing(true);
  };

  if (childrenLoading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  const linkedWithResults = (children_ ?? []).filter((c) => c.link_status === "linked" && c.assessment_status === "completed");
  const d = dash.data;
  const congruence: Congruence | null = d?.congruence ?? null;
  const submitted = Boolean(d?.my_expectations?.submitted);

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
      <ParentHeader
        title="Student & parent — side by side"
        sub="Where your hopes meet your child's own profile. Alignment is shown neutrally: there is no right side to pick."
      />

      {linkedWithResults.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing to align yet"
            body="Alignment appears once your child completes their assessment. Until then their results stay private and nothing is assumed."
          />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <ChildPicker children_={children_ ?? []} activeId={activeAssessment} onSelect={(_sid, aid) => setSelected(aid)} />
          </div>

          {dash.loading || !d ? (
            <div className="mt-8">
              <SkeletonCard lines={4} />
            </div>
          ) : dash.error ? (
            <div className="mt-6">
              <ErrorState message={dash.error.message} onRetry={dash.reload} />
            </div>
          ) : (
            <div className="mt-8 space-y-6 fade-in">
              {submitted && congruence && !editing && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="font-display text-[20px] font-bold">Alignment summary</h2>
                    <Button size="sm" variant="secondary" onClick={startEdit}>
                      Update perspective
                    </Button>
                  </div>
                  <AlignmentCard
                    congruence={congruence}
                    studentName={d.student.first_name}
                    fallback={{
                      studentTopStream: d.top_streams?.find((s2) => s2.rank === 1)?.name ?? d.top_streams?.[0]?.name ?? null,
                      parentExpectedStream: d.my_expectations?.expected_stream ? (STREAM_LABELS[d.my_expectations.expected_stream] ?? d.my_expectations.expected_stream) : null,
                      parentPriority: d.my_expectations?.outcome_priority ? (PRIORITY_LABELS[d.my_expectations.outcome_priority] ?? d.my_expectations.outcome_priority) : null,
                    }}
                  />
                  {congruence.discussion_areas && congruence.discussion_areas.length > 0 && (
                    <Card className="p-6">
                      <p className="font-semibold text-[15px] mb-3">Questions worth asking</p>
                      <ul className="space-y-2.5">
                        {congruence.discussion_areas.map((a, i) => (
                          <li key={i} className="flex gap-3 text-[14px] text-ink-2 leading-relaxed">
                            <span className="tnum text-ink-3 font-bold shrink-0">{i + 1}.</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[12px] text-ink-3 mt-4 leading-relaxed">
                        Suggested from the areas flagged in the alignment calculation — conversation
                        starters, not instructions.
                      </p>
                    </Card>
                  )}
                </>
              )}

              {(editing || !submitted) && (
                <Card className="p-6 sm:p-7" id="inventory-form">
                  <p className="font-semibold text-[16px]">{submitted ? "Update your perspective" : "Share your perspective"}</p>
                  <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">
                    Four quick parts: the direction you expected, what matters most to you, and how
                    you'd rate four everyday observations. Your child's own results are combined with
                    this — neutrally.
                  </p>
                  <form onSubmit={submit} className="mt-5" noValidate>
                    <div className="grid sm:grid-cols-2 gap-x-4">
                      <Field label="Direction you expected for them" htmlFor="expected-stream" required>
                        <Select id="expected-stream" value={form.expected_stream} onChange={(e) => setForm((f) => ({ ...f, expected_stream: e.target.value }))}>
                          {Object.entries(STREAM_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="What matters most for their outcome" htmlFor="outcome-priority" required>
                        <Select id="outcome-priority" value={form.outcome_priority} onChange={(e) => setForm((f) => ({ ...f, outcome_priority: e.target.value }))}>
                          {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-2 space-y-4">
                      {PERCEPTION_ITEMS.map((item) => (
                        <div key={item.key} className="rounded-[12px] border border-line px-4 py-3.5">
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                              <p className="text-[14px] font-semibold">{item.label}</p>
                              <p className="text-[12px] text-ink-3">{item.blurb}</p>
                            </div>
                            <div className="flex items-center gap-2" role="radiogroup" aria-label={item.label}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  role="radio"
                                  aria-checked={form[item.key as keyof typeof form] === String(n)}
                                  onClick={() => setForm((f) => ({ ...f, [item.key]: String(n) }))}
                                  className={`tnum w-10 h-10 rounded-[10px] border font-bold text-[14px] transition-all cursor-pointer ${
                                    form[item.key as keyof typeof form] === String(n)
                                      ? "bg-brand border-brand text-on-brand"
                                      : "border-line-2 text-ink-2 hover:border-ink-3"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Field label="Anything else worth noting?" htmlFor="comments" hint="Optional — a sentence helps the conversation.">
                        <Textarea id="comments" value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} />
                      </Field>
                    </div>
                    {formError && (
                      <p role="alert" className="mb-4 rounded-[10px] bg-bad-soft border border-[#EFCFC9] px-4 py-3 text-[13.5px] text-bad font-medium">
                        {formError}
                      </p>
                    )}
                    <div className="flex gap-2.5">
                      <Button type="submit" loading={busy}>
                        {submitted ? "Save changes" : "Submit perspective"}
                      </Button>
                      {submitted && (
                        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   PARENT REPORTS
   ============================================================ */

export function ParentReports() {
  const { data: children_, loading } = useChildren();
  const [selected, setSelected] = useState<number | null>(null);

  const activeAssessment = useMemo(() => {
    const linked = (children_ ?? []).filter((c) => c.link_status === "linked" && c.latest_assessment_id != null);
    return linked.find((c) => c.latest_assessment_id === selected)?.latest_assessment_id ?? linked[0]?.latest_assessment_id ?? null;
  }, [children_, selected]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  }

  const hasAny = (children_ ?? []).some((c) => c.link_status === "linked" && c.assessment_status === "completed");

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 sm:py-10">
      <ParentHeader
        title="Reports"
        sub="The same comprehensive guidance report your child sees — including a version tailored for parents."
      />
      <div className="mt-6">
        <ChildPicker children_={children_ ?? []} activeId={activeAssessment} onSelect={(_sid, aid) => setSelected(aid)} />
      </div>
      <div className="mt-6">
        {!hasAny || activeAssessment == null ? (
          <EmptyState
            title="No reports yet"
            body="Reports appear here after your child completes their assessment."
          />
        ) : (
          <ReportReader assessmentId={activeAssessment} allowedTypes={["parent", "candidate"]} initialType="parent" />
        )}
      </div>
    </div>
  );
}
