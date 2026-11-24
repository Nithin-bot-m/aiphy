"use client";

/**
 * App shell for signed-in candidate / parent experiences.
 * Desktop: fixed sidebar. Mobile (<lg): compact top bar + bottom navigation.
 * Admin uses its own distinct console layout (see Admin view).
 */
import { useState } from "react";
import { useApp, useRoute, scrollToSection } from "@/lib/AppContext";
import { Wordmark, Badge } from "./ui";
import { initials } from "@/lib/format";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const ICON_PROPS = { width: 19, height: 19, strokeWidth: 1.9, "aria-hidden": true } as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width={ICON_PROPS.width} height={ICON_PROPS.height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_PROPS.strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20a.9.9 0 0 0 .9.9h11.2a.9.9 0 0 0 .9-.9V9.5",
  assessment: "M8 4.5h8.5a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V6l2-1.5ZM9.5 9.5h5M9.5 13h5M9.5 16.5h3",
  results: "M4 20V10M10 20V4M16 20v-8M21 20H3",
  explore: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
  profile: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c1.2-3.2 4-5 7.5-5s6.3 1.8 7.5 5",
  child: "M12 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20c.9-2.8 3.5-4.5 7-4.5s6.1 1.7 7 4.5",
  alignment: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9 9.4 9 12 3.5Z",
  reports: "M7 3.5h7L19 8.5V20a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9ZM14 3.5v5h5M9.5 13h5M9.5 16.5h5",
};

const NAV: Record<string, NavItem[]> = {
  candidate: [
    { path: "/home", label: "Home", icon: <Icon d={ICONS.home} /> },
    { path: "/assessment", label: "Assessment", icon: <Icon d={ICONS.assessment} /> },
    { path: "/results", label: "Results", icon: <Icon d={ICONS.results} /> },
    { path: "/explore", label: "Explore", icon: <Icon d={ICONS.explore} /> },
    { path: "/profile", label: "Profile", icon: <Icon d={ICONS.profile} /> },
  ],
  parent: [
    { path: "/parent", label: "Home", icon: <Icon d={ICONS.home} /> },
    { path: "/parent/child", label: "Child", icon: <Icon d={ICONS.child} /> },
    { path: "/parent/alignment", label: "Alignment", icon: <Icon d={ICONS.alignment} /> },
    { path: "/parent/reports", label: "Reports", icon: <Icon d={ICONS.reports} /> },
  ],
};

const ROLE_BADGE: Record<string, { label: string; tone: "brand" | "neutral" }> = {
  candidate: { label: "Student", tone: "brand" },
  parent: { label: "Parent", tone: "neutral" },
};

