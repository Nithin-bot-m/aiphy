/**
 * API client — the ONLY way the frontend talks to the backend.
 *
 * Responsibilities:
 *  - same-origin fetch through the Next.js bridge (/api/* → psychometric backend)
 *  - unwrap the single response envelope ({success,data} | {success,error})
 *  - map transport/HTTP failures to friendly, non-technical messages
 *  - bearer-token session storage (sessionStorage — per tab, survives reload)
 *
 * It contains ZERO psychometric logic: no scoring, no bands, no fallback
 * numbers. Values come from the backend or they are null/absent.
 */
import type {
  ApiEnvelope,
  CounsellorMapEnvelope,
  CounsellorMapV1,
  V2AssessmentPayload,
  V2FairnessAudit,
  V2ParentM8Payload,
  V2ParentSummary,
  V2Result,
  V2ResultEnvelope,
} from "./types";

const TOKEN_KEY = "psa.session.token";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

/** Fired when the backend rejects the session (401) so the app can react. */
export const SESSION_EXPIRED_EVENT = "psa:session-expired";

const FRIENDLY: Record<string, string> = {
  BAD_REQUEST: "Some information wasn't valid. Please check and try again.",
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don't have access to this area.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: "This action isn't available right now.",
  UNPROCESSABLE: "Some required parts are still missing.",
  ASSESSMENT_INCOMPLETE: "A few questions are still unanswered.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
  NOT_IMPLEMENTED: "This feature isn't available yet.",
  SERVICE_UNAVAILABLE:
    "The assessment service is temporarily unavailable. Please try again shortly.",
  NETWORK_ERROR: "You appear to be offline. Check your connection and retry.",
};

