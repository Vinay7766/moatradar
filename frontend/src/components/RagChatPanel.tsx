"use client";

import { useState } from "react";
import { ExternalLink, MessageSquare, Send } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { safeHttpUrl } from "@/lib/url";

interface RagChatPanelProps {
  messages: ChatMessage[];
  onSend: (question: string) => Promise<void>;
  isSending: boolean;
  disabled: boolean;
}

export function RagChatPanel({
  messages,
  onSend,
  isSending,
  disabled,
}: RagChatPanelProps) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (question.trim().length < 3) {
      setError("Ask a specific follow-up question (min 3 chars).");
      return;
    }
    const q = question.trim();
    setQuestion("");
    try {
      await onSend(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send question.");
      setQuestion(q);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0f1623] p-4 flex flex-col shadow-xl print:hidden">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <MessageSquare className="w-4 h-4 text-teal-400" />
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Ask the Desk (RAG Copilot)
          </h3>
          <p className="text-xs text-slate-400">
            Grounded in ChromaDB vector chunks &amp; citations for this workspace.
          </p>
        </div>
      </div>

      <div className="my-3 space-y-3 max-h-72 overflow-y-auto studio-scroll pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Ask anything across saved dossiers—e.g. &ldquo;Which competitor has the strongest onboarding complaints?&rdquo;
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3 text-xs ${
                m.role === "user"
                  ? "bg-slate-800/90 text-slate-100 ml-6 border border-slate-700"
                  : "bg-teal-950/35 border border-teal-500/30 text-slate-200 mr-6"
              }`}
            >
              <p className="font-semibold text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                {m.role === "user" ? "Product Manager" : "CMI Analyst"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-teal-500/20 flex flex-wrap gap-1.5">
                  {m.citations.slice(0, 4).map((c, i) => {
                    const href = safeHttpUrl(c.url);
                    return (
                      <a
                        key={i}
                        href={href || "#"}
                        target={href ? "_blank" : undefined}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-teal-500/35 text-[11px] text-teal-300 hover:underline"
                      >
                        [{i + 1}] {c.competitor_name} · {c.section}
                        {href && <ExternalLink className="w-2.5 h-2.5" />}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!disabled && (
        <div className="pt-2.5 flex flex-wrap gap-1.5">
          {[
            "Where do competitors gate pricing?",
            "Top user complaints & switching triggers?",
            "What changed vs previous snapshot?",
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isSending}
              onClick={() => setQuestion(prompt)}
              className="rounded-full border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-teal-500/50 hover:bg-teal-500/15 hover:text-teal-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-rose-400 my-2">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-2.5 flex gap-2">
        <input
          type="text"
          value={question}
          disabled={disabled || isSending}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            disabled
              ? "Complete at least one snapshot first..."
              : "Ask a follow-up question across saved intel..."
          }
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || isSending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          {isSending ? "Asking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
