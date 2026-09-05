import { Hono } from "hono";
import { cors } from "hono/cors";
import { Prisma } from "@prisma/client";
import type { TextTask } from "@interestled/schemas";
import { authRouter, requireAuth, sessionRouter } from "./auth";
import type { AuthEnv } from "./auth";
import type { Db } from "./db";
import { ConflictError, GenerationError, NotFoundError, UniqueViolation } from "./errors";
import { learningRouter } from "./learning";
import type { Background } from "./narration";
import { createProvider, createSpeechProvider } from "./llm";
import type { LlmProvider, SpeechProvider } from "./llm";
import { profileRouter } from "./profile";
import { publicRouter } from "./public";
import { reviewRouter } from "./review";
import { sessionsRouter } from "./sessions";
import { createObjectStore } from "./storage";
import type { ObjectStore } from "./storage";
import { topicsRouter } from "./topics";

function uniqueMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const parsed = UniqueViolation.safeParse(error.meta);
  return parsed.success
    ? `That ${parsed.data.target.join(" and ")} is already taken`
    : "That value is already taken";
}

/**
 * Which sites' pages may call this API from a browser.
 *
 * **Production configuration, not a local-development convenience.** The web app
 * is served from the site and calls this host directly rather than through
 * CloudFront — the edge gives an origin sixty seconds and a map takes longer
 * than that often enough to matter — so every call the website makes is
 * cross-origin. With `ALLOWED_ORIGINS` unset the deployed app is refused every
 * request, and the fallback below is only any use on a laptop.
 *
 * Defaulting to "*" instead would let any site on the internet drive this API,
 * which matters more than usual when every generation call costs money.
 */
function allowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGINS;
  if (configured !== undefined && configured.trim() !== "") {
    return configured.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  }
  return ["http://localhost:7070", "http://localhost:8081"];
}

export interface AppOptions {
  /**
   * Built lazily and once per task: a missing API key must fail the request that
   * needed the model, not stop the server from serving anything at all. The task
   * is what picks the model, so a map and a card can be answered by two.
   */
  provider?: (task: TextTask) => LlmProvider;
  /**
   * The one that reads a card out, and the bucket the recording goes in. Both
   * lazy for the same reason and one more: neither is configured on a local
   * checkout, and a deployment with no AUDIO_BUCKET is one with the play button
   * off rather than one that cannot start.
   */
  speech?: () => SpeechProvider;
  objects?: () => ObjectStore;
  /**
   * Where work that outlives its request goes.
   *
   * Reading a card out is minutes of synthesis, and the edge gives an origin
   * sixty seconds — so the press claims the run and answers, and the run carries
   * on here. The default drops the promise on the event loop, with a catch,
   * because an unhandled rejection on a host shared with another application is
   * a two-application outage.
   *
   * It is a seam rather than a bare `void`: a test needs to await the run it
   * just started, and one day a graceful shutdown will want to as well.
   */
  background?: Background;
}

/** Built on the first call that needs it, and kept for the rest of the process. */
function once<T>(build: () => T): () => T {
  let value: T | null = null;
  return () => (value ??= build());
}

export function createApp(db: Db, options: AppOptions = {}): Hono {
  const app = new Hono();
  const cached = new Map<TextTask, LlmProvider>();
  const provider =
    options.provider ??
    ((task: TextTask): LlmProvider => {
      const existing = cached.get(task);
      if (existing !== undefined) {
        return existing;
      }
      const built = createProvider(task);
      cached.set(task, built);
      return built;
    });
  const speech = options.speech ?? once(createSpeechProvider);
  const objects = options.objects ?? once(createObjectStore);
  const background =
    options.background ??
    ((task: Promise<void>) => {
      // runNarration writes its own failures to the row it claimed; this is the
      // net under that, for the case where even that write fails.
      void task.catch((error: unknown) => console.error("background task failed", error));
    });

  const origins = allowedOrigins();
  app.use(
    "*",
    cors({
      origin: (origin) => (origins.includes(origin) ? origin : null),
      // Every call carries an Authorization header, which makes every one of
      // them preflighted. Without a max-age the browser asks again before each
      // request — two round trips to the other side of the world for every card
      // — and Chrome's own cap is two hours, so this is the number it uses.
      maxAge: 7200,
    }),
  );
  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/api/auth", authRouter(db));

  /**
   * Public reads, addressed by username. Registered before the authenticated
   * sub-app because that one is mounted on "/api" and its middleware would
   * otherwise answer these with a 401.
   *
   * It is handed no provider, which is not an omission: nothing under here may
   * generate, or reading somebody's map would spend their model budget. See
   * public.ts for what is public and what is not.
   */
  app.route("/api/u", publicRouter(db, objects));

  const authed = new Hono<AuthEnv>();
  authed.use("*", requireAuth(db));
  authed.route("/auth/session", sessionRouter(db));
  authed.route("/profile", profileRouter(db));
  authed.route("/topics", topicsRouter(db, provider));
  authed.route("/nodes", learningRouter(db, provider, speech, objects, background));
  authed.route("/review", reviewRouter(db));
  authed.route("/sessions", sessionsRouter(db));
  app.route("/api", authed);

  app.onError((error, c) => {
    if (error instanceof ConflictError) {
      return c.json({ error: error.message }, 409);
    }
    if (error instanceof NotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    // 502: the model is an upstream dependency, and the message is written to be
    // shown to the learner rather than swallowed into a generic failure.
    if (error instanceof GenerationError) {
      return c.json({ error: error.message }, 502);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return c.json({ error: uniqueMessage(error) }, 409);
      }
      if (error.code === "P2003") {
        return c.json({ error: "That row points at something that does not exist" }, 400);
      }
      if (error.code === "P2025") {
        return c.json({ error: "Row not found" }, 404);
      }
    }
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