function friendly(code: string, message: string): string {
  return message || FRIENDLY[code] || FRIENDLY.INTERNAL;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip attaching the bearer token (public endpoints). */
  public?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.public) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`/api/${path.replace(/^\//, "")}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", FRIENDLY.NETWORK_ERROR, 0);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    /* non-JSON body — handled below */
  }

  if (!res.ok || !envelope || envelope.success !== true) {
    const code = envelope?.error?.code || (res.status === 401 ? "UNAUTHORIZED" : "INTERNAL");
    const message = friendly(code, envelope?.error?.message || "");
    if (res.status === 401 && !opts.public && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(code, message, res.status);
  }

  return envelope.data as T;
}

/* ============================================================
   Endpoint catalog (mirrors backend route table)
   ============================================================ */

export interface LoginPayload {
  token: string;
  user: { id: number; email: string | null; phone: string | null; role: string };
  profile?: Record<string, unknown> | null;
}

export const api = {
  auth: {
    login: (identifier: string, password: string) =>
      request<LoginPayload>("auth/login", { method: "POST", body: { identifier, password }, public: true }),
    register: (body: Record<string, unknown>) =>
      request<LoginPayload>("auth/register", { method: "POST", body, public: true }),
    sendOtp: (phone: string) =>
      request<{ message: string; expires_in_minutes: number }>("auth/send-otp", { method: "POST", body: { phone }, public: true }),
    verifyOtp: (phone: string, otp: string) =>
      request<LoginPayload>("auth/verify-otp", { method: "POST", body: { phone, otp }, public: true }),
    me: () => request<{ user: { id: number; email: string | null; phone: string | null; role: string }; profile: Record<string, unknown> }>("auth/me"),
    logout: () => request<unknown>("auth/logout", { method: "POST" }),
  },

  candidate: {
    profile: () => request<Record<string, unknown>>("candidate/profile"),
    updateProfile: (body: Record<string, unknown>) =>
      request<Record<string, unknown>>("candidate/profile", { method: "PUT", body }),
    code: () => request<{ student_code: string }>("candidate/code"),
    /** Latest completed result; 404 (nothing completed yet) resolves to null. */
    results: async () => {
      try {
        return await request<{ assessment_id: number; result: Record<string, unknown> } | null>("candidate/results");
      } catch (e) {
        if (e instanceof ApiError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    },
    /** GET /assessments — the candidate's own assessment list. */
    listAssessments: () => request<{ assessments: Array<{ id: number; status: string; version_code?: string; completed_at?: string | null; current_step?: number | null }> }>("assessments"),
    parentRequests: () => request<{ requests: unknown[] }>("candidate/parent-requests"),
    approveParent: (mappingId: number) =>
      request<unknown>(`candidate/parent-requests/${mappingId}/approve`, { method: "POST" }),
    revokeParent: (mappingId: number) =>
      request<unknown>(`candidate/parent-requests/${mappingId}/revoke`, { method: "POST" }),
  },

  assessment: {
    /** Resume-or-create. Uses the no-id alias so creation never needs an id. */
    start: () => request<{ assessment: { id: number; status: string; current_step?: number | null }; version: { id: number; version_code: string; name: string } }>("candidate/assessment/start", { method: "POST" }),
    questions: (assessmentId: number) => request<Record<string, unknown>>(`assessments/${assessmentId}`),
    saveResponse: (assessmentId: number, body: Record<string, unknown>) =>
      request<{ success: boolean }>(`assessments/${assessmentId}/responses`, { method: "POST", body }),
    complete: (assessmentId: number) =>
      request<Record<string, unknown>>(`assessments/${assessmentId}/complete`, { method: "POST" }),
    progress: (assessmentId: number) =>
      request<{ answered: number; total: number; percent: number }>(`assessments/${assessmentId}/progress`),
  },

  results: {
    byId: (assessmentId: number) => request<Record<string, unknown>>(`results/${assessmentId}`),
    streams: (assessmentId: number) => request<Record<string, unknown>>(`results/${assessmentId}/streams`),
    congruence: (assessmentId: number) => request<Record<string, unknown>>(`results/${assessmentId}/congruence`),
  },

  reports: {
    get: (assessmentId: number, type: string) => request<Record<string, unknown>>(`reports/${assessmentId}/${type}`),
    regenerate: (assessmentId: number, type: string) =>
      request<Record<string, unknown>>(`reports/${assessmentId}/regenerate/${type}`, { method: "POST" }),
    versions: (assessmentId: number) => request<Record<string, unknown>>(`report-versions/${assessmentId}`),
  },

  parent: {
    children: () => request<{ children: unknown[] }>("parent/children"),
    linkRequest: (student_code: string) =>
      request<unknown>("parent/link-request", { method: "POST", body: { student_code } }),
    submitInventory: (body: Record<string, unknown>) =>
      request<Record<string, unknown>>("parent/inventory/submit", { method: "POST", body }),
    child: (assessmentId: number) =>
      request<Record<string, unknown>>(`parent/child?assessment_id=${assessmentId}`),
  },

  admin: {
    dashboard: () => request<Record<string, unknown>>("admin/dashboard"),
    candidates: () => request<Record<string, unknown>>("admin/candidates"),
    questions: (params?: { module?: string; version_id?: number }) => {
      const q = new URLSearchParams();
      if (params?.module) q.set("module", params.module);
      if (params?.version_id) q.set("version_id", String(params.version_id));
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return request<Record<string, unknown>>(`admin/questions${suffix}`);
    },
    createQuestion: (body: Record<string, unknown>) =>
      request<Record<string, unknown>>("admin/questions", { method: "POST", body }),
    updateQuestion: (id: number, body: Record<string, unknown>) =>
      request<Record<string, unknown>>(`admin/questions/${id}`, { method: "PUT", body }),
    toggleQuestion: (id: number) =>
      request<Record<string, unknown>>(`admin/questions/${id}`, { method: "DELETE" }),
    scoringRules: () => request<Record<string, unknown>>("admin/scoring-rules"),
    updateStreamRule: (streamId: string, body: Record<string, unknown>) =>
      request<Record<string, unknown>>(`admin/scoring-rules/${streamId}`, { method: "PUT", body }),
    scoringConfig: () => request<Record<string, unknown>>("admin/scoring-config"),
    updateScoringConfig: (body: Record<string, unknown>) =>
      request<Record<string, unknown>>("admin/scoring-config", { method: "PUT", body }),
    prompts: () => request<Record<string, unknown>>("admin/prompts"),
    promptDetail: (id: number) => request<Record<string, unknown>>(`admin/prompts/${id}`),
    updatePrompt: (id: number, body: Record<string, unknown>) =>
      request<Record<string, unknown>>(`admin/prompts/${id}`, { method: "PUT", body }),
    auditLogs: (params?: { limit?: number; offset?: number; action?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      if (params?.action) q.set("action", params.action);
      const suffix = q.toString() ? `?${q.toString()}` : "";
      return request<Record<string, unknown>>(`admin/audit-logs${suffix}`);
    },
    toggleVersion: (id: number, isActive?: boolean) =>
      request<{ version: Record<string, unknown> }>(`admin/versions/${id}/toggle`, {
        method: "POST",
        body: isActive === undefined ? {} : { is_active: isActive },
      }),
    export: (type: string) => request<Record<string, unknown>>(`admin/export/${type}`),
    llmUsage: () => request<Record<string, unknown>>("admin/llm/usage"),
    retentionRun: (dryRun: boolean) =>
      request<Record<string, unknown>>("admin/retention/run", { method: "POST", body: { dry_run: dryRun } }),
    userExport: (id: number) => request<Record<string, unknown>>(`admin/users/${id}/export`),
    userErase: (id: number) =>
      request<Record<string, unknown>>(`admin/users/${id}/erase`, { method: "POST", body: {} }),
  },

  v2: {
    status: () => request<{ version_code: string; v2_active: boolean }>("v2/status"),
    start: () =>
      request<{
        assessment_id: number;
        status: string;
        version_code: string;
        current_step?: number | null;
        grade: number;
      }>("v2/assessments/start", { method: "POST" }),
    assessment: (assessmentId: number) =>
      request<V2AssessmentPayload>(`v2/assessments/${assessmentId}`),
    saveResponse: (assessmentId: number, body: Record<string, unknown>) =>
      request<{
        success: boolean;
        blueprint_updated?: boolean;
        grade?: number;
        accommodations?: { extended_time_pct: number; simpler_wording: boolean };
      }>(`v2/assessments/${assessmentId}/responses`, { method: "POST", body }),
    complete: (assessmentId: number) =>
      request<{
        assessment_id: number;
        result: V2Result;
        counsellor_map_ready: boolean;
      }>(`v2/assessments/${assessmentId}/complete`, { method: "POST" }),
    myResults: () =>
      request<{
        available: boolean;
        assessment_id?: number;
        completed_at?: string | null;
        version_code?: string;
        parent_consent_sensitive?: boolean;
        result: V2Result | null;
      }>("v2/results"),
    resultById: (assessmentId: number) =>
      request<V2ResultEnvelope>(`v2/results/${assessmentId}`),
    setParentConsent: (assessmentId: number, allowed: boolean) =>
      request<{ assessment_id: number; parent_consent_sensitive: boolean }>(
        `v2/assessments/${assessmentId}/parent-consent`,
        { method: "POST", body: { parent_consent_sensitive: allowed } }
      ),
    parentM8: (assessmentId: number) =>
      request<V2ParentM8Payload>(`v2/parent/m8/${assessmentId}`),
    saveParentM8Response: (assessmentId: number, body: Record<string, unknown>) =>
      request<{ success: boolean }>(`v2/parent/m8/${assessmentId}/responses`, { method: "POST", body }),
    completeParentM8: (assessmentId: number) =>
      request<{
        assessment_id: number;
        parent_slot: string;
        status: string;
        counsellor_map_updated: boolean;
      }>(`v2/parent/m8/${assessmentId}/complete`, { method: "POST" }),
    parentSummary: (assessmentId: number) =>
      request<V2ParentSummary>(`v2/parent/summary/${assessmentId}`),
    counsellorMap: (assessmentId: number) =>
      request<CounsellorMapEnvelope>(`v2/admin/counsellor-map/${assessmentId}`),
    generateCounsellorMap: (assessmentId: number) =>
      request<{ success: boolean; assessment_id: number; map: CounsellorMapV1 }>(
        `v2/admin/counsellor-map/${assessmentId}/generate`,
        { method: "POST", body: {} }
      ),
    fairnessAudit: () => request<V2FairnessAudit>("v2/admin/fairness-audit"),
  },
};
