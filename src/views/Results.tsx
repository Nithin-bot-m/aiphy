"use client";

/**
 * Candidate results — "Your Profile" dashboard.
 * Overview / Aptitude / Interests / Work style. All values come from the
 * canonical result payload (GET /candidate/results). Null dimensions render
 * as "not measured" — never as fabricated numbers.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Eyebrow,
  Progress,
  SkeletonCard,
  Skeleton,
  Tabs,
} from "@/components/psych/ui";
import { AptitudePanel, RiasecChart, WorkStylePanel } from "@/components/psych/dataviz";
import { APTITUDE_DIMENSIONS, RIASEC_DIMENSIONS, fmtDateTime, fmtNum } from "@/lib/format";
import { sanitizeNarrative } from "@/lib/sanitize";
import type { CanonicalResult, ResultsPayload } from "@/lib/types";

interface ResultsView extends ResultsPayload {
  narrativeHtml?: string | null;
}

/** Pull one heading-section out of the sanitized narrative (backend text). */
function narrativeSection(html: string | null | undefined, pattern: RegExp): string | null {
  if (!html || typeof window === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heads = Array.from(doc.body.querySelectorAll("h2, h3"));
  for (const h of heads) {
    if (pattern.test(h.textContent || "")) {
      const parts: string[] = [];
      let node = h.nextElementSibling;
      while (node && !["H2", "H3"].includes(node.tagName)) {
        parts.push(node.outerHTML);
        node = node.nextElementSibling;
      }
      return parts.join("") || null;
    }
  }
  return null;
}

export default function Results({ navigate }: { navigate: (to: string) => void }) {
  const { profile } = useApp();
  const [tab, setTab] = useState("overview");
  const res = useAsyncData(async () => {
    const data = (await api.candidate.results()) as ResultsPayload | null;
    if (!data || !data.result) return data as ResultsView | null;
    let narrativeHtml: string | null = null;
    try {
      const rep = (await api.reports.get(data.assessment_id, "candidate")) as unknown as {
        report?: { narrative_html?: string };
      };
      narrativeHtml = rep.report?.narrative_html ?? null;
    } catch {
      narrativeHtml = null; // report text is an enhancement, never required
    }
    return { ...data, narrativeHtml } as ResultsView;
  }, []);

  if (res.loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 py-10 space-y-6">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-10 w-80" />
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (res.error) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-12">
        <ErrorState message={res.error.message} onRetry={res.reload} />
      </div>
    );
  }
  if (!res.data || !res.data.result) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        <Card className="p-10 text-center">
          <p className="font-display text-[19px] font-bold">No assessment completed yet</p>
          <p className="mt-2 text-[14px] text-ink-2 max-w-sm mx-auto">
            Complete the assessment to see your profile — it takes about 30 minutes and saves as you go.
          </p>
          <Button size="lg" className="mt-6" onClick={() => navigate("/assessment")}>
            Start assessment
          </Button>
        </Card>
      </div>
    );
  }

  const result = res.data.result as CanonicalResult;
  const name = result.student?.first_name || String((profile as { full_name?: string } | null)?.full_name ?? "Student");
  const top3 = (result.riasec.holland_code || "").split("");
  const topStreams = [...result.streams].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3);
  const workNarrative =
    narrativeSection(res.data?.narrativeHtml, /work\s*style|work-style|grit|persistence|how you work/i) ??
    narrativeSection(res.data?.narrativeHtml, /summary/i);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 sm:py-10">
      {/* ---------- profile header ---------- */}
      <Card className="p-6 sm:p-8 rise">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div>
            <Eyebrow>Your profile</Eyebrow>
            <h1 className="font-display text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] mt-2">
              {name}&rsquo;s profile
            </h1>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-ok" />
                Assessment completed
              </span>
              <span className="tnum">{fmtDateTime(result.assessment?.completed_at)}</span>
              <span className="tnum">Version {result.assessment?.version_code}</span>
              {result.student?.grade != null && <span>Grade {result.student.grade}</span>}
              {result.student?.board && <span>{result.student.board}</span>}
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate("/report")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M7 3.5h7L19 8.5V20a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9ZM14 3.5v5h5M9.5 13h5M9.5 16.5h5" />
            </svg>
            View full report
          </Button>
        </div>
      </Card>

      <Tabs
        className="mt-6"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "aptitude", label: "Aptitude" },
          { key: "interests", label: "Interests" },
          { key: "workstyle", label: "Work style" },
        ]}
      />

      <div className="mt-6 space-y-6">
        {/* ================= OVERVIEW ================= */}
        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-5 fade-in">
            <Card className="p-6">
              <p className="font-semibold text-[15px] mb-1">Aptitude highlights</p>
              <p className="text-[12.5px] text-ink-3 mb-5">Strongest reasoning areas from your responses</p>
              <div className="space-y-4">
                {APTITUDE_DIMENSIONS.map((d) => ({
                  ...d,
                  v: result.aptitude[d.key as keyof typeof result.aptitude] as number | null,
                }))
                  .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
                  .slice(0, 4)
                  .map((d) => (
                    <div key={d.key} className="flex items-center justify-between gap-4">
                      <span className="text-[13.5px] font-medium text-ink">{d.label}</span>
                      <div className="flex items-center gap-3 flex-1 max-w-[220px]">
                        <Progress value={d.v ?? 0} className="flex-1" />
                        <span className="tnum text-[13.5px] font-bold w-7 text-right">{fmtNum(d.v)}</span>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
                <span className="text-[13px] text-ink-2">Overall aptitude index</span>
                <span className="tnum font-display text-[20px] font-bold">{fmtNum(result.aptitude.overall)}</span>
              </div>
            </Card>

            <div className="space-y-5">
              <Card className="p-6">
                <p className="font-semibold text-[15px]">Interest pattern</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="tnum font-display text-[30px] font-bold tracking-[0.06em] text-brand">
                    {result.riasec.holland_code ?? "—"}
                  </span>
                  <div className="text-[12.5px] text-ink-2 leading-snug">
                    {top3.map((k) => RIASEC_DIMENSIONS.find((d) => d.key === k)?.label).filter(Boolean).join(" · ")}
                  </div>
                </div>
                <p className="text-[12.5px] text-ink-3 mt-2.5 leading-relaxed">
                  These are the interest patterns strongest in your responses — themes of work you
                  may find engaging, not a personality label.
                </p>
              </Card>

              <Card className="p-6">
                <p className="font-semibold text-[15px]">Top stream possibilities</p>
                <p className="text-[12.5px] text-ink-3 mt-0.5 mb-4">Fit indices — directions to explore, not verdicts</p>
                <div className="space-y-2.5">
                  {topStreams.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => navigate("/explore")}
                      className="w-full flex items-center justify-between rounded-[10px] border border-line px-3.5 py-2.5 hover:border-brand hover:bg-brand-mist transition-colors cursor-pointer text-left"
                    >
                      <span className="text-[13.5px] font-semibold truncate">{s.name}</span>
                      <span className="flex items-center gap-2.5 shrink-0">
                        <span className="tnum text-[14px] font-bold">{s.score === null ? "—" : Number(s.score).toFixed(1).replace(/\.0$/, "")}</span>
                        <Badge tone={s.band?.includes("Strong") ? "ok" : s.band?.includes("Possible") ? "warn" : "neutral"}>{s.band}</Badge>
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ================= APTITUDE ================= */}
        {tab === "aptitude" && (
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-5 fade-in items-start">
            <Card className="p-6">
              <p className="font-semibold text-[15px] mb-1">Aptitude profile</p>
              <p className="text-[12.5px] text-ink-3 mb-6">Normalized indices (0–100). Tap a bar for what it measures.</p>
              <AptitudePanel aptitude={result.aptitude} />
            </Card>
            <div className="space-y-3.5">
              {APTITUDE_DIMENSIONS.map((d) => {
                const v = result.aptitude[d.key as keyof typeof result.aptitude] as number | null;
                return (
                  <Card key={d.key} className="p-4.5 px-5 py-4 flex items-center gap-4">
                    <span className={`w-11 h-11 rounded-[11px] flex items-center justify-center tnum font-display font-bold text-[15px] ${v === null ? "bg-surface-2 text-ink-3" : "bg-brand-mist text-brand-strong"}`}>
                      {v === null ? "—" : v}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[14px]">{d.label}</p>
                      <p className="text-[12px] text-ink-3 leading-snug">{d.blurb}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= INTERESTS ================= */}
        {tab === "interests" && (
          <div className="fade-in space-y-5">
            <Card className="p-6 sm:p-8">
              <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 items-center">
                <div className="max-w-[420px] mx-auto w-full">
                  <RiasecChart riasec={result.riasec} />
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-3">Holland Code</p>
                  <p className="tnum font-display text-[40px] font-bold tracking-[0.05em] text-brand leading-none mt-1.5">
                    {result.riasec.holland_code ?? "—"}
                  </p>
                  <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">
                    Your strongest interest areas:{" "}
                    <span className="font-semibold text-ink">
                      {top3.map((k) => RIASEC_DIMENSIONS.find((d) => d.key === k)?.label).filter(Boolean).join(", ")}
                    </span>
                    . These are the interest patterns strongest in your responses.
                  </p>
                  {result.riasec.tie_break_applied && (
                    <p className="text-[12px] text-ink-3 mt-2.5 leading-relaxed">
                      Where two interest scores tied, the order follows the standard hexagon sequence —
                      applied for stable presentation, not because one matters more.
                    </p>
                  )}
                  <div className="mt-6 space-y-3.5">
                    {result.riasec.ranking?.slice(0, 6).map((r) => (
                      <div key={r.dimension} className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-[8px] flex items-center justify-center text-[12px] font-bold ${top3.slice(0, 3).includes(r.dimension) ? "bg-brand text-on-brand" : "bg-surface-2 text-ink-2"}`}>
                          {r.dimension}
                        </span>
                        <span className="text-[13px] text-ink-2 w-28 truncate">{r.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-full rounded-full bar-fill bg-brand/75" style={{ width: `${r.index ?? 0}%` }} />
                        </div>
                        <span className="tnum text-[12.5px] font-bold w-7 text-right">{r.measured ? r.index : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-brand-mist/60">
              <p className="text-[12.5px] text-ink-2 leading-relaxed">
                <span className="font-semibold text-ink">Reading this chart:</span> the filled shape
                shows your six interest indices side by side. Interests describe what you enjoy — they
                work together with aptitude and work style when exploring streams.
              </p>
            </Card>
          </div>
        )}

        {/* ================= WORK STYLE ================= */}
        {tab === "workstyle" && (
          <div className="grid lg:grid-cols-2 gap-5 fade-in items-start">
            <Card className="p-6">
              <p className="font-semibold text-[15px] mb-1">Work style profile</p>
              <p className="text-[12.5px] text-ink-3 mb-6">
                Self-ratings on a 1–5 scale, shown with the composite index (0–100).
              </p>
              <WorkStylePanel grit={result.grit} />
            </Card>
            <Card className="p-6">
              <p className="font-semibold text-[15px] mb-1">What this may mean</p>
              <p className="text-[12.5px] text-ink-3 mb-4">
                Written from your assessment data by the explanation layer — your scores were computed
                before any text was generated.
              </p>
              {workNarrative ? (
                <div
                  className="narrative text-[14px]"
                  // server narrative, re-sanitized client-side before render
                  dangerouslySetInnerHTML={{ __html: sanitizeNarrative(workNarrative) }}
                />
              ) : (
                <div>
                  <p className="text-[13.5px] text-ink-2 leading-relaxed">
                    Your work-style dimensions came from the Work Style section. Higher indices mean
                    you agreed more with statements about sustained effort in that area. In the report
                    you'll find a narrative explanation of how these patterns may show up in study
                    routines — written from these exact numbers, never the other way around.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={() => navigate("/report")}>
                    Read it in the report
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                    </svg>
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
