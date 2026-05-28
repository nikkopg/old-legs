"""
Platform-agnostic workout types and WatchAdapter protocol.

All watch platform adapters must conform to WatchAdapter. The internal
WorkoutSpec format is platform-neutral — each adapter translates it to
its own API schema.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Protocol

from pydantic import BaseModel


class WorkoutStep(BaseModel):
    step_type: Literal["warmup", "active", "cooldown", "rest"]
    duration_seconds: int
    target_type: Literal["heart_rate", "pace", "cadence", "power", "open"]
    # Units per target_type:
    #   heart_rate → bpm
    #   pace       → sec/km  (e.g. 330 = 5:30/km). Garmin receives m/s = 1000/sec_per_km.
    #   cadence    → steps per minute (spm)
    #   power      → watts
    #   open       → no target (target_low/high ignored)
    target_low: float | None = None
    target_high: float | None = None


class WorkoutSpec(BaseModel):
    name: str           # e.g. "Tuesday - Easy Run — Jun 2"
    description: str    # Pak Har's note for the day
    sport: Literal["running"] = "running"
    steps: list[WorkoutStep]
    scheduled_date: date


class WatchAdapter(Protocol):
    def connect(self, credentials: dict) -> None: ...
    def validate_credentials(self, credentials: dict) -> bool: ...
    def push_workout(self, workout: WorkoutSpec) -> str: ...  # returns platform workout ID
    def disconnect(self) -> None: ...
