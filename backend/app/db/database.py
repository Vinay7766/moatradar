"""SQLite persistence layer for workspaces, mission runs, snapshots, citations, events, and chat."""

import json
import sqlite3
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.intelligence import (
    AgentEventPayload,
    CompetitorCandidate,
    DiffSummary,
    DossierPayload,
    MissionStatus,
    SourceCitationInput,
    utc_now_iso,
)


class Database:
    """Thread-safe SQLite repository using short-lived WAL connections."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def init_db(self) -> None:
        """Create schema tables if they do not exist."""
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    product_description TEXT NOT NULL,
                    target_segment TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS mission_runs (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    llm_provider TEXT NOT NULL,
                    llm_model TEXT NOT NULL,
                    discovered_competitors_json TEXT NOT NULL DEFAULT '[]',
                    approved_competitors_json TEXT NOT NULL DEFAULT '[]',
                    critic_score REAL,
                    iteration_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS dossier_snapshots (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    dossier_json TEXT NOT NULL,
                    diff_summary_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES mission_runs(id) ON DELETE CASCADE,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS source_citations (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    competitor_name TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    snippet TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES mission_runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS agent_events (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    node_name TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES mission_runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    citations_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS custom_documents (
                    id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    char_count INTEGER NOT NULL,
                    content_excerpt TEXT NOT NULL,
                    uploaded_at TEXT NOT NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS workspace_monitors (
                    workspace_id TEXT PRIMARY KEY,
                    interval TEXT NOT NULL DEFAULT 'off',
                    webhook_url TEXT,
                    llm_provider TEXT,
                    llm_model TEXT,
                    last_run_at TEXT,
                    next_run_at TEXT,
                    last_status TEXT,
                    last_diff_headline TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );
                """
            )

    def create_workspace(
        self,
        name: str,
        product_name: str,
        product_description: str,
        target_segment: str,
    ) -> dict[str, Any]:
        ws_id = str(uuid4())
        created_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO workspaces (id, name, product_name, product_description, target_segment, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ws_id, name, product_name, product_description, target_segment, created_at),
            )
        return self.get_workspace(ws_id)  # type: ignore[return-value]

    def get_workspace(self, workspace_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM workspaces WHERE id = ?", (workspace_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_workspaces(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT w.*,
                       (SELECT COUNT(*) FROM dossier_snapshots s WHERE s.workspace_id = w.id) AS snapshot_count,
                       (SELECT s.created_at FROM dossier_snapshots s WHERE s.workspace_id = w.id ORDER BY s.created_at DESC LIMIT 1) AS last_snapshot_at,
                       (SELECT r.id FROM mission_runs r WHERE r.workspace_id = w.id ORDER BY r.started_at DESC LIMIT 1) AS latest_run_id,
                       (SELECT r.status FROM mission_runs r WHERE r.workspace_id = w.id ORDER BY r.started_at DESC LIMIT 1) AS latest_run_status
                FROM workspaces w
                ORDER BY w.created_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def delete_workspace(self, workspace_id: str) -> list[str] | None:
        """Delete a workspace (cascading SQLite runs/snapshots/docs/monitors) and return its run IDs."""
        with self._connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM workspaces WHERE id = ?", (workspace_id,)
            ).fetchone()
            if not exists:
                return None
            run_rows = conn.execute(
                "SELECT id FROM mission_runs WHERE workspace_id = ?", (workspace_id,)
            ).fetchall()
            run_ids = [str(r["id"]) for r in run_rows]
            conn.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
            return run_ids

    def create_run(
        self,
        workspace_id: str,
        thread_id: str,
        llm_provider: str,
        llm_model: str,
        status: MissionStatus = "discovering",
    ) -> dict[str, Any]:
        run_id = str(uuid4())
        started_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO mission_runs (id, workspace_id, thread_id, status, llm_provider, llm_model, started_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, workspace_id, thread_id, status, llm_provider, llm_model, started_at),
            )
        return self.get_run(run_id)  # type: ignore[return-value]

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM mission_runs WHERE id = ?", (run_id,)
            ).fetchone()
            if not row:
                return None
            data = dict(row)
            data["discovered_competitors"] = json.loads(
                data.pop("discovered_competitors_json", "[]")
            )
            data["approved_competitors"] = json.loads(
                data.pop("approved_competitors_json", "[]")
            )
            return data

    def update_run_status(
        self,
        run_id: str,
        status: MissionStatus,
        critic_score: float | None = None,
        iteration_count: int | None = None,
        error_message: str | None = None,
        completed: bool = False,
    ) -> None:
        fields = ["status = ?"]
        params: list[Any] = [status]
        if critic_score is not None:
            fields.append("critic_score = ?")
            params.append(critic_score)
        if iteration_count is not None:
            fields.append("iteration_count = ?")
            params.append(iteration_count)
        if error_message is not None:
            fields.append("error_message = ?")
            params.append(error_message)
        if completed:
            fields.append("completed_at = ?")
            params.append(utc_now_iso())
        params.append(run_id)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE mission_runs SET {', '.join(fields)} WHERE id = ?",
                params,
            )

    def save_discovered_competitors(
        self, run_id: str, competitors: list[CompetitorCandidate]
    ) -> None:
        payload = json.dumps([c.model_dump() for c in competitors])
        with self._connect() as conn:
            conn.execute(
                "UPDATE mission_runs SET discovered_competitors_json = ? WHERE id = ?",
                (payload, run_id),
            )

    def save_approved_competitors(
        self, run_id: str, competitors: list[CompetitorCandidate]
    ) -> None:
        payload = json.dumps([c.model_dump() for c in competitors])
        with self._connect() as conn:
            conn.execute(
                "UPDATE mission_runs SET approved_competitors_json = ? WHERE id = ?",
                (payload, run_id),
            )

    def save_citations(self, run_id: str, citations: list[SourceCitationInput]) -> None:
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT OR IGNORE INTO source_citations
                (id, run_id, competitor_name, source_type, title, url, snippet, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        c.id,
                        run_id,
                        c.competitor_name,
                        c.source_type,
                        c.title,
                        c.url,
                        c.snippet,
                        c.fetched_at,
                    )
                    for c in citations
                ],
            )

    def list_citations(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM source_citations WHERE run_id = ? ORDER BY fetched_at ASC",
                (run_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def save_event(self, event: AgentEventPayload) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agent_events (id, run_id, node_name, event_type, message, metadata_json, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.id,
                    event.run_id,
                    event.node_name,
                    event.event_type,
                    event.message,
                    json.dumps(event.metadata),
                    event.timestamp,
                ),
            )

    def list_events(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_events WHERE run_id = ? ORDER BY timestamp ASC",
                (run_id,),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d["metadata"] = json.loads(d.pop("metadata_json", "{}"))
                out.append(d)
            return out

    def save_snapshot(
        self,
        run_id: str,
        workspace_id: str,
        dossier: DossierPayload,
        diff_summary: DiffSummary | None,
    ) -> dict[str, Any]:
        snap_id = str(uuid4())
        created_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO dossier_snapshots (id, run_id, workspace_id, dossier_json, diff_summary_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    snap_id,
                    run_id,
                    workspace_id,
                    dossier.model_dump_json(),
                    diff_summary.model_dump_json() if diff_summary else None,
                    created_at,
                ),
            )
        return self.get_snapshot_by_run(run_id)  # type: ignore[return-value]

    def _hydrate_snapshot(self, row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        data["dossier"] = json.loads(data.pop("dossier_json"))
        diff_raw = data.pop("diff_summary_json", None)
        data["diff_summary"] = json.loads(diff_raw) if diff_raw else None
        return data

    def get_snapshot_by_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dossier_snapshots WHERE run_id = ? ORDER BY created_at DESC LIMIT 1",
                (run_id,),
            ).fetchone()
            return self._hydrate_snapshot(row) if row else None

    def get_latest_snapshot_for_workspace(self, workspace_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dossier_snapshots WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1",
                (workspace_id,),
            ).fetchone()
            return self._hydrate_snapshot(row) if row else None

    def list_snapshots_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM dossier_snapshots WHERE workspace_id = ? ORDER BY created_at DESC",
                (workspace_id,),
            ).fetchall()
            return [self._hydrate_snapshot(r) for r in rows]

    def save_chat_message(
        self, workspace_id: str, role: str, content: str, citations: list[dict[str, Any]]
    ) -> dict[str, Any]:
        msg_id = str(uuid4())
        created_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO chat_messages (id, workspace_id, role, content, citations_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (msg_id, workspace_id, role, content, json.dumps(citations), created_at),
            )
        return {
            "id": msg_id,
            "workspace_id": workspace_id,
            "role": role,
            "content": content,
            "citations": citations,
            "created_at": created_at,
        }

    def list_chat_messages(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM chat_messages WHERE workspace_id = ? ORDER BY created_at ASC",
                (workspace_id,),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                d = dict(r)
                d["citations"] = json.loads(d.pop("citations_json", "[]"))
                out.append(d)
            return out

    def reset_run_for_retry(
        self,
        run_id: str,
        status: MissionStatus,
        llm_provider: str,
        llm_model: str,
        approved_competitors: list[CompetitorCandidate] | None = None,
    ) -> None:
        """Reset error state and optionally update provider/model/competitors for retry."""
        fields = [
            "status = ?",
            "llm_provider = ?",
            "llm_model = ?",
            "error_message = NULL",
            "completed_at = NULL",
        ]
        params: list[Any] = [status, llm_provider, llm_model]
        if approved_competitors is not None:
            fields.append("approved_competitors_json = ?")
            params.append(json.dumps([c.model_dump() for c in approved_competitors]))
        params.append(run_id)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE mission_runs SET {', '.join(fields)} WHERE id = ?",
                params,
            )

    def create_custom_document(
        self,
        workspace_id: str,
        filename: str,
        content_type: str,
        char_count: int,
        content_excerpt: str,
        doc_id: str | None = None,
    ) -> dict[str, Any]:
        """Persist metadata for a workspace-scoped custom uploaded evidence file."""
        record_id = doc_id or str(uuid4())
        uploaded_at = utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO custom_documents (
                    id, workspace_id, filename, content_type, char_count, content_excerpt, uploaded_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    workspace_id,
                    filename,
                    content_type,
                    char_count,
                    content_excerpt,
                    uploaded_at,
                ),
            )
        return self.get_custom_document(workspace_id, record_id)  # type: ignore[return-value]

    def get_custom_document(self, workspace_id: str, doc_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM custom_documents WHERE workspace_id = ? AND id = ?",
                (workspace_id, doc_id),
            ).fetchone()
            return dict(row) if row else None

    def list_custom_documents(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM custom_documents WHERE workspace_id = ? ORDER BY uploaded_at DESC",
                (workspace_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def delete_custom_document(self, workspace_id: str, doc_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM custom_documents WHERE workspace_id = ? AND id = ?",
                (workspace_id, doc_id),
            )
            return cursor.rowcount > 0

    def get_workspace_monitor(self, workspace_id: str) -> dict[str, Any]:
        """Return workspace monitor settings or default disabled configuration."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM workspace_monitors WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            if row:
                return dict(row)
        return {
            "workspace_id": workspace_id,
            "interval": "off",
            "webhook_url": None,
            "llm_provider": None,
            "llm_model": None,
            "last_run_at": None,
            "next_run_at": None,
            "last_status": None,
            "last_diff_headline": None,
        }

    def upsert_workspace_monitor(
        self,
        workspace_id: str,
        interval: str,
        webhook_url: str | None,
        llm_provider: str | None,
        llm_model: str | None,
        next_run_at: str | None,
    ) -> dict[str, Any]:
        """Insert or update a workspace's scheduled monitor settings."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO workspace_monitors (
                    workspace_id, interval, webhook_url, llm_provider, llm_model, next_run_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    interval = excluded.interval,
                    webhook_url = excluded.webhook_url,
                    llm_provider = excluded.llm_provider,
                    llm_model = excluded.llm_model,
                    next_run_at = excluded.next_run_at
                """,
                (workspace_id, interval, webhook_url, llm_provider, llm_model, next_run_at),
            )
        return self.get_workspace_monitor(workspace_id)

    def update_monitor_run_result(
        self,
        workspace_id: str,
        last_run_at: str,
        next_run_at: str | None,
        last_status: str,
        last_diff_headline: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE workspace_monitors
                SET last_run_at = ?, next_run_at = ?, last_status = ?, last_diff_headline = ?
                WHERE workspace_id = ?
                """,
                (last_run_at, next_run_at, last_status, last_diff_headline, workspace_id),
            )

    def list_due_monitors(self, now_iso: str) -> list[dict[str, Any]]:
        """List active monitors whose next_run_at is due."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM workspace_monitors
                WHERE interval != 'off' AND (next_run_at IS NULL OR next_run_at <= ?)
                """,
                (now_iso,),
            ).fetchall()
            return [dict(r) for r in rows]
