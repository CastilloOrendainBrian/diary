import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth as authApi, type CurrentUser, type SessionResponse } from "../services/endpoints";
import { ApiError } from "../services/http";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: CurrentUser; permissions: ReadonlySet<string> };

interface AuthValue {
  state: AuthState;
  /** True when the signed-in user holds the permission. */
  can: (permission: string) => boolean;
  /** Stores a session returned by sign-in or profile updates. */
  setSession: (session: SessionResponse) => void;
  /** Reloads the current user from the server. */
  refresh: () => Promise<void>;
  /** Ends the session on the server and forgets the user locally. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const setSession = useCallback((session: SessionResponse) => {
    setState({
      status: "authenticated",
      user: session.user,
      permissions: new Set(session.permissions),
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setSession(await authApi.me());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "anonymous" });
        return;
      }
      throw error;
    }
  }, [setSession]);

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((session) => {
        if (active) setSession(session);
      })
      .catch(() => {
        if (active) setState({ status: "anonymous" });
      });
    return () => {
      active = false;
    };
  }, [setSession]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ status: "anonymous" });
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      state,
      can: (permission) => state.status === "authenticated" && state.permissions.has(permission),
      setSession,
      refresh,
      signOut,
    }),
    [state, setSession, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/** The signed-in user. Only valid below RequireAuth, which guarantees a session. */
export function useCurrentUser(): CurrentUser {
  const { state } = useAuth();
  if (state.status !== "authenticated") throw new Error("No authenticated user");
  return state.user;
}
