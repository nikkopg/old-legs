"""
Unit tests for services/hr_utils.py::get_hr_params.

Uses lightweight MagicMock objects — no ORM or DB fixtures required.
"""

from unittest.mock import MagicMock

from services.hr_utils import get_hr_params
from services.coach import FALLBACK_MAX_HR


def _make_user(*, max_hr_observed=None, max_hr=None, resting_hr=None) -> MagicMock:
    user = MagicMock()
    user.max_hr_observed = max_hr_observed
    user.max_hr = max_hr
    user.resting_hr = resting_hr
    return user


def _make_activity(*, max_hr=None, average_hr=None) -> MagicMock:
    act = MagicMock()
    act.max_hr = max_hr
    act.average_hr = average_hr
    return act


class TestGetHrParams:
    def test_uses_max_hr_observed_over_max_hr(self):
        """max_hr_observed takes priority over max_hr when both are set."""
        user = _make_user(max_hr_observed=175, max_hr=185)
        _, max_hr = get_hr_params(user, [])
        assert max_hr == 175

    def test_falls_back_to_max_hr_when_no_observed(self):
        """Falls back to max_hr when max_hr_observed is None."""
        user = _make_user(max_hr_observed=None, max_hr=185)
        _, max_hr = get_hr_params(user, [])
        assert max_hr == 185

    def test_scans_activity_max_hr_as_fallback(self):
        """When user has no HR fields set, scans activity max_hr values and picks the highest."""
        user = _make_user(max_hr_observed=None, max_hr=None)
        activities = [
            _make_activity(max_hr=170),
            _make_activity(max_hr=180),
            _make_activity(max_hr=165),
        ]
        _, max_hr = get_hr_params(user, activities)
        assert max_hr == 180

    def test_uses_avg_hr_estimate_when_no_max(self):
        """Falls back to int(max(average_hr) * 1.1) when no max_hr values exist."""
        user = _make_user(max_hr_observed=None, max_hr=None)
        activities = [
            _make_activity(max_hr=None, average_hr=150),
            _make_activity(max_hr=None, average_hr=160),
        ]
        _, max_hr = get_hr_params(user, activities)
        assert max_hr == int(160 * 1.1)

    def test_uses_fallback_max_hr_with_no_data(self):
        """Returns FALLBACK_MAX_HR when user has no HR data and activities list is empty."""
        user = _make_user(max_hr_observed=None, max_hr=None)
        _, max_hr = get_hr_params(user, [])
        assert max_hr == FALLBACK_MAX_HR
