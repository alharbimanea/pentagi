import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export async function configValue<T>(key: string, fallback: T): Promise<T> {
  const { data } = await adminClient().from("app_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}
