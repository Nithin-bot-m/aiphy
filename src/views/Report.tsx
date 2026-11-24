"use client";

/**
 * Report reader — premium, print-friendly document view.
 * Left: table of contents. Right: metadata + structured visual sections +
 * the backend's sanitized narrative. The report content is the backend's
 * word-for-word data; this view adds layout, not opinions.
 */
import { useMemo, useState } from "react";
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
} from "@/components/psych/ui";
import { AlignmentCard, AptitudePanel, RiasecChart, WorkStylePanel } from "@/components/psych/dataviz";
import { fmtDateTime, shortHash, bandTone } from "@/lib/format";
import { sanitizeNarrative, narrativeToText } from "@/lib/sanitize";
import type { CanonicalResult, ReportPayload, ReportType } from "@/lib/types";

function ReportStages({ step }: { step: 0 | 1 | 2 }) {
  const stages = ["Preparing your explanation", "Building your report"];
  return (
    <div aria-live="polite">
      <div className="space-y-4">
        {stages.map((s, i) => {
          const done = step > i;
          const active = step === i;
          return (
            <div key={s} className="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
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
              <span className={`text-[14.5px] ${done ? "text-ink-2" : active ? "font-semibold text-ink" : "text-ink-3"}`}>{s}</span>
              {active && <span className="ml-auto w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <Progress value={Math.min(step, 2) * 50 + 1} className="mt-6" label="Report preparation" />
    </div>
  );
}

export default function ReportReader({
  assessmentId,
  allowedTypes,
  initialType,
}: {
  assessmentId: number;
  allowedTypes: ReportType[];
  initialType?: ReportType;
}) {
  const { pushToast, profile, user } = useApp();
  const [preferred, setPreferred] = useState<ReportType>(initialType ?? allowedTypes[0] ?? "candidate");
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenStep, setRegenStep] = useState<0 | 1 | 2>(0);
  const [shareOpen, setShareOpen] = useState(false);

  const res = useAsyncData(async () => {
    // Try the preferred type first; if it isn't generated yet, fall back to
    // another accessible type rather than dead-ending the reader.
    const order = [preferred, ...allowedTypes.filter((t) => t !== preferred)];
    let lastErr: unknown = null;
    for (const t of order) {
      try {
        const data = (await api.reports.get(assessmentId, t)) as unknown as ReportPayload;
        return { ...data, effectiveType: t };
      } catch (e) {
        lastErr = e;
        if (e instanceof ApiError && e.code === "NOT_FOUND") continue;
        throw e;
      }
    }
    throw lastErr;
  }, [assessmentId, preferred]);

  const report = res.data?.report;
  const structured = report?.structured_data as CanonicalResult | null | undefined;
  const type: ReportType = res.data?.effectiveType ?? preferred;
  const studentCode =
    structured?.student?.student_code ??
    ((profile as Record<string, unknown> | null)?.student_code as string | undefined);

  // candidate → candidate report only; parent → parent+candidate (server enforces)
  const canRegenerate = allowedTypes.length > 0;

  const regenerate = async () => {
    setRegenOpen(true);
    setRegenStep(0);
    const t = window.setTimeout(() => setRegenStep(1), 900);
    try {
      await api.reports.regenerate(assessmentId, type);
      window.clearTimeout(t);
      setRegenStep(2);
      window.setTimeout(async () => {
        setRegenOpen(false);
        pushToast("Report rebuilt from the same stored results.", "success");
        res.reload();
      }, 900);
    } catch (err) {
      window.clearTimeout(t);
      setRegenOpen(false);
      pushToast(err instanceof Error ? err.message : "Couldn't rebuild the report.", "bad");
    }
  };

  const share = () => {
    setShareOpen(true);
  };

  const sections = useMemo(() => {
    if (!structured) return [];
    const s: Array<{ id: string; label: string }> = [{ id: "overview", label: "Overview" }];
    s.push({ id: "aptitude", label: "Aptitude" });
    s.push({ id: "interests", label: "Interests" });
    s.push({ id: "workstyle", label: "Work Style" });
    s.push({ id: "streams", label: "Stream Exploration" });
    if (structured.congruence?.has_parent_data) s.push({ id: "alignment", label: "Parent Alignment" });
    s.push({ id: "next", label: "Next Steps" });
    return s;
  }, [structured]);

  if (res.loading) {
    return (
      <Card className="p-8 space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="pt-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className={`h-3.5 ${i % 2 ? "w-11/12" : "w-full"}`} />
          ))}
        </div>
      </Card>
    );
  }

  if (res.error) {
    return (
      <ErrorState
        title={res.error.code === "NOT_FOUND" ? "Report not generated yet" : "Couldn't open the report"}
        message={
          res.error.code === "NOT_FOUND"
            ? "This report hasn't been generated. Try regenerating it, or check back shortly."
            : res.error.message
        }
        onRetry={res.reload}
      />
    );
  }

  if (!report || !structured) {
    return (
      <Card className="p-10 text-center">
        <p className="font-display font-bold text-[17px]">No report generated yet</p>
        <p className="mt-2 text-[14px] text-ink-2 max-w-md mx-auto">
          Reports are produced automatically when an assessment completes. If this seems wrong, try
          regenerating.
        </p>
        {canRegenerate && (
          <Button className="mt-6" onClick={regenerate}>
            Generate report
          </Button>
        )}
      </Card>
    );
  }

  const goTo = (id: string) => {
    document.getElementById(`rsec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-8 items-start">
      {/* ---------------- TOC ---------------- */}
      <nav aria-label="Report sections" className="hidden lg:block sticky top-24 no-print">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-3">Contents</p>
        <ul className="space-y-1 border-l border-line">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => goTo(s.id)}
                className="w-full text-left pl-4 py-1.5 text-[13.5px] text-ink-2 hover:text-brand hover:border-brand transition-colors cursor-pointer -ml-px border-l-2 border-transparent"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        {allowedTypes.length > 1 && (
          <div className="mt-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2">Report type</p>
            <div className="flex flex-col gap-1.5">
              {allowedTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setPreferred(t)}
                  aria-pressed={t === type}
                  className={`h-8 px-3 rounded-[8px] text-[12.5px] font-semibold capitalize text-left transition-colors cursor-pointer ${
                    t === type ? "bg-ink text-[#F3F1EA]" : "bg-surface-2 text-ink-2 hover:text-ink"
                  }`}
                >
                  {t} report
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* ---------------- content ---------------- */}
      <div className="print-area min-w-0">
        {/* actions */}
        <div className="flex flex-wrap items-center gap-2 mb-5 no-print">
          {allowedTypes.length > 1 && (
            <select
              aria-label="Report type"
              value={type}
              onChange={(e) => setPreferred(e.target.value as ReportType)}
              className="lg:hidden h-9 rounded-[9px] border border-line-2 bg-surface px-3 text-[13px] font-semibold cursor-pointer"
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>{t} report</option>
              ))}
            </select>
          )}
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M7 8V3.5h10V8M7 17.5H5.2A1.7 1.7 0 0 1 3.5 15.8V10a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 10v5.8a1.7 1.7 0 0 1-1.7 1.7H17M7 14h10v6.5H7z" />
            </svg>
            Print / Save PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={share}>
            Share
          </Button>
          {canRegenerate && user?.role === "admin" && (
            <Button size="sm" variant="ghost" onClick={regenerate}>
              Refresh report
            </Button>
          )}
        </div>

        {/* header */}
        <Card className="p-6 sm:p-8 print-block">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-[24px] sm:text-[28px] font-bold tracking-[-0.02em] leading-tight">
                {report.title}
              </h1>
              <p className="mt-2 text-[13.5px] text-ink-2">
                {structured.student?.first_name}
                {structured.student?.grade != null ? ` · Grade ${structured.student.grade}` : ""}
                {structured.student?.board ? ` · ${structured.student.board}` : ""}
              </p>
            </div>
            <Badge tone={report.status === "ready" ? "ok" : "warn"} dot>
              {report.status === "ready" ? "Final" : report.status}
            </Badge>
          </div>
          <dl className="mt-5 pt-4 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12.5px]">
            <div>
              <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10.5px]">Assessment version</dt>
              <dd className="tnum font-bold mt-0.5">{structured.assessment?.version_code ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10.5px]">Generated</dt>
              <dd className="tnum font-bold mt-0.5">{fmtDateTime(report.generated_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10.5px]">Scoring method</dt>
              <dd className="font-bold mt-0.5 truncate">Deterministic normative</dd>
            </div>
            <div>
              <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10.5px]">Verification code</dt>
              <dd className="tnum font-bold mt-0.5" title={report.structured_input_hash ?? ""}>
                {shortHash(report.structured_input_hash)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[11.5px] text-ink-3 leading-relaxed">
            The verification code identifies the exact assessment dataset this guidance report was built from. Scores are
            deterministic and mathematically verified against official normative standards.
          </p>
        </Card>

        {/* ---------- Overview + narrative ---------- */}
        <section id="rsec-overview" className="mt-6 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Overview</h2>
          <Card className="p-6">
            {report.narrative_html ? (
              <div className="narrative" dangerouslySetInnerHTML={{ __html: sanitizeNarrative(report.narrative_html) }} />
            ) : (
              <p className="text-[14px] text-ink-2">
                The narrative summary isn't available for this report version. All calculated values
                remain accurate below.
              </p>
            )}
          </Card>
        </section>

        {/* ---------- Aptitude ---------- */}
        <section id="rsec-aptitude" className="mt-8 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Aptitude</h2>
          <Card className="p-6">
            <AptitudePanel aptitude={structured.aptitude} />
          </Card>
        </section>

        {/* ---------- Interests ---------- */}
        <section id="rsec-interests" className="mt-8 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Interests</h2>
          <Card className="p-6">
            <div className="grid md:grid-cols-[300px_1fr] gap-6 items-center">
              <div className="max-w-[300px] mx-auto w-full">
                <RiasecChart riasec={structured.riasec} compact />
              </div>
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-3">Holland Code</p>
                <p className="tnum font-display text-[32px] font-bold tracking-[0.05em] text-brand mt-1">
                  {structured.riasec.holland_code ?? "—"}
                </p>
                <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
                  These are the interest patterns strongest in {structured.student?.first_name ?? "the student"}&rsquo;s
                  responses.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* ---------- Work style ---------- */}
        <section id="rsec-workstyle" className="mt-8 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Work Style</h2>
          <Card className="p-6">
            <WorkStylePanel grit={structured.grit} />
          </Card>
        </section>

        {/* ---------- Stream exploration ---------- */}
        <section id="rsec-streams" className="mt-8 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Stream Exploration</h2>
          <div className="space-y-3">
            {[...(structured.streams || [])]
              .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
              .map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="tnum w-7 h-7 rounded-full bg-surface-2 text-[12px] font-bold flex items-center justify-center">
                        {s.rank}
                      </span>
                      <p className="font-semibold text-[15px]">{s.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tnum font-display text-[20px] font-bold">
                        {s.score === null ? "—" : Number(s.score).toFixed(1).replace(/\.0$/, "")}
                      </span>
                      <Badge tone={bandTone(s.band)} dot>{s.band ?? "—"}</Badge>
                    </div>
                  </div>
                  {s.contributions?.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-line grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                      {s.contributions.map((c) => (
                        <p key={c.component} className="text-[12.5px] text-ink-2 flex justify-between gap-3">
                          <span>{c.component.startsWith("riasec_") ? "Interest" : "Ability"} · {c.component.replace(/^(riasec|grit)_?/, "")}</span>
                          <span className="tnum text-ink-3">
                            {c.value ?? "—"} × {c.weight != null ? `${Math.round(c.weight * 100)}%` : "—"} → <span className="font-semibold text-ink">+{c.contribution != null ? Number(c.contribution).toFixed(1) : "—"}</span>
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
          </div>
        </section>

        {/* ---------- Parent alignment ---------- */}
        {structured.congruence?.has_parent_data && (
          <section id="rsec-alignment" className="mt-8 scroll-mt-24 print-block">
            <h2 className="font-display text-[19px] font-bold mb-3">Parent Alignment</h2>
            <AlignmentCard congruence={structured.congruence} studentName={structured.student?.first_name ?? "Student"} />
          </section>
        )}

        {/* ---------- Next steps ---------- */}
        <section id="rsec-next" className="mt-8 mb-12 scroll-mt-24 print-block">
          <h2 className="font-display text-[19px] font-bold mb-3">Next Steps</h2>
          <Card className="p-6">
            <p className="text-[14px] text-ink-2 leading-relaxed">
              Use these results as a starting point for conversations — with family, teachers and
              counselors. Explore the top streams, read the &ldquo;why&rdquo; behind each fit, and
              revisit after major exams: profiles evolve as students grow.
            </p>
            {structured.limitations?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-line">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-2.5">
                  What this assessment is not
                </p>
                <ul className="space-y-1.5">
                  {structured.limitations.map((l, i) => (
                    <li key={i} className="text-[13px] text-ink-2 flex gap-2 leading-relaxed">
                      <span aria-hidden="true" className="text-ink-3">–</span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* ---------------- regenerate modal ---------------- */}
      <Modal open={regenOpen} onClose={() => setRegenOpen(false)} title="Refreshing report">
        <ReportStages step={regenStep} />
        <p className="text-[12px] text-ink-3 mt-4 leading-relaxed">
          The stored scores stay exactly the same — this updates the report presentation from the stored assessment data.
        </p>
      </Modal>

      {/* ---------------- share modal ---------------- */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this report">
        <div className="space-y-4">
          <p className="text-[13.5px] text-ink-2 leading-relaxed">
            Psychometric AI reports are private to the student by default. You can share your results with your family or counselor in two secure ways:
          </p>

          <Card className="p-4.5 border-brand/30 bg-brand-mist/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-brand">
                Option 1: Link with Parent (Live sync)
              </span>
              <Badge tone="ok">Recommended</Badge>
            </div>
            <p className="text-[13px] text-ink leading-relaxed">
              Share your <strong>Student Code</strong> with your parent. When they enter it in their dashboard, you'll be prompted to approve their access.
            </p>
            {studentCode && (
              <div className="flex items-center gap-2 pt-1">
                <code className="tnum font-bold text-[15px] bg-surface px-3 py-1.5 rounded-[8px] border border-line">
                  {studentCode}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(studentCode);
                    pushToast("Student code copied to clipboard.", "success");
                  }}
                >
                  Copy code
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4.5 space-y-2">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Option 2: Export or Print Document
            </span>
            <p className="text-[13px] text-ink-2 leading-relaxed">
              Print a physical copy or save a clean, formatted PDF directly to your device to share via email or messaging.
            </p>
            <div className="pt-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShareOpen(false);
                  setTimeout(() => window.print(), 100);
                }}
              >
                Print / Save PDF
              </Button>
            </div>
          </Card>
        </div>
      </Modal>
    </div>
  );
}

/** Small helper kept for narrative text extraction (share sheet). */
export function reportShareText(payload: ReportPayload | null): string {
  if (!payload?.report) return "";
  const text = narrativeToText(payload.report.narrative_html).slice(0, 220);
  return text ? `${payload.report.title} — ${text}…` : payload.report.title;
}
