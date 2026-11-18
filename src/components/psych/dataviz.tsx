"use client";

/**
 * Data visualization components.
 * Every number rendered here is read directly from the backend's canonical
 * result payload — these components NEVER compute scores, bands or weights.
 * Visual tone (color) varies by band wording; wording itself stays verbatim.
 */
import { useState } from "react";
import { Badge, Card, Button } from "./ui";
import {
  APTITUDE_DIMENSIONS,
  GRIT_DIMENSIONS,
  RIASEC_DIMENSIONS,
  contributionLabel,
  fmtScore,
  fmtNum,
  bandTone,
} from "@/lib/format";
import type {
  AptitudeScores,
  Congruence,
  GritScores,
  RiasecScores,
  StreamContribution,
  StreamResult,
} from "@/lib/types";

/**
 * Normalize the two documented congruence shapes (canonical result JSON vs
 * parent dashboard payload) into one presentation shape. Pure reshaping —
 * every value remains the backend's own.
 */
export function normalizeCongruence(c: Congruence | null | undefined): Congruence | null {
  if (!c) return null;
  const has = c.has_parent_data === true || c.has_parent_data === undefined ? (c.congruence_pct != null || c.score != null || c.alignment_status != null || c.band != null) : Boolean(c.has_parent_data);
  if (!has) return { ...c, has_parent_data: false };
  return {
    has_parent_data: true,
    congruence_pct: c.congruence_pct ?? c.score ?? null,
    alignment_status: c.alignment_status ?? c.band ?? null,
    stream_match_score: c.stream_match_score ?? null,
    perception_gap_score: c.perception_gap_score ?? null,
    friction_factors: c.friction_factors ?? c.friction?.friction_factors ?? [],
    discussion_areas: c.discussion_areas ?? c.friction?.discussion_areas ?? [],
    student_top_stream: c.student_top_stream ?? null,
    parent_expected_stream_id: c.parent_expected_stream_id ?? null,
    parent_priority: c.parent_priority ?? null,
    components_used: c.components_used,
  };
}

/* ============================================================
   ScoreBar — horizontal comparison bar (aptitude, interests)
   ============================================================ */

export function ScoreBar({
  label,
  value,
  max = 100,
  tone = "brand",
  suffix,
  onClick,
  sub,
}: {
  label: string;
  value: number | null;
  max?: number;
  tone?: "brand" | "ok" | "warn" | "ink";
  suffix?: string;
  onClick?: () => void;
  sub?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "ink" ? "bg-ink" : "bg-brand";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { onClick, type: "button" as const, "aria-label": `${label}: ${fmtNum(value)}` } : {})}
      className={`w-full group ${onClick ? "text-left cursor-pointer rounded-lg focus-visible:outline-2" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[13.5px] font-semibold text-ink group-hover:text-brand transition-colors">
          {label}
          {sub && <span className="ml-2 font-normal text-ink-3 text-[12px]">{sub}</span>}
        </span>
        <span className="tnum text-[14px] font-bold text-ink">
          {fmtNum(value)}
          {suffix}
          {value === null && <span className="text-ink-3 font-medium text-[12px]">not measured</span>}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full bar-fill ${fill}`}
          style={{ width: value === null ? "0%" : `${pct}%` }}
        />
      </div>
    </Wrapper>
  );
}

/* ============================================================
   DimensionCard — click to reveal what it measures & how it contributed
   ============================================================ */

