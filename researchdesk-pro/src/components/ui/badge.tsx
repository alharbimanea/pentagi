import type { StatusTone } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

const tones: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary dark:bg-primary/20",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
