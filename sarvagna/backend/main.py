from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api.routes import analytics, auth, discovery, flashcards, progress, query, qp_analyzer, quiz, roadmap_api, subjects, teach, upload
from core.config import settings
from core.database import Base, engine

# Columns added after initial deploy — ALTER TABLE is idempotent via IF NOT EXISTS
_MIGRATIONS = [
    "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS storage_url VARCHAR",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for sql in _MIGRATIONS:
            await conn.execute(text(sql))
    yield


app = FastAPI(title="Sarvagna API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
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
