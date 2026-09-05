import { z } from "zod";
import {
  Atom,
  AuthResult,
  CardContent,
  CardQuestion,
  CardSettings,
  Drill,
  LearningNode,
  MapPlanView,
  NodeAudioResult,
  NodeAudioView,
  NodeStatusSchema,
  Profile,
  ResumePoint,
  StudySession,
  Topic,
  TopicContentSettings,
  User,
  Verdict,
} from "@interestled/schemas";
import type {
  AtomT,
  AttemptInputT,
  CardQuestionT,
  CardSettingsT,
  DrillKind,
  DrillT,
  LearningNodeT,
  LoginInputT,
  MapPlanViewT,
  MoveDirection,
  NodeAudioT,
  NodeStatus,
  ProfileT,
  ProfileUpdateInputT,
  RegisterInputT,
  ReviewInputT,
  MapShapeT,
  ParagraphLength,
  TopicContentSettingsT,
  TopicContentSettingsInputT,
  TopicCreateInputT,
  TopicInfoInputT,
  TopicQuestionsInputT,
  TopicRegenerateInputT,
  TopicT,
} from "@interestled/schemas";

export interface ClientConfig {
  /** API origin, no trailing slash. */
  baseUrl: string;
  getToken: () => string | null;
  /** Called on any 401 so the app can drop a session the server has forgotten. */
  onUnauthorized?: () => void;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The topic a failed build left behind, when the failure was one.
     *
     * Creating a topic writes the row before it generates the map, so a build
     * that fails has already made one — and a client that only knew the message
     * would answer "try again" by creating a second topic, and a third. With
     * the slug it rebuilds the one that is there, which is also the row the
     * seven answers are linked to.
     */
    readonly topicSlug?: string,
  ) {
    super(message);
  }
}

const ErrorBody = z.object({ error: z.string(), topicSlug: z.string().optional() });

/** Sends the request and throws on anything that is not a 2xx. */
async function send(
  config: ClientConfig,
  path: string,
  method: string,
  body?: object,
): Promise<Response> {
  const token = config.getToken();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 401) {
    config.onUnauthorized?.();
  }
  if (!response.ok) {
    const parsed = ErrorBody.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error : `Request failed (${response.status})`,
      parsed.success ? parsed.data.topicSlug : undefined,
    );
  }
  return response;
}

/** A call whose body is parsed. */
async function request<T>(
  config: ClientConfig,
  path: string,
  method: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  body?: object,
): Promise<T> {
  return schema.parse(await (await send(config, path, method, body)).json());
}

/**
 * A call with no response body. Separate from request rather than passing a
 * null schema, which would need a cast to produce a T out of nothing.
 */
async function requestVoid(
  config: ClientConfig,
  path: string,
  method: string,
  body?: object,
): Promise<void> {
  await send(config, path, method, body);
}

const Progress = z.object({
  total: z.number(),
  earned: z.number(),
  shaky: z.number(),
  capabilities: z.array(z.string()),
  remainingMinutes: z.number(),
});

const NodeRef = z.object({ id: z.string(), title: z.string(), minutes: z.number() });

export const TopicDetail = z.object({
  topic: Topic,
  nodes: z.array(LearningNode),
  progress: Progress,
  resume: ResumePoint.nullable(),
});

export const CardView = z.object({
  node: LearningNode,
  /** What this card was actually written to, which is what the controls show. */
  settings: CardSettings,
  /**
   * What a plain open of this node writes to now. Where it differs from
   * `settings`, the settings have moved since this card was written — and
   * nothing is written again until the learner asks.
   */
  defaults: CardSettings,
  content: CardContent,
  missingPrerequisites: z.array(NodeRef),
});

export const AttemptResult = z.object({
  // Verdict, not z.custom: a custom schema with no validator accepts anything,
  // which is the one thing parsing at the boundary is supposed to prevent.
  attempt: z.object({ id: z.string(), verdict: Verdict }),
  status: NodeStatusSchema,
  capability: z.string(),
});

