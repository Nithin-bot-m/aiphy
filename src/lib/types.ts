/**
 * TypeScript models of the backend's canonical API payloads.
 * These mirror the source-of-truth contract (docs/API.md) — the frontend
 * renders these values; it never computes them.
 */

/* ---------- envelope ---------- */

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/* ---------- auth ---------- */

export type Role = "candidate" | "parent" | "admin";

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  role: Role;
}

export interface CandidateProfile {
  id: number;
  user_id: number;
  full_name: string;
  grade: number | null;
  school_name: string | null;
  board: string | null;
  student_code: string;
  profile_completed: number | boolean;
  dob?: string | null;
  email?: string | null;
  phone?: string | null;
  pending_parent_requests?: ParentRequestRow[];
  parent_links?: ParentLinkRow[];
}

export interface ParentProfile {
  id: number;
  user_id: number;
  full_name: string;
  phone: string | null;
  relationship: string | null;
}

/* ---------- parent linking ---------- */

export interface ParentRequestRow {
  mapping_id: number;
  parent_name: string;
  relationship: string | null;
  requested_at: string;
}

export interface ParentLinkRow {
  mapping_id: number;
  parent_name: string;
  relationship: string | null;
  status: string;
  linked_at: string | null;
}

/* ---------- assessment ---------- */

export type QuestionModule = "aptitude" | "riasec" | "grit" | string;

export interface QuestionOption {
  id: number;
  option_key: string;
  option_text: string;
  display_order: number;
}

export interface AssessmentQuestion {
  id: number;
  module: QuestionModule;
  category: string;
  dimension: string;
  difficulty: string | null;
  question_text: string;
  question_type: "single_choice" | "likert_5" | string;
  options: QuestionOption[];
}

export interface SavedResponse {
  selected_option_id: number | null;
  numeric_value: number | null;
}

export interface AssessmentPayload {
  assessment_id: number;
  version_code: string;
  strategy: string;
  total_questions: number;
  answered: number;
  current_step: number | null;
  questions: AssessmentQuestion[];
  responses: Record<string, SavedResponse>;
}

export interface AssessmentRow {
  id: number;
  status: "in_progress" | "completed" | string;
  version_code?: string;
  completed_at?: string | null;
  [k: string]: unknown;
}

/* ---------- canonical result (psychometric-result/1.0) ---------- */

export interface CompletenessItem {
  items_answered: number;
  items_expected: number;
  complete: boolean;
}

export interface AptitudeScores {
  numerical: number | null;
  logical: number | null;
  verbal: number | null;
  spatial: number | null;
  abstract: number | null;
  data: number | null;
  overall: number | null;
  scale: string;
}

export interface RiasecRank {
  dimension: string;
  name: string;
  mean: number | null;
  index: number | null;
  answered: number;
  expected: number;
  measured: boolean;
}

export interface RiasecScores {
  R: number | null;
  I: number | null;
  A: number | null;
  S: number | null;
  E: number | null;
  C: number | null;
  holland_code: string | null;
  scale: string;
  tie_break_applied: boolean;
  ranking: RiasecRank[];
}

export interface GritScores {
  persistence: number | null;
  focus: number | null;
  conscientiousness: number | null;
  curiosity: number | null;
  stress_resilience: number | null;
  deliberate_practice: number | null;
  response_to_failure: number | null;
  composite: number | null;
  normalized_index: number | null;
  scale: string;
}

export interface StreamContribution {
  component: string;
  weight: number;
  value: number | null;
  contribution: number | null;
}

export interface StreamResult {
  id: string;
  name: string;
  score: number | null;
  band: string | null;
  rank: number;
  contributions: StreamContribution[];
  career_clusters: string[];
  curriculum_boards: Record<string, unknown>;
}

export interface Recommendation {
  stream_id: string;
  stream_name: string;
  fit_band: string | null;
  fit_score: number | null;
}

export interface ParentContext {
  expected_stream: string | null;
  outcome_priority: string | null;
  perceptions: Record<string, number> | null;
  data_status: string;
}

export interface FrictionFactor {
  area: string;
  detail: string;
}

/** Congruence block — null fields are "not available", never fabricated.
 *  Accepts the two documented shapes (canonical result & parent dashboard). */
export interface Congruence {
  has_parent_data: boolean;
  congruence_pct?: number | null;
  alignment_status?: string | null;
  score?: number | null;
  band?: string | null;
  stream_match_score?: number | null;
  perception_gap_score?: number | null;
  friction_factors?: FrictionFactor[];
  discussion_areas?: string[];
  friction?: {
    friction_factors?: FrictionFactor[];
    discussion_areas?: string[];
  };
  student_top_stream?: string | null;
  parent_expected_stream_id?: string | null;
  parent_priority?: string | null;
  components_used?: { stream_match: boolean; perception_gap: boolean };
  message?: string;
}

