"use client";

import { PublicHeader, PublicFooter } from "@/components/psych/nav";
import { Card, Eyebrow } from "@/components/psych/ui";
import { useRoute } from "@/lib/AppContext";

export function LegalScreen({ type }: { type: "privacy" | "terms" | "contact" }) {
  const [, navigate] = useRoute();

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />
      <main id="main" className="flex-1 max-w-4xl w-full mx-auto px-5 sm:px-8 py-10 sm:py-16">
        {type === "privacy" && (
          <article className="space-y-8 rise">
            <div>
              <Eyebrow>Data Protection & Privacy</Eyebrow>
              <h1 className="font-display text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] mt-2">
                Privacy Policy
              </h1>
              <p className="mt-2 text-[14px] text-ink-3">
                Last updated: November 2026 · Compliant with the Digital Personal Data Protection (DPDP) Act 2023
              </p>
            </div>

            <Card className="p-6 sm:p-8 space-y-6 text-[14.5px] leading-relaxed text-ink-2">
              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">1. Educational Scope & Purpose</h2>
                <p>
                  Psychometric AI is an educational guidance screening platform designed for Grade 10 students exploring post-secondary academic streams. It is strictly not a psychological, clinical, diagnostic, or psychiatric assessment tool.
                </p>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">2. Data We Collect</h2>
                <p>We adhere to strict data minimisation:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Student Information:</strong> Name, Grade, Board (CBSE/ICSE/State), and optional School Name.</li>
                  <li><strong>Assessment Responses:</strong> Answers to the 44 structured questions across Aptitude, Interests, and Work Style.</li>
                  <li><strong>Account Credentials:</strong> Hashed passwords (bcrypt cost 12) or mobile phone numbers for OTP authentication. Passwords are never stored in plain text.</li>
                </ul>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">3. Minor Data & Parental Consent (DPDP Act 2023 §9)</h2>
                <p>
                  Under the Indian DPDP Act 2023, students under 18 years of age are considered minors. We enforce a consent-first architecture:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>A student's assessment results are private by default.</li>
                  <li>Results are shared with parents only when the student explicitly enters and approves a parent-linking connection.</li>
                  <li>Parents or legal guardians may review, download, or request erasure of their child's records at any time.</li>
                </ul>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">4. Data Processing & Privacy Boundary</h2>
                <p>
                  Scores and fit indices are computed 100% deterministically by mathematical algorithms against standard normative frameworks. Report generation systems receive only anonymized numerical results (e.g., scores and ranks) — strictly protected with zero access to passwords, student codes, email addresses, phone numbers, or raw response logs.
                </p>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">5. Data Retention Schedule (§8(7))</h2>
                <p>In accordance with our governance policy, data is purged on the following schedules:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Report Summary Logs:</strong> 180 days.</li>
                  <li><strong>System Audit Logs:</strong> 365 days.</li>
                  <li><strong>Outbox & Delivery Logs:</strong> 90 days.</li>
                  <li><strong>Account Erasure:</strong> Anonymized on user or parent deletion request.</li>
                </ul>
              </section>
            </Card>
          </article>
        )}

        {type === "terms" && (
          <article className="space-y-8 rise">
            <div>
              <Eyebrow>Terms of Service</Eyebrow>
              <h1 className="font-display text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] mt-2">
                Terms of Use
              </h1>
              <p className="mt-2 text-[14px] text-ink-3">
                Effective date: November 2026
              </p>
            </div>

            <Card className="p-6 sm:p-8 space-y-6 text-[14.5px] leading-relaxed text-ink-2">
              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">1. Nature of the Service</h2>
                <p>
                  Psychometric AI provides educational guidance fit indices to help students, parents, and educators discuss career and academic stream options. All calculations represent statistical fit indices for discussion — they do not predict academic success, college admissions, or career outcomes.
                </p>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">2. Acceptable Use</h2>
                <p>
                  You agree to use the platform solely for educational exploration. Automated scraping, submission of fabricated responses, attempting to bypass role permissions, or reverse engineering scoring logic is strictly prohibited.
                </p>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">3. Accuracy & Guidance</h2>
                <p>
                  Results should be viewed as one data point among school grades, personal interests, teacher guidance, and family priorities. Decisions regarding high school stream selection should not be made solely based on this assessment.
                </p>
              </section>

              <section>
                <h2 className="font-display font-bold text-[18px] text-ink mb-2">4. Contact & Disputes</h2>
                <p>
                  If you have questions about these terms or wish to report an issue, please reach out through our support channel.
                </p>
              </section>
            </Card>
          </article>
        )}

        {type === "contact" && (
          <article className="space-y-8 rise">
            <div>
              <Eyebrow>Support & Communication</Eyebrow>
              <h1 className="font-display text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] mt-2">
                Contact & Support
              </h1>
              <p className="mt-2 text-[14px] text-ink-3">
                We are here to assist students, parents, and school administrators.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <Card className="p-6">
                <h2 className="font-display font-bold text-[17px] text-ink mb-2">Student & Parent Support</h2>
                <p className="text-[14px] text-ink-2 leading-relaxed">
                  Have questions about taking the assessment, linking parent accounts, or accessing reports?
                </p>
                <div className="mt-5 space-y-2 text-[13.5px]">
                  <p><span className="font-semibold text-ink">Email:</span> support@psychometric-ai.local</p>
                  <p><span className="font-semibold text-ink">Hours:</span> Monday – Saturday, 9:00 AM – 6:00 PM IST</p>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="font-display font-bold text-[17px] text-ink mb-2">School & Institutional Inquiries</h2>
                <p className="text-[14px] text-ink-2 leading-relaxed">
                  For school onboarding, counselor console access, or batch cohort assessments:
                </p>
                <div className="mt-5 space-y-2 text-[13.5px]">
                  <p><span className="font-semibold text-ink">Email:</span> schools@psychometric-ai.local</p>
                  <p><span className="font-semibold text-ink">Address:</span> Bengaluru, Karnataka, India</p>
                </div>
              </Card>
            </div>
          </article>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

