import asyncio
from core.database import engine, Base
from models.db_models import User, Subject, Query, Progress

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully")

if __name__ == "__main__":
    asyncio.run(create_tables())