const MapInstructions = z.object({ mapInstructions: z.string() });
const ContentInstructions = z.object({ contentInstructions: z.string() });

export const ReviewBatch = z.object({ atoms: z.array(Atom), dueCount: z.number() });

export const SessionPlan = z.object({
  session: StudySession,
  contract: z.string(),
  steps: z.array(z.object({ kind: z.string(), nodeId: z.string(), minutes: z.number() })),
});

export const SessionSummaryView = z.object({
  session: StudySession,
  capabilities: z.array(z.string()),
  gotWrong: z.array(z.string()),
  nextNodes: z.array(NodeRef),
});

export type TopicDetailT = z.infer<typeof TopicDetail>;
export type CardViewT = z.infer<typeof CardView>;
export type AttemptResultT = z.infer<typeof AttemptResult>;
export type ReviewBatchT = z.infer<typeof ReviewBatch>;
export type SessionPlanT = z.infer<typeof SessionPlan>;
export type SessionSummaryViewT = z.infer<typeof SessionSummaryView>;

/** Every call the app can make. One place, so the surface stays visible. */
export interface ApiClient {
  register(input: RegisterInputT): Promise<z.infer<typeof AuthResult>>;
  login(input: LoginInputT): Promise<z.infer<typeof AuthResult>>;
  logout(): Promise<void>;
  me(): Promise<z.infer<typeof User>>;

  getProfile(): Promise<ProfileT>;
  updateProfile(input: ProfileUpdateInputT): Promise<ProfileT>;

  listTopics(): Promise<TopicT[]>;
  /**
   * The seven questions asked before a map is built — one for a topic that does
   * not exist yet, one for a rebuild of a topic that does. Both cost a model
   * call, so both are mutations rather than queries: nothing here refetches.
   */
  mapQuestions(input: TopicCreateInputT): Promise<MapPlanViewT>;
  topicMapQuestions(slug: string, input: TopicQuestionsInputT): Promise<MapPlanViewT>;
  createTopic(input: TopicCreateInputT): Promise<TopicT>;
  /** Every topic call is keyed by slug, because that is what the URL carries. */
  getTopic(slug: string): Promise<TopicDetailT>;
  regenerateTopic(slug: string, input: TopicRegenerateInputT): Promise<TopicT>;
  deleteTopic(slug: string): Promise<void>;

  /** What the topic is and what the learner wants from it. Generates nothing. */
  updateTopicInfo(slug: string, input: TopicInfoInputT): Promise<TopicT>;
  /**
   * How the topic is written. The server drops the cards already generated for
   * it, so the next open of a node writes it under the new settings.
   */
  updateTopicContentSettings(slug: string, input: TopicContentSettingsInputT): Promise<TopicT>;
  /** The defaults a topic falls back to, so the settings screens can show them. */
  getTopicDefaults(): Promise<TopicContentSettingsT>;
  /**
   * The instruction lines a set of shape settings seeds. Rendered server-side
   * from the same prompt file the map is built with, so the box on the screen
   * shows the sentence the model will actually be sent.
   */
  seedMapInstructions(shape: MapShapeT): Promise<string>;
  /** The same, for the lines a card is written to. */
  seedContentInstructions(paragraphLength: ParagraphLength): Promise<string>;

  /** The three map edits. Each answers with the whole map, already rebuilt. */
  regenerateNode(slug: string, nodeId: string, instructions: string): Promise<TopicDetailT>;
  moveNode(slug: string, nodeId: string, direction: MoveDirection): Promise<TopicDetailT>;
  deleteNode(slug: string, nodeId: string): Promise<TopicDetailT>;

