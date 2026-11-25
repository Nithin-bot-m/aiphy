"use client";

/**
 * Counsellor Mapping Console visualizations (native React + SVG):
 *  1. 16-Cluster Student vs Parent Overlay Comparison
 *  2. Construct Perception Gap Dumbbell Plot
 *  3. 3-Column Evidence Flow Bezier Graph
 *  4. Red Flags Banner, Pattern Cards (P01-P15), 60-min Session Plan & Data Gaps
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/AppContext";
import { Badge, Button, Card, Eyebrow, Progress } from "@/components/psych/ui";
import { fmtDateTime } from "@/lib/format";
import type { CounsellorMapEnvelope } from "@/lib/types";

const SEVERITY_META: Record<string, { label: string; tone: "bad" | "warn" | "ok" | "brand" }> = {
  high: { label: "High · Priority", tone: "bad" },
  medium: { label: "Medium · Discuss", tone: "warn" },
  positive: { label: "Strength", tone: "ok" },
  info: { label: "Info", tone: "brand" },
  red: { label: "Red · Urgent", tone: "bad" },
  amber: { label: "Amber · Discuss", tone: "warn" },
  green: { label: "Green · Strength", tone: "ok" },
  blue: { label: "Blue · Explore", tone: "brand" },
};

export function CounsellorMapConsoleView({
  envelope,
  onRegenerated,
}: {
  envelope: CounsellorMapEnvelope;
  onRegenerated: () => void;
}) {
  const { pushToast } = useApp();
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [showAllClusters, setShowAllClusters] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const m = envelope.map;
  const student = envelope.student;

  const filteredInsights = useMemo(() => {
    const list = m.insights || [];
    if (sevFilter === "all") return list;
    return list.filter((ins) => ins.severity === sevFilter);
  }, [m.insights, sevFilter]);

  const displayedClusters = useMemo(() => {
    const sorted = [...(m.cluster_map || [])].sort((a, b) => b.final - a.final);
    return showAllClusters ? sorted : sorted.slice(0, 8);
  }, [m.cluster_map, showAllClusters]);

  const regenerate = async () => {
    setRegenBusy(true);
    try {
      await api.v2.generateCounsellorMap(envelope.assessment_id);
      pushToast("Counsellor map rebuilt from latest student & parent data.", "success");
      onRegenerated();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not rebuild map.", "bad");
    } finally {
      setRegenBusy(false);
    }
  };

  return (
    <div className="space-y-6 fade-in">
      {/* ---------- Header Banner ---------- */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow>{m.schema}</Eyebrow>
              <Badge tone="brand">Grade {m.meta.grade}</Badge>
              <Badge tone={m.meta.norm_status === "final" ? "ok" : "neutral"}>
                Norms: {m.meta.norm_status}
              </Badge>
              {m.meta.parents_responded.length > 0 ? (
                <Badge tone="ok" dot>
                  Parents: {m.meta.parents_responded.join(", ")}
                </Badge>
              ) : (
                <Badge tone="warn">No Parent M8 yet</Badge>
              )}
              {(m.meta.validity_flags?.length ?? 0) > 0 && (
                <Badge tone="warn">Validity: {m.meta.validity_flags.join(", ")}</Badge>
              )}
            </div>
            <h2 className="font-display text-[24px] font-bold tracking-[-0.02em] mt-2">
              {student?.full_name || `Student ${m.meta.student_id}`}{" "}
              <span className="text-ink-3 font-normal text-[15px] tnum">({student?.student_code || m.meta.student_id})</span>
            </h2>
            <p className="text-[13px] text-ink-2 mt-1">
              {student?.school_name ? `${student.school_name} · ` : ""}
              {student?.board || ""} · Generated {fmtDateTime(m.meta.generated_at)} · Engine {envelope.model}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print Brief
            </Button>
            <Button size="sm" loading={regenBusy} onClick={regenerate}>
              Rebuild Map
            </Button>
          </div>
        </div>

        {/* Summary & 3 Picks */}
        <p className="mt-4 text-[14px] text-ink leading-relaxed bg-paper border border-line rounded-[12px] p-4">
          {m.counsellor_summary}
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[12.5px]">
          <div className="rounded-[10px] border border-line p-3">
            <span className="text-ink-3 block text-[11px] uppercase">RIASEC</span>
            <span className="font-display text-[18px] font-bold text-brand tnum">{m.student_summary.riasec_code}</span>
          </div>
          <div className="rounded-[10px] border border-line p-3">
            <span className="text-ink-3 block text-[11px] uppercase">Passion</span>
            <span className="font-bold text-ink">{m.student_summary.passion_type}</span>
          </div>
          <div className="rounded-[10px] border border-line p-3">
            <span className="text-ink-3 block text-[11px] uppercase">Passion Pick</span>
            <span className="font-bold text-ink">{m.student_summary.picks?.passion}</span>
          </div>
          <div className="rounded-[10px] border border-line p-3">
            <span className="text-ink-3 block text-[11px] uppercase">Strength Pick</span>
            <span className="font-bold text-ink">{m.student_summary.picks?.strength}</span>
          </div>
          <div className="rounded-[10px] border border-line p-3">
            <span className="text-ink-3 block text-[11px] uppercase">Balanced Pick</span>
            <span className="font-bold text-ink">{m.student_summary.picks?.balanced}</span>
          </div>
        </div>
      </Card>

      {/* ---------- Red Flags Escalation Banner ---------- */}
      {(m.red_flags?.length ?? 0) > 0 && (
        <Card className="p-5 border-bad bg-bad-soft">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-bad">
            Priority Counsellor Safety / Wellbeing Alerts ({m.red_flags.length})
          </p>
          <div className="mt-2.5 space-y-2.5">
            {m.red_flags.map((rf, idx) => (
              <div key={idx} className="rounded-[10px] bg-surface border border-[#EFCFC9] p-3.5 text-[13.5px]">
                <p className="font-semibold text-bad">{rf}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---------- Chart 1: 16-Cluster Student vs Parent Overlay ---------- */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">1. Cluster Fit vs Parent Observation Overlay</h3>
            <p className="text-[12.5px] text-ink-3">
              Teal bar = student composite fit (0–100) · Navy dot = parent observed rating (when available)
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowAllClusters((s) => !s)}>
            {showAllClusters ? "Show Top 8" : "Show All 16 Clusters"}
          </Button>
        </div>

        <div className="space-y-3">
          {displayedClusters.map((c) => (
            <div key={c.id} className="rounded-[10px] border border-line p-3">
              <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-bold text-ink-3 tnum">{c.id}</span>
                  <span className="text-[13.5px] font-semibold text-ink truncate">{c.name}</span>
                  {c.student_dream && <Badge tone="brand">Student Dream</Badge>}
                  {(c.parent_pref?.length ?? 0) > 0 && (
                    <Badge tone="warn">Pref: {c.parent_pref.join("+")}</Badge>
                  )}
                  {c.parent_income_worry != null && c.parent_income_worry >= 70 && (
                    <Badge tone="bad">Income Worry {c.parent_income_worry}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[12px] tnum shrink-0">
                  <span className="text-ink-2">Int {c.interest}</span>
                  <span className="text-ink-2">Apt {c.aptitude}</span>
                  <span className="font-bold text-brand">Fit {c.final}</span>
                  {c.parent_observed != null && (
                    <span className="font-bold text-ink">Parent Obs {c.parent_observed}</span>
                  )}
                </div>
              </div>
              <div className="relative h-3 w-full rounded-full bg-surface-2 overflow-visible">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.min(100, Math.max(0, c.final))}%` }}
                />
                {c.parent_observed != null && (
                  <span
                    title={`Parent Observed: ${c.parent_observed}`}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-ink border-2 border-surface shadow-sm"
                    style={{ left: `${Math.min(100, Math.max(0, c.parent_observed))}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- Chart 2 & Chart 3 ---------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Perception Gap Dumbbell Plot */}
        <Card className="p-6">
          <h3 className="font-display text-[17px] font-bold">2. Construct Perception Gap</h3>
          <p className="text-[12.5px] text-ink-3 mb-4">
            Within-person normalized Student (teal circle) vs Parent (dark diamond). Lines highlight |Δ| &ge; 20 (amber) or &ge; 35 (red).
          </p>
          {(m.perception_gap?.length ?? 0) === 0 ? (
            <p className="text-[13px] text-ink-3 py-6">
              Parent Module 8 responses are pending — construct comparison will render once submitted.
            </p>
          ) : (
            <div className="space-y-3.5">
              {m.perception_gap.map((pg) => {
                const lineColor =
                  pg.flag === "high" ? "#C94933" : pg.flag === "medium" ? "#B76E00" : "#9CA7A4";
                const left = Math.min(pg.student, pg.parent);
                const right = Math.max(pg.student, pg.parent);
                return (
                  <div key={pg.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold text-ink">{pg.label}</span>
                      <span className="flex items-center gap-2 tnum">
                        <span className="text-ink-2">S:{pg.student} / P:{pg.parent}</span>
                        <Badge tone={pg.flag === "high" ? "bad" : pg.flag === "medium" ? "warn" : "neutral"}>
                          {pg.gap > 0 ? `+${pg.gap}` : pg.gap}
                        </Badge>
                      </span>
                    </div>
                    <svg viewBox="0 0 300 22" className="w-full h-6 overflow-visible" aria-label={`${pg.label} gap`}>
                      <line x1="8" y1="11" x2="292" y2="11" stroke="#E6E1D6" strokeWidth="2" strokeLinecap="round" />
                      <line
                        x1={8 + (left / 100) * 284}
                        y1="11"
                        x2={8 + (right / 100) * 284}
                        y2="11"
                        stroke={lineColor}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                      <circle cx={8 + (pg.student / 100) * 284} cy="11" r="5.5" fill="#0E7268" />
                      <rect
                        x={8 + (pg.parent / 100) * 284 - 4.5}
                        y="6.5"
                        width="9"
                        height="9"
                        rx="2"
                        fill="#181C1F"
                      />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 3-Column Evidence Flow Bezier SVG */}
        <Card className="p-6">
          <h3 className="font-display text-[17px] font-bold">3. 3-Column Evidence Flow</h3>
          <p className="text-[12.5px] text-ink-3 mb-4">
            How Student drivers flow into Top Clusters and connect with Parent observations &amp; preferences.
          </p>
          <EvidenceFlowSvg flow={m.evidence_flow} />
        </Card>
      </div>

      {/* ---------- Insights (P01-P15) ---------- */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">4. Detected Alignment & Counselling Patterns</h3>
            <p className="text-[12.5px] text-ink-3">Cross-referenced from P01–P15 deterministic detectors</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["all", "high", "medium", "info"].map((sev) => (
              <Button
                key={sev}
                size="sm"
                variant={sevFilter === sev ? "primary" : "secondary"}
                onClick={() => setSevFilter(sev)}
              >
                {sev === "all" ? `All (${m.insights.length})` : sev.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        {filteredInsights.length === 0 ? (
          <p className="text-[13px] text-ink-3 py-4">No patterns match this severity filter.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredInsights.map((ins) => {
              const sm = SEVERITY_META[ins.severity] ?? SEVERITY_META.info;
              return (
                <div key={ins.id} className="rounded-[14px] border border-line p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={sm.tone}>{ins.pattern}</Badge>
                      <span className="text-[11px] font-bold uppercase text-ink-3">{sm.label}</span>
                    </div>
                    <h4 className="font-display font-bold text-[15.5px] mt-2">{ins.title}</h4>
                    <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{ins.meaning}</p>
                    <div className="mt-3 rounded-[10px] bg-paper p-2.5 text-[12px] text-ink-2 space-y-1">
                      {(ins.student_said || []).map((s, si) => (
                        <p key={`s-${si}`}><strong>Student:</strong> {s.summary}</p>
                      ))}
                      {(ins.parent_said || []).map((p, pi) => (
                        <p key={`p-${pi}`}><strong>Parent:</strong> {p.summary}</p>
                      ))}
                    </div>
                    {ins.avoid && (
                      <p className="text-[11.5px] text-warn mt-2"><strong>Avoid:</strong> {ins.avoid}</p>
                    )}
                  </div>
                  {(ins.talking_points?.length || ins.suggestions?.length) ? (
                    <div className="pt-2 border-t border-line">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-1">
                        Session prompts &amp; actions
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-[12.5px] text-ink-2">
                        {(ins.talking_points || []).map((tp, idx) => (
                          <li key={`tp-${idx}`}>{tp}</li>
                        ))}
                        {(ins.suggestions || []).map((sg, idx) => (
                          <li key={`sg-${idx}`}>{sg}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ---------- 60-Min Session Plan & Data Gaps ---------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display text-[17px] font-bold mb-1">5. Tailored 60-Minute Session Plan</h3>
          <p className="text-[12.5px] text-ink-3 mb-4">Sequenced for safety, autonomy, and constructive parent buy-in</p>
          <div className="space-y-3">
            {(m.session_plan || []).map((st, idx) => (
              <div key={idx} className="flex gap-3.5 items-start rounded-[12px] border border-line p-3.5">
                <span className="shrink-0 px-2.5 py-1 rounded-[8px] bg-brand-mist text-brand-strong tnum text-[12px] font-bold">
                  {st.min}m
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold text-ink">{st.step}</p>
                  <p className="text-[12.5px] text-ink-2 mt-0.5">{st.goal}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-[17px] font-bold mb-1">6. Data Gaps & Missing Context</h3>
          <p className="text-[12.5px] text-ink-3 mb-4">Explicit transparency on missing inputs — never silently assumed</p>
          {(m.data_gaps?.length ?? 0) === 0 ? (
            <p className="text-[13.5px] text-ok font-medium">All expected inputs are complete for this session.</p>
          ) : (
            <div className="space-y-2.5">
              {m.data_gaps.map((dg, idx) => (
                <div key={idx} className="rounded-[12px] border border-line p-3.5 text-[13px]">
                  <p className="text-ink font-medium">{dg}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function EvidenceFlowSvg({
  flow,
}: {
  flow: {
    student_nodes: Array<{ id: string; label: string }>;
    cluster_nodes: Array<{ id: string; label: string }>;
    parent_nodes: Array<{ id: string; label: string }>;
    links: Array<{ from: string; to: string; w: number }>;
  };
}) {
  const sNodes = flow.student_nodes || [];
  const cNodes = flow.cluster_nodes || [];
  const pNodes = flow.parent_nodes || [];

  const maxRows = Math.max(sNodes.length, cNodes.length, pNodes.length, 3);
  const height = Math.max(240, maxRows * 52 + 24);
  const width = 560;

  const posMap: Record<string, { x: number; y: number }> = {};
  const layoutCol = (nodes: Array<{ id: string }>, x: number) => {
    const step = height / (nodes.length + 1);
    nodes.forEach((n, i) => {
      posMap[n.id] = { x, y: (i + 1) * step };
    });
  };
  layoutCol(sNodes, 82);
  layoutCol(cNodes, 280);
  layoutCol(pNodes, 478);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {(flow.links || []).map((l, idx) => {
        const a = posMap[l.from];
        const b = posMap[l.to];
        if (!a || !b) return null;
        const midX = (a.x + b.x) / 2;
        const path = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
        return (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke={l.from.startsWith("S") ? "#0E7268" : "#181C1F"}
            strokeOpacity={0.28}
            strokeWidth={Math.max(1.5, Math.min(7, l.w * 0.8))}
          />
        );
      })}

      {[
        { list: sNodes, fill: "#E5F3F1", stroke: "#0E7268", x: 82 },
        { list: cNodes, fill: "#F7F6F2", stroke: "#181C1F", x: 280 },
        { list: pNodes, fill: "#EEEBE2", stroke: "#6E7370", x: 478 },
      ].map((col, ci) =>
        col.list.map((n) => {
          const pos = posMap[n.id];
          return (
            <g key={`${ci}-${n.id}`}>
              <rect
                x={col.x - 74}
                y={pos.y - 16}
                width="148"
                height="32"
                rx="8"
                fill={col.fill}
                stroke={col.stroke}
                strokeWidth="1.2"
              />
              <text
                x={col.x}
                y={pos.y + 4}
                textAnchor="middle"
                fontSize="10.5"
                fontWeight="600"
                fill="#181C1F"
              >
                {n.label.length > 21 ? `${n.label.slice(0, 19)}…` : n.label}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}

export function FairnessNormsPanel({
  audit,
}: {
  audit: {
    total_v2_completed: number;
    grade_norms: {
      grade_10: { completed_n: number; norm_status: string; threshold: number };
      grade_12: { completed_n: number; norm_status: string; threshold: number };
    };
    gender_counts: Record<string, number>;
    fairness_disparity_flags: Array<{
      cluster_id: string;
      gap_sd: number;
      breakdown: Array<{ gender: string; n: number; mean: number }>;
    }>;
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">V2 Completed Cohort</p>
          <p className="tnum font-display text-[30px] font-bold mt-2">{audit.total_v2_completed}</p>
        </Card>
        {[
          { label: "Grade 10 Norms", d: audit.grade_norms.grade_10 },
          { label: "Grade 12 Norms", d: audit.grade_norms.grade_12 },
        ].map((g) => (
          <Card key={g.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">{g.label}</p>
              <Badge tone={g.d.norm_status === "final" ? "ok" : "warn"}>{g.d.norm_status}</Badge>
            </div>
            <p className="tnum font-display text-[24px] font-bold mt-2">
              {g.d.completed_n} <span className="text-[13px] text-ink-3 font-normal">/ {g.d.threshold}</span>
            </p>
            <Progress value={Math.min(100, Math.round((g.d.completed_n / g.d.threshold) * 100))} className="mt-2.5" />
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-6">
          <h3 className="font-display font-bold text-[16px] mb-3">Demographic Reporting (Non-Scoring)</h3>
          <p className="text-[12.5px] text-ink-3 mb-4">
            Gender and demographic items never enter scoring weights; they are monitored post-release strictly for fairness checks.
          </p>
          {Object.keys(audit.gender_counts).length === 0 ? (
            <p className="text-[13px] text-ink-3">No V2 assessments completed yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(audit.gender_counts).map(([g, cnt]) => (
                <div key={g} className="flex items-center justify-between rounded-[10px] bg-paper px-3.5 py-2.5 text-[13.5px]">
                  <span className="font-medium text-ink">{g}</span>
                  <span className="tnum font-bold text-ink">{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-bold text-[16px] mb-3">Fairness Disparity Guard (&gt; 0.3 SD)</h3>
          {audit.fairness_disparity_flags.length === 0 ? (
            <div className="rounded-[12px] bg-ok-soft border border-[#BFE3D2] p-4 text-[13.5px] text-ok font-medium">
              All 16 clusters are within the 0.3 SD inter-group disparity threshold across current completed V2 data.
            </div>
          ) : (
            <div className="space-y-2.5">
              {audit.fairness_disparity_flags.map((fl) => (
                <div key={fl.cluster_id} className="rounded-[12px] border border-warn bg-warn-soft p-3.5 text-[13px]">
                  <p className="font-bold text-warn">
                    {fl.cluster_id} · Disparity {fl.gap_sd} SD
                  </p>
                  <p className="text-ink-2 mt-1">
                    {fl.breakdown.map((b) => `${b.gender}: ${b.mean.toFixed(1)} (n=${b.n})`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
