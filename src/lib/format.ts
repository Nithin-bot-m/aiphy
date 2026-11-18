/** Display formatters — presentation only, no data transformation beyond cosmetics. */

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function fmtScore(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits).replace(/\.0+$/, digits ? "" : "");
}

export function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return String(value);
}

export function shortHash(hash?: string | null, size = 10): string {
  if (!hash) return "—";
  return `${String(hash).slice(0, size)}…${String(hash).slice(-6)}`;
}

export function initials(name?: string | null): string {
  if (!name) return "•";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Rough time-left estimate for the assessment (labels itself as an estimate). */
export function estimateRemaining(answeredCount: number, total: number): string {
  const remaining = Math.max(total - answeredCount, 0);
  const minutes = Math.max(Math.round((remaining * 14) / 60), 1);
  return `~${minutes} min left`;
}

/** Dimension display metadata — cosmetic labels/descriptions of WHAT a
 *  dimension measures (product copy), never an interpretation of scores. */
export const APTITUDE_DIMENSIONS: Array<{ key: string; label: string; blurb: string }> = [
  { key: "logical", label: "Logical", blurb: "Working through rules and deductions step by step." },
  { key: "numerical", label: "Numerical", blurb: "Reasoning with numbers, ratios and sequences." },
  { key: "spatial", label: "Spatial", blurb: "Imagining shapes, rotations and arrangements." },
  { key: "abstract", label: "Abstract", blurb: "Spotting patterns that aren't expressed in words or numbers." },
  { key: "verbal", label: "Verbal", blurb: "Understanding language, analogies and meaning." },
  { key: "data", label: "Data", blurb: "Reading tables, charts and figures accurately." },
];

export const RIASEC_DIMENSIONS: Array<{ key: string; label: string; blurb: string }> = [
  { key: "R", label: "Realistic", blurb: "Hands-on, practical and technical activities." },
  { key: "I", label: "Investigative", blurb: "Observing, analysing and solving problems." },
  { key: "A", label: "Artistic", blurb: "Creating, expressing and designing." },
  { key: "S", label: "Social", blurb: "Teaching, supporting and working with people." },
  { key: "E", label: "Enterprising", blurb: "Leading, persuading and organising." },
  { key: "C", label: "Conventional", blurb: "Structuring information and working with precision." },
];

export const GRIT_DIMENSIONS: Array<{ key: string; label: string; blurb: string }> = [
  { key: "persistence", label: "Persistence", blurb: "Sticking with projects until they're done." },
  { key: "focus", label: "Focus", blurb: "Concentrating without frequent distraction." },
  { key: "curiosity", label: "Curiosity", blurb: "Enjoying new ideas and exploring topics deeply." },
  { key: "conscientiousness", label: "Conscientiousness", blurb: "Care, order and follow-through in schoolwork." },
  { key: "response_to_failure", label: "Response to Failure", blurb: "How setbacks are handled and recovered from." },
  { key: "deliberate_practice", label: "Deliberate Practice", blurb: "Practising with intent to improve specific skills." },
  { key: "stress_resilience", label: "Stress Resilience", blurb: "Steadiness under pressure and deadlines." },
];

/** component key ("riasec_i", "spatial", "grit", …) → display label. */
export function contributionLabel(component: string): string {
  if (component.startsWith("riasec_")) {
    const key = component.slice("riasec_".length).toUpperCase();
    const found = RIASEC_DIMENSIONS.find((d) => d.key === key);
    return found ? `${found.label} interest` : `${key} interest`;
  }
  if (component === "grit" || component === "grit_composite") return "Work style (overall)";
  const apt = APTITUDE_DIMENSIONS.find((d) => d.key === component);
  if (apt) return `${apt.label} ability`;
  const grit = GRIT_DIMENSIONS.find((d) => d.key === component);
  if (grit) return `${grit.label} (work style)`;
  return component.replace(/_/g, " ");
}

/** Visual tone for a fit band — color only, wording stays the backend's. */
export type Tone = "ok" | "warn" | "neutral" | "brand" | "bad";

export function bandTone(band?: string | null): Tone {
  const b = (band || "").toLowerCase();
  if (b.includes("strong")) return "ok";
  if (b.includes("possible")) return "warn";
  if (b.includes("explore")) return "neutral";
  if (b.includes("high alignment")) return "ok";
  if (b.includes("moderate")) return "warn";
  if (b.includes("friction") || b.includes("low")) return "bad";
  return "neutral";
}
