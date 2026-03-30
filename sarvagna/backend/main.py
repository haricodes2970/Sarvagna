import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, chat, map, modulemap, progress, query, subjects

app = FastAPI(title="Sarvagna API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(subjects.router, prefix="/api/v1")
app.include_router(progress.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(map.router, prefix="/api/v1")
app.include_router(modulemap.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
