from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from database import engine, Base
from routes import rooms, questions, organizer, ws

load_dotenv()

app = FastAPI(title="HushHour API")

# CORS Configuration
origins = [
    "http://localhost:5173",
    "http://localhost:4173",
    "https://h-nine-gules.vercel.app",
    "https://hushhour.app",
]

# Add env origins if present
if env_origins := os.getenv("CORS_ORIGINS"):
    origins.extend([o.strip() for o in env_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    # Simple request logging
    print(f"Request: {request.method} {request.url}", flush=True)
    return await call_next(request)

# Include Routers
app.include_router(rooms.router)
app.include_router(questions.router)
app.include_router(organizer.router)
app.include_router(ws.router)

@app.on_event("startup")
async def startup_event():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
async def root():
    return {"status": "ok", "message": "HushHour API is running"}
