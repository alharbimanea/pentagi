import { z } from "zod";

// bcrypt (used by Supabase Auth) hashes at most 72 bytes; anything longer
// would be silently truncated, so the limit is on UTF-8 bytes, not characters.
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSPHRASE_MIN_LENGTH = 16;
export const PASSWORD_SPECIALS = "!@#$&*";

export type PasswordProblem = "too_short" | "too_long" | "needs_classes";

export function checkPassword(password: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "too_long";
  if (length >= PASSPHRASE_MIN_LENGTH) return null;
  const ok =
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$&*]/.test(password);
  return ok ? null : "needs_classes";
}

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const problem = checkPassword(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
