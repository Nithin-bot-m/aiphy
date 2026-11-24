"use client";

/**
 * Sign in / Register.
 * Registration offers candidate & parent roles only — admin accounts are
 * provisioned by the operator (the backend rejects self-registered admins).
 * Friendly error mapping: never expose internals on failure.
 */
import { useEffect, useState } from "react";
import { useApp, useRoute } from "@/lib/AppContext";
import { Button, Card, Field, Input, Select, Wordmark, Badge, Modal } from "@/components/psych/ui";

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
  const { signIn, signInWithOtp, signUp, pushToast } = useApp();
  const [, navigate] = useRoute();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [role, setRole] = useState<"candidate" | "parent">("candidate");
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fields, setFields] = useState({
    identifier: "",
    password: "",
    confirm_password: "",
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
    setOtpSent(false);
    setOtpCode("");
  }, [mode, loginMethod]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = window.setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [otpCountdown]);

  const set = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const validateRegister = (): boolean => {
    const e: Record<string, string> = {};
    if (!fields.full_name.trim()) e.full_name = "Please enter the full name.";
    if (role === "parent" && !fields.email.trim()) e.email = "Please enter an email address.";
    if (fields.email && !/^\S+@\S+\.\S+$/.test(fields.email)) e.email = "That email doesn't look right.";
    if (!fields.password || fields.password.length < 8) e.password = "Password needs at least 8 characters.";
    if (fields.password !== fields.confirm_password) e.confirm_password = "Passwords do not match.";
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

  const doSendOtp = async () => {
    const phone = fields.phone.trim();
    if (!phone) {
      setFormError("Please enter your registered mobile number.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const { api } = await import("@/lib/api");
      const res = await api.auth.sendOtp(phone);
      setOtpSent(true);
      setOtpCountdown(60);
      pushToast(res.message || "Verification code sent.", "success");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send verification code. Try password login.");
    } finally {
      setBusy(false);
    }
  };

  const doOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = fields.phone.trim();
    const code = otpCode.trim();
    if (!phone) {
      setFormError("Please enter your mobile number.");
      return;
    }
    if (!code || code.length !== 6) {
      setFormError("Please enter the 6-digit verification code.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const u = await signInWithOtp(phone, code);
      pushToast("Welcome back.", "success");
      afterAuth(u.role);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Invalid verification code.");
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
            <div className="mt-6">
              <div className="flex border-b border-line-2 mb-5" role="tablist" aria-label="Sign in method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginMethod === "password"}
                  onClick={() => setLoginMethod("password")}
                  className={`pb-2.5 px-3 text-[13.5px] font-semibold transition-all border-b-2 cursor-pointer ${
                    loginMethod === "password"
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginMethod === "otp"}
                  onClick={() => setLoginMethod("otp")}
                  className={`pb-2.5 px-3 text-[13.5px] font-semibold transition-all border-b-2 cursor-pointer ${
                    loginMethod === "otp"
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-3 hover:text-ink"
                  }`}
                >
                  Mobile OTP
                </button>
              </div>

              {loginMethod === "password" ? (
                <form onSubmit={doLogin} noValidate>
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
                  <div className="flex justify-end -mt-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-[12.5px] font-medium text-brand hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
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
                <form onSubmit={doOtpLogin} noValidate>
                  <Field label="Registered mobile phone" htmlFor="phone-otp" required hint="Include country code, e.g. +91XXXXXXXXXX">
                    <div className="flex gap-2">
                      <Input
                        id="phone-otp"
                        type="tel"
                        value={fields.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="+919876543210"
                        required
                        disabled={busy || (otpSent && otpCountdown > 0)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={doSendOtp}
                        disabled={busy || (otpSent && otpCountdown > 0)}
                        loading={busy && !otpSent}
                        className="shrink-0 text-[13px]"
                      >
                        {otpSent ? (otpCountdown > 0 ? `Resend (${otpCountdown}s)` : "Resend") : "Send code"}
                      </Button>
                    </div>
                    {otpSent && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCountdown(0);
                            setOtpCode("");
                          }}
                          className="text-[12px] font-medium text-brand hover:underline cursor-pointer"
                        >
                          Change phone number
                        </button>
                      </div>
                    )}
                  </Field>

                  {otpSent && (
                    <Field label="6-Digit verification code" htmlFor="otp-code" required hint="Enter the code sent to your phone.">
                      <Input
                        id="otp-code"
                        type="text"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="······"
                        required
                        autoFocus
                        className="font-mono tracking-[0.3em] text-center text-[18px] font-bold"
                      />
                    </Field>
                  )}

                  {formError && (
                    <p role="alert" className="mb-4 rounded-[10px] bg-bad-soft border border-[#EFCFC9] px-4 py-3 text-[13.5px] text-bad font-medium">
                      {formError}
                    </p>
                  )}

                  <Button type="submit" size="lg" loading={busy && otpSent} disabled={!otpSent} className="w-full">
                    Verify & Sign in
                  </Button>
                </form>
              )}
            </div>
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
                      <option value="9">Grade 9</option>
                      <option value="10">Grade 10</option>
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
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
              <Field label="Confirm password" htmlFor="reg-confirm" required error={errors.confirm_password}>
                <Input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={fields.confirm_password}
                  onChange={(e) => set("confirm_password", e.target.value)}
                  required
                />
              </Field>
              <p className="text-[12.5px] text-ink-3 leading-relaxed mb-4 -mt-1">
                By creating an account you agree to our{" "}
                <button type="button" onClick={() => navigate("/terms")} className="text-brand underline cursor-pointer">
                  Terms of Use
                </button>{" "}
                and{" "}
                <button type="button" onClick={() => navigate("/privacy")} className="text-brand underline cursor-pointer">
                  Privacy Policy
                </button>. Results are for educational guidance and shared only with people you approve.
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

          <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Account Recovery">
            <div className="space-y-4">
              <p className="text-[13.5px] text-ink-2 leading-relaxed">
                Forgot your password? You can recover access using either of these options:
              </p>
              <Card className="p-4 border-brand/30 bg-brand-mist/40 space-y-2">
                <p className="font-semibold text-[14px] text-ink">Option 1: Mobile Phone OTP (Instant)</p>
                <p className="text-[13px] text-ink-2 leading-relaxed">
                  If your account has a registered phone number, you can log in immediately using a one-time SMS verification code without your password.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setForgotOpen(false);
                    setLoginMethod("otp");
                  }}
                >
                  Switch to Mobile OTP
                </Button>
              </Card>
              <Card className="p-4 space-y-2">
                <p className="font-semibold text-[14px] text-ink">Option 2: Institutional / Admin Reset</p>
                <p className="text-[13px] text-ink-2 leading-relaxed">
                  If your account was provisioned by your school or institution, contact your school counselor or administrator to reset your credentials.
                </p>
                <p className="text-[12.5px] text-ink-3">
                  Email: support@psychometric-ai.local
                </p>
              </Card>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}
