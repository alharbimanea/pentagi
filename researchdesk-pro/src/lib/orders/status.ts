export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "needs_clarification",
  "awaiting_quote",
  "awaiting_payment",
  "paid",
  "in_review",
  "in_progress",
  "quality_check",
  "delivered",
  "revision_requested",
  "revision_in_progress",
  "completed",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Mirrors public.order_transition_allowed. The database is the authority;
// this copy only decides which buttons the UI offers.
const CUSTOMER: Partial<Record<OrderStatus, OrderStatus[]>> = {
  draft: ["submitted", "cancelled"],
  submitted: ["cancelled"],
  needs_clarification: ["submitted", "cancelled"],
  awaiting_quote: ["cancelled"],
  awaiting_payment: ["cancelled"],
  delivered: ["completed"],
};

const ADMIN: Partial<Record<OrderStatus, OrderStatus[]>> = {
  submitted: ["needs_clarification", "awaiting_quote", "cancelled"],
  needs_clarification: ["awaiting_quote", "cancelled"],
  awaiting_quote: ["needs_clarification", "cancelled"],
  awaiting_payment: ["awaiting_quote", "cancelled"],
  paid: ["in_review"],
  in_review: ["in_progress"],
  in_progress: ["quality_check"],
  quality_check: ["in_progress"],
  delivered: ["completed"],
};

export function nextStatuses(actor: "customer" | "admin", from: OrderStatus): OrderStatus[] {
  return (actor === "customer" ? CUSTOMER : ADMIN)[from] ?? [];
}

export const ACTIVE_STATUSES: OrderStatus[] = [
  "paid",
  "in_review",
  "in_progress",
  "quality_check",
  "revision_requested",
  "revision_in_progress",
];

export const ATTENTION_STATUSES: OrderStatus[] = ["submitted", "needs_clarification", "revision_requested"];

export const TERMINAL_STATUSES: OrderStatus[] = ["completed", "cancelled", "refunded"];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export function statusTone(status: OrderStatus): StatusTone {
  if (status === "completed" || status === "delivered") return "success";
  if (status === "cancelled" || status === "refunded") return "danger";
  if (ATTENTION_STATUSES.includes(status) || status === "awaiting_payment") return "warning";
  if (status === "draft") return "neutral";
  return "info";
}
