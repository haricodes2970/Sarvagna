from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, discovery, flashcards, progress, query, qp_analyzer, quiz, roadmap_api, subjects, teach, upload
from core.config import settings
from core.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Sarvagna API", lifespan=lifespan)

_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if settings.FRONTEND_URL not in _origins:
    _origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
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


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
