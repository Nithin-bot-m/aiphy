"use client";

/**
 * App root — hash-based view router with role guards.
 * Routes are client-side (single Next.js page), syncable via URL hash so a
 * refresh restores the same screen. Guards mirror the backend's RBAC; they
 * shape navigation but the API remains the real enforcement point.
 */
import { useEffect, useState } from "react";
import { AppProvider, useApp, useRoute } from "@/lib/AppContext";
import { AppShell, PublicHeader, PublicFooter } from "@/components/psych/nav";
import { Button, EmptyState, LogoMark, Skeleton, SkeletonCard, ToastViewport, Wordmark } from "@/components/psych/ui";
import Landing from "@/views/Landing";
import { AuthScreen } from "@/views/Auth";
import { LegalScreen } from "@/views/Legal";
import Assessment from "@/views/Assessment";
import Results from "@/views/Results";
import Explore from "@/views/Explore";
import { CandidateHome, ProfileScreen } from "@/views/Candidate";
import { ParentHome, ParentChild, ParentAlignment, ParentReports } from "@/views/Parent";
import ReportReader from "@/views/Report";
import Admin from "@/views/Admin";

function BootSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-paper gap-4" role="status" aria-label="Loading application">
      <LogoMark size={40} />
      <Wordmark />
      <span className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" aria-hidden="true" />
    </div>
  );
}

function NotFound({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <EmptyState
          title="That page doesn't exist"
          body="The link may be outdated. Head back to your dashboard to continue where you left off."
          action={<Button onClick={() => navigate("/")}>Go home</Button>}
        />
      </div>
    </div>
  );
}

function CandidateReport({ navigate }: { navigate: (to: string) => void }) {
  const { id, loading } = useMyAssessmentId();
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-9 space-y-5">
        <Skeleton className="h-9 w-48" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (id == null) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16">
        <EmptyState
          title="No report yet"
          body="Complete your assessment first — your report is generated from its results."
          action={<Button onClick={() => navigate("/assessment")}>Start assessment</Button>}
        />
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-9 print:p-0 print:max-w-none">
      <ReportReader
        assessmentId={id}
        allowedTypes={["candidate"]}
        initialType="candidate"
        onBack={() => navigate("/results")}
      />
    </div>
  );
}

/** Reads the latest assessment id from /candidate/results (null if none). */
function useMyAssessmentId(): { id: number | null; loading: boolean } {
  const [state, setState] = useState<{ id: number | null; loading: boolean }>({ id: null, loading: true });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import("@/lib/api");
        const data = (await api.candidate.results()) as { assessment_id?: number } | null;
        if (!cancelled) setState({ id: data?.assessment_id ?? null, loading: false });
      } catch {
        if (!cancelled) setState({ id: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function AppInner() {
  const { booted, user, sessionExpired, clearSessionExpired } = useApp();
  const [path, navigate] = useRoute();

  // On session expiry: route to login with a friendly notice.
  useEffect(() => {
    if (sessionExpired) {
      navigate("/login");
      const t = window.setTimeout(() => clearSessionExpired(), 8000);
      return () => window.clearTimeout(t);
    }
  }, [sessionExpired, navigate, clearSessionExpired]);

  if (!booted) return <BootSplash />;

  const role = user?.role ?? null;

  // Signed-in users hitting the public auth screens go to their workspace.
  if (user && (path === "/login" || path === "/register")) {
    navigate(role === "admin" ? "/admin" : role === "parent" ? "/parent" : "/home");
    return <BootSplash />;
  }

  /* ---------------- public ---------------- */
  if (path === "/" || path === "/how" || path === "/trust") {
    return (
      <>
        <Landing />
        <ToastViewport />
      </>
    );
  }
  if (path === "/login" || path === "/register") {
    return (
      <>
        <AuthScreen mode={path === "/login" ? "login" : "register"} sessionExpired={sessionExpired} />
        <ToastViewport />
      </>
    );
  }
  if (path === "/privacy") {
    return (
      <>
        <LegalScreen type="privacy" />
        <ToastViewport />
      </>
    );
  }
  if (path === "/terms") {
    return (
      <>
        <LegalScreen type="terms" />
        <ToastViewport />
      </>
    );
  }
  if (path === "/contact") {
    return (
      <>
        <LegalScreen type="contact" />
        <ToastViewport />
      </>
    );
  }

  /* ---------------- requires auth ---------------- */
  if (!user) {
    const knownAuthRoutes = [
      "/home",
      "/assessment",
      "/results",
      "/report",
      "/explore",
      "/profile",
      "/parent",
      "/admin",
    ];
    const isKnownAuth = knownAuthRoutes.some((r) => path === r || path.startsWith(r + "/"));
    if (isKnownAuth) {
      return (
        <>
          <AuthScreen mode="login" sessionExpired={sessionExpired} />
          <ToastViewport />
        </>
      );
    }
    return (
      <>
        <NotFound navigate={navigate} />
        <ToastViewport />
      </>
    );
  }

  /* ---------------- admin console ---------------- */
  if (path.startsWith("/admin")) {
    if (role !== "admin") {
      return (
        <>
          <NotFound navigate={navigate} />
          <ToastViewport />
        </>
      );
    }
    return (
      <>
        <Admin />
        <ToastViewport />
      </>
    );
  }

  /* ---------------- candidate ---------------- */
  const candidateRoutes: Record<string, React.ReactNode> = {
    "/home": <CandidateHome navigate={navigate} />,
    "/assessment": <Assessment navigate={navigate} />,
    "/results": <Results navigate={navigate} />,
    "/explore": <Explore />,
    "/profile": <ProfileScreen />,
    "/report": <CandidateReport navigate={navigate} />,
  };

  /* ---------------- parent ---------------- */
  const parentRoutes: Record<string, React.ReactNode> = {
    "/parent": <ParentHome />,
    "/parent/child": <ParentChild />,
    "/parent/alignment": <ParentAlignment />,
    "/parent/reports": <ParentReports />,
  };

  let content: React.ReactNode | undefined;
  if (role === "candidate") content = candidateRoutes[path];
  if (role === "parent") content = parentRoutes[path];

  if (!content) {
    // role-aware fallbacks: unknown path → send to the role's home
    return (
      <>
        <NotFound navigate={navigate} />
        <ToastViewport />
      </>
    );
  }

  return (
    <>
      <AppShell>{content}</AppShell>
      <ToastViewport />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-brand focus:text-on-brand focus:px-4 focus:py-2 focus:rounded-[10px] focus:font-semibold"
      >
        Skip to content
      </a>
      <AppInner />
    </AppProvider>
  );
}
