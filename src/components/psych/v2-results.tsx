"use client";

/**
 * V2 Student Results & Pathway Explorer views (16 career clusters, Passion Health,
 * Hidden Gems, Growth Paths, Grade 10 vs 12 segregation, Reality Check).
 * Strictly no AI/model/agent mentions in student-facing views.
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/AppContext";
import { Badge, Button, Card, Eyebrow, Modal, Progress, Tabs } from "@/components/psych/ui";
import { fmtDateTime } from "@/lib/format";
import type { V2ClusterRow, V2ResultEnvelope } from "@/lib/types";

const APT_LABELS: Array<{ key: string; label: string; desc: string }> = [
  { key: "V", label: "Verbal Reasoning", desc: "Reading comprehension, nuance, and vocabulary precision" },
  { key: "N", label: "Numerical Reasoning", desc: "Quantitative logic, ratios, and numerical fluency" },
  { key: "L", label: "Logical Reasoning", desc: "Pattern deduction, rule inference, and structured proof" },
  { key: "S", label: "Spatial Reasoning", desc: "Mental rotation, geometry, and 3D structure mapping" },
  { key: "P", label: "Perceptual Speed", desc: "Fast visual scanning and detail accuracy" },
  { key: "CRE", label: "Divergent Creativity", desc: "Originality and breadth across open-ended prompts" },
  { key: "EQ", label: "Emotional Awareness", desc: "Self-regulation, empathy, and interpersonal judgement" },
];

const BIG5_LABELS: Record<string, string> = {
  O: "Openness & Curiosity",
  C: "Conscientiousness & Follow-through",
  E: "Extraversion & Social Energy",
  A: "Agreeableness & Collaboration",
  N: "Stress Sensitivity",
};

const PASSION_HELP: Record<string, { tone: "ok" | "brand" | "warn"; text: string }> = {
  Harmonious: {
    tone: "ok",
    text: "You engage deeply in what you enjoy while keeping healthy balance across school and life.",
  },
  Balanced: {
    tone: "brand",
    text: "Steady interest across themes without excessive pressure or over-narrowing too early.",
  },
  Obsessive: {
    tone: "warn",
    text: "Strong drive can feel all-consuming — protecting rest and variety helps sustain motivation.",
  },
  "Pressure-driven": {
    tone: "warn",
    text: "External expectations appear heavy right now; distinguishing your own voice from outside pressure matters.",
  },
  Exploring: {
    tone: "brand",
    text: "You are still sampling directions — hands-on projects and electives are ideal next steps.",
  },
};

function clusterById(clusters: V2ClusterRow[], id?: string | null): V2ClusterRow | undefined {
  if (!id) return undefined;
  return clusters.find((c) => c.id === id);
}

export function V2ResultsDashboard({
  envelope,
  studentName,
  navigate,
  onConsentChanged,
}: {
  envelope: V2ResultEnvelope;
  studentName: string;
  navigate: (to: string) => void;
  onConsentChanged?: (next: boolean) => void;
}) {
  const { pushToast } = useApp();
  const [tab, setTab] = useState("overview");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentState, setConsentState] = useState(Boolean(envelope.parent_consent_sensitive));
  const [clusterFilter, setClusterFilter] = useState<"all" | "top5">("all");
  const [selectedCluster, setSelectedCluster] = useState<V2ClusterRow | null>(null);

  const r = envelope.result;
  const passionPick = clusterById(r.clusters, r.picks?.passion);
  const strengthPick = clusterById(r.clusters, r.picks?.strength);
  const balancedPick = clusterById(r.clusters, r.picks?.balanced);
  const passionMeta = PASSION_HELP[r.passion_type] ?? PASSION_HELP.Balanced;

  const toggleConsent = async () => {
    setConsentBusy(true);
    try {
      const res = await api.v2.setParentConsent(envelope.assessment_id, !consentState);
      setConsentState(res.parent_consent_sensitive);
      onConsentChanged?.(res.parent_consent_sensitive);
      pushToast(
        res.parent_consent_sensitive
          ? "Shared study-stress reflections can now be discussed in your parent summary."
          : "Personal stress & reflection notes kept private.",
        "success"
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not update sharing preference.", "bad");
    } finally {
      setConsentBusy(false);
    }
  };

  const visibleClusters = useMemo(
    () => (clusterFilter === "top5" ? r.clusters.slice(0, 5) : r.clusters),
    [r.clusters, clusterFilter]
  );

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 sm:py-10">
      {/* Header card */}
      <Card className="p-6 sm:p-8 rise">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow>Comprehensive V2 profile</Eyebrow>
              <Badge tone="brand">Grade {r.grade}</Badge>
              <Badge tone={r.norm_status === "final" ? "ok" : "neutral"}>
                {r.norm_status === "final" ? "Norm calibrated" : "Provisional norms"}
              </Badge>
              <Badge tone={r.confidence === "High" ? "ok" : r.confidence === "Moderate" ? "brand" : "warn"}>
                {r.confidence} confidence
              </Badge>
            </div>
            <h1 className="font-display text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] mt-2">
              {studentName}&rsquo;s career profile
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-ok" />
                Assessment completed
              </span>
              {envelope.completed_at && <span className="tnum">{fmtDateTime(envelope.completed_at)}</span>}
              <span>RIASEC <strong className="text-ink tnum">{r.riasec_code}</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Button onClick={() => navigate("/explore")}>Explore pathways</Button>
          </div>
        </div>

        {r.validity?.is_provisional_due_to_validity && (
          <div className="mt-5 rounded-[12px] border border-[#EBDDBB] bg-warn-soft px-4 py-3 text-[13px] text-warn">
            Some sections had very fast or uniform answers, so consider narrow rank differences exploratory and verify them in counselling.
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-ink-2 max-w-xl">
            <span className="font-semibold text-ink">Parent privacy control:</span> exam-stress and personal reflection themes are{" "}
            <strong>{consentState ? "shared with linked parents" : "kept private (you + counsellor only)"}</strong>.
          </div>
          <Button size="sm" variant="secondary" loading={consentBusy} onClick={toggleConsent}>
            {consentState ? "Make stress notes private" : "Allow sharing stress notes"}
          </Button>
        </div>
      </Card>

      <Tabs
        className="mt-6"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "clusters", label: "16 Career Clusters" },
          { key: "aptitude", label: "Reasoning & Creativity" },
          { key: "mind", label: "Mind, Values & Readiness" },
        ]}
      />

      <div className="mt-6 space-y-6">
        {tab === "overview" && (
          <div className="space-y-6 fade-in">
            {/* 3 Highlight Picks */}
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: "Passion Pick", hint: "Highest intrinsic excitement", item: passionPick },
                { label: "Strength Pick", hint: "Strongest cognitive fit", item: strengthPick },
                { label: "Balanced Pick", hint: "Best overall composite fit", item: balancedPick },
              ].map((card) => (
                <Card key={card.label} className="p-5 flex flex-col justify-between">
                  <div>
                    <Badge tone="brand">{card.label}</Badge>
                    <h2 className="font-display text-[17px] font-bold mt-3 leading-snug">
                      {card.item?.name ?? "—"}
                    </h2>
                    <p className="text-[12px] text-ink-3 mt-1">{card.hint}</p>
                  </div>
                  {card.item && (
                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-[12.5px]">
                      <span className="text-ink-2">Composite</span>
                      <span className="tnum font-bold text-ink">{card.item.final}%</span>
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* RIASEC + Passion Health */}
            <div className="grid md:grid-cols-2 gap-5">
              <Card className="p-6">
                <p className="font-semibold text-[15px]">Passion & Persistence Profile</p>
                <div className="mt-3 flex items-center gap-2.5">
                  <Badge tone={passionMeta.tone} dot>{r.passion_type} passion</Badge>
                  <Badge tone="neutral">Grit {r.grit_mean_5} / 5</Badge>
                </div>
                <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">{passionMeta.text}</p>
                <div className="mt-4 pt-4 border-t border-line grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">RIASEC</p>
                    <p className="font-display text-[20px] font-bold text-brand tnum mt-0.5">{r.riasec_code}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Career Awareness</p>
                    <p className="font-display text-[20px] font-bold tnum mt-0.5">{r.readiness?.career_awareness_pct ?? "—"}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3">Spread</p>
                    <p className="font-display text-[20px] font-bold tnum mt-0.5">{r.confidence_spread} pts</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <p className="font-semibold text-[15px] mb-1">Top 5 Career Clusters</p>
                <p className="text-[12.5px] text-ink-3 mb-4">Weighted across interest, passion, and reasoning</p>
                <div className="space-y-3">
                  {r.clusters.slice(0, 5).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCluster(c)}
                      className="w-full text-left group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[13px] mb-1">
                        <span className="font-semibold text-ink group-hover:text-brand truncate pr-2">
                          {c.id} · {c.name}
                        </span>
                        <span className="tnum font-bold shrink-0">{c.final}%</span>
                      </div>
                      <Progress value={c.final} />
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Hidden Gems & Growth Paths */}
            {(r.hidden_gems?.length > 0 || r.growth_paths?.length > 0) && (
              <div className="grid md:grid-cols-2 gap-5">
                <Card className="p-6">
                  <Badge tone="ok">Hidden Gems</Badge>
                  <p className="text-[12.5px] text-ink-3 mt-1.5 mb-4">
                    High-fit options outside your original starting guess
                  </p>
                  {r.hidden_gems?.length > 0 ? (
                    <div className="space-y-3">
                      {r.hidden_gems.map((g) => (
                        <div key={g.id} className="rounded-[12px] border border-line p-3.5">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-[14px]">{g.name}</p>
                            <span className="tnum text-[13px] font-bold text-ok">Passion {g.passion}% · Apt {g.aptitude}%</span>
                          </div>
                          <p className="text-[12.5px] text-ink-2 mt-1">
                            Sample roles: {(g.careers || []).join(", ") || "Multi-disciplinary roles"}
                          </p>
                          <p className="text-[11.5px] text-ink-3 mt-1">
                            Earning ladder: {typeof g.earning_ladder === "string" ? g.earning_ladder : g.earning_ladder?.entry || "Data pending"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-3">Your top clusters already align closely with your stated preference.</p>
                  )}
                </Card>

                <Card className="p-6">
                  <Badge tone="warn">Growth Paths</Badge>
                  <p className="text-[12.5px] text-ink-3 mt-1.5 mb-4">
                    High interest areas where targeted skill practice can lift readiness
                  </p>
                  {r.growth_paths?.length > 0 ? (
                    <div className="space-y-3">
                      {r.growth_paths.map((gp) => (
                        <div key={gp.id} className="rounded-[12px] border border-line p-3.5">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-[14px]">{gp.name}</p>
                            <span className="tnum text-[12.5px] font-semibold text-warn">Passion {gp.passion}% · Apt {gp.aptitude}%</span>
                          </div>
                          <p className="text-[12.5px] text-ink-2 mt-1.5 leading-relaxed">{gp.six_month_plan}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-3">Your top passion areas already match your measured reasoning strengths.</p>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "clusters" && (
          <div className="space-y-4 fade-in">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-[13.5px] text-ink-2">
                Tap any cluster to inspect matching courses, Grade 10 stream tags, and entrance exam notes.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={clusterFilter === "all" ? "primary" : "secondary"} onClick={() => setClusterFilter("all")}>
                  All 16
                </Button>
                <Button size="sm" variant={clusterFilter === "top5" ? "primary" : "secondary"} onClick={() => setClusterFilter("top5")}>
                  Top 5
                </Button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {visibleClusters.map((c, idx) => (
                <Card key={c.id} className="p-5 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
                          #{idx + 1} · {c.id} · {c.stream10 || "Flexible"}
                        </p>
                        <h3 className="font-display font-bold text-[16px] mt-0.5">{c.name}</h3>
                      </div>
                      <span className="tnum font-display text-[22px] font-bold text-brand shrink-0">{c.final}%</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] bg-paper rounded-[10px] p-2.5">
                      <div>
                        <span className="text-ink-3 block">Interest</span>
                        <span className="tnum font-bold text-ink">{c.interest}%</span>
                      </div>
                      <div>
                        <span className="text-ink-3 block">Passion</span>
                        <span className="tnum font-bold text-ink">{c.passion}%</span>
                      </div>
                      <div>
                        <span className="text-ink-3 block">Aptitude</span>
                        <span className="tnum font-bold text-ink">{c.aptitude}%</span>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setSelectedCluster(c)}>
                    Courses & Pathway Details
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === "aptitude" && (
          <div className="space-y-5 fade-in">
            <Card className="p-6">
              <p className="font-semibold text-[15px] mb-1">Reasoning & Creative Aptitude</p>
              <p className="text-[12.5px] text-ink-3 mb-5">
                0–100 indices from your timed and untimed Module 4 exercises ({r.norm_status} calibration).
              </p>
              <div className="space-y-4">
                {APT_LABELS.map((d) => {
                  const val = r.aptitude?.[d.key] ?? 0;
                  return (
                    <div key={d.key} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-[14px] font-semibold text-ink">{d.label}</span>
                          <span className="text-[12px] text-ink-3 ml-2">{d.desc}</span>
                        </div>
                        <span className="tnum font-bold text-[15px]">{val}</span>
                      </div>
                      <Progress value={val} />
                    </div>
                  );
                })}
              </div>
            </Card>
            {r.eq_facets && (
              <Card className="p-6">
                <p className="font-semibold text-[15px] mb-3">Emotional Awareness Facets</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {Object.entries(r.eq_facets).map(([k, v]) => (
                    <div key={k} className="rounded-[12px] border border-line p-3.5 flex items-center justify-between">
                      <span className="text-[13.5px] font-medium capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="tnum font-bold text-[15px] text-brand">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "mind" && (
          <div className="space-y-5 fade-in">
            <div className="grid md:grid-cols-2 gap-5">
              <Card className="p-6">
                <p className="font-semibold text-[15px] mb-4">Work Style & Personality (0–100)</p>
                <div className="space-y-3.5">
                  {Object.entries(BIG5_LABELS).map(([k, label]) => {
                    const v = r.personality?.[k] ?? 50;
                    return (
                      <div key={k} className="space-y-1">
                        <div className="flex justify-between text-[13px]">
                          <span className="font-medium">{label}</span>
                          <span className="tnum font-bold">{v}</span>
                        </div>
                        <Progress value={v} />
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-6">
                <p className="font-semibold text-[15px] mb-4">Top Core Values</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {(r.values_rank || []).slice(0, 6).map((v, i) => (
                    <Badge key={v} tone={i < 2 ? "brand" : "neutral"}>
                      #{i + 1} {v}
                    </Badge>
                  ))}
                </div>
                <p className="font-semibold text-[14px] mb-2">Study & Career Readiness</p>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div className="rounded-[10px] bg-paper p-3">
                    <dt className="text-ink-3 text-[11px] uppercase">Self-Efficacy</dt>
                    <dd className="tnum font-bold text-[16px] mt-0.5">{r.readiness?.se_academic_idx ?? "—"}%</dd>
                  </div>
                  <div className="rounded-[10px] bg-paper p-3">
                    <dt className="text-ink-3 text-[11px] uppercase">Career Awareness</dt>
                    <dd className="tnum font-bold text-[16px] mt-0.5">{r.readiness?.career_awareness_pct ?? "—"}%</dd>
                  </div>
                  <div className="rounded-[10px] bg-paper p-3">
                    <dt className="text-ink-3 text-[11px] uppercase">Decision Style</dt>
                    <dd className="font-bold text-[14px] mt-0.5">{r.readiness?.decision_style ?? "—"}</dd>
                  </div>
                  <div className="rounded-[10px] bg-paper p-3">
                    <dt className="text-ink-3 text-[11px] uppercase">Test Stress Index</dt>
                    <dd className="tnum font-bold text-[16px] mt-0.5">{r.readiness?.test_anxiety_idx ?? "—"}%</dd>
                  </div>
                </dl>
              </Card>
            </div>

            <Card className="p-5 bg-brand-mist/50">
              <p className="font-semibold text-[14px] mb-2">Measurement & Fairness Notes</p>
              <ul className="list-disc pl-5 space-y-1 text-[13px] text-ink-2">
                {(r.limitations || []).map((lim) => (
                  <li key={lim}>{lim}</li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      <Modal
        open={selectedCluster !== null}
        onClose={() => setSelectedCluster(null)}
        title={selectedCluster ? `${selectedCluster.id} · ${selectedCluster.name}` : ""}
        wide
      >
        {selectedCluster && (
          <ClusterModalContent cluster={selectedCluster} />
        )}
      </Modal>
    </div>
  );
}

function ClusterModalContent({ cluster }: { cluster: V2ClusterRow }) {
  const exams = cluster.exams || cluster.reality?.exams || [];
  const courses = cluster.courses || cluster.reality?.courses || [];
  const ladder = cluster.earning_ladder || cluster.reality?.earning_ladder || "Data verification pending";

  return (
    <div className="space-y-4 text-[13.5px]">
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">Composite {cluster.final}%</Badge>
        <Badge tone="neutral">Interest {cluster.interest}%</Badge>
        <Badge tone="neutral">Passion {cluster.passion}%</Badge>
        <Badge tone="neutral">Aptitude {cluster.aptitude}%</Badge>
        {cluster.stream10 && <Badge tone="ok">Grade 10 Stream: {cluster.stream10}</Badge>}
      </div>

      <div>
        <p className="font-semibold text-ink mb-1.5">Degree & Learning Courses</p>
        <ul className="list-disc pl-5 space-y-1 text-ink-2">
          {courses.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      {exams.length > 0 && (
        <div>
          <p className="font-semibold text-ink mb-1.5">Entrance Pathways</p>
          <ul className="space-y-1.5">
            {exams.map((rawEx, i) => {
              const ex = typeof rawEx === "string" ? { name: rawEx, note: "Verify rules for the current year" } : rawEx;
              return (
                <li key={i} className="rounded-[10px] border border-line px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{ex.name}</span>
                  <span className="text-[11.5px] text-ink-3">{ex.note || "Verify rules for the current year"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded-[10px] bg-paper border border-line p-3">
        <p className="text-[12px] font-semibold text-ink">Earning Ladder</p>
        <p className="text-[12.5px] text-ink-2 mt-0.5">{ladder}</p>
      </div>
    </div>
  );
}

export function V2ExploreView({
  envelope,
  onOpenResults,
}: {
  envelope: V2ResultEnvelope;
  onOpenResults: () => void;
}) {
  const [selectedCluster, setSelectedCluster] = useState<V2ClusterRow | null>(null);
  const r = envelope.result;
  const isGrade12 = Number(r.grade) >= 11;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <Eyebrow>Grade {r.grade} pathway explorer</Eyebrow>
          <h1 className="font-display text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] mt-1.5">
            {isGrade12 ? "Courses, degrees & next-step routes" : "Grade 10 streams & 16 career clusters"}
          </h1>
          <p className="mt-2.5 text-[14.5px] text-ink-2 leading-relaxed">
            {isGrade12
              ? "Tailored for post-Class-12 degrees and entrance preparation — always verify rules for the current year."
              : "Post-Grade-10 stream fit alongside the 16 broader career clusters so you keep doors open cleanly."}
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenResults}>
          Back to profile
        </Button>
      </div>

      {/* Grade-segregated primary view */}
      {!isGrade12 ? (
        <section className="mt-8">
          <h2 className="font-display text-[20px] font-bold mb-3">Grade 10 Stream Fit</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(r.streams_10 || []).map((st) => (
              <Card key={st.id} className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">{st.band}</p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-[17px] font-bold">{st.name}</h3>
                  <span className="tnum font-display text-[22px] font-bold text-brand shrink-0">{st.score}%</span>
                </div>
                <Progress value={st.score} className="mt-3" />
                {st.top_cluster && (
                  <p className="text-[12px] text-ink-2 mt-3">
                    Driven by: <span className="font-semibold">{st.top_cluster}</span>
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="font-display text-[20px] font-bold mb-3">Top Degree &amp; Entrance Pathways</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {(r.courses_12 || []).map((c) => (
              <Card key={c.cluster_id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge tone="brand">{c.cluster_id} · {c.final_score}%</Badge>
                    <h3 className="font-display text-[17px] font-bold mt-2">{c.cluster_name}</h3>
                  </div>
                </div>
                <ul className="mt-3 list-disc pl-5 text-[13px] text-ink-2 space-y-1">
                  {c.courses.map((course) => (
                    <li key={course}>{course}</li>
                  ))}
                </ul>
                <div className="mt-4 pt-3 border-t border-line text-[12px] space-y-1">
                  <p className="text-ink-2">
                    <strong>Exams:</strong>{" "}
                    {c.exams.join(", ") || "Course-specific"} ·{" "}
                    <span className="text-ink-3">Verify rules for the current year</span>
                  </p>
                  <p className="text-ink-3">Earning ladder: {c.earning_ladder || "Data verification pending"}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Reality check */}
      {r.reality_check && (
        <section className="mt-10">
          <Card className="p-6 bg-brand-mist/50">
            <h2 className="font-display text-[18px] font-bold">Reality Check &amp; Planning Notes</h2>
            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-[13px] text-ink-2">
              {r.reality_check.budget_fit && <p>• {r.reality_check.budget_fit}</p>}
              {r.reality_check.relocation_fit && <p>• {r.reality_check.relocation_fit}</p>}
              {r.reality_check.preparation_needed_note && <p>• {r.reality_check.preparation_needed_note}</p>}
              {r.reality_check.low_awareness_note && <p>• {r.reality_check.low_awareness_note}</p>}
            </div>
            {(r.reality_check.backup_routes?.length ?? 0) > 0 && (
              <p className="mt-3 text-[12.5px] text-ink-2">
                <strong>Parallel backup options:</strong>{" "}
                {r.reality_check.backup_routes?.map((b) => b.name).join(" · ")}
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Full 16 clusters */}
      <section className="mt-10">
        <h2 className="font-display text-[20px] font-bold mb-4">All 16 Career Clusters</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {r.clusters.map((c, idx) => (
            <Card key={c.id} className="p-5 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    #{idx + 1} · {c.id}
                  </span>
                  <span className="tnum font-display font-bold text-[18px] text-brand">{c.final}%</span>
                </div>
                <h3 className="font-display font-bold text-[15.5px] mt-1">{c.name}</h3>
                <p className="text-[12px] text-ink-3 mt-1">
                  Interest {c.interest}% · Passion {c.passion}% · Aptitude {c.aptitude}%
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setSelectedCluster(c)}>
                Courses & Exams
              </Button>
            </Card>
          ))}
        </div>
      </section>

      <Modal
        open={selectedCluster !== null}
        onClose={() => setSelectedCluster(null)}
        title={selectedCluster ? `${selectedCluster.id} · ${selectedCluster.name}` : ""}
        wide
      >
        {selectedCluster && <ClusterModalContent cluster={selectedCluster} />}
      </Modal>
    </div>
  );
}
