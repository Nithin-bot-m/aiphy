"use client";

/**
 * Admin console — deliberately different from the student/parent product:
 * a dense operations layout with a dark navigation rail, tables and filters.
 * Scoring-rule editing validates input locally for UX, but the backend
 * remains the single authority on weights and scores.
 */
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp, useAsyncData } from "@/lib/AppContext";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  Skeleton,
  Textarea,
  Wordmark,
} from "@/components/psych/ui";
import { DistributionBars } from "@/components/psych/dataviz";
import { fmtDateTime, fmtNum, initials, shortHash } from "@/lib/format";
import type {
  AdminCandidateRow,
  AdminDashboard,
  AdminQuestionRow,
  AuditRow,
  PromptRow,
  StreamRuleRow,
} from "@/lib/types";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "candidates", label: "Candidates" },
  { key: "assessments", label: "Assessments" },
  { key: "questions", label: "Questions" },
  { key: "scoring", label: "Scoring" },
  { key: "llm", label: "LLM" },
  { key: "reports", label: "Reports" },
  { key: "audit", label: "Audit" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ---------------- console chrome ---------------- */

function ConsoleShell({
  tab,
  setTab,
  children,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  children: React.ReactNode;
}) {
  const { user, signOut } = useApp();
  return (
    <div className="min-h-screen flex bg-[#0F1716]">
      {/* dark rail */}
      <aside className="hidden lg:flex flex-col w-[228px] shrink-0 bg-inverse border-r border-[#23322F] sticky top-0 h-screen">
        <div className="px-5 h-[64px] flex items-center border-b border-[#23322F]">
          <Wordmark inverse />
        </div>
        <p className="px-5 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6E8783]">
          Operations console
        </p>
        <nav aria-label="Admin sections" className="flex-1 px-3 space-y-0.5">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={on ? "page" : undefined}
                className={`w-full text-left px-3.5 h-10 rounded-[9px] text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
                  on ? "bg-[#223834] text-[#EDEFEA]" : "text-[#93A5A1] hover:bg-[#1A2B28] hover:text-[#EDEFEA]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-[#23322F]">
          <div className="flex items-center gap-3">
            <span className="w-8.5 h-8.5 min-w-[34px] min-h-[34px] rounded-full bg-[#223834] text-[#9DC3BD] font-display font-bold text-[12px] flex items-center justify-center" aria-hidden="true">
              {initials("Platform Admin")}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[#EDEFEA] truncate">Administrator</p>
              <p className="text-[11px] text-[#6E8783] truncate">{user?.email ?? "console"}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-3 w-full h-8.5 min-h-[34px] rounded-[8px] text-[12.5px] font-semibold text-[#93A5A1] hover:bg-[#1A2B28] hover:text-[#EDEFEA] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* content */}
      <div className="flex-1 min-w-0 bg-paper">
        <header className="lg:hidden sticky top-0 z-40 bg-inverse border-b border-[#23322F]">
          <div className="h-14 px-4 flex items-center justify-between">
            <Wordmark inverse />
            <button onClick={signOut} className="text-[12.5px] font-semibold text-[#93A5A1] hover:text-white cursor-pointer">
              Sign out
            </button>
          </div>
          <div className="flex gap-1 px-3 pb-2.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Admin sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={t.key === tab}
                onClick={() => setTab(t.key)}
                className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold transition-colors cursor-pointer ${
                  t.key === tab ? "bg-[#EDEFEA] text-[#14211F]" : "bg-[#1A2B28] text-[#93A5A1]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        <main id="main" className="p-5 sm:p-8 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}

function AdminTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <Eyebrow>Console</Eyebrow>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.02em] mt-1.5">{title}</h1>
        {sub && <p className="text-[13.5px] text-ink-2 mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function TableShell({
  head,
  children,
  emptyText = "Nothing here yet.",
}: {
  head: string[];
  children: React.ReactNode;
  emptyText?: string;
}) {
  const rows = Array.isArray(children) ? children.flat() : children;
  const isEmpty = Array.isArray(rows) && rows.length === 0;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[640px]">
          <thead>
            <tr className="bg-paper text-left">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-bold text-[11px] uppercase tracking-[0.1em] text-ink-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{isEmpty ? null : children}</tbody>
        </table>
      </div>
      {isEmpty && <div className="px-5 py-8"><p className="text-[13.5px] text-ink-3 text-center">{emptyText}</p></div>}
    </Card>
  );
}

/* ============================================================ */

export default function Admin() {
  const { pushToast } = useApp();
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <ConsoleShell tab={tab} setTab={setTab}>
      {tab === "dashboard" && <DashboardTab go={setTab} />}
      {tab === "candidates" && <CandidatesTab />}
      {tab === "assessments" && <AssessmentsTab />}
      {tab === "questions" && <QuestionsTab onError={(m) => pushToast(m, "bad")} onOk={(m) => pushToast(m, "success")} />}
      {tab === "scoring" && <ScoringTab onError={(m) => pushToast(m, "bad")} onOk={(m) => pushToast(m, "success")} />}
      {tab === "llm" && <LlmTab onOk={(m) => pushToast(m, "success")} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "audit" && <AuditTab />}
    </ConsoleShell>
  );
}

/* ---------------- dashboard ---------------- */

function DashboardTab({ go }: { go: (t: TabKey) => void }) {
  const res = useAsyncData(async () => (await api.admin.dashboard()) as unknown as AdminDashboard, []);
  if (res.loading) {
    return (
      <div>
        <AdminTitle title="Overview" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-5">
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
      </div>
    );
  }
  if (res.error || !res.data) {
    return <ErrorState message={res.error?.message ?? "Couldn't load the dashboard."} onRetry={res.reload} />;
  }
  const d = res.data;
  const s = d.summary;
  return (
    <div>
      <AdminTitle
        title="Overview"
        sub="Platform activity at a glance. All figures come live from the assessment store."
        action={
          <Button size="sm" variant="secondary" onClick={() => go("audit")}>
            Open audit trail
          </Button>
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Candidates", value: s.candidates, sub: `${s.parents} parent accounts` },
          { label: "Completed assessments", value: s.completed_assessments, sub: `${s.assessments} total` },
          { label: "Completion rate", value: `${s.completion_rate}%`, sub: "of started assessments" },
          { label: "Reports generated", value: s.reports_generated, sub: "all types, versioned" },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-3">{k.label}</p>
            <p className="tnum mt-2 font-display text-[30px] font-bold leading-none">{k.value}</p>
            <p className="mt-1.5 text-[12px] text-ink-3">{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-5">
        <DistributionBars
          title="Stream distribution (top fit per completed candidate)"
          rows={(d.stream_distribution || []).map((r) => ({ label: r.stream_name, count: r.count }))}
        />
        <DistributionBars
          title="Holland codes"
          rows={(d.riasec_distribution || []).map((r) => ({ label: r.holland_code, count: r.count }))}
        />
        <DistributionBars
          title="Alignment bands"
          rows={(d.alignment_distribution || []).map((r) => ({ label: (r as { alignment_status?: string; band?: string; count: number }).alignment_status ?? (r as { band?: string }).band ?? "—", count: r.count }))}
          emptyText="No parent-submitted alignments yet."
        />
        <Card className="p-5">
          <p className="font-semibold text-[14px] mb-4">Average aptitude profile</p>
          {d.average_aptitude ? (
            <div className="space-y-3">
              {Object.entries(d.average_aptitude)
                .filter(([k]) => k !== "scale")
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-[12.5px] text-ink-2 w-24 capitalize">{k === "overall" ? "Overall" : k}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-brand/80 bar-fill" style={{ width: `${Number(v) || 0}%` }} />
                    </div>
                    <span className="tnum text-[12.5px] font-bold w-8 text-right">{fmtNum(v as number)}</span>
                  </div>
                ))}
              <p className="text-[11.5px] text-ink-3 pt-1">
                Work-style composite: <span className="tnum font-bold text-ink">{fmtNum(d.average_grit?.normalized_index)}</span> / 100
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-ink-3 py-4">No completed assessments yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- candidates ---------------- */

function CandidatesTab() {
  const [q, setQ] = useState("");
  const res = useAsyncData(async () => (await api.admin.candidates()) as unknown as { candidates?: AdminCandidateRow[] }, []);
  const rows = (res.data?.candidates ?? []) as AdminCandidateRow[];
  const filtered = rows.filter((r) =>
    [r.full_name, r.student_code, r.email].some((v) => (v || "").toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div>
      <AdminTitle
        title="Candidates"
        sub="Roster with each candidate's latest assessment outcome."
        action={
          <Input
            aria-label="Search candidates"
            placeholder="Search name or code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56"
          />
        }
      />
      {res.loading ? (
        <Skeleton className="h-64 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : (
        <TableShell head={["Candidate", "Code", "Grade", "Status", "Overall", "Holland", "Top stream"]} emptyText="No candidates registered yet.">
          {filtered.map((r, i) => (
            <tr key={r.student_id ?? r.user_id ?? i} className="bg-surface hover:bg-paper/60">
              <td className="px-4 py-3 font-semibold">
                {r.full_name}
                {r.is_demo ? <Badge tone="neutral" className="ml-2">Demo</Badge> : null}
              </td>
              <td className="px-4 py-3 tnum text-ink-2">{r.student_code ?? "—"}</td>
              <td className="px-4 py-3 tnum">{r.grade ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={r.assessment_status === "completed" ? "ok" : r.assessment_status === "in_progress" ? "warn" : "neutral"}>
                  {r.assessment_status?.replace(/_/g, " ") ?? "not started"}
                </Badge>
              </td>
              <td className="px-4 py-3 tnum font-bold">{fmtNum(r.overall_index)}</td>
              <td className="px-4 py-3 tnum font-semibold">{r.holland_code ?? "—"}</td>
              <td className="px-4 py-3 text-ink-2 truncate max-w-[180px]">{r.top_stream ?? "—"}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}

/* ---------------- assessments / versions ---------------- */

function AssessmentsTab() {
  const res = useAsyncData(async () => (await api.admin.dashboard()) as unknown as AdminDashboard, []);
  return (
    <div>
      <AdminTitle
        title="Assessment versions"
        sub="Question banks are versioned — completed assessments stay reproducible against the version they used."
      />
      {res.loading ? (
        <Skeleton className="h-48 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : (
        <TableShell head={["Version", "Name", "Status", "Questions"]} emptyText="No versions configured.">
          {(res.data?.assessment_versions ?? []).map((v, i) => (
            <tr key={v.id ?? i} className="bg-surface">
              <td className="px-4 py-3 tnum font-bold">{v.version_code}</td>
              <td className="px-4 py-3 text-ink-2">{v.name ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={v.is_active ? "ok" : "neutral"} dot>{v.is_active ? "Active" : "Archived"}</Badge>
              </td>
              <td className="px-4 py-3 tnum">{v.question_count ?? "—"}</td>
            </tr>
          ))}
        </TableShell>
      )}
      <Card className="mt-5 p-5 bg-brand-mist/50">
        <p className="text-[13px] text-ink-2 leading-relaxed">
          <span className="font-semibold text-ink">Versioning policy:</span> editing a question used by
          a completed assessment is blocked — create a new question or a new version instead. Old
          results must remain reproducible byte-for-byte.
        </p>
      </Card>
    </div>
  );
}

/* ---------------- questions ---------------- */

function QuestionsTab({ onError, onOk }: { onError: (m: string) => void; onOk: (m: string) => void }) {
  const [module, setModule] = useState("");
  const res = useAsyncData(async () => {
    const data = (await api.admin.questions(module ? { module } : undefined)) as unknown as { questions?: AdminQuestionRow[] };
    return data.questions ?? [];
  }, [module]);
  const [addOpen, setAddOpen] = useState(false);
  const [editText, setEditText] = useState<{ id: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (id: number) => {
    try {
      await api.admin.toggleQuestion(id);
      onOk("Question visibility updated.");
      res.reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't update the question.");
    }
  };

  const saveText = async () => {
    if (!editText) return;
    setBusy(true);
    try {
      await api.admin.updateQuestion(editText.id, { question_text: editText.text });
      onOk("Question text updated.");
      setEditText(null);
      res.reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Update rejected — the question may be locked by completed assessments.");
    } finally {
      setBusy(false);
    }
  };

  const rows = res.data ?? [];

  return (
    <div>
      <AdminTitle
        title="Question bank"
        sub="Every item belongs to a version. Items used by completed assessments are locked."
        action={
          <div className="flex gap-2.5">
            <Select aria-label="Filter by module" value={module} onChange={(e) => setModule(e.target.value)} className="w-40">
              <option value="">All modules</option>
              <option value="aptitude">Aptitude</option>
              <option value="riasec">Interests</option>
              <option value="grit">Work style</option>
            </Select>
            <Button onClick={() => setAddOpen(true)}>Add question</Button>
          </div>
        }
      />
      {res.loading ? (
        <Skeleton className="h-72 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No questions match this filter" body="Try another module, or add a new question to the active version." action={<Button onClick={() => setAddOpen(true)}>Add question</Button>} />
      ) : (
        <TableShell head={["ID", "Module", "Dimension", "Difficulty", "Question", "Status", "Actions"]}>
          {rows.map((r) => (
            <tr key={r.id} className="bg-surface hover:bg-paper/60">
              <td className="px-4 py-3 tnum text-ink-3">{r.id}</td>
              <td className="px-4 py-3 font-semibold capitalize">{r.module}</td>
              <td className="px-4 py-3 text-ink-2">{r.dimension}</td>
              <td className="px-4 py-3 text-ink-2">{r.difficulty ?? "—"}</td>
              <td className="px-4 py-3 max-w-[320px]"><span className="line-clamp-2 text-ink-2">{r.question_text}</span></td>
              <td className="px-4 py-3">
                <Badge tone={r.is_active ? "ok" : "neutral"} dot>{r.is_active ? "Active" : "Hidden"}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setEditText({ id: r.id, text: r.question_text })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(r.id)}>
                    {r.is_active ? "Hide" : "Show"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      {/* edit text modal */}
      <Modal
        open={editText !== null}
        onClose={() => setEditText(null)}
        title="Edit question text"
        footer={
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setEditText(null)}>Cancel</Button>
            <Button loading={busy} onClick={saveText}>Save</Button>
          </div>
        }
      >
        {editText && (
          <Field label="Question text" htmlFor="edit-qt">
            <Textarea id="edit-qt" value={editText.text} onChange={(e) => setEditText({ ...editText, text: e.target.value })} />
          </Field>
        )}
        <p className="text-[12px] text-ink-3">If this question has been answered in a completed assessment, the backend will reject the edit — create a new question instead to keep old results reproducible.</p>
      </Modal>

      <AddQuestionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          onOk("Question added to the active version.");
          res.reload();
        }}
        onError={onError}
      />
    </div>
  );
}

function AddQuestionModal({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    module: "aptitude",
    dimension: "numerical",
    category: "Numerical Reasoning",
    difficulty: "medium",
    question_text: "",
    o1: "", o2: "", o3: "", o4: "",
    correct: "1",
  });
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const texts = [f.o1, f.o2, f.o3, f.o4];
    if (!f.question_text.trim()) return setErr("Question text is required.");
    if (texts.some((t) => !t.trim())) return setErr("All four options need text.");
    const options = texts.map((t, i) => ({
      option_key: String.fromCharCode(65 + i),
      option_text: t,
      score_value: f.module === "aptitude" ? (String(i + 1) === f.correct ? 1 : 0) : i + 1,
    }));
    const body = {
      module: f.module,
      dimension: f.dimension,
      category: f.category || f.dimension,
      difficulty: f.module === "aptitude" ? f.difficulty : null,
      question_text: f.question_text,
      question_type: f.module === "aptitude" ? "single_choice" : "likert_5",
      options: f.module === "aptitude" ? options : Array.from({ length: 5 }, (_, i) => ({ option_key: String(i + 1), option_text: ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"][i], score_value: i + 1 })),
    };
    setBusy(true);
    try {
      await api.admin.createQuestion(body);
      onDone();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't add the question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add question (active version)"
      wide
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={submit}>Add question</Button>
        </div>
      }
    >
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Module" htmlFor="nq-module">
          <Select id="nq-module" value={f.module} onChange={(e) => setF((x) => ({ ...x, module: e.target.value }))}>
            <option value="aptitude">Aptitude (single choice)</option>
            <option value="riasec">Interests (1–5 scale)</option>
            <option value="grit">Work style (1–5 scale)</option>
          </Select>
        </Field>
        <Field label="Dimension" htmlFor="nq-dim">
          <Input id="nq-dim" value={f.dimension} onChange={(e) => setF((x) => ({ ...x, dimension: e.target.value }))} />
        </Field>
        {f.module === "aptitude" && (
          <>
            <Field label="Difficulty" htmlFor="nq-diff">
              <Select id="nq-diff" value={f.difficulty} onChange={(e) => setF((x) => ({ ...x, difficulty: e.target.value }))}>
                <option>easy</option>
                <option>medium</option>
                <option>hard</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="nq-cat">
              <Input id="nq-cat" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))} />
            </Field>
          </>
        )}
      </div>
      <Field label="Question text" htmlFor="nq-text">
        <Textarea id="nq-text" value={f.question_text} onChange={(e) => setF((x) => ({ ...x, question_text: e.target.value }))} />
      </Field>
      {f.module === "aptitude" ? (
        <div className="space-y-2.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-3">Options · mark the correct one</p>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-2.5">
              <input
                type="radio"
                name="correct-option"
                aria-label={`Option ${n} is correct`}
                checked={f.correct === String(n)}
                onChange={() => setF((x) => ({ ...x, correct: String(n) }))}
                className="w-4 h-4 accent-[#0E7268] cursor-pointer"
              />
              <Input
                aria-label={`Option ${n} text`}
                placeholder={`Option ${String.fromCharCode(64 + n)}`}
                value={f[`o${n}` as "o1"] ?? ""}
                onChange={(e) => setF((x) => ({ ...x, [`o${n}`]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-3 leading-relaxed">
          Scale items automatically carry the standard five options (Strongly Disagree → Strongly
          Agree, scored 1–5) — the same items used across the battery.
        </p>
      )}
      {err && <p role="alert" className="mt-3 text-[13px] font-medium text-bad">{err}</p>}
    </Modal>
  );
}

/* ---------------- scoring rules ---------------- */

function ScoringTab({ onError, onOk }: { onError: (m: string) => void; onOk: (m: string) => void }) {
  const res = useAsyncData(async () => (await api.admin.scoringRules()) as unknown as { rules?: StreamRuleRow[] }, []);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // The backend ships weights inside weight_config_json (a JSON string).
  // Parse defensively — every displayed weight remains the stored value.
  const parseWeights = (r: StreamRuleRow): Record<string, number> => {
    if (r.weights && Object.keys(r.weights).length > 0) return r.weights;
    if (r.weight_config_json) {
      try {
        const cfg = JSON.parse(r.weight_config_json) as { weights?: Record<string, number> };
        if (cfg.weights) return cfg.weights;
      } catch {
        /* fall through */
      }
    }
    return {};
  };

  const rules: StreamRuleRow[] = (res.data?.rules ?? []).map((r) => ({ ...r, weights: parseWeights(r) }));

  const draftFor = (r: StreamRuleRow): Record<string, string> => {
    if (drafts[r.stream_id]) return drafts[r.stream_id];
    return Object.fromEntries(Object.entries(r.weights || {}).map(([k, v]) => [k, String(v)]));
  };

  const sumOf = (d: Record<string, string>) =>
    Object.values(d).reduce((a, v) => a + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);

  const save = async (r: StreamRuleRow) => {
    const draft = draftFor(r);
    setBusyId(r.stream_id);
    try {
      await api.admin.updateStreamRule(r.stream_id, { weights: Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) });
      onOk(`${r.stream_name} weights saved.`);
      res.reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save rejected by the backend.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <AdminTitle
        title="Stream scoring rules"
        sub="Versioned weight profiles per stream. The fit index is the weighted sum of dimension values — weights must sum to 1.00."
      />
      {res.loading ? (
        <Skeleton className="h-72 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : rules.length === 0 ? (
        <EmptyState title="No scoring rules found" body="The backend exposes no weight profiles — check the scoring configuration." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rules.map((r) => {
            const draft = draftFor(r);
            const sum = sumOf(draft);
            const dirty = JSON.stringify(draft) !== JSON.stringify(Object.fromEntries(Object.entries(r.weights || {}).map(([k, v]) => [k, String(v)])));
            return (
              <Card key={r.stream_id} className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="font-display font-bold text-[15px]">{r.stream_name}</p>
                    <p className="text-[11.5px] text-ink-3 tnum">{r.stream_id}{r.version_code ? ` · ${r.version_code}` : ""}</p>
                  </div>
                  <Badge tone={Math.abs(sum - 1) < 0.005 ? "ok" : "bad"} dot>
                    Σ {sum.toFixed(2)}
                  </Badge>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(draft).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3">
                      <label htmlFor={`w-${r.stream_id}-${k}`} className="text-[12.5px] text-ink-2 w-36 truncate">
                        {k.replace(/^riasec_/, "interest ").replace(/_/g, " ")}
                      </label>
                      <input
                        id={`w-${r.stream_id}-${k}`}
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={v}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [r.stream_id]: { ...draftFor(r), [k]: e.target.value },
                          }))
                        }
                        className="w-24 h-9 px-2.5 rounded-[8px] border border-line-2 bg-surface tnum text-[13px] focus:border-brand focus:outline-none"
                      />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        aria-label={`${k} weight for ${r.stream_name}`}
                        value={Number.isFinite(Number(v)) ? Number(v) : 0}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.stream_id]: { ...draftFor(r), [k]: e.target.value } }))
                        }
                        className="flex-1 accent-[#0E7268] cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-ink-3">The backend re-validates the sum on save.</p>
                  <Button size="sm" disabled={!dirty} loading={busyId === r.stream_id} onClick={() => save(r)}>
                    Save weights
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- LLM usage & quota ---------------- */

type LlmUsage = {
  today?: { requests?: number; successes?: number; avg_latency_ms?: number; daily_request_limit?: number | null };
  month?: { requests?: number; tokens_input?: number; tokens_output?: number; estimated_cost_usd?: number; monthly_token_budget?: number | null };
  by_day?: { day: string; requests: number; successes: number }[];
  provider?: string;
  model?: string;
};

function UsageAndQuota() {
  const res = useAsyncData(async () => (await api.admin.llmUsage()) as unknown as LlmUsage, []);
  const u = res.data;
  const fmt = (n?: number | null) => (n === null || n === undefined ? "—" : String(n));
  return (
    <Card className="mb-5 p-5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h3 className="text-[15px] font-bold text-ink">Usage &amp; quota</h3>
        <p className="text-[11.5px] text-ink-2">
          provider <strong>{u?.provider ?? "—"}</strong> · model <strong>{u?.model ?? "—"}</strong>
        </p>
      </div>
      {res.loading ? (
        <Skeleton className="h-24 rounded-card" />
      ) : res.error ? (
        <p className="text-[13px] text-ink-2">Usage data unavailable ({res.error.message}).</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">Today</p>
            <p className="text-[19px] font-bold tabular-nums text-ink">{fmt(u?.today?.requests)} <span className="text-[11px] font-medium text-ink-2">requests</span></p>
            <p className="text-[11px] text-ink-2 tabular-nums">
              {fmt(u?.today?.successes)} succeeded · limit {u?.today?.daily_request_limit ?? "∞"}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">This month</p>
            <p className="text-[19px] font-bold tabular-nums text-ink">
              {fmt((u?.month?.tokens_input ?? 0) + (u?.month?.tokens_output ?? 0))} <span className="text-[11px] font-medium text-ink-2">tokens</span>
            </p>
            <p className="text-[11px] text-ink-2 tabular-nums">budget {u?.month?.monthly_token_budget ?? "∞"}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">Est. cost (month)</p>
            <p className="text-[19px] font-bold tabular-nums text-ink">${fmt(u?.month?.estimated_cost_usd)}</p>
            <p className="text-[11px] text-ink-2">estimated from token usage</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-2">Avg latency (today)</p>
            <p className="text-[19px] font-bold tabular-nums text-ink">{fmt(u?.today?.avg_latency_ms)} <span className="text-[11px] font-medium text-ink-2">ms</span></p>
            <p className="text-[11px] text-ink-2">quota skips fall back offline</p>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Data governance (retention, DPDP) ---------------- */

function GovernancePanel({ onOk }: { onOk: (m: string) => void }) {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const runRetention = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = (await api.admin.retentionRun(dryRun)) as { deleted?: Record<string, number>; kept?: string[] };
      const deleted = Object.entries(r.deleted ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "nothing to delete";
      onOk(dryRun ? `Dry run — would delete → ${deleted}` : `Retention applied → ${deleted}`);
    } catch (e) {
      onOk(e instanceof Error ? e.message : "Retention run failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportUser = async () => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return onOk("Enter a numeric user id first.");
    setBusy(true);
    try {
      const data = (await api.admin.userExport(id)) as Record<string, unknown>;
      setLastExport(JSON.stringify(data, null, 2));
      onOk(`Subject export for user ${id} generated below (DPDP §11).`);
    } catch (e) {
      onOk(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const eraseUser = async () => {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return onOk("Enter a numeric user id first.");
    if (!window.confirm(`Erase identity data for user ${id}? This anonymizes the account (irreversible) while preserving assessment records.`)) return;
    setBusy(true);
    try {
      const r = (await api.admin.userErase(id)) as { anonymized_email?: string };
      onOk(`User ${id} anonymized → ${r.anonymized_email ?? "done"} (DPDP §12).`);
      setLastExport(null);
    } catch (e) {
      onOk(e instanceof Error ? e.message : "Erasure rejected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-5 p-5">
      <h3 className="text-[15px] font-bold text-ink">Data governance</h3>
      <p className="text-[12.5px] text-ink-2 mt-1 mb-4 max-w-2xl leading-relaxed">
        Retention enforces the DPDP §8(7) schedule (LLM audit 180d · audit logs 365d · outbox 90d —
        scores and reports are never auto-deleted). Subject access and erasure serve DPDP §11/§12;
        erasure anonymizes identity while preserving psychometric records and is audited.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => runRetention(true)}>Dry-run retention</Button>
        <Button disabled={busy} onClick={() => runRetention(false)}>Run retention</Button>
        <span className="mx-2 hidden sm:block w-px h-6 bg-border" />
        <input
          aria-label="User id"
          placeholder="User id"
          value={userId}
          onChange={(e) => setUserId(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-28 px-3 py-2 rounded-input border border-border bg-surface text-[13px] text-ink"
        />
        <Button variant="secondary" disabled={busy} onClick={exportUser}>Export data</Button>
        <Button variant="secondary" disabled={busy} onClick={eraseUser}>Erase identity</Button>
      </div>
      {lastExport && (
        <pre className="mt-4 max-h-64 overflow-auto rounded-card bg-inverse text-[#D6DEDA] p-4 text-[11px] leading-relaxed tabular-nums">
          {lastExport}
        </pre>
      )}
    </Card>
  );
}

/* ---------------- LLM & prompts ---------------- */

function LlmTab({ onOk }: { onOk: (m: string) => void }) {
  const res = useAsyncData(async () => (await api.admin.prompts()) as unknown as { prompts?: PromptRow[] }, []);
  const [detail, setDetail] = useState<PromptRow | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const prompts: PromptRow[] = res.data?.prompts ?? (Array.isArray(res.data) ? (res.data as unknown as PromptRow[]) : []);

  const openDetail = async (p: PromptRow) => {
    setDetail(p);
    setSystemPrompt("");
    setUserTemplate(p.user_template ?? p.template ?? "");
    try {
      const d = (await api.admin.promptDetail(p.id)) as unknown as { prompt?: PromptRow };
      if (d.prompt) {
        setSystemPrompt(d.prompt.system_prompt ?? "");
        setUserTemplate(d.prompt.user_template ?? "");
        setDetail(d.prompt);
      }
    } catch {
      /* keep list-level info */
    }
  };

  const savePrompt = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.admin.updatePrompt(detail.id, { user_template: userTemplate });
      onOk("Prompt saved — a new version was created; history is never rewritten.");
      setDetail(null);
      res.reload();
    } catch (e) {
      onOk(e instanceof Error ? e.message : "Prompt update rejected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AdminTitle
        title="Explanation layer"
        sub="Prompts are versioned in the database. The LLM explains results — it can never compute or alter them."
      />
      <Card className="mb-5 p-5 bg-inverse text-[#EDEFEA]">
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8FB5AF]">Boundary</p>
            <p className="text-[13px] mt-1 max-w-xl leading-relaxed text-[#C9D4D1]">
              The LLM receives only the structured result JSON and a versioned system prompt — no
              credentials, no raw responses. Its output is validated and sanitized before storage.
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8FB5AF]">Generation status</p>
            <p className="text-[13px] mt-1 text-[#C9D4D1]">
              Reports record their model on every generation — see the Reports tab.
            </p>
          </div>
        </div>
      </Card>

      <UsageAndQuota />
      <GovernancePanel onOk={onOk} />

      {res.loading ? (
        <Skeleton className="h-56 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : prompts.length === 0 ? (
        <EmptyState title="No prompts configured" body="Prompt versions appear here once seeded." />
      ) : (
        <TableShell head={["Prompt", "Version", "Status", "Updated", ""]}>
          {prompts.map((p, i) => (
            <tr key={p.id ?? i} className="bg-surface hover:bg-paper/60">
              <td className="px-4 py-3 font-semibold">{String(p.prompt_type ?? p.key ?? p.name ?? "prompt").replace(/_/g, " ")}</td>
              <td className="px-4 py-3 tnum">{p.version ?? p.version_code ?? "—"}</td>
              <td className="px-4 py-3">
                <Badge tone={p.is_active ? "ok" : "neutral"} dot>{p.is_active ? "Active" : "Archived"}</Badge>
              </td>
              <td className="px-4 py-3 tnum text-ink-2">{p.updated_at ? fmtDateTime(p.updated_at) : "—"}</td>
              <td className="px-4 py-3">
                <Button size="sm" variant="secondary" onClick={() => openDetail(p)}>
                  View / edit
                </Button>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Prompt · ${(detail.prompt_type ?? detail.key ?? "prompt").replace(/_/g, " ")} · ${detail.version_code ?? ""}` : "Prompt"}
        wide
        footer={
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setDetail(null)}>Cancel</Button>
            <Button loading={busy} onClick={savePrompt}>Save as new version</Button>
          </div>
        }
      >
        {systemPrompt && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-1.5">System prompt (read-only)</p>
            <pre className="max-h-36 overflow-y-auto rounded-[10px] bg-surface-2 border border-line p-3 text-[12px] font-mono whitespace-pre-wrap text-ink-2">{systemPrompt}</pre>
          </div>
        )}
        <p className="text-[12.5px] text-ink-2 mb-3 leading-relaxed">
          Editing creates a <strong>new prompt version</strong> — existing reports keep the version
          they were generated with. Placeholders like <code className="font-mono">&#123;&#123;riasec_code&#125;&#125;</code> are
          filled server-side from the structured result.
        </p>
        <Textarea
          aria-label="Prompt template"
          value={userTemplate}
          onChange={(e) => setUserTemplate(e.target.value)}
          className="font-mono text-[12.5px] min-h-[280px]"
        />
      </Modal>
    </div>
  );
}

