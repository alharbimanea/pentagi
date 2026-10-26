import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";
import { isOrderStatus, statusTone } from "@/lib/orders/status";

export function StatusBadge({ status, dict }: { status: string; dict: Dictionary }) {
  if (!isOrderStatus(status)) return <Badge>{status}</Badge>;
  return <Badge tone={statusTone(status)}>{dict.status[status]}</Badge>;
}
