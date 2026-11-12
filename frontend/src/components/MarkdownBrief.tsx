"use client";

import React from "react";
import { ExternalLink } from "lucide-react";

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*)/g);
  return tokens.map((tok, idx) => {
    const linkMatch = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-teal-400 underline decoration-teal-500/40 hover:text-teal-300 print:text-teal-700"
        >
          {linkMatch[1]}
          <ExternalLink className="w-3 h-3" />
        </a>
      );
    }
    const boldMatch = tok.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={idx} className="font-semibold text-slate-100 print:text-slate-900">
          {boldMatch[1]}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{tok}</React.Fragment>;
  });
}

export function MarkdownBrief({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);

  return (
    <div className="space-y-2.5 text-sm text-slate-300 leading-relaxed print:text-slate-800">
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="text-sm font-semibold text-slate-100 pt-2 print:text-slate-900">
              {renderInline(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith("## ") || line.startsWith("# ")) {
          const text = line.replace(/^#{1,2}\s+/, "");
          return (
            <h3 key={idx} className="text-base font-semibold text-slate-100 pt-2 print:text-slate-900">
              {renderInline(text)}
            </h3>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 print:bg-teal-700" />
              <p className="flex-1">{renderInline(line.slice(2))}</p>
            </div>
          );
        }
        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}