  /**
   * One card. `rewrite` asks for it to be written again at the settings it
   * already has rather than read from the cache — the one call that costs a
   * model call every time it is made, so it is a separate argument rather than
   * another setting: it is not something the card was written to, and it must
   * not end up in a cache key as though it were.
   */
  getCard(
    nodeId: string,
    settings?: Partial<CardSettingsT>,
    options?: { rewrite?: boolean },
  ): Promise<CardViewT>;
  /**
   * What the learner wants for this node's card in particular. Saved on the
   * node and nothing written: the card is written again only when asked.
   */
  saveCardInstructions(nodeId: string, instructions: string): Promise<LearningNodeT>;
  /** Everything asked on this card, oldest first. */
  listQuestions(nodeId: string): Promise<CardQuestionT[]>;
  /** One question, answered against the card the learner is reading, and kept. */
  askQuestion(nodeId: string, question: string): Promise<CardQuestionT>;
  /**
   * The recording of the card on screen, or null when there is not one yet.
   * Cheap — no model call and nothing written — but never cached for long: the
   * URL it carries is signed and expires.
   */
  getNodeAudio(nodeId: string, settings: CardSettingsT): Promise<NodeAudioT | null>;
  /**
   * Read this card out and keep it. The most expensive call in the product, so
   * it is a mutation the learner sets off by pressing a button and nothing can
   * refetch. A card already recorded comes back from the bucket rather than
   * being made again.
   */
  createNodeAudio(nodeId: string, settings: CardSettingsT): Promise<NodeAudioT>;
  getDrill(nodeId: string, kind?: DrillKind): Promise<DrillT>;
  submitAttempt(input: AttemptInputT): Promise<AttemptResultT>;
  setNodeStatus(nodeId: string, status: NodeStatus): Promise<LearningNodeT>;

  getReview(): Promise<ReviewBatchT>;
  gradeReview(input: ReviewInputT): Promise<void>;

  startSession(topicId: string, minutes: number): Promise<SessionPlanT>;
  endSession(sessionId: string): Promise<SessionSummaryViewT>;
  saveResume(input: {
    topicId: string;
    nodeId: string;
    drillId: string | null;
    draft: string;
    lastThought: string;
  }): Promise<void>;
}

/**
 * Which card a recording is of, as the card route answered it.
 *
 * Every field, unlike the card query, which sends only what the learner
 * overrode: this is not asking for a card to be written to some settings, it is
 * naming the one already on screen, and a field left out would name a different
 * one. `instructions` is absent because it is not in the cache key — the server
 * reads it off the node.
 */
function audioQuery(settings: CardSettingsT): string {
  return new URLSearchParams({
    depth: String(settings.depth),
    minutes: String(settings.minutes),
    englishLevel: settings.englishLevel,
    technicalDetail: settings.technicalDetail,
    format: settings.format,
    paragraphLength: settings.paragraphLength,
    angle: settings.angle,
  }).toString();
}