export function DimensionCard({
  label,
  value,
  blurb,
  detail,
  scaleNote,
}: {
  label: string;
  value: number | null;
  blurb: string;
  detail?: string;
  scaleNote?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full px-5 py-4 flex items-center gap-4 text-left cursor-pointer hover:bg-paper transition-colors"
      >
        <div className="w-12 h-12 rounded-[12px] bg-brand-mist flex items-center justify-center shrink-0">
          <span className="tnum font-display font-bold text-[17px] text-brand-strong">
            {fmtNum(value)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[14.5px] text-ink">{label}</p>
          <p className="text-[12.5px] text-ink-2 truncate">{blurb}</p>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
          className={`text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-line fade-in">
          <p className="text-[13.5px] text-ink-2 leading-relaxed mt-3">
            {detail || blurb}
          </p>
          <p className="text-[12px] text-ink-3 mt-2">
            {scaleNote || "Score shown is a normalized index (0–100) from your assessment responses."}
          </p>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   RiasecChart — elegant hexagon, top-3 highlighted
   ============================================================ */

const HEX_ORDER = ["R", "I", "A", "S", "E", "C"];

export function RiasecChart({ riasec, compact = false }: { riasec: RiasecScores; compact?: boolean }) {
  const size = compact ? 260 : 340;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size * 0.375;
  const top3 = (riasec.holland_code || "").split("");

  const angle = (i: number) => (-90 + i * 60) * (Math.PI / 180);
  const point = (i: number, radius: number) => ({
    x: cx + radius * Math.cos(angle(i)),
    y: cy + radius * Math.sin(angle(i)),
  });

  const scores = HEX_ORDER.map((k) => riasec[k as keyof RiasecScores] as number | null);
  // inner polygon scaled by measured scores (presentation of backend values)
  const innerPts = scores.map((v, i) => point(i, v === null ? 0 : (Math.max(4, v) / 100) * r));
  const hexPts = HEX_ORDER.map((_, i) => point(i, r));
  const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`${-size * 0.15} 0 ${size * 1.3} ${size}`}
      width="100%"
      role="img"
      aria-label={`Holland Code ${riasec.holland_code ?? "not available"}. ${HEX_ORDER.map(
        (k, i) => `${RIASEC_DIMENSIONS.find((d) => d.key === k)?.label}: ${scores[i] ?? "not measured"}`.trim()
      ).join(", ")}.`}
      className="max-w-full h-auto"
    >
      {/* hexagon frame */}
      <polygon points={poly(hexPts)} fill="none" stroke="var(--border-strong)" strokeWidth="1.4" />
      <polygon points={poly(HEX_ORDER.map((_, i) => point(i, r * 0.5)))} fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
      {/* spokes */}
      {HEX_ORDER.map((_, i) => {
        const p = point(i, r);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth="1" />;
      })}
      {/* score polygon */}
      {scores.some((v) => v !== null) && (
        <polygon points={poly(innerPts)} fill="var(--accent)" opacity="0.14" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
      )}
      {/* vertices */}
      {HEX_ORDER.map((k, i) => {
        const p = point(i, r);
        const v = scores[i];
        const isTop = top3.includes(k);
        const label = RIASEC_DIMENSIONS.find((d) => d.key === k)?.label ?? k;
        const lx = cx + (r + 26) * Math.cos(angle(i));
        const ly = cy + (r + 26) * Math.sin(angle(i));
        const anchor = Math.abs(Math.cos(angle(i))) < 0.3 ? "middle" : Math.cos(angle(i)) > 0 ? "start" : "end";
        return (
          <g key={k}>
            <circle
              cx={p.x} cy={p.y} r={isTop ? 15 : 13}
              fill={v === null ? "var(--surface-sunken)" : isTop ? "var(--accent)" : "var(--surface)"}
              stroke={v === null ? "var(--border-strong)" : isTop ? "var(--accent-strong)" : "var(--border-strong)"}
              strokeWidth="1.6"
            />
            <text
              x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="700"
              fill={v === null ? "var(--text-tertiary)" : isTop ? "#fff" : "var(--text-secondary)"}
              fontFamily="var(--font-display)"
            >
              {k}
            </text>
            <text x={lx} y={ly - 2} textAnchor={anchor} fontSize={compact ? "11" : "12"} fontWeight="600" fill="var(--text-secondary)">
              {label}
            </text>
            <text x={lx} y={ly + 13} textAnchor={anchor} fontSize={compact ? "11.5" : "13"} fontWeight="700" fill="var(--text-primary)" fontFamily="var(--font-body)">
              {v === null ? "n/a" : v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   StreamCard + ExplainabilityPanel
   ============================================================ */

export function StreamCard({
  stream,
  onWhy,
  featured = false,
}: {
  stream: StreamResult;
  onWhy?: (s: StreamResult) => void;
  featured?: boolean;
}) {
  const tone = bandTone(stream.band);
  const topContrib = [...(stream.contributions || [])]
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))
    .slice(0, 3);
  return (
    <Card interactive={!!onWhy} className={`p-5 flex flex-col ${featured ? "border-brand/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="tnum w-7 h-7 shrink-0 rounded-full bg-surface-2 text-ink-2 text-[12px] font-bold flex items-center justify-center">
            {stream.rank}
          </span>
          <h3 className="font-display font-bold text-[15.5px] leading-tight pt-0.5">{stream.name}</h3>
        </div>
        <Badge tone={tone} dot className="shrink-0 whitespace-nowrap">{stream.band ?? "—"}</Badge>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className="tnum font-display text-[38px] font-bold leading-none text-ink">
            {fmtScore(stream.score, 1)}
          </p>
          <p className="text-[11px] uppercase tracking-[0.1em] text-ink-3 mt-1 font-semibold">Fit index</p>
        </div>
        <div className="flex-1 pb-1 space-y-1.5">
          {topContrib.map((c) => (
            <div key={c.component} className="flex items-center gap-2">
              <span className="text-[11.5px] text-ink-2 w-28 truncate">{contributionLabel(c.component)}</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand/70 bar-fill"
                  style={{ width: `${c.value ?? 0}%` }}
                />
              </div>
              <span className="tnum text-[11px] text-ink-3 w-6 text-right">{fmtNum(c.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {onWhy && (
        <div className="mt-4 pt-3.5 border-t border-line">
          <Button variant="ghost" size="sm" onClick={() => onWhy(stream)} aria-label={`Explain why ${stream.name} scored ${fmtScore(stream.score, 1)}`}>
            Why this score?
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * ExplainabilityPanel — the "WHY" view.
 * Renders the backend's contribution breakdown verbatim:
 *   component label · value × weight → contribution
 * The final score is the backend's score; nothing is recalculated here.
 */
export function ExplainabilityPanel({ stream }: { stream: StreamResult }) {
  const rows = [...(stream.contributions || [])].sort(
    (a, b) => (b.contribution ?? 0) - (a.contribution ?? 0)
  );
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <div>
          <EyebrowSmall text={`Why ${stream.name} scored ${fmtScore(stream.score, 1)}`} />
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">
            Each dimension below contributed part of the fit index. Values and weights come from the
            assessment result and the versioned scoring rules — shown exactly as calculated.
          </p>
        </div>
        <Badge tone={bandTone(stream.band)} dot>{stream.band}</Badge>
      </div>

      <div className="rounded-[12px] border border-line overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_70px_90px] gap-x-4 px-4 py-2.5 bg-paper text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 border-b border-line">
          <span>Dimension</span>
          <span className="hidden sm:block text-right">Value</span>
          <span className="hidden sm:block text-right">Weight</span>
          <span className="text-right">Contribution</span>
        </div>
        {rows.map((c: StreamContribution) => (
          <div
            key={c.component}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_70px_90px] gap-x-4 items-center px-4 py-3 border-b border-line last:border-0 bg-surface"
          >
            <span className="text-[13.5px] font-medium text-ink">{contributionLabel(c.component)}</span>
            <span className="hidden sm:block tnum text-right text-[13.5px] text-ink-2">{fmtNum(c.value)}</span>
            <span className="hidden sm:block tnum text-right text-[13.5px] text-ink-2">
              {c.weight !== null && c.weight !== undefined ? `${Math.round(c.weight * 100)}%` : "—"}
            </span>
            <span className="tnum text-right text-[14px] font-bold text-brand-strong">
              {c.contribution === null ? "—" : `+${Number(c.contribution).toFixed(1)}`}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_70px_90px] gap-x-4 items-center px-4 py-3.5 bg-brand-mist">
          <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-brand-strong">Final fit index</span>
          <span className="hidden sm:block" />
          <span className="hidden sm:block" />
          <span className="tnum text-right font-display text-[20px] font-bold text-brand-strong">
            {fmtScore(stream.score, 1)}
          </span>
        </div>
      </div>

      <p className="text-[12px] text-ink-3 mt-3 leading-relaxed">
        Fit index = sum of (dimension value × dimension weight). Weights are defined in the versioned
        stream scoring rules and sum to 1.00. This is a fit <em>index</em> for exploration — not a
        percentage of success or a prediction.
      </p>
    </div>
  );
}

function EyebrowSmall({ text }: { text: string }) {
  return (
    <h3 className="font-display font-bold text-[17px] leading-snug text-ink">{text}</h3>
  );
}

/* ============================================================
   WorkStyle — compact work-style rows (raw 1–5 + composite index)
   ============================================================ */

export function WorkStylePanel({ grit }: { grit: GritScores }) {
  return (
    <div className="space-y-5">
      {GRIT_DIMENSIONS.map((d) => {
        const raw = grit[d.key as keyof GritScores] as number | null;
        return (
          <div key={d.key}>
            <ScoreBar
              label={d.label}
              sub={`${raw === null ? "—" : Number(raw).toFixed(1)} / 5`}
              value={raw === null ? null : Math.max(4, (raw / 5) * 100)}
              tone="ink"
            />
            <p className="text-[12px] text-ink-3 mt-1">{d.blurb}</p>
          </div>
        );
      })}
      <div className="rounded-[12px] bg-paper border border-line px-4 py-3.5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-ink">Overall work-style index</p>
          <p className="text-[12px] text-ink-3">Composite of the seven dimensions above</p>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-[22px] font-bold text-ink leading-none">
            {fmtNum(grit.normalized_index)}
          </p>
          <p className="text-[10.5px] uppercase tracking-[0.1em] text-ink-3 mt-0.5">of 100</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AptitudePanel — horizontal comparison bars
   ============================================================ */

export function AptitudePanel({ aptitude }: { aptitude: AptitudeScores }) {
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = APTITUDE_DIMENSIONS.map((d) => ({
    ...d,
    value: aptitude[d.key as keyof AptitudeScores] as number | null,
  })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  return (
    <div className="space-y-5">
      {ordered.map((d) => (
        <div key={d.key}>
          <ScoreBar
            label={d.label}
            value={d.value}
            onClick={() => setSelected((s) => (s === d.key ? null : d.key))}
          />
          {selected === d.key && (
            <div className="mt-2.5 rounded-[10px] bg-brand-mist border border-[#D3E5E1] px-4 py-3 fade-in">
              <p className="text-[13px] text-ink-2 leading-relaxed">
                <span className="font-semibold text-ink">{d.label} reasoning</span> — {d.blurb}{" "}
                This index reflects your responses in this section; it describes the assessment, not a
                fixed ability.
              </p>
            </div>
          )}
        </div>
      ))}
      <div className="rounded-[12px] bg-paper border border-line px-4 py-3.5 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-ink">Overall aptitude index</p>
          <p className="text-[12px] text-ink-3">Across all six reasoning sections</p>
        </div>
        <p className="tnum font-display text-[22px] font-bold text-ink leading-none">
          {fmtNum(aptitude.overall)}
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   AlignmentCard — student ↔ parent comparison (neutral language)
   ============================================================ */

export function AlignmentCard({
  congruence: rawCongruence,
  studentName,
  fallback,
}: {
  congruence: Congruence;
  studentName: string;
  /** Extra context from the parent dashboard payload (some shapes omit these). */
  fallback?: {
    studentTopStream?: string | null;
    parentExpectedStream?: string | null;
    parentPriority?: string | null;
  };
}) {
  const congruence = normalizeCongruence(rawCongruence);
  if (!congruence || !congruence.has_parent_data) {
    return (
      <div className="rounded-card border border-dashed border-line-2 bg-surface p-8 text-center">
        <p className="font-display font-bold text-[16px]">Parent perspective not submitted yet</p>
        <p className="mt-1.5 text-[13.5px] text-ink-2 max-w-md mx-auto">
          Alignment is computed once a linked parent shares their perspective. Until then this stays
          intentionally empty — nothing is assumed.
        </p>
      </div>
    );
  }
  const score = congruence.congruence_pct ?? null;
  const band = congruence.alignment_status ?? null;
  const topStream = congruence.student_top_stream ?? fallback?.studentTopStream ?? null;
  const expectedStream = congruence.parent_expected_stream_id ?? fallback?.parentExpectedStream ?? null;
  const priority = congruence.parent_priority ?? fallback?.parentPriority ?? null;
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3">Student profile</p>
          <p className="font-display font-bold text-[16px] mt-2">{studentName}</p>
          <p className="text-[13px] text-ink-2 mt-1">
            Top stream: <span className="font-semibold text-ink">{topStream ?? "—"}</span>
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3">Parent expectation</p>
          <p className="font-display font-bold text-[16px] mt-2 capitalize">
            {(expectedStream ?? "—").replace(/_/g, " ")}
          </p>
          <p className="text-[13px] text-ink-2 mt-1 capitalize">
            Priority: <span className="font-semibold text-ink">{(priority ?? "—").replace(/_/g, " ")}</span>
          </p>
        </Card>
        <Card className="p-5 border-brand/40">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-brand">Alignment</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="tnum font-display text-[30px] font-bold leading-none text-ink">{fmtNum(score)}</p>
            <Badge tone={bandTone(band)} dot>{band ?? "—"}</Badge>
          </div>
          <p className="text-[12px] text-ink-3 mt-2">0–100 alignment index · computed from both perspectives</p>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="font-semibold text-[14px] text-ok flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ok" aria-hidden="true" />
            Where perspectives meet
          </p>
          <p className="text-[13px] text-ink-2 mt-2.5 leading-relaxed">
            Stream agreement index: <span className="tnum font-semibold text-ink">{fmtNum(congruence.stream_match_score)}</span>
            {congruence.perception_gap_score !== null && congruence.perception_gap_score !== undefined && (
              <>
                {" "}· Perception gap index:{" "}
                <span className="tnum font-semibold text-ink">{fmtNum(congruence.perception_gap_score)}</span>
              </>
            )}
          </p>
          <p className="text-[12.5px] text-ink-3 mt-2 leading-relaxed">
            Higher values mean the two perspectives point in similar directions on that component.
          </p>
        </Card>
        <Card className="p-5">
          <p className="font-semibold text-[14px] text-warn flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warn" aria-hidden="true" />
            Areas worth discussing
          </p>
          {(congruence.friction_factors?.length || 0) > 0 || (congruence.discussion_areas?.length || 0) > 0 ? (
            <ul className="mt-2.5 space-y-2">
              {(congruence.friction_factors || []).map((f) => (
                <li key={f.area} className="text-[13px] text-ink-2 leading-relaxed flex gap-2">
                  <span aria-hidden="true" className="text-ink-3 mt-0.5">–</span>
                  {f.detail}
                </li>
              ))}
              {(congruence.discussion_areas || []).map((a, i) => (
                <li key={i} className="text-[13px] text-ink-2 leading-relaxed flex gap-2">
                  <span aria-hidden="true" className="text-ink-3 mt-0.5">–</span>
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-2 mt-2.5">
              No specific friction areas were flagged — the two perspectives broadly agree.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   Admin distribution bars
   ============================================================ */

export function DistributionBars({
  title,
  rows,
  emptyText = "No data yet",
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  emptyText?: string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card className="p-5">
      <p className="font-semibold text-[14px] mb-4">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3 py-4">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <span className="text-[12.5px] text-ink-2 w-40 truncate">{r.label}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-brand/80 bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <span className="tnum text-[12.5px] font-bold text-ink w-6 text-right">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