function isActive(current: string, item: string): boolean {
  if (current === item) return true;
  if (item !== "/" && current.startsWith(item + "/")) return true;
  return false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut } = useApp();
  const [path, navigate] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;
  const role = user.role;
  const items = NAV[role] || NAV.candidate;
  const name =
    role === "candidate"
      ? String((profile as { full_name?: string } | null)?.full_name ?? "Student")
      : String((profile as { full_name?: string } | null)?.full_name ?? "Parent");
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.candidate;

  const go = (to: string) => {
    setMenuOpen(false);
    navigate(to);
  };

  return (
    <div className="min-h-screen flex bg-paper">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="hidden lg:flex flex-col w-[248px] shrink-0 border-r border-line bg-surface sticky top-0 h-screen">
        <div className="px-6 h-[72px] flex items-center border-b border-line">
          <button onClick={() => go("/home")} className="cursor-pointer" aria-label="Go to home">
            <Wordmark />
          </button>
        </div>
        <nav aria-label="Primary" className="flex-1 px-3 py-4 space-y-0.5">
          {items.map((it) => {
            const on = isActive(path, it.path);
            return (
              <button
                key={it.path}
                onClick={() => go(it.path)}
                aria-current={on ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3.5 h-11 rounded-[10px] text-[14px] font-semibold transition-all duration-150 cursor-pointer ${
                  on ? "bg-ink text-[#F3F1EA]" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {it.icon}
                {it.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-line">
          <div className="flex items-center gap-3 px-1.5">
            <span className="w-9 h-9 rounded-full bg-brand-soft text-brand-strong font-display font-bold text-[13px] flex items-center justify-center shrink-0" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ink truncate">{name}</p>
              <Badge tone={badge.tone} className="mt-0.5">{badge.label}</Badge>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-3 w-full h-9 rounded-[9px] text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------- main column ---------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line no-print">
          <div className="h-14 px-4 flex items-center justify-between">
            <button onClick={() => go("/home")} className="cursor-pointer" aria-label="Go to home">
              <Wordmark />
            </button>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className="w-9 h-9 rounded-full bg-brand-soft text-brand-strong font-display font-bold text-[12.5px] flex items-center justify-center cursor-pointer"
            >
              {initials(name)}
            </button>
          </div>
          {menuOpen && (
            <div className="px-4 pb-3 fade-in" role="menu">
              <div className="rounded-[12px] border border-line bg-surface p-3.5 shadow-card">
                <p className="text-[13.5px] font-semibold">{name}</p>
                <p className="text-[12px] text-ink-3">{String((profile as { email?: string } | null)?.email ?? user.email ?? "")}</p>
                <Badge tone={badge.tone} className="mt-1.5">{badge.label}</Badge>
                <button
                  onClick={signOut}
                  role="menuitem"
                  className="mt-3 w-full h-9 rounded-[9px] bg-surface-2 text-[13px] font-semibold text-ink hover:bg-border transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </header>

        <main id="main" className="flex-1 min-w-0 pb-20 lg:pb-0">
          {children}
        </main>

        {/* mobile bottom nav */}
        <nav
          aria-label="Primary"
          className="lg:hidden sticky bottom-0 z-40 bg-surface/95 backdrop-blur border-t border-line no-print"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
            {items.map((it) => {
              const on = isActive(path, it.path);
              return (
                <button
                  key={it.path}
                  onClick={() => go(it.path)}
                  aria-current={on ? "page" : undefined}
                  className={`h-16 flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold cursor-pointer transition-colors ${
                    on ? "text-brand" : "text-ink-3"
                  }`}
                >
                  <span className={on ? "scale-110 transition-transform" : "transition-transform"}>{it.icon}</span>
                  {it.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

/* ---------------- public header / footer ---------------- */

export function PublicHeader() {
  const { user } = useApp();
  const [path, navigate] = useRoute();
  const scrollLanding = (id: string) => {
    if (path !== "/" && path !== "/how" && path !== "/trust") {
      navigate("/");
      window.setTimeout(() => scrollToSection(id), 90);
    } else {
      scrollToSection(id);
    }
  };
  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line/70 no-print">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between">
        <button onClick={() => navigate("/")} className="cursor-pointer" aria-label="Psychometric AI home">
          <Wordmark />
        </button>
        <nav aria-label="Public" className="flex items-center gap-2 sm:gap-5">
          <a
            href="#how"
            onClick={(e) => {
              e.preventDefault();
              scrollLanding("how");
            }}
            className="hidden sm:inline text-[13.5px] font-semibold text-ink-2 hover:text-ink transition-colors cursor-pointer"
          >
            How it works
          </a>
          <a
            href="#trust"
            onClick={(e) => {
              e.preventDefault();
              scrollLanding("trust");
            }}
            className="hidden sm:inline text-[13.5px] font-semibold text-ink-2 hover:text-ink transition-colors cursor-pointer"
          >
            Principles
          </a>
          {user ? (
            <button
              onClick={() => navigate(user.role === "admin" ? "/admin" : user.role === "parent" ? "/parent" : "/home")}
              className="h-9.5 px-4 rounded-[10px] bg-ink text-[#F3F1EA] text-[13.5px] font-semibold hover:bg-ink/85 transition-colors cursor-pointer"
            >
              Open dashboard
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("/login")}
                className="h-9.5 px-3.5 rounded-[10px] text-[13.5px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/register")}
                className="h-9.5 px-4 rounded-[10px] bg-brand text-on-brand text-[13.5px] font-semibold hover:bg-brand-strong transition-colors cursor-pointer"
              >
                Start Assessment
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const [, navigate] = useRoute();
  return (
    <footer className="mt-auto border-t border-line bg-surface no-print">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <button onClick={() => navigate("/")} className="cursor-pointer" aria-label="Home">
            <Wordmark />
          </button>
          <div className="flex items-center gap-4 text-[12.5px] font-medium text-ink-3">
            <button onClick={() => navigate("/privacy")} className="hover:text-ink transition-colors cursor-pointer">
              Privacy Policy
            </button>
            <span>·</span>
            <button onClick={() => navigate("/terms")} className="hover:text-ink transition-colors cursor-pointer">
              Terms of Use
            </button>
            <span>·</span>
            <button onClick={() => navigate("/contact")} className="hover:text-ink transition-colors cursor-pointer">
              Support
            </button>
          </div>
        </div>
        <p className="text-[12.5px] text-ink-3 text-center sm:text-right max-w-md leading-relaxed">
          Educational guidance for Grade 10 students. Results are fit indices to support
          conversations — they do not predict outcomes or define anyone.
        </p>
      </div>
    </footer>
  );
}
