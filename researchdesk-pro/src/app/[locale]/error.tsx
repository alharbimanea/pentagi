"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container py-24 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong · حدث خطأ ما</h1>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">{error.digest}</p> : null}
      <Button className="mt-6" variant="outline" onClick={reset}>
        Try again · حاول مجدداً
      </Button>
    </div>
  );
}
