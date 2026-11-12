"use client";

import { useRef, useState } from "react";
import {
  FileText,
  FileUp,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { CustomDocument } from "@/lib/types";

interface CustomEvidencePanelProps {
  workspaceId: string;
  documents: CustomDocument[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
  isLoading?: boolean;
}

const ALLOWED_EXTENSIONS = [".md", ".txt", ".pdf"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function CustomEvidencePanel({
  workspaceId,
  documents,
  onUpload,
  onDelete,
  isLoading = false,
}: CustomEvidencePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const lowerName = file.name.toLowerCase();
    const validExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!validExt) {
      setError("Only .md, .txt, or .pdf files are supported.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File exceeds the 2 MB upload limit.");
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload document."
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    setError(null);
    setDeletingId(docId);
    try {
      await onDelete(docId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete document."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section
      aria-label={`Custom evidence for workspace ${workspaceId}`}
      className="rounded-xl border border-slate-800 bg-[#0f1623] p-4 flex flex-col shadow-xl print:hidden"
    >
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-start gap-2">
          <FileUp className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Custom Internal Evidence
            </h3>
            <p className="text-xs text-slate-400">
              Upload <code className="text-teal-300">.md</code>,{" "}
              <code className="text-teal-300">.txt</code>, or{" "}
              <code className="text-teal-300">.pdf</code> win/loss notes or battlecards (indexed into RAG &amp; synthesis as{" "}
              <code className="text-teal-300">custom_upload</code>).
            </p>
          </div>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
            onChange={(e) => void handleFileSelect(e)}
            className="hidden"
            aria-label="Upload custom evidence document"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {isUploading ? "Uploading..." : "Upload Doc"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-xs font-medium text-rose-400">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-2 max-h-72 overflow-y-auto studio-scroll pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading workspace documents...
          </div>
        ) : documents.length === 0 ? (
          <p className="text-xs text-slate-500 py-5 text-center border border-dashed border-slate-700 rounded-lg">
            No custom documents uploaded yet. Add customer call notes, internal specs, or competitor battlecards.
          </p>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-slate-800 bg-slate-950/75 p-2.5 flex items-start justify-between gap-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {doc.filename}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300">
                    {doc.char_count.toLocaleString()} chars
                  </span>
                </div>
                {doc.content_excerpt && (
                  <p className="mt-1 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {doc.content_excerpt}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-500">
                  Uploaded {new Date(doc.uploaded_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                aria-label={`Delete ${doc.filename}`}
                className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {deletingId === doc.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