export interface CanonicalResult {
  schema: string;
  assessment: {
    id: number;
    version_code: string;
    version_name?: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    scoring_config?: string;
  };
  student: {
    id: number;
    first_name: string;
    grade: number | null;
    board: string | null;
    student_code?: string | null;
  };
  completeness: Record<string, CompletenessItem>;
  aptitude: AptitudeScores;
  riasec: RiasecScores;
  grit: GritScores;
  streams: StreamResult[];
  recommendations: Recommendation[];
  parent: ParentContext | null;
  congruence: Congruence | null;
  limitations: string[];
}

/* ---------- candidate results endpoints ---------- */

export interface ResultsPayload {
  assessment_id: number;
  result: CanonicalResult;
}

export interface StreamsPayload {
  assessment_id: number;
  streams: StreamResult[];
}

export interface CongruencePayload {
  assessment_id: number;
  has_parent_data: boolean;
  message?: string;
  [k: string]: unknown;
}

/* ---------- reports ---------- */

export type ReportType = "candidate" | "parent" | "counselor";

export interface ReportPayload {
  report: {
    id: number;
    assessment_id: number;
    report_type: ReportType;
    title: string;
    status: string;
    model: string;
    generated_at: string;
    structured_input_hash: string;
    structured_data: CanonicalResult | null;
    narrative_html: string;
  };
}

export interface ReportVersionRow {
  id: number;
  report_id: number;
  report_type: ReportType;
  model: string;
  prompt_version?: string | null;
  input_hash?: string | null;
  created_at?: string;
  generated_at?: string;
  [k: string]: unknown;
}

/* ---------- parent ---------- */

export interface ParentChildRow {
  student_id: number;
  full_name: string;
  grade: number | null;
  school_name: string | null;
  board: string | null;
  student_code: string;
  is_demo: number | boolean;
  mapping_id: number;
  link_status: "linked" | "pending_student_approval" | string;
  requested_by: string;
  linked_at: string | null;
  completed_at?: string | null;
  latest_assessment_id: number | null;
  assessment_status: string | null;
}

export interface ParentChildDashboard {
  student: { id: number; first_name: string; grade: number | null; board: string | null; is_demo?: boolean };
  assessment: { id: number; status: string; version_code: string; completed_at: string | null } | null;
  top_streams: Array<Pick<StreamResult, "id" | "name" | "score" | "band" | "rank">>;
  congruence: Congruence | null;
  my_expectations: { submitted: boolean; expected_stream?: string | null; outcome_priority?: string | null };
  my_perceptions: {
    observed_analytical?: number | null;
    observed_creative?: number | null;
    observed_study_habits?: number | null;
    observed_stress_resilience?: number | null;
  } | null;
  aptitude?: AptitudeScores | null;
  grit?: GritScores | null;
  riasec?: RiasecScores | null;
}

/* ---------- admin ---------- */

export interface AdminDashboard {
  summary: {
    candidates: number;
    parents: number;
    assessments: number;
    completed_assessments: number;
    reports_generated: number;
    completion_rate: number;
  };
  stream_distribution: Array<{ stream_name: string; count: number }>;
  riasec_distribution: Array<{ holland_code: string; count: number }>;
  alignment_distribution: Array<{ band: string; count: number }>;
  average_aptitude: AptitudeScores | null;
  average_grit: GritScores | null;
  question_analytics: Array<{
    id: number;
    module: string;
    dimension: string;
    difficulty: string | null;
    category: string;
    attempts: number;
    correct: number;
  }>;
  assessment_versions: Array<{
    id: number;
    version_code: string;
    name?: string;
    is_active?: number | boolean;
    question_count?: number;
    [k: string]: unknown;
  }>;
}

export interface AdminCandidateRow {
  student_id?: number;
  user_id?: number;
  full_name: string;
  email?: string | null;
  grade?: number | null;
  school_name?: string | null;
  board?: string | null;
  student_code?: string;
  latest_assessment_id?: number | null;
  assessment_status?: string | null;
  completed_at?: string | null;
  overall_index?: number | null;
  holland_code?: string | null;
  top_stream?: string | null;
  is_demo?: number | boolean;
  [k: string]: unknown;
}

export interface AdminQuestionRow {
  id: number;
  module: string;
  category: string;
  dimension: string;
  difficulty: string | null;
  question_text: string;
  question_type: string;
  is_active: number | boolean;
  version_id?: number;
  option_count?: number;
  [k: string]: unknown;
}

export interface StreamRuleRow {
  stream_id: string;
  stream_name: string;
  weights: Record<string, number>;
  weight_config_json?: string;
  version_id?: number;
  version_code?: string;
  is_active?: number | boolean;
  updated_at?: string;
  [k: string]: unknown;
}

export interface PromptRow {
  id: number;
  key?: string;
  prompt_type?: string;
  name?: string;
  version?: number;
  version_code?: string;
  is_active?: number | boolean;
  template?: string;
  system_prompt?: string;
  user_template?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface AuditRow {
  id: number;
  user_id: number | null;
  actor_email?: string | null;
  email?: string | null;
  role?: string | null;
  action: string;
  resource_type: string;
  resource_id: string | number | null;
  details_json?: string | null;
  ip_address?: string | null;
  detail?: string | null;
  created_at: string;
  [k: string]: unknown;
}
