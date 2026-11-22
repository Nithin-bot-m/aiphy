"use client";

/**
 * App-wide session + routing + toast state.
 * Session lives in sessionStorage (survives refresh, per-tab); the token is
 * never placed in localStorage and never logged. On 401 the app routes to a
 * friendly session-expired state — no technical details are exposed.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ApiError, getToken, setToken, SESSION_EXPIRED_EVENT } from "./api";
import type { Role } from "./types";

export interface SessionUser {
  id: number;
  role: Role;
  email: string | null;
  phone: string | null;
}

export interface Toast {
  id: number;
  tone: "info" | "success" | "warn" | "bad";
  message: string;
}

interface AppState {
  booted: boolean;
  user: SessionUser | null;
  profile: Record<string, unknown> | null;
  /** true when a 401 just ended the session (so we can show why). */
  sessionExpired: boolean;
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  signIn: (identifier: string, password: string) => Promise<SessionUser>;
  signInWithOtp: (phone: string, otp: string) => Promise<SessionUser>;
  signUp: (body: Record<string, unknown>) => Promise<SessionUser>;
  signOut: () => void;
  refreshProfile: () => Promise<void>;
  clearSessionExpired: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

/* ---------------- hash router ---------------- */

export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  const h = window.location.hash.replace(/^#/, "");
  return h === "" ? "/" : h;
}

export function useRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState("/");
  useEffect(() => {
    const sync = () => setPath(currentPath());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const navigate = useCallback((to: string) => {
    if (currentPath() === to) return;
    window.location.hash = to;
    window.scrollTo({ top: 0 });
  }, []);
  return [path, navigate];
}

/* ---------------- provider ---------------- */

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(1);

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = toastSeq.current++;
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const adoptSession = useCallback(
    (me: { user: { id: number; role: string; email: string | null; phone: string | null }; profile: Record<string, unknown> }) => {
      setUser({
        id: me.user.id,
        role: me.user.role as Role,
        email: me.user.email,
        phone: me.user.phone,
      });
      setProfile(me.profile ?? null);
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    try {
      const me = await api.auth.me();
      adoptSession(me as { user: { id: number; role: string; email: string | null; phone: string | null }; profile: Record<string, unknown> });
    } catch {
      /* keep current state; 401 path handles expiry */
    }
  }, [adoptSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (token) {
        try {
          const me = await api.auth.me();
          if (!cancelled) adoptSession(me as Parameters<typeof adoptSession>[0]);
        } catch (err) {
          setToken(null);
          if (err instanceof ApiError && err.status !== 0 && !cancelled) {
            /* token invalid — start clean */
          }
        }
      }
      if (!cancelled) setBooted(true);
    })();
    const onExpired = () => {
      setToken(null);
      setUser(null);
      setProfile(null);
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [adoptSession]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.auth.login(identifier, password);
      setToken(res.token);
      const me = await api.auth.me();
      adoptSession(me as Parameters<typeof adoptSession>[0]);
      return { id: me.user.id, email: me.user.email, phone: me.user.phone, role: me.user.role } as SessionUser;
    },
    [adoptSession]
  );

  const signInWithOtp = useCallback(
    async (phone: string, otp: string) => {
      const res = await api.auth.verifyOtp(phone, otp);
      setToken(res.token);
      const me = await api.auth.me();
      adoptSession(me as Parameters<typeof adoptSession>[0]);
      return { id: me.user.id, email: me.user.email, phone: me.user.phone, role: me.user.role } as SessionUser;
    },
    [adoptSession]
  );

  const signUp = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await api.auth.register(body);
      setToken(res.token);
      const me = await api.auth.me();
      adoptSession(me as Parameters<typeof adoptSession>[0]);
      return { id: me.user.id, email: me.user.email, phone: me.user.phone, role: me.user.role } as SessionUser;
    },
    [adoptSession]
  );

  const signOut = useCallback(() => {
    api.auth.logout().catch(() => undefined);
    setToken(null);
    setUser(null);
    setProfile(null);
    setSessionExpired(false);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      booted,
      user,
      profile,
      sessionExpired,
      toasts,
      pushToast,
      dismissToast,
      signIn,
      signInWithOtp,
      signUp,
      signOut,
      refreshProfile,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [booted, user, profile, sessionExpired, toasts, pushToast, dismissToast, signIn, signInWithOtp, signUp, signOut, refreshProfile]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------------- data hook ---------------- */

export interface AsyncData<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Standard fetch-state helper for views: loading skeleton / error state / data.
 *  State updates happen only in promise callbacks (never synchronously inside
 *  the effect body), so reloads keep the previous data on screen instead of
 *  flashing a skeleton. Remount-free refresh via `reload()`. */
export function useAsyncData<T>(fn: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fn()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
