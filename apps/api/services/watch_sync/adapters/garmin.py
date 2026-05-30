"""
Garmin Connect adapter.

Uses garminconnect's typed workout helpers (RunningWorkout, WorkoutSegment,
create_*_step) — validated against a real Garmin account in the PoC script
(2026-05-28, workout ID 1582206396).

PoC findings:
- garth.oauth2_token is not accessible in garminconnect >=0.2.21 — session caching
  is deferred to a future version. v1 re-authenticates on every sync (~1-2s overhead).
- HR targets use Garmin zone numbers (1-5), not raw bpm — the user's configured
  zones in Garmin Connect determine the actual bpm range shown on the watch.
- upload_running_workout() is the correct entry point (not upload_workout with raw JSON).
"""

from __future__ import annotations

import logging
from datetime import date

logger = logging.getLogger(__name__)


class GarminAdapter:
    """
    Adapter for Garmin Connect structured workouts.

    Credentials shape: {"email": str, "password": str}
    Re-authenticates on every sync (session caching deferred to v1.1).
    """

    def __init__(self) -> None:
        self._client = None

    # ------------------------------------------------------------------
    # WatchAdapter protocol
    # ------------------------------------------------------------------

    def connect(self, credentials: dict[str, str]) -> None:
        """
        Authenticate with Garmin Connect.

        Raises:
            ValueError: credentials missing required keys.
            garminconnect.GarminConnectAuthenticationError: bad credentials or MFA needed.
        """
        import garminconnect

        email = credentials.get("email")
        password = credentials.get("password")
        if not email or not password:
            raise ValueError("Garmin credentials must include 'email' and 'password'")

        client = garminconnect.Garmin(email, password)
        client.login()
        self._client = client

    def connect_with_mfa(self, credentials: dict[str, str], mfa_code: str) -> None:
        """
        Complete Garmin login with an MFA code.

        Passes the code directly to login() on a fresh Garmin instance (PoC
        option a). Validated only for accounts with 2FA enabled.
        """
        import garminconnect

        email = credentials.get("email")
        password = credentials.get("password")
        if not email or not password:
            raise ValueError("Garmin credentials must include 'email' and 'password'")

        client = garminconnect.Garmin(email, password)
        client.login(mfa_code)
        self._client = client

    def validate_credentials(self, credentials: dict[str, str]) -> bool:
        try:
            self.connect(credentials)
            return True
        except Exception:
            return False

    def push_workout(self, workout: "WorkoutSpec") -> str:  # noqa: F821
        """
        Create and schedule a structured workout in Garmin Connect.

        Returns the Garmin workout ID string.
        """
        if self._client is None:
            raise RuntimeError("GarminAdapter not connected — call connect() first")

        garmin_workout = _build_garmin_workout(workout)
        result = self._client.upload_running_workout(garmin_workout)
        workout_id = str(result.get("workoutId", ""))

        if workout_id:
            self._client.schedule_workout(workout_id, workout.scheduled_date.isoformat())

        return workout_id

    def disconnect(self) -> None:
        self._client = None


# ------------------------------------------------------------------
# WorkoutSpec -> garminconnect RunningWorkout
# ------------------------------------------------------------------

def _no_target() -> dict:
    return {
        "workoutTargetTypeId": 1,
        "workoutTargetTypeKey": "no.target",
        "displayOrder": 1,
    }


