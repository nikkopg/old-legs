"""
HR parameter helpers shared across plan generation and watch sync.
"""

from models.activity import Activity
from models.user import User
from services.coach import DEFAULT_RHR, FALLBACK_MAX_HR


def get_hr_params(user: User, activities: list[Activity]) -> tuple[int, int]:
    """
    Resolve resting HR and max HR for zone classification.

    Prefers values stored on the User row (resting_hr, max_hr_observed / max_hr).
    Falls back to scanning activity max_hr fields, then population defaults.

    Args:
        user: The authenticated User ORM object.
        activities: Recent activities used as fallback for max HR.

    Returns:
        A (rhr, max_hr) tuple, both in bpm.
    """
    rhr = user.resting_hr if user.resting_hr is not None else DEFAULT_RHR
    max_hr = user.max_hr_observed or user.max_hr
    if max_hr is None:
        candidates = [a.max_hr for a in activities if a.max_hr is not None]
        max_hr = max(candidates) if candidates else None
    if max_hr is None:
        avg_hrs = [a.average_hr for a in activities if a.average_hr is not None]
        if avg_hrs:
            max_hr = int(max(avg_hrs) * 1.1)
        else:
            max_hr = FALLBACK_MAX_HR

    return rhr, max_hr
