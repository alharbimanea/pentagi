import { cn } from "@/lib/utils";

const tones = {
  info: "border-primary/30 bg-primary/5",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  error: "border-destructive/40 bg-destructive/10",
} as const;

export function Alert({ tone = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border p-3 text-sm", tones[tone], className)} {...props} />;
}
