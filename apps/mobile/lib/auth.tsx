import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@interestled/api";
import type { ApiClient } from "@interestled/api";
import type { LoginInputT, RegisterInputT, UserT } from "@interestled/schemas";
import { API_URL } from "./config";
import { clearMapDraft } from "./mapDraft";
import { queryPersister } from "./queryPersister";
import { readToken, readUser, writeToken, writeUser } from "./storage";

interface AuthState {
  ready: boolean;
  user: UserT | null;
  client: ApiClient;
  register: (input: RegisterInputT) => Promise<void>;
  signIn: (input: LoginInputT) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserT | null>(null);
  const queryClient = useQueryClient();
  // A ref, not state: the client reads the token on every request and must not
  // be rebuilt (and so invalidate every query) each time it changes.
  const token = useRef<string | null>(null);

  const clearSession = useCallback((): void => {
    token.current = null;
    setUser(null);
    void writeToken(null);
    void writeUser(null);
    // The QueryClient outlives the session, so without this the next person to
    // sign in on this device sees the previous one's cached topics and answers.
    // The copy on disk goes with it, rather than waiting for the throttled
    // write that would otherwise carry the empty cache there a second later.
    queryClient.clear();
    void queryPersister.removeClient();
    // The map somebody was part way through setting up is what they typed, and
    // it outlives a session by design — so the session ending is what ends it.
    clearMapDraft();
  }, [queryClient]);

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        getToken: () => token.current,
        onUnauthorized: clearSession,
      }),
    [clearSession],
  );

  const remember = useCallback(async (next: UserT): Promise<void> => {
    setUser(next);
    await writeUser(next);
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await readToken();
      if (stored === null) {
        setReady(true);
        return;
      }
      token.current = stored;
      // A token on disk is a session until the server says otherwise, so the
      // app opens on the last user it was told about rather than on a spinner:
      // the round trip that confirms them runs behind the first screen, and a
      // token the server has forgotten resolves to signed-out through
      // onUnauthorized, so a stale one never strands anybody on the app either.
      // With no user on disk (an older build's session) the confirmation is
      // waited for, as it always was.
      const known = await readUser();
      if (known !== null) {
        setUser(known);
        setReady(true);
      }
      await client
        .me()
        .then(remember)
        .catch(() => undefined);
      setReady(true);
    })();
  }, [client, remember]);

  const adopt = useCallback(
    async (result: { token: string; user: UserT }): Promise<void> => {
      // A sign-in starts from an empty cache and an empty draft. Both are
      // cleared on sign-out too, but a sign-out cut off before those writes
      // landed would otherwise hand the next person the last one's map — and,
      // for the draft, the sentences they typed about themselves.
      queryClient.clear();
      clearMapDraft();
      token.current = result.token;
      await writeToken(result.token);
      await remember(result.user);
    },
    [queryClient, remember],
  );

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      client,
      register: async (input) => adopt(await client.register(input)),
      signIn: async (input) => adopt(await client.login(input)),
      signOut: async () => {
        await client.logout().catch(() => undefined);
        clearSession();
      },
    }),
    [ready, user, client, adopt, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return value;
}
