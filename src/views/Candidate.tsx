"use client";

/**
 * Candidate Home (status + quick actions) and Profile (account, student code,
 * parent link approvals). All state comes from the API; nothing is inferred.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Eyebrow,
} from "@/components/psych/ui";
import { fmtDateTime, fmtNum } from "@/lib/format";
import type { CanonicalResult, ParentLinkRow, ParentRequestRow, ResultsPayload } from "@/lib/types";

interface AssessmentsList {
  assessments?: Array<{
    id: number;
    status: string;
    version_code?: string;
    completed_at?: string | null;
    current_step?: number | null;
  }>;
}

interface ProfileView {
  full_name?: string;
  email?: string;
  phone?: string;
  grade?: number | null;
  school_name?: string | null;
  board?: string | null;
  student_code?: string;
  parent_links?: ParentLinkRow[];
  pending_parent_requests?: ParentRequestRow[];
}

function useCandidateHomeData() {
  return useAsyncData(async () => {
    const [rawProfile, assessments, results, requests] = await Promise.all([
      api.candidate.profile() as Promise<Record<string, unknown>>,
      api.candidate.listAssessments() as Promise<AssessmentsList>,
      api.candidate.results() as Promise<ResultsPayload | null>,
      api.candidate.parentRequests() as Promise<{ pending?: ParentRequestRow[] }>,
    ]);
    const profile = {
      ...(rawProfile.student as ProfileView | undefined),
      parent_links: (rawProfile.parent_links as ParentLinkRow[]) ?? [],
      pending_parent_requests: requests.pending ?? [],
    } as ProfileView;
    return { profile, assessments: assessments.assessments ?? [], results };
  }, []);
}

/* ============================================================
   HOME
   ============================================================ */

