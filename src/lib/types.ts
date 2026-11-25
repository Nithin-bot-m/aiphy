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
  isDemo?: boolean;
  emailVerified?: boolean;
  deletionRequestedAt?: string | null;
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
  in_progress_count?: number;
  latest_attempt_status?: string | null;
  version_code?: string;
  m8_status?: string | null;
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
  id?: number;
  student_id?: number;
  user_id?: number;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  grade?: number | null;
  school_name?: string | null;
  board?: string | null;
  student_code?: string;
  email_verified?: number | boolean;
  deletion_requested_at?: string | null;
  latest_assessment_id?: number | null;
  latest_completed_assessment_id?: number | null;
  version_code?: string | null;
  assessment_status?: string | null;
  completed_at?: string | null;
  overall_index?: number | null;
  holland_code?: string | null;
  top_stream?: string | null;
  counsellor_map_status?: string | null;
  v2_riasec_code?: string | null;
  v2_top_clusters?: string[] | null;
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

/* ---------- V2 Psychometrics, Parent M8 & Counsellor Map ---------- */

export interface V2ItemOption {
  k: string;
  text: string;
  [extra: string]: unknown;
}

export interface V2Item {
  id: number;
  external_id: string;
  module: number;
  respondent: "student" | "parent";
  sub: string | null;
  dim: string | null;
  field_name: string | null;
  item_type: "likert5" | "single_select" | "mcq" | "forced_choice" | "scenario" | "sjt" | "best_worst" | "ranking" | "multi_select" | "open_text" | string;
  grade_scope: string | null;
  difficulty: string | null;
  time_sec: number | null;
  scale_name: string | null;
  stem: string;
  options: V2ItemOption[];
}

export interface V2ResponseValue {
  answer_key?: string | null;
  numeric_value?: number | null;
  response_json?: unknown;
  response_text?: string | null;
}

export interface V2AssessmentPayload {
  assessment_id: number;
  version_code: string;
  strategy: string;
  grade: number;
  accommodations: { extended_time_pct: number; simpler_wording: boolean };
  total_questions: number;
  answered: number;
  current_step: number | null;
  questions: V2Item[];
  responses: Record<string, V2ResponseValue>;
}

export interface V2ClusterRow {
  id: string;
  name: string;
  riasec: string[];
  interest: number;
  passion: number;
  aptitude: number;
  final: number;
  confidence_se?: number;
  stream10?: string;
  courses?: string[];
  exams?: Array<string | { name: string; note?: string }>;
  earning_ladder?: string;
  reality?: {
    stream10?: string;
    courses?: string[];
    exams?: Array<string | { name: string; note?: string }>;
    earning_ladder?: string;
    note?: string;
  };
  [k: string]: unknown;
}

export interface V2Result {
  schema: string;
  grade: string;
  norm_status: "provisional" | "final" | string;
  validity: {
    flags: Array<{ code: string; severity?: string; detail?: string }>;
    is_provisional_due_to_validity?: boolean;
    distress_detected?: boolean;
  };
  riasec_code: string;
  riasec: Record<string, number>;
  passion_type: string;
  grit: number;
  grit_mean_5: number;
  aptitude: Record<string, number>;
  creativity_detail?: Record<string, unknown>;
  personality: Record<string, number>;
  thinking_styles: Record<string, number>;
  eq_facets: Record<string, number>;
  eq_self_awareness_flag?: boolean;
  values_rank: string[];
  values_scores: Record<string, number>;
  readiness: {
    test_anxiety_mean: number;
    test_anxiety_idx: number;
    se_academic_idx: number | null;
    decision_style: string | null;
    decision_scores: Record<string, number>;
    career_maturity_mean: number;
    career_awareness_pct: number | null;
    harm_mean: number;
    obs_mean: number;
    pressure_mean: number;
  };
  m1_context: {
    board?: string | null;
    marks_band?: string | null;
    own_dream?: string | null;
    parent_pref?: string | null;
    certainty?: string | null;
    fav_subjects?: string[] | null;
    budget?: string | null;
    relocate?: string | null;
    accommodations?: { extended_time_pct?: number; simpler_wording?: boolean };
  };
  clusters: V2ClusterRow[];
  top5: string[];
  picks: {
    passion: string;
    strength: string;
    balanced: string;
  };
  confidence: string;
  confidence_spread: number;
  hidden_gems: Array<{
    id: string;
    name: string;
    interest: number;
    passion: number;
    aptitude: number;
    careers: string[];
    courses: string[];
    earning_ladder?: { entry: string; five_year: string; ten_year: string } | string;
  }>;
  growth_paths: Array<{
    id: string;
    name: string;
    interest: number;
    passion: number;
    aptitude: number;
    weak_dimensions?: Array<{ dim: string; score: number }>;
    needs_steady_practice?: boolean;
    six_month_plan: string;
  }>;
  streams_10: Array<{
    id: string;
    name: string;
    score: number;
    band: string;
    top_cluster: string | null;
  }>;
  courses_12: Array<{
    cluster_id: string;
    cluster_name: string;
    final_score: number;
    courses: string[];
    careers?: string[];
    exams: string[];
    earning_ladder?: string;
  }>;
  reality_check: {
    budget_fit?: string | null;
    relocation_fit?: string | null;
    preparation_needed_note?: string | null;
    low_awareness_note?: string | null;
    backup_routes?: Array<{ cluster_id: string; name: string; courses: string[] }>;
  };
  limitations: string[];
}

