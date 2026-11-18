"use client";

/**
 * Sign in / Register.
 * Registration offers candidate & parent roles only — admin accounts are
 * provisioned by the operator (the backend rejects self-registered admins).
 * Friendly error mapping: never expose internals on failure.
 */
import { useEffect, useState } from "react";
import { useApp, useRoute } from "@/lib/AppContext";
import { Button, Card, Field, Input, Select, Wordmark, Badge } from "@/components/psych/ui";

const DEMO_ACCOUNTS = [
  { role: "Student", id: "aarav@demo.psychometric-ai.local" },
  { role: "Parent", id: "sunita@demo.psychometric-ai.local" },
  { role: "Admin", id: "admin@demo.psychometric-ai.local" },
];

function AuthAside() {
  return (
    <aside className="hidden lg:flex flex-col justify-between bg-inverse p-10 xl:p-14">
      <Wordmark inverse />
      <div>
        <h2 className="font-display text-[30px] font-bold leading-tight tracking-[-0.02em] text-[#F3F1EA]">
          Understand your strengths.
          <br />
          <span className="text-[#9DC3BD]">Explore what comes next.</span>
        </h2>
        <ul className="mt-8 space-y-4">
          {[
            "Deterministic scoring — the same answers, the same profile",
            "Explainable stream fits with the numbers behind them",
            "Private by default: you approve who sees your results",
          ].map((t) => (
            <li key={t} className="flex items-start gap-3 text-[14px] text-[#C9D4D1]">
              <span aria-hidden="true" className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#6FA69B] shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[12px] text-[#6E8783] leading-relaxed">
        Educational guidance support — not a clinical or diagnostic instrument.
      </p>
    </aside>
  );
}

export function AuthScreen({ mode, sessionExpired }: { mode: "login" | "register"; sessionExpired: boolean }) {
  const { signIn, signUp, pushToast } = useApp();
  const [, navigate] = useRoute();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [role, setRole] = useState<"candidate" | "parent">("candidate");
  const [fields, setFields] = useState({
    identifier: "",
    password: "",
    full_name: "",
    email: "",
    grade: "10",
    board: "CBSE",
    school_name: "",
    relationship: "Mother",
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormError(null);
    setErrors({});
  }, [mode]);

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const validateRegister = (): boolean => {
    const e: Record<string, string> = {};
    if (!fields.full_name.trim()) e.full_name = "Please enter the full name.";
    if (role === "parent" && !fields.email.trim()) e.email = "Please enter an email address.";
    if (fields.email && !/^\S+@\S+\.\S+$/.test(fields.email)) e.email = "That email doesn't look right.";
    if (!fields.password || fields.password.length < 8) e.password = "Password needs at least 8 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const afterAuth = (r: string) => {
    navigate(r === "admin" ? "/admin" : r === "parent" ? "/parent" : "/home");
  };

  const doLogin = async (e?: React.FormEvent, overrideId?: string) => {
    e?.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const u = await (overrideId ? signIn(overrideId, "Demo@12345") : signIn(fields.identifier.trim(), fields.password));
      pushToast(`Welcome back.`, "success");
      afterAuth(u.role);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validateRegister()) return;
    setBusy(true);
    try {
      const body =
        role === "candidate"
          ? {
              role,
              full_name: fields.full_name.trim(),
              email: fields.email.trim() || undefined,
              password: fields.password,
              grade: Number(fields.grade) || 10,
              board: fields.board,
              school_name: fields.school_name.trim() || undefined,
            }
          : {
              role,
              full_name: fields.full_name.trim(),
              email: fields.email.trim(),
              phone: fields.phone.trim() || undefined,
              password: fields.password,
              relationship: fields.relationship,
            };
      const u = await signUp(body);
      pushToast("Account created. Welcome aboard.", "success");
      afterAuth(u.role);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create the account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_520px] bg-paper">
      <AuthAside />
      <div className="flex flex-col justify-center px-5 sm:px-10 py-10 lg:py-14 bg-surface lg:border-l border-line">
        <div className="w-full max-w-md mx-auto rise">
          <div className="lg:hidden mb-8">
            <Wordmark />
          </div>

          {sessionExpired && (
            <div role="status" className="mb-5 rounded-[12px] bg-warn-soft border border-[#EBDDBB] px-4 py-3 text-[13.5px] text-warn font-medium">
              Your session ended for security. Please sign in again — your saved progress is safe.
            </div>
          )}

          <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {mode === "login"
              ? "Continue your assessment or view your profile."
              : "For students in Grade 10 and their parents. Counselor access is provisioned by your institution."}
          </p>

          {mode === "register" && (
            <div className="mt-6" role="radiogroup" aria-label="Account type">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { k: "candidate", t: "Student", d: "I'm taking the assessment" },
                    { k: "parent", t: "Parent", d: "I'm linking to my child" },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.k}
                    type="button"
                    role="radio"
                    aria-checked={role === r.k}
                    onClick={() => setRole(r.k)}
                    className={`rounded-[12px] border px-4 py-3 text-left transition-all cursor-pointer ${
                      role === r.k ? "border-brand bg-brand-mist" : "border-line-2 hover:border-ink-3"
                    }`}
                  >
                    <span className="block text-[14px] font-bold text-ink">{r.t}</span>
                    <span className="block text-[12px] text-ink-2 mt-0.5">{r.d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={doLogin} className="mt-6" noValidate>
              <Field label="Email or phone" htmlFor="identifier" required>
                <Input
                  id="identifier"
                  name="identifier"
                  autoComplete="username"
                  value={fields.identifier}
                  onChange={(e) => set("identifier", e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </Field>
              <Field label="Password" htmlFor="password" required error={errors.password}>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={fields.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                />
              </Field>
              {formError && (
                <p role="alert" className="mb-4 rounded-[10px] bg-bad-soft border border-[#EFCFC9] px-4 py-3 text-[13.5px] text-bad font-medium">
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" loading={busy} className="w-full">
                Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={doRegister} className="mt-6" noValidate>
              <Field label="Full name" htmlFor="full_name" required error={errors.full_name}>
                <Input id="full_name" value={fields.full_name} onChange={(e) => set("full_name", e.target.value)} required />
              </Field>
              <Field
                label="Email"
                htmlFor="email"
                required={role === "parent"}
                error={errors.email}
                hint={role === "candidate" ? "Optional — you can also sign in with a phone number later." : undefined}
              >
                <Input id="email" type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              {role === "parent" && (
                <Field label="Phone" htmlFor="phone" hint="Used for account recovery.">
                  <Input id="phone" type="tel" value={fields.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
              )}
              {role === "candidate" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Grade" htmlFor="grade">
                    <Select id="grade" value={fields.grade} onChange={(e) => set("grade", e.target.value)}>
                      <option value="9">9</option>
                      <option value="10">10</option>
                      <option value="11">11</option>
                    </Select>
                  </Field>
                  <Field label="Board" htmlFor="board">
                    <Select id="board" value={fields.board} onChange={(e) => set("board", e.target.value)}>
                      <option>CBSE</option>
                      <option>ICSE</option>
                      <option>State Board</option>
                      <option>IB / IGCSE</option>
                    </Select>
                  </Field>
                </div>
              )}
              {role === "parent" && (
                <Field label="Relationship to student" htmlFor="relationship">
                  <Select id="relationship" value={fields.relationship} onChange={(e) => set("relationship", e.target.value)}>
                    <option>Mother</option>
                    <option>Father</option>
                    <option>Guardian</option>
                  </Select>
                </Field>
              )}
              <Field label="Password" htmlFor="reg-password" required error={errors.password} hint="At least 8 characters.">
                <Input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={fields.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                />
              </Field>
              <p className="text-[12.5px] text-ink-3 leading-relaxed mb-4 -mt-1">
                By creating an account you agree that results are for educational guidance and are
                shared only with people the student approves.
              </p>
              {formError && (
                <p role="alert" className="mb-4 rounded-[10px] bg-bad-soft border border-[#EFCFC9] px-4 py-3 text-[13.5px] text-bad font-medium">
                  {formError}
                </p>
              )}
              <Button type="submit" size="lg" loading={busy} className="w-full">
                Create account
              </Button>
            </form>
          )}

          <p className="mt-6 text-[13.5px] text-ink-2">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button onClick={() => navigate("/register")} className="font-semibold text-brand hover:text-brand-strong cursor-pointer">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => navigate("/login")} className="font-semibold text-brand hover:text-brand-strong cursor-pointer">
                  Sign in
                </button>
              </>
            )}
          </p>

          {mode === "login" && (
            <Card className="mt-8 p-4.5 px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-3">Demo environment</p>
                <Badge tone="neutral">Demo@12345</Badge>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => doLogin(undefined, a.id)}
                    disabled={busy}
                    className="w-full flex items-center justify-between rounded-[9px] px-3 py-2 hover:bg-paper transition-colors cursor-pointer text-left disabled:opacity-50"
                  >
                    <span className="text-[13px] font-semibold text-ink">{a.role}</span>
                    <span className="text-[12px] text-ink-3 truncate ml-3">{a.id}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-ink-3 mt-2.5">One click signs in with the demo password.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
