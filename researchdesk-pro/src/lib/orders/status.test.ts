import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nextStatuses, ORDER_STATUSES, type OrderStatus } from "@/lib/orders/status";

const sql = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20261026000002_functions.sql", import.meta.url)), "utf8");

function sqlPairs(actor: "customer" | "admin"): string[] {
  const block = new RegExp(`when '${actor}' then \\(p_from, p_to\\) in \\(([\\s\\S]*?)\\)\\s*\\n\\s*when|when '${actor}' then \\(p_from, p_to\\) in \\(([\\s\\S]*?)\\)\\s*\\n\\s*else`).exec(sql);
  const body = block?.[1] ?? block?.[2] ?? "";
  return [...body.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
}

function tsPairs(actor: "customer" | "admin"): string[] {
  return ORDER_STATUSES.flatMap((from: OrderStatus) => nextStatuses(actor, from).map((to) => `${from}>${to}`)).sort();
}

describe("order status transitions", () => {
  it.each(["customer", "admin"] as const)("the UI map for %s matches order_transition_allowed", (actor) => {
    const fromSql = sqlPairs(actor);
    expect(fromSql.length).toBeGreaterThan(5);
    expect(tsPairs(actor)).toEqual(fromSql);
  });

  it("never lets a customer or admin set paid or refunded directly", () => {
    for (const actor of ["customer", "admin"] as const) {
      expect(tsPairs(actor).filter((p) => p.endsWith(">paid") || p.endsWith(">refunded"))).toEqual([]);
    }
  });
});
