from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

from database import engine, Base
from routes import rooms, questions, organizer, ws

load_dotenv()

app = FastAPI(title="HushHour API")

# CORS Configuration
origins = os.getenv("CORS_ORIGINS", "").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    return response

# Include Routers
app.include_router(rooms.router)
app.include_router(questions.router)
app.include_router(organizer.router)
app.include_router(ws.router)

@app.on_event("startup")
async def startup_event():
    # create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
async def root():
    return {"message": "HushHour API is running"}
