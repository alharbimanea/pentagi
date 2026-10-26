"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createUploadAction, finalizeUploadAction } from "@/actions/files";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/files/validate";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const PROBLEMS: Record<string, { en: string; ar: string }> = {
  unsupported_type: { en: "This file type is not accepted.", ar: "نوع الملف غير مقبول." },
  too_large: { en: "The file is larger than 25 MB.", ar: "حجم الملف يتجاوز 25 ميجابايت." },
  empty: { en: "The file is empty.", ar: "الملف فارغ." },
  mismatch: { en: "The file content does not match its extension.", ar: "محتوى الملف لا يطابق امتداده." },
  infected: { en: "The file failed the malware scan and was removed.", ar: "لم يجتز الملف فحص البرمجيات الضارة وتم حذفه." },
  rate_limited: { en: "Too many uploads. Try again later.", ar: "عمليات رفع كثيرة. حاول لاحقاً." },
  forbidden: { en: "You cannot upload to this order.", ar: "لا يمكنك الرفع إلى هذا الطلب." },
  failed: { en: "Upload failed. Please try again.", ar: "فشل الرفع. حاول مرة أخرى." },
};

export function FileUploader({
  orderId,
  purpose,
  label,
  locale,
  onUploaded,
  compact,
  refresh = true,
}: {
  orderId: string;
  purpose: "attachment" | "message" | "deliverable" | "revision";
  label: string;
  locale: "en" | "ar";
  onUploaded?: (fileId: string, name: string) => void;
  compact?: boolean;
  // The wizard keeps its own list; refreshing there would remount it at step one.
  refresh?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setProblem(null);
    try {
      const ticket = await createUploadAction({ orderId, name: file.name, size: file.size, purpose });
      if (!ticket.ok) return setProblem(ticket.problem);
      const { error } = await browserClient().storage.from("order-files").uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || undefined });
      if (error) return setProblem("failed");
      const result = await finalizeUploadAction(ticket.fileId);
      if (!result.ok) return setProblem(result.problem);
      onUploaded?.(ticket.fileId, file.name);
      if (refresh) router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className={cn(buttonClass("outline", compact ? "sm" : "md"), "cursor-pointer", busy && "pointer-events-none opacity-60")}>
        <Paperclip className="h-4 w-4" aria-hidden />
        <span>{busy ? "…" : label}</span>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {problem ? <Alert tone="error">{PROBLEMS[problem]?.[locale] ?? PROBLEMS.failed![locale]}</Alert> : null}
    </div>
  );
}
