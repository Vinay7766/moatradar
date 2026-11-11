"""ChromaDB persistent vector store for workspace dossiers and RAG retrieval."""

from pathlib import Path
from typing import Any

import chromadb

from app.schemas.intelligence import DossierPayload, SourceCitationInput


class DossierVectorStore:
    """Indexes structured dossiers and source snippets in ChromaDB for semantic Q&A."""

    def __init__(self, persist_dir: str) -> None:
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(name="cmi_dossier_chunks")

    def index_dossier(
        self,
        workspace_id: str,
        run_id: str,
        dossier: DossierPayload,
        citations: list[SourceCitationInput],
    ) -> int:
        """Split dossier deliverables and citations into searchable vector chunks."""
        docs: list[str] = []
        metadatas: list[dict[str, Any]] = []
        ids: list[str] = []

        def _add(chunk_key: str, competitor: str, section: str, url: str, text: str) -> None:
            clean = text.strip()
            if not clean:
                return
            ids.append(f"{run_id}:{chunk_key}")
            docs.append(clean)
            metadatas.append(
                {
                    "workspace_id": workspace_id,
                    "run_id": run_id,
                    "competitor_name": competitor,
                    "section": section,
                    "url": url,
                }
            )

        _add("exec_brief", "Market", "Executive Brief", "", dossier.executive_brief_md)

        for idx, bc in enumerate(dossier.battlecards):
            url = bc.citation_urls[0] if bc.citation_urls else bc.website
            text = (
                f"Competitor {bc.competitor_name} ({bc.website}). "
                f"Positioning: {bc.positioning}. Target ICP: {bc.target_icp}. "
                f"Strengths: {'; '.join(bc.swot.strengths)}. "
                f"Weaknesses: {'; '.join(bc.swot.weaknesses)}. "
                f"How to win: {'; '.join(bc.how_to_win)}."
            )
            _add(f"battlecard_{idx}", bc.competitor_name, "Battlecard & SWOT", url, text)

        for idx, pr in enumerate(dossier.pricing_matrix):
            url = pr.pricing_url or (pr.citation_urls[0] if pr.citation_urls else "")
            text = (
                f"Pricing for {pr.competitor_name}: Billing={pr.billing_model}, "
                f"Free={pr.free_tier}, Entry={pr.entry_price}, Mid={pr.mid_tier}, "
                f"Enterprise={pr.enterprise_tier}. Gates: {', '.join(pr.key_packaging_gates)}."
            )
            _add(f"pricing_{idx}", pr.competitor_name, "Pricing Matrix", url, text)

        for idx, voc in enumerate(dossier.voc_insights):
            text = (
                f"Voice of Customer ({voc.sentiment}) on {voc.competitor_name} "
                f"from {voc.platform} — {voc.theme}: {voc.evidence_quote}"
            )
            _add(f"voc_{idx}", voc.competitor_name, "Voice of Customer", voc.source_url, text)

        for idx, opp in enumerate(dossier.opportunities):
            url = opp.citation_urls[0] if opp.citation_urls else ""
            text = (
                f"Opportunity ({opp.horizon}, Impact {opp.impact_score}/10, Effort {opp.effort_score}/10): "
                f"{opp.title}. Evidence: {opp.problem_evidence}. Bet: {opp.recommended_feature_or_bet}."
            )
            _add(f"opp_{idx}", "Market", "Opportunities", url, text)

        for idx, cit in enumerate(citations[:40]):
            _add(
                f"cit_{idx}",
                cit.competitor_name,
                f"Raw Source ({cit.source_type})",
                cit.url,
                f"{cit.title}: {cit.snippet}",
            )

        if not docs:
            return 0

        self.collection.upsert(ids=ids, documents=docs, metadatas=metadatas)
        return len(docs)

    def query_workspace(
        self, workspace_id: str, query: str, top_k: int = 6
    ) -> list[dict[str, Any]]:
        """Retrieve top_k relevant evidence chunks scoped to workspace_id."""
        existing = self.collection.get(where={"workspace_id": workspace_id}, limit=1)
        if not existing or not existing.get("ids"):
            return []

        res = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where={"workspace_id": workspace_id},
        )
        documents = (res.get("documents") or [[]])[0]
        metadatas = (res.get("metadatas") or [[]])[0]
        chunks: list[dict[str, Any]] = []
        for text, meta in zip(documents, metadatas, strict=False):
            chunks.append(
                {
                    "text": text,
                    "competitor_name": (meta or {}).get("competitor_name", "Market"),
                    "section": (meta or {}).get("section", "Dossier"),
                    "url": (meta or {}).get("url", ""),
                    "run_id": (meta or {}).get("run_id", ""),
                }
            )
        return chunks
