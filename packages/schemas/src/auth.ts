import { z } from "zod";
import { CardDepth } from "./cards";
import { Id } from "./ids";
import { Username } from "./slugs";

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("That does not look like an email address");

/**
 * Length is the only rule. Composition rules (a digit, a symbol, a capital)
 * push people towards predictable substitutions and are not worth the friction
 * at signup — see A14, setup before starting.
 */
export const Password = z
  .string()
  .min(10, "Use at least 10 characters — a short phrase works well")
  .max(200);

export const RegisterInput = z.object({ email: Email, password: Password });
export const LoginInput = z.object({ email: Email, password: z.string().min(1) });

/** Never carries the password hash: the schema has no field to put it in. */
export const User = z.object({
  id: Id,
  email: Email,
  /**
   * How this learner is addressed in public. Allocated from the email at
   * registration and never changed; every public read is under it, and the
   * account's recordings are in a bucket folder named after it.
   */
  username: Username,
  /**
   * Where this learner's cards start — on the user rather than the topic,
   * because depth follows the person across every subject. Answered back so the
   * app can name the depth a card is being written to before it arrives.
   */
  defaultDepth: CardDepth,
  createdAt: z.coerce.date(),
});

export const AuthResult = z.object({ token: z.string().min(1), user: User });

export type EmailT = z.infer<typeof Email>;
export type RegisterInputT = z.infer<typeof RegisterInput>;
export type LoginInputT = z.infer<typeof LoginInput>;
export type UserT = z.infer<typeof User>;
export type AuthResultT = z.infer<typeof AuthResult>;
