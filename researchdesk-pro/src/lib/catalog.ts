import "server-only";
import type { PricedService, PricingRule } from "@/lib/pricing/engine";
import { serverClient } from "@/lib/supabase/server";

export interface ServiceRow extends PricedService {
  slug: string;
  category: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  revisions_included: number;
  active: boolean;
  sort_order: number;
}

export interface RuleRow extends PricingRule {
  id: string;
  label_en: string;
  label_ar: string;
  sort_order: number;
}

export async function getServices(includeInactive = false): Promise<ServiceRow[]> {
  const supabase = await serverClient();
  let query = supabase.from("services").select("*").order("sort_order");
  if (!includeInactive) query = query.eq("active", true);
  const { data } = await query;
  return ((data ?? []) as ServiceRow[]).map((s) => ({
    ...s,
    base_price_sar: Number(s.base_price_sar),
    base_price_usd: Number(s.base_price_usd),
    min_price_sar: Number(s.min_price_sar),
    min_price_usd: Number(s.min_price_usd),
  }));
}

export async function getRules(includeInactive = false): Promise<RuleRow[]> {
  const supabase = await serverClient();
  let query = supabase.from("pricing_rules").select("*").order("kind").order("sort_order");
  if (!includeInactive) query = query.eq("active", true);
  const { data } = await query;
  return ((data ?? []) as RuleRow[]).map((r) => ({
    ...r,
    multiplier: r.multiplier === null ? null : Number(r.multiplier),
    flat_sar: r.flat_sar === null ? null : Number(r.flat_sar),
    flat_usd: r.flat_usd === null ? null : Number(r.flat_usd),
  }));
}
