"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

// `pending` covers forms dispatched from onSubmit (useActionForm), which
// useFormStatus does not see.
export function SubmitButton({ children, pending: external, ...props }: ButtonProps & { pending?: boolean }) {
  const status = useFormStatus();
  const pending = status.pending || Boolean(external);
  return (
    <Button type="submit" aria-busy={pending} disabled={pending || props.disabled} {...props}>
      {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </Button>
  );
}