export function createApiClient(config: ClientConfig): ApiClient {
  const get = <T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> =>
    request(config, path, "GET", schema);
  const post = <T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: object,
  ): Promise<T> => request(config, path, "POST", schema, body);

  return {
    register: (input) => post("/api/auth/register", AuthResult, input),
    login: (input) => post("/api/auth/login", AuthResult, input),
    logout: () => requestVoid(config, "/api/auth/session/logout", "POST"),
    me: () => get("/api/auth/session/me", User),

    getProfile: () => get("/api/profile", Profile),
    updateProfile: (input) => request(config, "/api/profile", "PUT", Profile, input),

    listTopics: () => get("/api/topics", z.array(Topic)),
    mapQuestions: (input) => post("/api/topics/questions", MapPlanView, input),
    topicMapQuestions: (slug, input) =>
      post(`/api/topics/${encodeURIComponent(slug)}/questions`, MapPlanView, input),
    createTopic: (input) => post("/api/topics", Topic, input),
    getTopic: (slug) => get(`/api/topics/${encodeURIComponent(slug)}`, TopicDetail),
    regenerateTopic: (slug, input) =>
      post(`/api/topics/${encodeURIComponent(slug)}/regenerate`, Topic, input),
    deleteTopic: (slug) => requestVoid(config, `/api/topics/${encodeURIComponent(slug)}`, "DELETE"),

    updateTopicInfo: (slug, input) =>
      request(config, `/api/topics/${encodeURIComponent(slug)}/info`, "PUT", Topic, input),
    updateTopicContentSettings: (slug, input) =>
      request(
        config,
        `/api/topics/${encodeURIComponent(slug)}/content-settings`,
        "PUT",
        Topic,
        input,
      ),
    getTopicDefaults: () => get("/api/topics/defaults", TopicContentSettings),
    seedMapInstructions: async (shape) =>
      (await post("/api/topics/map-instructions", MapInstructions, shape)).mapInstructions,
    seedContentInstructions: async (paragraphLength) =>
      (await post("/api/topics/content-instructions", ContentInstructions, { paragraphLength }))
        .contentInstructions,

    regenerateNode: (slug, nodeId, instructions) =>
      post(`/api/topics/${encodeURIComponent(slug)}/nodes/${nodeId}/regenerate`, TopicDetail, {
        instructions,
      }),
    moveNode: (slug, nodeId, direction) =>
      request(config, `/api/topics/${encodeURIComponent(slug)}/nodes/${nodeId}/move`, "PUT", TopicDetail, {
        direction,
      }),
    deleteNode: (slug, nodeId) =>
      request(config, `/api/topics/${encodeURIComponent(slug)}/nodes/${nodeId}`, "DELETE", TopicDetail),

    getCard: (nodeId, settings, options) => {
      // Only what the learner actually changed: an empty query is the plain
      // card, written to the topic's own settings.
      const query = new URLSearchParams();
      if (settings?.depth !== undefined) {
        query.set("depth", String(settings.depth));
      }
      if (settings?.minutes !== undefined) {
        query.set("minutes", String(settings.minutes));
      }
      if (settings?.englishLevel !== undefined) {
        query.set("englishLevel", settings.englishLevel);
      }
      if (settings?.technicalDetail !== undefined) {
        query.set("technicalDetail", settings.technicalDetail);
      }
      if (settings?.format !== undefined) {
        query.set("format", settings.format);
      }
      if (settings?.paragraphLength !== undefined) {
        query.set("paragraphLength", settings.paragraphLength);
      }
      if (settings?.angle !== undefined) {
        query.set("angle", settings.angle);
      }
      if (options?.rewrite === true) {
        query.set("rewrite", "1");
      }
      const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
      return get(`/api/nodes/${nodeId}/card${suffix}`, CardView);
    },
    saveCardInstructions: (nodeId, instructions) =>
      request(config, `/api/nodes/${nodeId}/card-instructions`, "PUT", LearningNode, {
        instructions,
      }),
    listQuestions: (nodeId) => get(`/api/nodes/${nodeId}/questions`, z.array(CardQuestion)),
    askQuestion: (nodeId, question) =>
      post(`/api/nodes/${nodeId}/questions`, CardQuestion, { question }),
    getNodeAudio: async (nodeId, settings) =>
      (await get(`/api/nodes/${nodeId}/audio?${audioQuery(settings)}`, NodeAudioView)).audio,
    createNodeAudio: async (nodeId, settings) =>
      (await post(`/api/nodes/${nodeId}/audio?${audioQuery(settings)}`, NodeAudioResult)).audio,
    getDrill: (nodeId, kind) =>
      get(`/api/nodes/${nodeId}/drill${kind === undefined ? "" : `?kind=${kind}`}`, Drill),
    submitAttempt: (input) => post("/api/nodes/attempts", AttemptResult, input),
    setNodeStatus: (nodeId, status) =>
      request(config, `/api/nodes/${nodeId}/status`, "PUT", LearningNode, { status }),

    getReview: () => get("/api/review", ReviewBatch),
    gradeReview: (input) => requestVoid(config, "/api/review", "POST", input),

    startSession: (topicId, minutes) => post("/api/sessions", SessionPlan, { topicId, minutes }),
    endSession: (sessionId) => post(`/api/sessions/${sessionId}/end`, SessionSummaryView),
    saveResume: (input) => requestVoid(config, "/api/sessions/resume", "PUT", input),
  };
}

export type { AtomT, CardQuestionT, DrillT, LearningNodeT, ProfileT, TopicT };
