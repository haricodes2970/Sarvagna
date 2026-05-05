import ssl
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings

_db_url = settings.DATABASE_URL or "sqlite+aiosqlite:///./dev.db"

# Apply SSL whenever connecting to Neon (or any production Postgres URL).
# asyncpg does not support ?sslmode= in the URL — SSL must be in connect_args.
_connect_args: dict = {}
_needs_ssl = (
    settings.ENVIRONMENT == "production"
    or "neon.tech" in _db_url
    or "neondb" in _db_url
    or _db_url.startswith("postgresql")
)
if _needs_ssl and not _db_url.startswith("sqlite"):
    _ssl_ctx = ssl.create_default_context()
    _connect_args = {"ssl": _ssl_ctx}

engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,   # detect stale connections before use
    pool_recycle=300,     # recycle connections every 5 min (Neon idle timeout)
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
