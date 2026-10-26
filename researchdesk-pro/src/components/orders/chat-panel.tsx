"use client";

import { CheckCheck, Search, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markConversationReadAction, searchMessagesAction, sendMessageAction, type ChatMessage } from "@/actions/messages";
import { FileUploader } from "@/components/orders/file-uploader";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { Dictionary, Locale } from "@/lib/i18n";
import { browserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

interface Read {
  user_id: string;
  last_read_at: string;
}

export function ChatPanel({
  conversationId,
  orderId,
  me,
  myKind,
  dict,
  locale,
  timezone,
  initialMessages,
  initialReads,
  fileNames,
}: {
  conversationId: string;
  orderId: string | null;
  me: string;
  myKind: "customer" | "admin";
  dict: Dictionary;
  locale: Locale;
  timezone: string;
  initialMessages: ChatMessage[];
  initialReads: Read[];
  fileNames: Record<string, string>;
}) {
  const t = dict.chat;
  const [messages, setMessages] = useState(initialMessages);
  const [reads, setReads] = useState(initialReads);
  const [draft, setDraft] = useState("");
  const [pendingFile, setPendingFile] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof browserClient>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);
  // Typing events go over a broadcast channel, so they carry a random tab id
  // rather than the user id.
  const tabId = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()));

  const markRead = useCallback(() => {
    void markConversationReadAction(conversationId);
  }, [conversationId]);

  useEffect(() => {
    const supabase = browserClient();
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      // Join with the user's own JWT, not the anon key: Realtime filters
      // postgres_changes through RLS using whatever token the socket holds,
      // and the client can otherwise join before the session is applied.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`conversation:${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_id !== me && document.visibilityState === "visible") markRead();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          const row = payload.new as Read;
          if (!row?.user_id) return;
          setReads((prev) => [...prev.filter((r) => r.user_id !== row.user_id), row]);
        })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.from === tabId.current) return;
          setTyping(true);
          clearTimeout(typingTimer);
          typingTimer = setTimeout(() => setTyping(false), 3000);
        })
        .subscribe((status) => setConnected(status === "SUBSCRIBED"));
      channelRef.current = channel;
    })();
    markRead();
    return () => {
      cancelled = true;
      clearTimeout(typingTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [conversationId, me, markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const othersReadAt = useMemo(
    () => reads.filter((r) => r.user_id !== me).reduce((acc, r) => Math.max(acc, Date.parse(r.last_read_at)), 0),
    [reads, me],
  );
  const lastMine = [...messages].reverse().find((m) => m.sender_id === me);

  async function send() {
    const body = draft.trim() || (pendingFile ? pendingFile.name : "");
    if (!body) return;
    setError(null);
    const result = await sendMessageAction({ conversationId, body, fileId: pendingFile?.id ?? null });
    if (!result.ok) return setError(result.error === "rate_limited" ? dict.errors.rateLimited : dict.errors.generic);
    setDraft("");
    setPendingFile(null);
  }

  function senderLabel(m: ChatMessage) {
    if (m.sender_id === me) return t.you;
    if (m.sender_kind === "admin") return t.owner;
    if (m.sender_kind === "system") return t.system;
    return t.customer;
  }

  const shown = results ?? messages;

  return (
    <div className="flex h-[32rem] flex-col rounded-lg border">
      <div className="flex items-center gap-2 border-b p-2">
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setResults(query.trim().length >= 2 ? await searchMessagesAction(conversationId, query) : null);
          }}
          role="search"
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} className="h-8" />
          <Button type="submit" size="sm" variant="ghost" aria-label={dict.actions.search}>
            <Search className="h-4 w-4" aria-hidden />
          </Button>
        </form>
        <span className={cn("text-xs", connected ? "text-success" : "text-muted-foreground")} aria-live="polite">
          ● {connected ? t.live : t.offline}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite" aria-relevant="additions">
        {shown.length === 0 ? <p className="text-center text-sm text-muted-foreground">{t.empty}</p> : null}
        {shown.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                {m.file_id ? (
                  <a href={`/api/files/${m.file_id}`} className="mt-1 block text-xs underline">
                    📎 {fileNames[m.file_id] ?? dict.actions.download}
                  </a>
                ) : null}
              </div>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                {senderLabel(m)} · {formatDateTime(m.created_at, locale, timezone)}
                {m.delivery_status === "failed" ? " · ⚠" : null}
                {mine && lastMine?.id === m.id && othersReadAt >= Date.parse(m.created_at) ? (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    <CheckCheck className="h-3 w-3" aria-hidden /> {t.seen}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
        {results ? (
          <Button size="sm" variant="link" onClick={() => setResults(null)}>
            {dict.actions.close}
          </Button>
        ) : null}
        <div ref={bottom} />
      </div>

      {typing ? <p className="px-3 text-xs text-muted-foreground">{myKind === "admin" ? t.customer : t.owner} {t.typing}</p> : null}
      {error ? <Alert tone="error" className="mx-3">{error}</Alert> : null}

      <form
        className="flex items-end gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {orderId ? (
          <FileUploader orderId={orderId} purpose="message" label={t.attach} locale={locale} compact refresh={false} onUploaded={(id, name) => setPendingFile({ id, name })} />
        ) : null}
        <div className="flex-1">
          {pendingFile ? <p className="mb-1 truncate text-xs text-muted-foreground">📎 {pendingFile.name}</p> : null}
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const now = Date.now();
              if (now - lastTypingSent.current > 2000) {
                lastTypingSent.current = now;
                void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: tabId.current } });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            rows={2}
            maxLength={10000}
            className="min-h-0"
          />
        </div>
        <Button type="submit" aria-label={t.send}>
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