export interface V2ResultEnvelope {
  available?: boolean;
  assessment_id: number;
  completed_at?: string | null;
  version_code?: string;
  parent_consent_sensitive?: boolean;
  result: V2Result;
}

export interface V2ParentM8Payload {
  assessment_id: number;
  parent_slot: "parent_1" | "parent_2" | string;
  status: string;
  total_questions: number;
  answered: number;
  questions: V2Item[];
  responses: Record<string, V2ResponseValue>;
}

export interface V2ParentSummary {
  available: boolean;
  reason?: string;
  grade?: string;
  norm_status?: string;
  riasec_code?: string;
  top_clusters?: Array<{ id: string; name: string; final: number; interest: number; aptitude: number; stream10?: string }>;
  streams_10?: Array<{ id: string; name: string; score: number; band: string; top_cluster: string | null }>;
  courses_12?: Array<{ cluster_id: string; cluster_name: string; final_score: number; courses: string[]; exams: string[]; earning_ladder?: string }>;
  my_m8_status?: string;
  my_m8_pref?: string | null;
  shared_talking_points?: Array<{
    id: string;
    title: string;
    severity: string;
    meaning: string;
    talking_points?: string[];
  }>;
}

export interface CounsellorMapV1 {
  schema: string;
  meta: {
    student_id: string;
    grade: string;
    generated_at: string;
    norm_status: string;
    validity_flags: string[];
    parents_responded: string[];
    demo?: boolean;
  };
  student_summary: {
    riasec_code: string;
    passion_type: string;
    grit: number;
    picks: { passion: string; strength: string; balanced: string };
    top5: string[];
  };
  cluster_map: Array<{
    id: string;
    name: string;
    interest: number;
    passion: number;
    aptitude: number;
    final: number;
    confidence: number;
    parent_observed: number | null;
    parent_support: number | null;
    parent_income_worry: number | null;
    parent_pref: string[];
    student_dream: boolean;
  }>;
  perception_gap: Array<{
    id: string;
    label: string;
    group: string;
    student: number;
    parent: number;
    gap: number;
    flag: "high" | "medium" | "none" | string;
    parent_items?: string[];
  }>;
  evidence_flow: {
    student_nodes: Array<{ id: string; label: string }>;
    cluster_nodes: Array<{ id: string; label: string }>;
    parent_nodes: Array<{ id: string; label: string }>;
    links: Array<{ from: string; to: string; w: number }>;
  };
  insights: Array<{
    id: string;
    pattern: string;
    title: string;
    severity: "high" | "medium" | "positive" | "info" | string;
    cluster?: string | null;
    student_said?: Array<{ summary: string; items?: string[] }>;
    parent_said?: Array<{ summary: string; items?: string[] }>;
    meaning: string;
    suggestions?: string[];
    talking_points?: string[];
    avoid?: string;
  }>;
  red_flags: string[];
  session_plan: Array<{ min: number; step: string; goal: string }>;
  data_gaps: string[];
  counsellor_summary: string;
}

export interface CounsellorMapEnvelope {
  assessment_id: number;
  student: {
    id: number;
    full_name: string;
    grade: number | null;
    school_name: string | null;
    board: string | null;
    student_code: string;
  } | null;
  status: string;
  schema_version: string;
  model: string;
  generated_at: string;
  parent_sessions: Array<{
    parent_slot: string;
    status: string;
    completed_at: string | null;
    student_consent_sensitive: boolean;
  }>;
  scoring: V2Result;
  map: CounsellorMapV1;
}

export interface V2FairnessAudit {
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
}