/* ---------------- reports ---------------- */

function ReportsTab() {
  const [assessmentId, setAssessmentId] = useState<string>("");
  const res = useAsyncData(async () => (await api.admin.candidates()) as unknown as { candidates?: AdminCandidateRow[] }, []);
  const completed = (res.data?.candidates ?? []).filter((c) => c.latest_assessment_id != null);
  const versions = useAsyncData(async () => {
    if (!assessmentId) return null;
    return (await api.admin.auditLogs({ limit: 1 })) && (await api.reports.versions(Number(assessmentId))) as unknown as { versions?: Array<{ id: number; report_type?: string; model?: string; created_at?: string; generated_at?: string; prompt_version?: string; input_hash?: string }> };
  }, [assessmentId]);
  const list = (versions.data as { versions?: Array<Record<string, unknown>> } | null)?.versions ?? [];

  return (
    <div>
      <AdminTitle title="Report versions" sub="Every regeneration is retained — pick a completed assessment to inspect its history." />
      {res.loading ? (
        <Skeleton className="h-24 rounded-card" />
      ) : (
        <Card className="p-5 mb-5">
          <Field label="Assessment" htmlFor="rep-assessment">
            <Select id="rep-assessment" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
              <option value="">Choose a completed assessment…</option>
              {completed.map((c) => (
                <option key={c.latest_assessment_id} value={String(c.latest_assessment_id)}>
                  {c.full_name} · assessment #{c.latest_assessment_id} · {c.student_code}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      )}
      {!assessmentId ? (
        <EmptyState title="No report versions to show" body="Choose a completed assessment above to see its report version history." />
      ) : versions.loading ? (
        <Skeleton className="h-40 rounded-card" />
      ) : versions.error ? (
        <ErrorState message={versions.error.message} onRetry={versions.reload} />
      ) : list.length === 0 ? (
        <EmptyState title="No reports generated yet" body="This assessment has no report versions — reports appear after generation." />
      ) : (
        <TableShell head={["#", "Type", "Model", "Prompt ver.", "Input hash", "Generated"]}>
          {list.map((v, i) => (
            <tr key={String(v.id ?? i)} className="bg-surface">
              <td className="px-4 py-3 tnum text-ink-3">{String(v.id ?? i + 1)}</td>
              <td className="px-4 py-3 font-semibold capitalize">{String(v.report_type ?? "—")}</td>
              <td className="px-4 py-3 text-ink-2">{String(v.model ?? "—")}</td>
              <td className="px-4 py-3 tnum">{String(v.prompt_version ?? "—")}</td>
              <td className="px-4 py-3 tnum text-ink-3">{shortHash(String(v.input_hash ?? v.structured_input_hash ?? ""))}</td>
              <td className="px-4 py-3 tnum text-ink-2">{fmtDateTime((v.created_at ?? v.generated_at) as string)}</td>
            </tr>
          ))}
        </TableShell>
      )}
    </div>
  );
}

/* ---------------- audit ---------------- */

function AuditTab() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;
  const res = useAsyncData(async () => {
    return (await api.admin.auditLogs({ limit, offset: page * limit, action: action || undefined })) as unknown as {
      logs?: AuditRow[];
      total?: number;
      entries?: AuditRow[];
    };
  }, [action, page]);
  const rows: AuditRow[] = res.data?.logs ?? res.data?.entries ?? [];
  const total = res.data?.total ?? null;
  const pages = total != null ? Math.max(1, Math.ceil(Number(total) / limit)) : null;

  const actorOf = (r: AuditRow): string => {
    if (r.email || r.actor_email) return String(r.email ?? r.actor_email);
    if (r.user_id != null) return `user #${r.user_id}`;
    if (r.resource_type === "USER" && r.resource_id != null) return `user #${r.resource_id}`;
    return "system";
  };
  const detailOf = (r: AuditRow): string => {
    if (r.details_json) {
      try {
        const obj = JSON.parse(r.details_json) as Record<string, unknown>;
        const parts = Object.entries(obj).map(([k, v]) => `${k}: ${String(v)}`);
        const ip = r.ip_address ? ` · ${String(r.ip_address).replace("::ffff:", "")}` : "";
        return parts.join(" · ") + ip;
      } catch {
        return r.details_json;
      }
    }
    return r.detail ?? "—";
  };

  const exportData = async (type: string) => {
    try {
      const data = (await api.admin.export(type)) as unknown as object;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `psychometric-ai-${type}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* export button surfaces errors via state */
    }
  };

  return (
    <div>
      <AdminTitle
        title="Audit trail"
        sub="Append-only record of security-relevant actions. Who did what, to which resource, when."
        action={
          <div className="flex gap-2.5">
            <Button size="sm" variant="secondary" onClick={() => exportData("candidates")}>
              Export candidates
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportData("audit")}>
              Export audit
            </Button>
          </div>
        }
      />
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Filter by action" htmlFor="audit-action">
              <Input
                id="audit-action"
                placeholder="e.g. LOGIN, START_ASSESSMENT…"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value.toUpperCase());
                  setPage(0);
                }}
              />
            </Field>
          </div>
          {action && (
            <Button size="sm" variant="ghost" onClick={() => setAction("")} className="mb-[22px]">
              Clear
            </Button>
          )}
        </div>
      </Card>

      {res.loading ? (
        <Skeleton className="h-72 rounded-card" />
      ) : res.error ? (
        <ErrorState message={res.error.message} onRetry={res.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No audit entries match" body="Try a different action filter, or clear it to see the latest entries." />
      ) : (
        <>
          <TableShell head={["Time", "Actor", "Action", "Resource", "Detail"]}>
            {rows.map((r, i) => (
              <tr key={r.id ?? i} className="bg-surface hover:bg-paper/60">
                <td className="px-4 py-3 tnum text-ink-3 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="px-4 py-3 tnum text-ink-2">{actorOf(r)}</td>
                <td className="px-4 py-3">
                  <Badge tone="brand">{r.action}</Badge>
                </td>
                <td className="px-4 py-3 tnum text-ink-2">
                  {r.resource_type}
                  {r.resource_id != null ? ` #${r.resource_id}` : ""}
                </td>
                <td className="px-4 py-3 max-w-[260px]"><span className="line-clamp-1 text-ink-3">{detailOf(r)}</span></td>
              </tr>
            ))}
          </TableShell>
          {pages != null && pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[12.5px] text-ink-3 tnum">
                Page {page + 1} of {pages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
