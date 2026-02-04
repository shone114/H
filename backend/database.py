from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

import ssl

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

# Create a custom SSL context that ignores certificate verification
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

engine = create_async_engine(DATABASE_URL, echo=False, connect_args={"ssl": ssl_context})

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with SessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()
