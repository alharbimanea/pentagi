"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/actions/types";

// React 19 resets every uncontrolled field after a <form action> finishes,
// so a refused submission would throw away what the user typed. This
// dispatches from onSubmit instead and resets only after a success.
export function useActionForm(action: (state: ActionState, form: FormData) => Promise<ActionState>, { resetOnSuccess = true } = {}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(data));
  }

  return { state, pending, formRef, onSubmit };
}
