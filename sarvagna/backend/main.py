import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.routes import analytics, auth, discovery, flashcards, progress, query, qp_analyzer, quiz, roadmap_api, subjects, teach, upload
from core.config import settings
from core.database import Base, engine

logger = logging.getLogger(__name__)

# Idempotent schema migrations (create_all never ALTERs existing tables)
_MIGRATIONS = [
    "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS storage_url VARCHAR",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for sql in _MIGRATIONS:
                await conn.execute(text(sql))
    except Exception as e:
        logger.error("Startup DB migration failed (continuing): %s", e)
    yield


app = FastAPI(title="Sarvagna API", lifespan=lifespan)

# CORS must be added BEFORE exception handlers so it wraps everything
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(query.router, prefix="/query", tags=["query"])
app.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
app.include_router(progress.router, prefix="/progress", tags=["progress"])
app.include_router(upload.router, prefix="/upload", tags=["upload"])
app.include_router(qp_analyzer.router, prefix="/qp", tags=["qp"])
app.include_router(discovery.router, prefix="/discovery", tags=["discovery"])
app.include_router(roadmap_api.router, prefix="/roadmap", tags=["roadmap"])
app.include_router(teach.router, prefix="/teach", tags=["teach"])
app.include_router(flashcards.router, prefix="/flashcards", tags=["flashcards"])
app.include_router(quiz.router, prefix="/quiz", tags=["quiz"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
