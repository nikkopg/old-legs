# READY FOR QA
# Feature: FastAPI project scaffold (TASK-001)
# What was built:
#   - FastAPI app entry point with CORS configuration
#   - Health check endpoint at GET /health
#   - Router stubs included for: auth, activities, plan, coach
# Edge cases to test:
#   - Health check returns {"status": "ok"} on GET /health
#   - CORS headers present when frontend calls from http://localhost:3000
#   - CORS rejects requests from unauthorized origins
#   - 404 on undefined routes with proper JSON error body

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

from routers import auth, activities, plan, coach

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="allow")

    # Defaults — override via environment variables in production
    api_port: int = 8000
    cors_origin: str = "http://localhost:3000"


settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: log environment info (no secrets)
    logger.info(f"Old Legs API starting — port {settings.api_port}")
    logger.info(f"CORS origin: {settings.cors_origin}")
    yield
    # Shutdown
    logger.info("Old Legs API shutting down")


app = FastAPI(
    title="Old Legs API",
    description=(
        "AI running coach powered by Pak Har.\n\n"
        "## Schemas\n"
        "All request/response shapes are defined in `apps/api/schemas/`:\n"
        "- User: `schemas/user.py` (UserCreate, UserRead, UserUpdate, UserProfile)\n"
        "- Activity: `schemas/activity.py` (ActivityCreate, ActivityRead, ActivityUpdate)\n"
        "- TrainingPlan: `schemas/training_plan.py` (TrainingPlanCreate, TrainingPlanRead)\n"
        "- ChatMessage: `schemas/chat_message.py` (ChatMessageCreate, ChatMessageRead)\n"
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include router stubs
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(activities.router, prefix="/activities", tags=["activities"])
app.include_router(plan.router, prefix="/plan", tags=["plan"])
app.include_router(coach.router, prefix="/coach", tags=["coach"])


@app.get("/health", tags=["health"])
def health_check():
    """Lightweight health check for load balancers and container orchestration."""
    return {"status": "ok"}
