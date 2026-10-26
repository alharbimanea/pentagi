import "server-only";
import { serverEnv } from "@/lib/env";
import { redact } from "@/lib/ai/redact";

export interface IntakeForAi {
  service: string;
  title: string;
  discipline: string | null;
  intendedUse: string | null;
  scope: string | null;
  methodology: string | null;
  citationStyle: string | null;
  quantity: number | null;
  deadline: string | null;
  instructions: string | null;
}

export function aiConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL);
}

const SYSTEM = `You help the owner of a research-support practice triage incoming requests.
Write for the owner, never for the customer. Output plain text with three short sections:
SUMMARY (3 sentences max), MISSING OR UNCLEAR (bullets), RISKS (bullets: integrity, feasibility, deadline).
Flag any sign that the customer wants assessed work written for submission under their name.
Do not propose a price, do not promise a deadline, and do not invent facts not in the request.`;

// Draft only: the result is stored as an internal note labelled as AI output
// and changes nothing about the order.
export async function summarizeIntake(intake: IntakeForAi): Promise<string> {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw new Error("AI assistance is not configured");
  const fields = Object.entries(intake)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}: ${redact(String(v)).slice(0, 4000)}`)
    .join("\n");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL, instructions: SYSTEM, input: fields, store: false, max_output_tokens: 600 }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI request failed with HTTP ${res.status}`);
  const json = (await res.json()) as { output_text?: string; output?: Array<{ content?: Array<{ type: string; text?: string }> }> };
  const text =
    json.output_text ??
    json.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("\n") ??
    "";
  return text.trim().slice(0, 8000);
}
