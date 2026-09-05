import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  LoginInput,
  RegisterInput,
  User,
  emailSlug,
  newId,
  slugStem,
  uniqueSlug,
} from "@interestled/schemas";
import type { UserT } from "@interestled/schemas";
import { Prisma } from "@prisma/client";
import type { Db } from "./db";
import { UniqueViolation } from "./errors";
import { hashPassword, verifyPassword } from "./password";

export interface AuthEnv {
  /**
   * `username` is here for the same reason `defaultDepth` is: it is on the user
   * row the session already loads, it never changes, and the alternative is a
   * second lookup on a route that runs on every card view.
   */
  Variables: { userId: string; defaultDepth: number; username: string };
}

/**
 * Long enough that a learner is not signed out mid-topic, short enough that a
 * token lifted from a device stops working. Refreshed on use below.
 */
const SESSION_DAYS = 30;

function expiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function issueToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * How this account is addressed, from the address they signed up with: the
 * email minus its domain, numbered if somebody already has it.
 *
 * Allocated once, here, and never again. Two things are built on it and neither
 * survives it changing: the audio bucket is laid out by it, so a new one orphans
 * every recording, and it is what a public URL names. The server allocates it
 * for the same reason it allocates every other slug — nobody types one.
 *
 * Only the names that could actually collide are read, which is the ones
 * starting with this base rather than the whole table.
 */
async function allocateUsername(db: Db, email: string): Promise<string> {
  const base = emailSlug(email);
  // The stem rather than the base: uniqueSlug cuts a long base short before
  // numbering it, so "<58 characters>-2" does not start with the 58 characters.
  // Searching on the base would not see that row, uniqueSlug would propose the
  // same name again, and every attempt would lose on the unique index — leaving
  // that address unable to register at all.
  const taken = await db.user.findMany({
    where: { username: { startsWith: slugStem(base) } },
    select: { username: true },
  });
  return uniqueSlug(base, new Set(taken.map((row) => row.username)));
}

/**
 * How many times a registration retries a username collision.
 *
 * Two accounts registering the same base in the same instant both read the same
 * set and both propose the same name; the second insert loses on the unique
 * index. Rare, and worth catching rather than showing: "that name is taken" is
 * meaningless to somebody who never chose one, and the retry reads the row the
 * winner just wrote and numbers past it.
 */
const USERNAME_ATTEMPTS = 3;

/** Only the name is retried here. A collision on the email is a different answer. */
function usernameCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = UniqueViolation.safeParse(error.meta);
  return target.success && target.data.target.includes("username");
}

/**
 * The account, with a name of its own. Null only if three rounds of the same
 * base collided in the same instant, which is not a thing that happens — but a
 * loop that can run out has to say what it does when it has.
 */
async function createUser(db: Db, email: string, passwordHash: string): Promise<UserT | null> {
  for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt += 1) {
    try {
      const username = await allocateUsername(db, email);
      // `slug` is the column username replaced and is written here only until
      // the next schema change drops it — see the note on User in schema.prisma.
      return User.parse(
        await db.user.create({
          data: { id: newId(), email, passwordHash, username, slug: username },
        }),
      );
    } catch (error) {
      // Anything else — a taken email above all — is answered by the handler in
      // app.ts, which names the columns that actually collided.
      if (!usernameCollision(error)) {
        throw error;
      }
    }
  }
  return null;
}

export function authRouter(db: Db): Hono {
  const router = new Hono();

  router.post("/register", zValidator("json", RegisterInput), async (c) => {
    const { email, password } = c.req.valid("json");
    const existing = await db.user.findUnique({ where: { email } });
    if (existing !== null) {
      // Deliberately explicit: hiding it here just moves the discovery to the
      // login screen, and the address is the account name people will retry.
      return c.json({ error: "That email already has an account — sign in instead" }, 409);
    }
    const user = await createUser(db, email, await hashPassword(password));
    if (user === null) {
      return c.json({ error: "Could not create that account — try again" }, 409);
    }
    const token = issueToken();
    await db.authSession.create({ data: { token, userId: user.id, expiresAt: expiry() } });
    return c.json({ token, user }, 201);
  });

  router.post("/login", zValidator("json", LoginInput), async (c) => {
    const { email, password } = c.req.valid("json");
    // The one deliberate opt-out from the global passwordHash omit.
    const user = await db.user.findUnique({ where: { email }, omit: { passwordHash: false } });
    // Verify even when the user is missing, so a wrong address and a wrong
    // password take the same time and cannot be told apart by timing.
    const stored = user?.passwordHash ?? "scrypt$32768$8$1$aaaa$bbbb";
    const ok = await verifyPassword(password, stored);
    if (user === null || !ok) {
      return c.json({ error: "Wrong email or password" }, 401);
    }
    const token = issueToken();
    await db.authSession.create({ data: { token, userId: user.id, expiresAt: expiry() } });
    // Opportunistic cleanup: this login is a natural moment to drop the rows
    // this user has already let lapse, so nothing has to sweep the table.
    await db.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
    return c.json({ token, user: User.parse(user) });
  });

  return router;
}

export function requireAuth(db: Db): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") === true ? header.slice("Bearer ".length) : null;
    const session =
      token === null
        ? null
        : await db.authSession.findUnique({ where: { token }, include: { user: true } });
    if (session === null) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await db.authSession.delete({ where: { token: session.token } }).catch(() => undefined);
      return c.json({ error: "Your session has expired — sign in again" }, 401);
    }
    c.set("userId", session.userId);
    c.set("defaultDepth", session.user.defaultDepth);
    c.set("username", session.user.username);
    await next();
  };
}

export function sessionRouter(db: Db): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();

  router.get("/me", async (c) => {
    const user = await db.user.findUnique({ where: { id: c.get("userId") } });
    if (user === null) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json(User.parse(user));
  });

  router.post("/logout", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    await db.authSession.deleteMany({ where: { token: header.slice("Bearer ".length) } });
    return c.body(null, 204);
  });

  return router;
}
