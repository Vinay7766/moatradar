"""FastAPI application entrypoint for MoatRadar."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.services.mission_runner import MissionRunner


def create_app(
    db_override: Database | None = None,
    vector_store_override: DossierVectorStore | None = None,
) -> FastAPI:
    """Application factory enabling clean test isolation and production lifespan."""
    db = db_override or Database(settings.sqlite_db_path)
    db.init_db()
    vector_store = vector_store_override or DossierVectorStore(settings.chroma_persist_dir)
    runner = MissionRunner(db=db, vector_store=vector_store)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await runner.shutdown()

    app = FastAPI(
        title="MoatRadar",
        version="0.1.0",
        description="Stateful LangGraph Multi-Agent Competitive Intelligence Platform for Product Managers",
        lifespan=lifespan,
    )
    app.state.db = db
    app.state.vector_store = vector_store
    app.state.runner = runner

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    app.include_router(router)
    return app


app = create_app()