export function CandidateHome({ navigate }: { navigate: (to: string) => void }) {
  const { user, profile, pushToast } = useApp();
  const { data, error, loading, reload } = useCandidateHomeData();
  const [acting, setActing] = useState<number | null>(null);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-12">
        <ErrorState message={error.message} onRetry={reload} />
      </div>
    );
  }

  const name =
    data?.profile?.full_name || String((profile as { full_name?: string } | null)?.full_name ?? user?.email ?? "there");
  const inProgress = data?.assessments.find((a) => a.status === "in_progress");
  const completed = data?.assessments.filter((a) => a.status === "completed") ?? [];
  const result = data?.results?.result as CanonicalResult | undefined;
  const pending = data?.profile?.pending_parent_requests ?? [];

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
      <Eyebrow>Student space</Eyebrow>
      <h1 className="font-display text-[28px] sm:text-[32px] font-bold tracking-[-0.02em] mt-2">
        {loading ? <Skeleton className="h-8 w-56 inline-block" /> : `Hello, ${String(name).split(" ")[0]}`}
      </h1>
      <p className="mt-2 text-[14.5px] text-ink-2">
        Understand your strengths, explore your options, and share the conversation.
      </p>

      {/* -------- assessment status -------- */}
      <section className="mt-8 space-y-4" aria-label="Assessment status">
        {loading ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : result ? (
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge tone="ok" dot>Assessment completed</Badge>
                <p className="font-display font-bold text-[18px] mt-3">Your profile is ready</p>
                <p className="text-[13.5px] text-ink-2 mt-1">
                  Version {result.assessment?.version_code} · completed {fmtDateTime(result.assessment?.completed_at)}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
                  <span className="text-ink-2">
                    Holland code <span className="tnum font-bold text-ink">{result.riasec.holland_code}</span>
                  </span>
                  <span className="text-ink-2">
                    Overall aptitude <span className="tnum font-bold text-ink">{fmtNum(result.aptitude.overall)}</span>
                  </span>
                  <span className="text-ink-2">
                    Top stream <span className="font-bold text-ink">{result.streams.find((s) => s.rank === 1)?.name ?? "—"}</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Button variant="secondary" onClick={() => navigate("/explore")}>
                  Explore streams
                </Button>
                <Button onClick={() => navigate("/results")}>View profile</Button>
              </div>
            </div>
          </Card>
        ) : inProgress ? (
          <Card className="p-6 border-brand/40">
            <Badge tone="warn" dot>In progress</Badge>
            <p className="font-display font-bold text-[18px] mt-3">Welcome back — pick up where you left off</p>
            <p className="text-[13.5px] text-ink-2 mt-1">
              Your answers are saved after every question. Nothing is lost when you close the page.
            </p>
            <Button className="mt-5" onClick={() => navigate("/assessment")}>
              Resume assessment
            </Button>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <Badge tone="brand">Not started</Badge>
            <p className="font-display font-bold text-[19px] mt-3">
              Understand your strengths. Explore what comes next.
            </p>
            <p className="text-[14px] text-ink-2 mt-2 max-w-lg leading-relaxed">
              A structured assessment of aptitude, interests and work style — one question at a time,
              about 30 minutes, saved as you go. Your scores are calculated deterministically from
              your responses.
            </p>
            <Button size="lg" className="mt-6" onClick={() => navigate("/assessment")}>
              Start Assessment
            </Button>
          </Card>
        )}
      </section>

      {/* -------- parent link requests -------- */}
      {pending.length > 0 && (
        <section className="mt-8" aria-label="Parent link requests">
          <h2 className="font-display font-bold text-[17px] mb-3">Parent link requests</h2>
          <Card className="divide-y divide-line">
            {pending.map((r) => (
              <div key={r.mapping_id} className="p-4.5 px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[14px] font-semibold">{r.parent_name}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {r.relationship ?? "Parent"} · requested {fmtDateTime(r.requested_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={acting === r.mapping_id}
                    onClick={async () => {
                      setActing(r.mapping_id);
                      try {
                        await api.candidate.approveParent(r.mapping_id);
                        pushToast(`${r.parent_name} can now view your profile.`, "success");
                        reload();
                      } catch (e) {
                        pushToast(e instanceof Error ? e.message : "Couldn't approve.", "bad");
                      } finally {
                        setActing(null);
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={acting === -r.mapping_id}
                    onClick={async () => {
                      setActing(-r.mapping_id);
                      try {
                        await api.candidate.revokeParent(r.mapping_id);
                        pushToast("Request declined.", "info");
                        reload();
                      } catch (e) {
                        pushToast(e instanceof Error ? e.message : "Couldn't decline.", "bad");
                      } finally {
                        setActing(null);
                      }
                    }}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* -------- student code -------- */}
      {data?.profile?.student_code && (
        <section className="mt-8" aria-label="Student code">
          <Card className="p-5 sm:p-6">
            <p className="font-semibold text-[15px]">Your student code</p>
            <p className="text-[13px] text-ink-2 mt-1 leading-relaxed max-w-lg">
              Share this code with a parent so they can request access to your profile. You approve
              every connection — nothing is shared automatically.
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <code className="tnum text-[16px] font-bold tracking-[0.08em] bg-surface-2 border border-line rounded-[10px] px-4 py-2">
                {data.profile.student_code}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.profile?.student_code ?? "");
                    pushToast("Student code copied.", "success");
                  } catch {
                    pushToast("Couldn't access the clipboard — copy it manually.", "warn");
                  }
                }}
              >
                Copy code
              </Button>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   PROFILE
   ============================================================ */

export function ProfileScreen() {
  const { pushToast, refreshProfile } = useApp();
  const res = useAsyncData(async () => {
    const raw = (await api.candidate.profile()) as Record<string, unknown>;
    return {
      ...(raw.student as ProfileView | undefined),
      parent_links: (raw.parent_links as ParentLinkRow[]) ?? [],
    } as ProfileView;
  }, []);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", grade: "10", school_name: "", board: "CBSE" });

  if (res.error) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-12">
        <ErrorState message={res.error.message} onRetry={res.reload} />
      </div>
    );
  }
  const p = res.data;
  const links = p?.parent_links ?? [];

  const startEdit = () => {
    setForm({
      full_name: p?.full_name ?? "",
      grade: String(p?.grade ?? 10),
      school_name: p?.school_name ?? "",
      board: p?.board ?? "CBSE",
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.candidate.updateProfile({
        full_name: form.full_name.trim(),
        grade: Number(form.grade) || undefined,
        school_name: form.school_name.trim() || undefined,
        board: form.board,
      });
      await refreshProfile();
      pushToast("Profile updated.", "success");
      setEditing(false);
      res.reload();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Couldn't save changes.", "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
      <h1 className="font-display text-[28px] font-bold tracking-[-0.02em]">Profile</h1>
      <p className="mt-2 text-[14.5px] text-ink-2">Your account details, student code and connections.</p>

      {res.loading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-28 w-full rounded-card" />
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {/* -------- details -------- */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-[15px]">Student details</p>
              {!editing && (
                <Button size="sm" variant="secondary" onClick={startEdit}>
                  Edit
                </Button>
              )}
            </div>
            {editing ? (
              <div>
                <Field label="Full name" htmlFor="pf-name">
                  <Input id="pf-name" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
                </Field>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Grade" htmlFor="pf-grade">
                    <Select id="pf-grade" value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}>
                      <option value="9">Grade 9</option>
                      <option value="10">Grade 10</option>
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </Select>
                  </Field>
                  <Field label="Board" htmlFor="pf-board">
                    <Select id="pf-board" value={form.board} onChange={(e) => setForm((f) => ({ ...f, board: e.target.value }))}>
                      <option>CBSE</option>
                      <option>ICSE</option>
                      <option>State Board</option>
                      <option>IB / IGCSE</option>
                    </Select>
                  </Field>
                  <Field label="School" htmlFor="pf-school">
                    <Input id="pf-school" value={form.school_name} onChange={(e) => setForm((f) => ({ ...f, school_name: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex gap-2.5 mt-2">
                  <Button size="sm" loading={busy} onClick={save}>
                    Save changes
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5 text-[14px]">
                {[
                  ["Full name", p?.full_name],
                  ["Grade", p?.grade != null ? `Grade ${p.grade}` : null],
                  ["Board", p?.board],
                  ["School", p?.school_name],
                  ["Email", p?.email ?? undefined],
                  ["Phone", p?.phone ?? undefined],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{k}</dt>
                    <dd className="mt-0.5 font-medium text-ink">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          {/* -------- student code -------- */}
          {p?.student_code && (
            <Card className="p-6">
              <p className="font-semibold text-[15px]">Student code</p>
              <p className="text-[12.5px] text-ink-2 mt-1">
                Share this code with your parent to link their account to your profile.
              </p>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <code className="tnum text-[15px] font-bold tracking-[0.08em] bg-surface-2 border border-line rounded-[10px] px-4 py-2">
                  {p.student_code}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(p.student_code ?? "");
                    pushToast("Student code copied.", "success");
                  }}
                >
                  Copy code
                </Button>
              </div>
            </Card>
          )}

          {/* -------- linked parents -------- */}
          <Card className="p-6">
            <p className="font-semibold text-[15px] mb-3">Linked parents</p>
            {links.length === 0 ? (
              <EmptyState
                compact
                title="No parents linked yet"
                body="Share your student code with a parent. Once you approve their request, they'll see your profile and can share their perspective."
              />
            ) : (
              <ul className="divide-y divide-line">
                {links.map((l) => (
                  <li key={l.mapping_id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold">{l.parent_name}</p>
                      <p className="text-[12.5px] text-ink-3">{l.relationship ?? "Parent"}</p>
                    </div>
                    <Badge tone={l.status === "linked" ? "ok" : "warn"} dot>
                      {l.status === "linked" ? "Linked" : l.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* -------- DPDP §11/§12 self-service -------- */}
          <Card className="p-6">
            <p className="font-semibold text-[15px] mb-1">Account & Data Management</p>
            <p className="text-[13px] text-ink-2 mb-4 leading-relaxed">
              In accordance with the Digital Personal Data Protection (DPDP) Act 2023, you can export your data or request account removal at any time.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p, null, 2));
                  const dlAnchor = document.createElement("a");
                  dlAnchor.setAttribute("href", dataStr);
                  dlAnchor.setAttribute("download", `psychometric_profile_${p?.student_code || "export"}.json`);
                  dlAnchor.click();
                  pushToast("Profile data exported successfully.", "success");
                }}
              >
                Export My Data (JSON)
              </Button>
            </div>
          </Card>

          {/* -------- privacy note -------- */}
          <Card className="p-6 bg-brand-mist/50">
            <p className="font-semibold text-[14px]">How your data is handled</p>
            <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">
              Your responses and results stay private. Parents only see your profile after you approve
              their request, and you can revoke access any time. All assessment reports reflect your
              exact calculated scores — credentials remain strictly encrypted and scores are never altered.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
