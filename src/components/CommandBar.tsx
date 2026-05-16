"use client";

/**
 * Lex AI assistant — corner chat widget.
 *
 * Bottom-right launcher pill opens a 380x540 popover (full-width on
 * mobile) anchored to the corner. Conversation history is preserved
 * within the open session so the lawyer can review past questions
 * mid-pitch without re-typing. Closing clears the transcript.
 *
 * Two intents (server classifies):
 *   - draft  → server creates a draft row, we router.push('/drafts/{id}')
 *   - query  → prose answer rendered as an assistant bubble
 *
 * Keyboard: ⌘K toggles open/close. Esc closes when input has focus.
 * Enter submits.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { aiDispatchAction } from "@/app/(workspace)/assistant/actions";
import type { OpenRouterError } from "@/lib/openrouter/types";

type MessageBody =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "error"; reason: string };

type Message = MessageBody & { id: number };

export function CommandBar() {
  const router = useRouter();
  const t = useTranslations();
  const draftHint = t("ai.placeholderDraft");
  const queryHint = t("ai.placeholderQuery");

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [placeholder, setPlaceholder] = useState<string>(draftHint);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(1);

  function close() {
    setOpen(false);
    setInput("");
    setMessages([]);
    setThinking(false);
  }

  function openWidget() {
    setPlaceholder(Math.random() < 0.5 ? draftHint : queryHint);
    setOpen(true);
  }

  // ⌘K toggles. Esc closes only when widget is focused (we don't
  // hijack Esc when the user is mid-typing elsewhere).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) {
          openWidget();
        } else {
          close();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftHint, queryHint]);

  // Auto-scroll to bottom whenever messages or thinking state changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  // Refocus the input when the widget opens, so the user can type
  // immediately without clicking. Skipped on mobile (where the
  // keyboard-up is jarring on widget open).
  useEffect(() => {
    if (open && window.innerWidth >= 640) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function errorMessageFor(err: OpenRouterError | string): string {
    switch (err) {
      case "no_api_key":
        return t("ai.errors.noApiKey");
      case "refusal":
        return t("ai.errors.refusal");
      case "parse_failed":
        return t("ai.errors.parseFailed");
      case "unknown_client":
        return t("ai.errors.unknownClient");
      case "unknown_matter":
        return t("ai.errors.unknownMatter");
      case "rate_limited":
        return t("ai.errors.rateLimit");
      case "network":
      case "model_error":
        return t("ai.errors.networkError");
      default:
        return t("ai.errors.parseFailed");
    }
  }

  function pushMessage(msg: MessageBody): void {
    setMessages((prev) => [...prev, { ...msg, id: nextIdRef.current++ }]);
  }

  async function submit() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    pushMessage({ kind: "user", text });
    setThinking(true);
    try {
      const dispatched = await aiDispatchAction(text);
      setThinking(false);
      if (dispatched.kind === "draft") {
        router.push(`/drafts/${dispatched.id}`);
        close();
      } else if (dispatched.kind === "query") {
        pushMessage({ kind: "assistant", text: dispatched.text });
      } else {
        pushMessage({
          kind: "error",
          reason: errorMessageFor(dispatched.error),
        });
      }
    } catch {
      setThinking(false);
      pushMessage({ kind: "error", reason: errorMessageFor("network") });
    }
  }

  return (
    <>
      <Launcher onOpen={openWidget} hidden={open} />

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t("ai.launcherLabel")}
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--line)]"
          style={{
            background: "var(--bg)",
            boxShadow: "var(--elev-3)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
            right: "24px",
            width: "min(380px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 80px))",
            animation: "lex-chat-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <style>{`
            @keyframes lex-chat-in {
              from { opacity: 0; transform: translateY(8px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          <header
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded-full font-display text-sm font-medium"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg)",
                  lineHeight: 1,
                }}
                aria-hidden="true"
              >
                L
              </span>
              <div className="flex flex-col leading-tight">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  Lex
                </span>
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
                >
                  {t("ai.launcherLabel")}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("ai.toClose")}
              className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
              style={{ color: "var(--muted)", cursor: "pointer" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            style={{ background: "var(--bg-2)" }}
          >
            {messages.length === 0 && !thinking && (
              <div className="space-y-3">
                <Bubble role="assistant">{t("ai.idleHint")}</Bubble>
              </div>
            )}

            {messages.map((m) => {
              if (m.kind === "user")
                return (
                  <Bubble key={m.id} role="user">
                    {m.text}
                  </Bubble>
                );
              if (m.kind === "assistant")
                return (
                  <Bubble key={m.id} role="assistant">
                    {m.text}
                  </Bubble>
                );
              return (
                <Bubble key={m.id} role="error">
                  {m.reason}
                </Bubble>
              );
            })}

            {thinking && (
              <Bubble role="assistant">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full motion-safe:animate-pulse"
                    style={{ background: "var(--accent)" }}
                  />
                  {t("ai.thinking")}
                </span>
              </Bubble>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-2 px-3 py-3 border-t"
            style={{ borderColor: "var(--line-soft)", background: "var(--bg)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
              }}
              placeholder={placeholder}
              aria-label={t("ai.inputLabel")}
              disabled={thinking}
              className="flex-1 bg-transparent px-2 py-2 outline-none text-sm placeholder:text-[var(--dim)]"
              style={{ color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              aria-label={t("ai.send" /* fallback handled by chat */)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                opacity: !input.trim() || thinking ? 0.4 : 1,
                cursor:
                  !input.trim() || thinking ? "not-allowed" : "pointer",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M2 8h12M9 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant" | "error";
  children: React.ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  if (role === "error") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm border"
          style={{
            background: "color-mix(in oklch, var(--kill) 6%, var(--bg))",
            borderColor: "var(--kill)",
            color: "var(--kill)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm border"
        style={{
          background: "var(--bg)",
          borderColor: "var(--line-soft)",
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Launcher({
  onOpen,
  hidden,
}: {
  onOpen: () => void;
  hidden: boolean;
}) {
  const t = useTranslations();
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("ai.launcherLabel")}
      className="fixed z-40 flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        right: "24px",
        borderColor: "var(--line)",
        background: "var(--bg)",
        color: "var(--muted)",
        boxShadow: "var(--elev-2)",
        cursor: "pointer",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full font-display text-xs font-medium"
        style={{
          background: "var(--accent)",
          color: "var(--bg)",
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        L
      </span>
      <span
        className="font-display text-sm"
        style={{ color: "var(--accent)" }}
      >
        {t("ai.launcherCta")}
      </span>
      <kbd
        className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: "var(--bg-2)", color: "var(--dim)" }}
      >
        ⌘K
      </kbd>
    </button>
  );
}
