import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: flag,
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ResearchDesk Pro <no-reply@example.com>"),
  SUPPORT_EMAIL: z.string().email().default("support@example.com"),
  CRON_SECRET: z.string().min(24).optional(),
  IP_HASH_SALT: z.string().min(16).default("change-me-in-production"),
  CLAMAV_REST_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  PAYMENTS_SANDBOX_ENABLED: flag,
  SANDBOX_WEBHOOK_SECRET: z.string().min(24).optional(),
  MOYASAR_SECRET_KEY: z.string().optional(),
  MOYASAR_PUBLISHABLE_KEY: z.string().optional(),
  MOYASAR_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${fields}`);
    }
    cached = parsed.data;
    if (cached.NODE_ENV === "production" && cached.PAYMENTS_SANDBOX_ENABLED) {
      throw new Error("PAYMENTS_SANDBOX_ENABLED must be false in production");
    }
  }
  return cached;
}

export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  googleAuthEnabled: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
};