def _build_step(step: "WorkoutStep", order: int) -> "ExecutableStep":  # noqa: F821
    """
    Build a Garmin ExecutableStep from a WorkoutStep.

    targetValueOne / targetValueTwo must be TOP-LEVEL fields on ExecutableStep —
    NOT nested inside the targetType dict (PoC finding 2026-05-28).

    Warmup and cooldown always get no.target (cleaner watch face).
    Active and rest steps get their target if target_low/high are set.

    Pace targets use speed.zone (Garmin's native representation for pace/speed).
    Whether the watch displays kph or min/km is controlled by the user's Garmin
    device setting: Settings → System → Units → Running Speed → Pace.
    Pace values in WorkoutStep are in sec/km; we convert to m/s for Garmin.
    """
    from garminconnect.workout import ExecutableStep, TargetType, StepType, ConditionType

    _STEP_TYPES = {
        "warmup":   {"stepTypeId": StepType.WARMUP,    "stepTypeKey": "warmup",    "displayOrder": 1},
        "active":   {"stepTypeId": StepType.INTERVAL,  "stepTypeKey": "interval",  "displayOrder": 3},
        "cooldown": {"stepTypeId": StepType.COOLDOWN,  "stepTypeKey": "cooldown",  "displayOrder": 2},
        "rest":     {"stepTypeId": StepType.RECOVERY,  "stepTypeKey": "recovery",  "displayOrder": 4},
    }

    end_condition = {
        "conditionTypeId": ConditionType.TIME,
        "conditionTypeKey": "time",
        "displayOrder": 2,
        "displayable": True,
    }

    step_type_dict = _STEP_TYPES.get(step.step_type, _STEP_TYPES["active"])
    use_target = (
        step.step_type not in ("warmup", "cooldown")
        and step.target_low is not None
        and step.target_high is not None
        and step.target_type != "open"
    )

    if not use_target:
        return ExecutableStep(
            stepOrder=order,
            stepType=step_type_dict,
            endCondition=end_condition,
            endConditionValue=float(step.duration_seconds),
            targetType=_no_target(),
        )

    if step.target_type == "heart_rate":
        target_type = {"workoutTargetTypeId": TargetType.HEART_RATE, "workoutTargetTypeKey": "heart.rate.zone", "displayOrder": 4}
        val1, val2 = round(step.target_low), round(step.target_high)

    elif step.target_type == "pace":
        # sec/km → m/s. target_low is the faster end (lower sec/km = higher m/s).
        # Garmin expects targetValueOne < targetValueTwo (slower m/s first).
        target_type = {"workoutTargetTypeId": TargetType.SPEED, "workoutTargetTypeKey": "speed.zone", "displayOrder": 5}
        faster_ms = round(1000.0 / step.target_low, 4)   # e.g. 330 s/km → 3.03 m/s
        slower_ms = round(1000.0 / step.target_high, 4)  # e.g. 390 s/km → 2.56 m/s
        val1, val2 = slower_ms, faster_ms                # low → high (slower → faster)

    elif step.target_type == "cadence":
        target_type = {"workoutTargetTypeId": TargetType.CADENCE, "workoutTargetTypeKey": "cadence", "displayOrder": 3}
        val1, val2 = round(step.target_low), round(step.target_high)

    elif step.target_type == "power":
        target_type = {"workoutTargetTypeId": TargetType.POWER, "workoutTargetTypeKey": "power.zone", "displayOrder": 2}
        val1, val2 = round(step.target_low), round(step.target_high)

    else:
        return ExecutableStep(
            stepOrder=order,
            stepType=step_type_dict,
            endCondition=end_condition,
            endConditionValue=float(step.duration_seconds),
            targetType=_no_target(),
        )

    return ExecutableStep(
        stepOrder=order,
        stepType=step_type_dict,
        endCondition=end_condition,
        endConditionValue=float(step.duration_seconds),
        targetType=target_type,
        targetValueOne=val1,
        targetValueTwo=val2,
    )


def _build_garmin_workout(workout: "WorkoutSpec") -> "RunningWorkout":  # noqa: F821
    from garminconnect.workout import RunningWorkout, WorkoutSegment

    garmin_steps = [_build_step(s, i) for i, s in enumerate(workout.steps, start=1)]

    return RunningWorkout(
        workoutName=workout.name,
        description=workout.description or None,
        estimatedDurationInSecs=float(sum(s.duration_seconds for s in workout.steps)),
        workoutSegments=[
            WorkoutSegment(
                segmentOrder=1,
                sportType={"sportTypeId": 1, "sportTypeKey": "running"},
                workoutSteps=garmin_steps,
            )
        ],
    )
