"use client";

import type { ActionState } from "@/actions/types";
import { Alert } from "@/components/ui/alert";
import { useActionForm } from "@/hooks/use-action-form";
import { cn } from "@/lib/utils";

// Wraps an admin server action so database refusals (an illegal transition,
// a refund over the limit) surface inline instead of failing silently.
export function ActionForm({
  action,
  children,
  className,
  hidden,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const { state, pending, formRef, onSubmit } = useActionForm(action);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending} className={cn("space-y-2", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
