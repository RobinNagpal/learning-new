import AsyncStorage from "@react-native-async-storage/async-storage";
import { User } from "@interestled/schemas";
import type { UserT } from "@interestled/schemas";

const TOKEN_KEY = "interestled.token";
const USER_KEY = "interestled.user";
/** Where the query cache sleeps between launches. */
export const QUERY_CACHE_KEY = "interestled.queries";
/**
 * The map being set up but not yet built. Kept on disk so a build that fails —
 * or a phone put down between the form and the button — does not cost the
 * learner the seven answers they gave. Read and written in lib/mapDraft.ts.
 */
export const MAP_DRAFT_KEY = "interestled.mapDraft";

export async function readToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function writeToken(token: string | null): Promise<void> {
  if (token === null) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/**
 * The signed-in user as the server last described them, kept beside the token
 * so a launch can open on the app rather than on a spinner waiting to be told
 * who is holding the phone. Parsed on the way back in: a row written by an
 * older build that the schema no longer accepts reads as absent, which costs
 * one round trip rather than a crash.
 */
export async function readUser(): Promise<UserT | null> {
  const stored = await AsyncStorage.getItem(USER_KEY);
  if (stored === null) {
    return null;
  }
  try {
    const parsed = User.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeUser(user: UserT | null): Promise<void> {
  if (user === null) {
    await AsyncStorage.removeItem(USER_KEY);
    return;
  }
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
