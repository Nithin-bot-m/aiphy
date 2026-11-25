"use client";

/**
 * Report reader — premium, print-friendly document view.
 * Left: table of contents. Right: metadata + structured visual sections +
 * the backend's sanitized narrative. The report content is the backend's
 * word-for-word data; this view adds layout, not opinions.
 */
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Eyebrow,
  Modal,
  Progress,
  Skeleton,
} from "@/components/psych/ui";
import { AlignmentCard, AptitudePanel, RiasecChart, WorkStylePanel } from "@/components/psych/dataviz";
import {
  RIASEC_DIMENSIONS,
  bandTone,
  contributionLabel,
  fmtDateTime,
  fmtNum,
  fmtScore,
  shortHash,
} from "@/lib/format";
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
  onBack,
}: {
  assessmentId: number;
  allowedTypes: ReportType[];
  initialType?: ReportType;
  onBack?: () => void;
}) {
  const { pushToast, profile, user } = useApp();
  const [preferred, setPreferred] = useState<ReportType>(initialType ?? allowedTypes[0] ?? "candidate");
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenStep, setRegenStep] = useState<0 | 1 | 2>(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

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

  useEffect(() => {
    if (typeof window === "undefined" || sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.id?.startsWith("rsec-")) {
          setActiveSection(visible.target.id.slice(5));
        }
      },
      { rootMargin: "-90px 0px -65% 0px", threshold: 0.05 }
    );
    for (const s of sections) {
      const el = document.getElementById(`rsec-${s.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

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
    setActiveSection(id);
    document.getElementById(`rsec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sortedStreams = [...(structured.streams || [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const topStream = sortedStreams[0] ?? null;
  const topInterests = (structured.riasec?.holland_code || "")
    .split("")
    .map((k) => {
      const meta = RIASEC_DIMENSIONS.find((d) => d.key === k);
      const val = structured.riasec?.[k as "R" | "I" | "A" | "S" | "E" | "C"] ?? null;
      return meta ? { ...meta, score: val } : null;
    })
    .filter((x): x is { key: string; label: string; blurb: string; score: number | null } => Boolean(x));

  return (
    <div className="space-y-6">
      {/* ---------------- top action bar ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line no-print">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button size="sm" variant="ghost" onClick={onBack} className="-ml-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 12.5 5.5 8 10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to Results
            </Button>
          )}
          <span className="hidden sm:inline text-[12.5px] font-medium text-ink-3 truncate">
            Full Guidance Report
            {structured.student?.first_name ? ` · ${structured.student.first_name}` : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowedTypes.length > 1 && (
            <select
              aria-label="Report type"
              value={type}
              onChange={(e) => setPreferred(e.target.value as ReportType)}
              className="lg:hidden h-9 rounded-[9px] border border-line-2 bg-surface px-3 text-[13px] font-semibold cursor-pointer capitalize"
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
      </div>

      {/* mobile / tablet section navigator */}
      <nav aria-label="Quick section jump" className="lg:hidden flex flex-wrap gap-1.5 no-print">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(s.id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors cursor-pointer ${
              activeSection === s.id
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-ink-2 border-line hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="grid lg:grid-cols-[210px_1fr] gap-8 items-start">
        {/* ---------------- desktop sticky TOC ---------------- */}
        <aside className="hidden lg:block sticky top-20 no-print">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3 mb-2.5 px-2">
              Contents
            </p>
            <ul className="space-y-0.5">
              {sections.map((s) => {
                const on = activeSection === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(s.id)}
                      className={`w-full text-left px-3 py-2 rounded-[9px] text-[13px] transition-colors cursor-pointer ${
                        on
                          ? "bg-brand-mist text-brand font-semibold"
                          : "text-ink-2 hover:bg-paper hover:text-ink"
                      }`}
                    >
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            {allowedTypes.length > 1 && (
              <div className="mt-5 pt-4 border-t border-line">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3 mb-2 px-1">
                  Report audience
                </p>
                <div className="flex flex-col gap-1.5">
                  {allowedTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPreferred(t)}
                      aria-pressed={t === type}
                      className={`h-8.5 px-3 rounded-[8px] text-[12.5px] font-semibold capitalize text-left transition-colors cursor-pointer ${
                        t === type ? "bg-ink text-[#F3F1EA]" : "bg-surface-2 text-ink-2 hover:text-ink"
                      }`}
                    >
                      {t} report
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </aside>

        {/* ---------------- main editorial document ---------------- */}
        <div className="print-area min-w-0 space-y-8">
          {/* executive cover card */}
          <Card className="p-6 sm:p-8 border-t-4 border-t-brand print-block">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow>Official Psychometric Guidance Report</Eyebrow>
                <h1 className="font-display text-[24px] sm:text-[30px] font-bold tracking-[-0.02em] leading-tight mt-2">
                  {report.title}
                </h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{structured.student?.first_name ?? "Student"}</span>
                  {structured.student?.grade != null && (
                    <Badge tone="neutral">Grade {structured.student.grade}</Badge>
                  )}
                  {structured.student?.board && (
                    <Badge tone="neutral">{structured.student.board}</Badge>
                  )}
                </div>
              </div>
              <Badge tone={report.status === "ready" ? "ok" : "warn"} dot className="shrink-0">
                {report.status === "ready" ? "Final Report" : report.status}
              </Badge>
            </div>

            <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
              <div className="rounded-[10px] bg-paper border border-line/80 px-3.5 py-2.5">
                <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10px]">Version</dt>
                <dd className="tnum font-bold text-ink mt-0.5">{structured.assessment?.version_code ?? "—"}</dd>
              </div>
              <div className="rounded-[10px] bg-paper border border-line/80 px-3.5 py-2.5">
                <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10px]">Generated</dt>
                <dd className="tnum font-bold text-ink mt-0.5">{fmtDateTime(report.generated_at)}</dd>
              </div>
              <div className="rounded-[10px] bg-paper border border-line/80 px-3.5 py-2.5">
                <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10px]">Scoring Method</dt>
                <dd className="font-bold text-ink mt-0.5 truncate">Deterministic rules</dd>
              </div>
              <div className="rounded-[10px] bg-paper border border-line/80 px-3.5 py-2.5">
                <dt className="text-ink-3 font-semibold uppercase tracking-[0.08em] text-[10px]">Verification Hash</dt>
                <dd className="tnum font-bold text-ink mt-0.5 truncate" title={report.structured_input_hash ?? ""}>
                  {shortHash(report.structured_input_hash)}
                </dd>
              </div>
            </dl>

            {/* executive snapshot metrics */}
            <div className="mt-5 pt-5 border-t border-line grid sm:grid-cols-3 gap-3.5">
              <div className="rounded-[12px] bg-paper/70 border border-line p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">Overall Aptitude</p>
                <p className="tnum font-display text-[26px] font-bold text-ink mt-1">
                  {fmtNum(structured.aptitude?.overall)}
                  <span className="text-[13px] font-normal text-ink-3 ml-1">/ 100</span>
                </p>
                <p className="text-[12px] text-ink-3 mt-0.5">Reasoning composite index</p>
              </div>
              <div className="rounded-[12px] bg-paper/70 border border-line p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">Holland Interest Code</p>
                <p className="tnum font-display text-[26px] font-bold tracking-[0.06em] text-brand mt-1">
                  {structured.riasec?.holland_code ?? "—"}
                </p>
                <p className="text-[12px] text-ink-3 mt-0.5 truncate">
                  {topInterests.map((i) => i.label).join(" · ") || "Primary interest themes"}
                </p>
              </div>
              <div className="rounded-[12px] bg-paper/70 border border-line p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">Work Style & Top Fit</p>
                <p className="tnum font-display text-[26px] font-bold text-ink mt-1">
                  {fmtScore(structured.grit?.normalized_index, 0)}
                  <span className="text-[13px] font-normal text-ink-3 ml-1">/ 100</span>
                </p>
                <p className="text-[12px] text-ink-2 mt-0.5 truncate">
                  {topStream ? `Top fit: ${topStream.name}` : "Work habits index"}
                </p>
              </div>
            </div>

            <p className="mt-4 text-[11.5px] text-ink-3 leading-relaxed">
              The verification hash uniquely identifies the assessment responses this document was generated from — stored scores remain fixed and reproducible.
            </p>
          </Card>

          {/* ---------- Overview + narrative ---------- */}
          <section id="rsec-overview" className="scroll-mt-24 print-block">
            <div className="mb-3">
              <Eyebrow>Summary</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Overview</h2>
            </div>
            <Card className="p-6 sm:p-7">
              {report.narrative_html ? (
                <div className="narrative" dangerouslySetInnerHTML={{ __html: sanitizeNarrative(report.narrative_html) }} />
              ) : (
                <p className="text-[14px] text-ink-2">
                  The narrative summary isn&rsquo;t available for this report version. All calculated values remain accurate below.
                </p>
              )}
            </Card>
          </section>

          {/* ---------- Aptitude ---------- */}
          <section id="rsec-aptitude" className="scroll-mt-24 print-block">
            <div className="mb-3">
              <Eyebrow>Reasoning Abilities</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Aptitude Profile</h2>
              <p className="text-[13px] text-ink-2 mt-0.5">
                Normalized 0–100 assessment indices across measured cognitive reasoning areas.
              </p>
            </div>
            <Card className="p-6">
              <AptitudePanel aptitude={structured.aptitude} />
            </Card>
          </section>

          {/* ---------- Interests ---------- */}
          <section id="rsec-interests" className="scroll-mt-24 print-block">
            <div className="mb-3">
              <Eyebrow>RIASEC Profile</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Interests &amp; Work Preferences</h2>
            </div>
            <Card className="p-6">
              <div className="grid md:grid-cols-[290px_1fr] gap-7 items-center">
                <div className="max-w-[290px] mx-auto w-full">
                  <RiasecChart riasec={structured.riasec} compact />
                </div>
                <div>
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3">Holland Code</p>
                  <p className="tnum font-display text-[32px] font-bold tracking-[0.06em] text-brand mt-1">
                    {structured.riasec.holland_code ?? "—"}
                  </p>
                  <p className="text-[13.5px] text-ink-2 mt-1.5 leading-relaxed">
                    Strongest interest environments reflected in {structured.student?.first_name ?? "the student"}&rsquo;s responses:
                  </p>
                  {topInterests.length > 0 && (
                    <div className="mt-4 space-y-2.5">
                      {topInterests.map((theme, idx) => (
                        <div key={theme.key} className="rounded-[10px] bg-paper border border-line/80 px-3.5 py-2.5 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-semibold text-ink">
                              {idx + 1}. {theme.label} <span className="text-ink-3 font-normal">({theme.key})</span>
                            </p>
                            <p className="text-[12px] text-ink-3 mt-0.5">{theme.blurb}</p>
                          </div>
                          <span className="tnum text-[14px] font-bold text-brand shrink-0">
                            {fmtScore(theme.score, 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* ---------- Work style ---------- */}
          <section id="rsec-workstyle" className="scroll-mt-24 print-block">
            <div className="mb-3">
              <Eyebrow>Habits &amp; Mindset</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Work Style</h2>
            </div>
            <Card className="p-6">
              <WorkStylePanel grit={structured.grit} />
            </Card>
          </section>

          {/* ---------- Stream exploration ---------- */}
          <section id="rsec-streams" className="scroll-mt-24 print-block">
            <div className="mb-3">
              <Eyebrow>Weighted Fit Analysis</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Stream Exploration</h2>
              <p className="text-[13px] text-ink-2 mt-0.5">
                Every stream score shows its exact contribution math: measured score × configured rule weight.
              </p>
            </div>
            <div className="space-y-3.5">
              {sortedStreams.map((s) => {
                const isTop3 = (s.rank ?? 99) <= 3;
                const scoreNum = s.score === null ? null : Number(s.score);
                return (
                  <Card key={s.id} className={`p-5 sm:p-6 ${isTop3 ? "border-brand/35" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`tnum w-8 h-8 rounded-full text-[13px] font-bold flex items-center justify-center shrink-0 ${
                            isTop3 ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-2"
                          }`}
                        >
                          {s.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="font-display font-bold text-[16px] text-ink leading-snug">{s.name}</p>
                          {s.career_clusters && s.career_clusters.length > 0 && (
                            <p className="text-[12px] text-ink-3 mt-0.5">
                              {s.career_clusters.slice(0, 3).join(" · ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="tnum font-display text-[22px] font-bold text-ink">
                            {scoreNum === null ? "—" : scoreNum.toFixed(1).replace(/\.0$/, "")}
                          </span>
                          <span className="text-[12px] text-ink-3 ml-1">/ 100</span>
                        </div>
                        <Badge tone={bandTone(s.band)} dot>{s.band ?? "—"}</Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={scoreNum ?? 0}
                        tone={isTop3 ? "ok" : "brand"}
                        label={`${s.name} fit score`}
                      />
                    </div>

                    {s.contributions?.length > 0 && (
                      <div className="mt-4 pt-3.5 border-t border-line grid sm:grid-cols-2 gap-2.5">
                        {s.contributions.map((c) => (
                          <div
                            key={c.component}
                            className="rounded-[10px] bg-paper/75 border border-line/70 px-3 py-2 flex items-center justify-between gap-3 text-[12.5px]"
                          >
                            <span className="font-medium text-ink truncate">
                              {contributionLabel(c.component)}
                            </span>
                            <span className="tnum text-ink-3 whitespace-nowrap shrink-0">
                              {c.value ?? "—"} × {c.weight != null ? `${Math.round(c.weight * 100)}%` : "—"} →{" "}
                              <span className="font-bold text-brand-strong">
                                +{c.contribution != null ? Number(c.contribution).toFixed(1) : "—"}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ---------- Parent alignment ---------- */}
          {structured.congruence?.has_parent_data && (
            <section id="rsec-alignment" className="scroll-mt-24 print-block">
              <div className="mb-3">
                <Eyebrow>Family Perspective</Eyebrow>
                <h2 className="font-display text-[20px] font-bold mt-1">Parent Alignment</h2>
              </div>
              <AlignmentCard congruence={structured.congruence} studentName={structured.student?.first_name ?? "Student"} />
            </section>
          )}

          {/* ---------- Next steps ---------- */}
          <section id="rsec-next" className="scroll-mt-24 mb-8 print-block">
            <div className="mb-3">
              <Eyebrow>Moving Forward</Eyebrow>
              <h2 className="font-display text-[20px] font-bold mt-1">Next Steps</h2>
            </div>
            <Card className="p-6 space-y-5">
              <p className="text-[14.5px] text-ink-2 leading-relaxed">
                Use these results as a starting point for conversations — with family, teachers and
                counselors. Explore the top streams, inspect the factor breakdown behind each fit, and
                revisit after major exams as interests and skills mature.
              </p>
              {structured.limitations?.length > 0 && (
                <div className="rounded-[12px] bg-paper border border-line p-4">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3 mb-2.5">
                    What this assessment is not
                  </p>
                  <ul className="space-y-1.5">
                    {structured.limitations.map((l, i) => (
                      <li key={i} className="text-[13px] text-ink-2 flex gap-2 leading-relaxed">
                        <span aria-hidden="true" className="text-brand font-bold">·</span>
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>
        </div>
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
