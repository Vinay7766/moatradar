"""Citation-grounded RAG analyst for Ask the Desk follow-up Q&A."""

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import SupportedProvider
from app.db.vector_store import DossierVectorStore
from app.llm.factory import create_chat_model
from app.schemas.intelligence import RagChatResponse, RagCitation


async def answer_workspace_question(
    vector_store: DossierVectorStore,
    workspace_id: str,
    question: str,
    llm_provider: SupportedProvider,
    llm_model: str,
) -> RagChatResponse:
    """Retrieve workspace evidence chunks from ChromaDB and answer with inline citations."""
    chunks = vector_store.query_workspace(workspace_id=workspace_id, query=question, top_k=6)
    if not chunks:
        return RagChatResponse(
            answer=(
                "No intelligence snapshots have been indexed for this workspace yet. "
                "Run a competitive intelligence mission first."
            ),
            citations=[],
        )

    context_lines: list[str] = []
    citations: list[RagCitation] = []
    for idx, ch in enumerate(chunks, start=1):
        context_lines.append(
            f"[{idx}] ({ch['competitor_name']} · {ch['section']}) {ch['text']} (Source: {ch['url'] or 'Dossier'})"
        )
        citations.append(
            RagCitation(
                competitor_name=ch["competitor_name"],
                section=ch["section"],
                url=ch["url"],
                excerpt=ch["text"][:240],
            )
        )

    llm = create_chat_model(llm_provider, llm_model, temperature=0.1)
    reply = await llm.ainvoke(
        [
            SystemMessage(
                content=(
                    "You are the CMI Desk Follow-Up Analyst for Product Managers. "
                    "Answer strictly using the numbered <workspace_evidence> snippets below. "
                    "Cite sources inline as [1], [2], etc. If the evidence doesn't contain the answer, say so."
                )
            ),
            HumanMessage(
                content=(
                    f"Question: {question}\n\n"
                    f"<workspace_evidence>\n" + "\n\n".join(context_lines) + "\n</workspace_evidence>"
                )
            ),
        ]
    )

    answer_text = reply.content if isinstance(reply.content, str) else str(reply.content)
    return RagChatResponse(answer=answer_text, citations=citations)
