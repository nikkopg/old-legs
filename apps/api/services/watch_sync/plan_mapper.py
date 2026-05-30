"""
Maps TrainingPlan day entries to platform-agnostic WorkoutSpec objects.

All adapters consume WorkoutSpec — this module is the single place where
PlanDay types are interpreted into structured workout steps.
"""

from __future__ import annotations

from datetime import date, timedelta

from schemas.training_plan import PlanDay
from services.hr_utils import get_hr_params
from models.activity import Activity
from models.training_plan import TrainingPlan
from models.user import User
from services.watch_sync.base import WorkoutSpec, WorkoutStep

_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# HR zone target percentages of HRmax (not Karvonen — simpler for watch targets)
_ZONE_PCTS = {
    1: (0.50, 0.60),
    2: (0.60, 0.70),
    3: (0.70, 0.80),
    4: (0.80, 0.90),
    5: (0.90, 1.00),
}

# Minimum duration (seconds) for warmup + cooldown to make sense
# easy/long: 10 min warmup + 5 min cooldown = 15 min = 900 s overhead
_EASY_OVERHEAD_S = 15 * 60
# tempo: 10 min warmup + 10 min cooldown = 20 min overhead
_TEMPO_OVERHEAD_S = 20 * 60


def _hr_targets(zone: int, max_hr: int) -> tuple[float, float]:
    low_pct, high_pct = _ZONE_PCTS[zone]
    return low_pct * max_hr, high_pct * max_hr


def _build_steps_easy(duration_s: int, max_hr: int) -> list[WorkoutStep]:
    z2_low, z2_high = _hr_targets(2, max_hr)
    if duration_s <= _EASY_OVERHEAD_S:
        return [WorkoutStep(step_type="active", duration_seconds=duration_s,
                            target_type="heart_rate", target_low=z2_low, target_high=z2_high)]
    warmup_s = 10 * 60
    cooldown_s = 5 * 60
    main_s = duration_s - warmup_s - cooldown_s
    z1_low, z1_high = _hr_targets(1, max_hr)
    return [
        WorkoutStep(step_type="warmup", duration_seconds=warmup_s,
                    target_type="heart_rate", target_low=z1_low, target_high=z1_high),
        WorkoutStep(step_type="active", duration_seconds=main_s,
                    target_type="heart_rate", target_low=z2_low, target_high=z2_high),
        WorkoutStep(step_type="cooldown", duration_seconds=cooldown_s,
                    target_type="heart_rate", target_low=z1_low, target_high=z1_high),
    ]


def _build_steps_tempo(duration_s: int, max_hr: int) -> list[WorkoutStep]:
    z4_low, z4_high = _hr_targets(4, max_hr)
    if duration_s <= _TEMPO_OVERHEAD_S:
        return [WorkoutStep(step_type="active", duration_seconds=duration_s,
                            target_type="heart_rate", target_low=z4_low, target_high=z4_high)]
    warmup_s = 10 * 60
    cooldown_s = 10 * 60
    main_s = duration_s - warmup_s - cooldown_s
    z1_low, z1_high = _hr_targets(1, max_hr)
    return [
        WorkoutStep(step_type="warmup", duration_seconds=warmup_s,
                    target_type="heart_rate", target_low=z1_low, target_high=z1_high),
        WorkoutStep(step_type="active", duration_seconds=main_s,
                    target_type="heart_rate", target_low=z4_low, target_high=z4_high),
        WorkoutStep(step_type="cooldown", duration_seconds=cooldown_s,
                    target_type="heart_rate", target_low=z1_low, target_high=z1_high),
    ]


def _build_steps_interval(max_hr: int) -> list[WorkoutStep]:
    # Fixed structure: 10 min warmup, 6x(3 min Z5 + 2 min Z1 recovery), 10 min cooldown
    z5_low, z5_high = _hr_targets(5, max_hr)
    z1_low, z1_high = _hr_targets(1, max_hr)
    steps: list[WorkoutStep] = [
        WorkoutStep(step_type="warmup", duration_seconds=10 * 60,
                    target_type="heart_rate", target_low=z1_low, target_high=z1_high),
    ]
    for _ in range(6):
        steps.append(WorkoutStep(step_type="active", duration_seconds=3 * 60,
                                 target_type="heart_rate", target_low=z5_low, target_high=z5_high))
        steps.append(WorkoutStep(step_type="rest", duration_seconds=2 * 60,
                                 target_type="heart_rate", target_low=z1_low, target_high=z1_high))
    steps.append(WorkoutStep(step_type="cooldown", duration_seconds=10 * 60,
                             target_type="heart_rate", target_low=z1_low, target_high=z1_high))
    return steps


def _build_steps_recovery(duration_s: int, max_hr: int) -> list[WorkoutStep]:
    z1_low, z1_high = _hr_targets(1, max_hr)
    return [WorkoutStep(step_type="active", duration_seconds=duration_s,
                        target_type="heart_rate", target_low=z1_low, target_high=z1_high)]


def map_plan_to_workouts(
    plan: TrainingPlan,
    user: User,
    activities: list[Activity],
) -> list[WorkoutSpec]:
    """
    Convert a TrainingPlan into a list of WorkoutSpec objects (one per running day).

    Skips rest and cross_training days — no workout is created for them.
    plan.plan_data keys are lowercase day names ("monday" .. "sunday").
    plan.pak_har_notes keys match plan_data keys.

    Args:
        plan: The active TrainingPlan ORM object.
        user: The authenticated user (used for HR params).
        activities: Recent activities for HRmax fallback.

    Returns:
        List of WorkoutSpec, one per non-rest/non-cross_training day.
    """
    _, max_hr = get_hr_params(user, activities)
    week_start: date = plan.week_start_date

    workouts: list[WorkoutSpec] = []
    for i, day_name in enumerate(_DAY_NAMES):
        raw = plan.plan_data.get(day_name)
        if raw is None:
            continue
        plan_day = PlanDay.model_validate(raw)
        if plan_day.type in ("rest", "cross_training"):
            continue
        if plan_day.duration_minutes <= 0:
            continue

        duration_s = plan_day.duration_minutes * 60
        description = plan.pak_har_notes.get(day_name) or ""

        if plan_day.type == "interval":
            steps = _build_steps_interval(max_hr)
        elif plan_day.type in ("easy", "long"):
            steps = _build_steps_easy(duration_s, max_hr)
        elif plan_day.type == "tempo":
            steps = _build_steps_tempo(duration_s, max_hr)
        elif plan_day.type == "recovery":
            steps = _build_steps_recovery(duration_s, max_hr)
        else:
            # Unknown type — emit a single open-target step
            steps = [WorkoutStep(step_type="active", duration_seconds=duration_s,
                                 target_type="open")]

        day_date = week_start + timedelta(days=i)
        display_day = day_name.capitalize()
        type_label = plan_day.type.replace("_", " ").title()
        month_day = f"{day_date.day} {day_date.strftime('%b')}"

        workouts.append(WorkoutSpec(
            name=f"{display_day} - {type_label} Run — {month_day}",
            description=description,
            steps=steps,
            scheduled_date=day_date,
        ))

    return workouts
