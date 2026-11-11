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
    <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <MessageSquare className="w-4 h-4 text-teal-700" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Ask the Desk (RAG Follow-Up Analyst)
          </h3>
          <p className="text-xs text-slate-500">
            Grounded in ChromaDB vector chunks & collected citations for this workspace.
          </p>
        </div>
      </div>

      <div className="my-3 space-y-3 max-h-72 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Ask anything across saved dossiers—e.g. &ldquo;Which competitor has the strongest onboarding complaints?&rdquo;
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md p-3 text-xs ${
                m.role === "user"
                  ? "bg-slate-100 text-slate-900 ml-8"
                  : "bg-teal-50/50 border border-teal-200 text-slate-800 mr-8"
              }`}
            >
              <p className="font-semibold text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                {m.role === "user" ? "Product Manager" : "CMI Analyst"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-teal-100 flex flex-wrap gap-1.5">
                  {m.citations.slice(0, 4).map((c, i) => {
                    const href = safeHttpUrl(c.url);
                    return (
                      <a
                        key={i}
                        href={href || "#"}
                        target={href ? "_blank" : undefined}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-teal-200 text-[11px] text-teal-800 hover:underline"
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

      {error && <p className="text-xs text-rose-700 mb-2">{error}</p>}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={disabled || isSending}
          placeholder={
            disabled
              ? "Complete at least one snapshot first..."
              : "Ask a follow-up question over this workspace's evidence..."
          }
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={disabled || isSending}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {isSending ? "Thinking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
