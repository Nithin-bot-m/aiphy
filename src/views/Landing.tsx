"use client";

/**
 * Landing — premium editorial hero, product principles, how-it-works.
 * The hero visual is an abstract "profile → dimensions → streams" panel
 * rendered with the design system (no robots, no AI magic effects).
 */
import { useEffect } from "react";
import { PublicHeader, PublicFooter } from "@/components/psych/nav";
import { Button, Card, Eyebrow, SectionHeading } from "@/components/psych/ui";
import { useApp, useRoute, scrollToSection } from "@/lib/AppContext";

/* ---------------- hero visual ---------------- */

function HeroVisual() {
  const dims = [
    { label: "Analytical", v: 84 },
    { label: "Curiosity", v: 91 },
    { label: "Persistence", v: 78 },
    { label: "Creativity", v: 67 },
  ];
  const streams = [
    { name: "Science · PCM", band: "Strong Fit", tone: "#7FC6A4" },
    { name: "Data & Analytics", band: "Strong Fit", tone: "#7FC6A4" },
    { name: "Design", band: "Possible Fit", tone: "#E4C27E" },
  ];
  return (
    <div className="relative rounded-[22px] bg-inverse p-6 sm:p-7 shadow-pop overflow-hidden" aria-label="Illustration of a sample assessment profile">
      {/* faint hexagon watermark */}
      <svg aria-hidden="true" className="absolute -right-14 -top-14 w-72 h-72 opacity-[0.06]" viewBox="0 0 100 100">
        <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" stroke="#fff" strokeWidth="1.4" />
        <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="none" stroke="#fff" strokeWidth="1" />
      </svg>

      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8FB5AF]">Sample profile</p>
        <span className="text-[10.5px] font-semibold text-[#8FB5AF] border border-[#2A3B38] rounded-full px-2.5 py-0.5">
          Grade 10
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-[#1E3B37] text-[#9DC3BD] font-display font-bold text-[13px] flex items-center justify-center" aria-hidden="true">
          AR
        </span>
        <div>
          <p className="text-[15px] font-semibold text-[#F3F1EA] leading-tight">Student profile</p>
          <p className="text-[11.5px] text-[#8FB5AF]">Aptitude · Interests · Work style</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {dims.map((d, i) => (
          <div key={d.label} style={{ animationDelay: `${i * 90}ms` }} className="rise">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12.5px] font-medium text-[#C9D4D1]">{d.label}</span>
              <span className="tnum text-[12.5px] font-bold text-[#F3F1EA]">{d.v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#22332F] overflow-hidden">
              <div className="h-full rounded-full bar-fill bg-[#6FA69B]" style={{ width: `${d.v}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-5 border-t border-[#243430]">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8FB5AF] mb-3">
          Stream possibilities
        </p>
        <div className="space-y-2">
          {streams.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-[10px] bg-[#1B2D2A] border border-[#283B37] px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-[#EDEFEA]">{s.name}</span>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: s.tone }}>
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: s.tone }} />
                {s.band}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[10.5px] text-[#6E8783] leading-relaxed">
        Illustration with sample data. Every real result is calculated from that student's own responses.
      </p>
    </div>
  );
}

/* ---------------- how it works mini-visuals ---------------- */

function StepVisual({ step }: { step: number }) {
  if (step === 0)
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <rect x="8" y="6" width="28" height="32" rx="4" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
        <path d="M14 15h16M14 21h16M14 27h8" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        <circle cx="30" cy="30" r="6.5" fill="var(--accent)" />
        <path d="m27.6 30 1.7 1.7 3-3.2" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (step === 1)
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <path d="M9 34V22M17 34V12M25 34V18M33 34V8" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
      </svg>
    );
  if (step === 2)
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <polygon points="22,5 37,13.5 37,30.5 22,39 7,30.5 7,13.5" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
        <polygon points="22,14 29,18 29,26 22,30 15,26 15,18" fill="var(--accent)" opacity="0.22" />
        <circle cx="29" cy="18" r="3.2" fill="var(--accent)" />
        <circle cx="15" cy="26" r="2.4" fill="var(--accent)" opacity="0.6" />
      </svg>
    );
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
      <circle cx="30" cy="20" r="6" fill="none" stroke="var(--accent)" strokeWidth="1.8" opacity="0.55" />
      <path d="M8 36c1.5-5 4.5-7.5 8-7.5s6.5 2.5 8 7.5M25 32c1.2-3 3.2-4.5 5.5-4.5 2 0 3.8 1.2 5 3.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

const STEPS = [
  { n: "01", title: "Assess", text: "Work through a structured set of reasoning, interest and work-style questions — one question at a time, saved as you go." },
  { n: "02", title: "Understand", text: "See your profile as clear indices across aptitude areas, interest themes and work style — with the numbers behind every value." },
  { n: "03", title: "Explore", text: "Browse streams and career areas as fit possibilities, each with an explanation of why it appeared for you." },
  { n: "04", title: "Discuss", text: "Share your report with parents and counselors, compare perspectives, and turn alignment into a calm conversation." },
];

const PRINCIPLES = [
  {
    title: "Deterministic scoring",
    body: "Every score is produced by a fixed, versioned psychometric engine. The same answers always produce the same result — exactly.",
  },
  {
    title: "Structured assessment",
    body: "Aptitude, interests and work style are measured with defined dimensions and documented weights, not open-ended AI guesses.",
  },
  {
    title: "Explainable results",
    body: "Every stream fit can be traced: dimension → value × weight → contribution → final index. No black boxes.",
  },
  {
    title: "Privacy-conscious design",
    body: "Results are shared only with people you approve. Errors never expose internals, and AI never receives your credentials.",
  },
];

export default function Landing() {
  const { user } = useApp();
  const [, navigate] = useRoute();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#\/?/, "");
    if (hash === "how" || hash === "trust") {
      const el = document.getElementById(hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, []);

  const startCta = () => navigate(user ? "/assessment" : "/register");

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />

      <main id="main" className="flex-1">
        {/* ================= HERO ================= */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
            <div className="rise">
              <Eyebrow>Psychometric Assessment for Grade 10</Eyebrow>
              <h1 className="font-display font-extrabold tracking-[-0.03em] text-[38px] leading-[1.06] sm:text-[54px] sm:leading-[1.04] mt-4 text-ink">
                Understand your strengths.
                <br />
                <span className="text-brand">Explore what comes next.</span>
              </h1>
              <p className="mt-6 text-[16.5px] leading-relaxed text-ink-2 max-w-xl">
                A structured assessment of aptitude, interests and work style to help students
                explore educational directions with greater clarity.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Button size="lg" onClick={startCta}>
                  Start Assessment
                </Button>
                <a
                  href="#how"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("how");
                  }}
                  className="h-12 px-6 inline-flex items-center rounded-[12px] border border-line-2 bg-surface text-[15.5px] font-semibold text-ink hover:border-ink-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                  How it works
                </a>
              </div>
              <p className="mt-6 text-[13px] text-ink-3">
                Free during the MVP · No installation · Works on any device
              </p>
            </div>
            <div className="rise lg:pl-4">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ================= TRUST ================= */}
        <section id="trust" className="border-y border-line bg-surface scroll-mt-20">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
            <div className="max-w-3xl mx-auto text-center">
              <Eyebrow className="justify-center">Our product principle</Eyebrow>
              <blockquote className="font-display text-[22px] sm:text-[28px] font-bold leading-snug tracking-[-0.015em] mt-4 text-ink">
                &ldquo;Your results are calculated from your assessment responses. AI helps explain
                your results — <span className="text-brand">it does not decide your scores.</span>&rdquo;
              </blockquote>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
              {PRINCIPLES.map((p) => (
                <Card key={p.title} className="p-6">
                  <span className="inline-flex w-9 h-9 rounded-[10px] bg-brand-mist items-center justify-center mb-4" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                      <path d="M9 1.8 15.2 5v8L9 16.2 2.8 13V5L9 1.8Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="m6.4 9 1.9 1.9 3.5-3.8" stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h3 className="font-display font-bold text-[15.5px]">{p.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{p.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section id="how" className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24 scroll-mt-16">
          <SectionHeading
            eyebrow="How it works"
            title="From questions to clarity, in four steps"
            description="One guided experience — designed to be thoughtful, not stressful. Most students finish in under 30 minutes."
          />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
            {STEPS.map((s) => (
              <li key={s.n}>
                <Card className="p-6 h-full flex flex-col">
                  <div className="flex items-start justify-between">
                    <StepVisual step={Number(s.n) - 1} />
                    <span className="tnum font-display text-[13px] font-bold text-ink-3">{s.n}</span>
                  </div>
                  <h3 className="font-display font-bold text-[17px] mt-5">{s.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= AUDIENCES ================= */}
        <section className="border-t border-line bg-surface">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
            <SectionHeading
              eyebrow="Who it's for"
              title="Built for the whole conversation"
              description="Students see their own profile. Parents see a calm discussion space. Counselors and admins see structured, versioned data."
            />
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  t: "Students",
                  b: "A focused assessment, an honest profile, and a stream explorer that treats every result as a possibility to explore — never a verdict.",
                  k: ["One question at a time", "Progress is saved as you go", "Explainable fit scores"],
                },
                {
                  t: "Parents",
                  b: "Share your perspective alongside your child's profile and see where expectations meet — expressed neutrally, ready for a good conversation.",
                  k: ["Private, consent-based linking", "Side-by-side alignment view", "Questions worth asking"],
                },
                {
                  t: "Counselors & admins",
                  b: "Versioned question banks, transparent scoring rules, report history and an audit trail — the machinery stays visible and accountable.",
                  k: ["Versioned assessments", "Scoring-rule transparency", "Full audit trail"],
                },
              ].map((a) => (
                <Card key={a.t} className="p-6">
                  <h3 className="font-display font-bold text-[16.5px]">{a.t}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{a.b}</p>
                  <ul className="mt-4 space-y-1.5">
                    {a.k.map((k) => (
                      <li key={k} className="flex items-center gap-2 text-[13px] text-ink-2">
                        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-brand/60" />
                        {k}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <div className="rounded-[22px] bg-inverse px-6 py-12 sm:p-14 text-center relative overflow-hidden">
            <svg aria-hidden="true" className="absolute -left-16 -bottom-20 w-80 h-80 opacity-[0.05]" viewBox="0 0 100 100">
              <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" stroke="#fff" strokeWidth="1.2" />
            </svg>
            <h2 className="font-display text-[26px] sm:text-[34px] font-bold tracking-[-0.02em] text-[#F3F1EA]">
              Clearer decisions start with understanding.
            </h2>
            <p className="mt-4 text-[15px] text-[#B9C4C1] max-w-xl mx-auto leading-relaxed">
              Take the assessment, explore your possibilities, and bring your family into the
              conversation with shared, explainable results.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <Button size="lg" variant="inverse" onClick={startCta}>
                Start Assessment
              </Button>
              <a
                href="#how"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("how");
                }}
                className="h-12 px-6 inline-flex items-center rounded-[12px] border border-[#33474333] text-[15.5px] font-semibold text-[#F3F1EA] hover:bg-[#1E3B37] active:scale-[0.98] transition-all cursor-pointer"
              >
                See how it works
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
