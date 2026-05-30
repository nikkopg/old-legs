"""
Unit tests for services/watch_sync/plan_mapper.py.

Tests every PlanDay type mapping including the duration underflow edge case.
Uses real SQLite DB via conftest fixtures, no garminconnect needed here.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest

from models.training_plan import TrainingPlan
from models.user import User
from services.watch_sync.plan_mapper import map_plan_to_workouts
from services.watch_sync.base import WorkoutSpec, WorkoutStep


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_plan(plan_data: dict, pak_har_notes: dict | None = None) -> TrainingPlan:
    plan = MagicMock(spec=TrainingPlan)
    plan.plan_data = plan_data
    plan.pak_har_notes = pak_har_notes or {}
    plan.week_start_date = date(2026, 6, 1)  # Monday
    return plan


def _make_user(max_hr: int = 180) -> User:
    user = MagicMock(spec=User)
    user.resting_hr = 60
    user.max_hr = max_hr
    user.max_hr_observed = None
    return user


def _day(type_: str, duration_min: int = 40) -> dict:
    return {"type": type_, "description": f"{type_} run", "duration_minutes": duration_min}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_easy_run_nominal():
    plan = _make_plan({"monday": _day("easy", 40)})
    user = _make_user(max_hr=180)
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    w = workouts[0]
    assert len(w.steps) == 3
    step_types = [s.step_type for s in w.steps]
    assert step_types == ["warmup", "active", "cooldown"]
    # warmup 10min + active 25min + cooldown 5min = 40min
    assert sum(s.duration_seconds for s in w.steps) == 40 * 60
    # All steps should have heart_rate targets
    for s in w.steps:
        assert s.target_type == "heart_rate"
        assert s.target_low is not None
        assert s.target_high is not None


def test_easy_run_duration_underflow():
    """Short easy run (< 16 min) should emit a single active step, no warmup/cooldown crash."""
    plan = _make_plan({"tuesday": _day("easy", 10)})
    user = _make_user()
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    assert len(workouts[0].steps) == 1
    assert workouts[0].steps[0].step_type == "active"
    assert workouts[0].steps[0].duration_seconds == 600


def test_tempo_run():
    plan = _make_plan({"wednesday": _day("tempo", 45)})
    user = _make_user(max_hr=180)
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    w = workouts[0]
    assert len(w.steps) == 3
    assert w.steps[1].step_type == "active"
    # Tempo main step should target Z4 (80-90% HRmax = 144-162)
    assert w.steps[1].target_low == pytest.approx(0.80 * 180, abs=1)
    assert w.steps[1].target_high == pytest.approx(0.90 * 180, abs=1)


def test_long_run():
    plan = _make_plan({"saturday": _day("long", 90)})
    user = _make_user()
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    assert len(workouts[0].steps) == 3  # warmup + active + cooldown


def test_interval_run():
    """Interval structure is fixed (6x3 min Z5 + 2 min rest) regardless of duration_minutes."""
    plan = _make_plan({"thursday": _day("interval", 60)})
    user = _make_user()
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    steps = workouts[0].steps
    # warmup + 6*(active+rest) + cooldown = 1 + 12 + 1 = 14
    assert len(steps) == 14
    assert steps[0].step_type == "warmup"
    assert steps[-1].step_type == "cooldown"
    active_steps = [s for s in steps if s.step_type == "active"]
    assert len(active_steps) == 6


def test_recovery_run():
    plan = _make_plan({"friday": _day("recovery", 30)})
    user = _make_user(max_hr=180)
    workouts = map_plan_to_workouts(plan, user, [])
    assert len(workouts) == 1
    w = workouts[0]
    assert len(w.steps) == 1
    assert w.steps[0].step_type == "active"
    assert w.steps[0].duration_seconds == 30 * 60
    # Z1 = 50-60% HRmax
    assert w.steps[0].target_low == pytest.approx(0.50 * 180, abs=1)


def test_cross_training_skipped():
    plan = _make_plan({"monday": _day("cross_training", 30)})
    workouts = map_plan_to_workouts(plan, _make_user(), [])
    assert workouts == []


def test_rest_skipped():
    plan = _make_plan({"tuesday": {"type": "rest", "description": "Rest", "duration_minutes": 0}})
    workouts = map_plan_to_workouts(plan, _make_user(), [])
    assert workouts == []


def test_pak_har_notes_in_description():
    plan = _make_plan(
        {"monday": _day("easy", 40)},
        pak_har_notes={"monday": "Start slow. The first 10 minutes don't count."},
    )
    workouts = map_plan_to_workouts(plan, _make_user(), [])
    assert workouts[0].description == "Start slow. The first 10 minutes don't count."


def test_missing_pak_har_notes_key_no_crash():
    """Missing key in pak_har_notes should fall back to empty string, not raise KeyError."""
    plan = _make_plan(
        {"monday": _day("easy", 40)},
        pak_har_notes={},  # no monday key
    )
    workouts = map_plan_to_workouts(plan, _make_user(), [])
    assert len(workouts) == 1
    assert workouts[0].description == ""


def test_scheduled_date_correct():
    """Monday plan, tuesday workout should be week_start + 1 day."""
    plan = _make_plan({
        "monday": _day("rest", 0),
        "tuesday": _day("easy", 40),
    })
    workouts = map_plan_to_workouts(plan, _make_user(), [])
    assert len(workouts) == 1
    assert workouts[0].scheduled_date == date(2026, 6, 2)  # Tuesday = June 2
