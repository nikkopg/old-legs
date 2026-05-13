"""
Tests for the Strava streams pipeline introduced in TASK-165/166.

Covers:
- _fetch_streams_for_activity: happy path, downsampling, partial streams, HTTP errors
- _fetch_splits_metric_fallback: happy path, HTTP errors
- _derive_splits_from_streams: splits derivation and pace math
- sync_activities sentinel guard: activities with streams={} are never re-fetched

Strava HTTP calls are mocked via respx. Database is real SQLite in-memory.
"""

import math
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock
import pytest
import httpx
import respx
from httpx import Response
from sqlalchemy.orm import Session

from models.activity import Activity
from models.user import User
from services.strava import (
    _fetch_streams_for_activity,
    _fetch_splits_metric_fallback,
    _derive_splits_from_streams,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_stream_entry(data: list) -> dict:
    """Wrap a data array in the Strava stream response envelope."""
    return {"type": "data", "series_type": "distance", "original_size": len(data), "resolution": "high", "data": data}


def _full_streams_payload(n: int = 10) -> dict:
    """Build a minimal full 9-key streams payload with n data points."""
    time_data = list(range(n))
    dist_data = [i * 10.0 for i in range(n)]  # 10m per second
    vel_data = [3.0] * n
    hr_data = [150] * n
    cad_data = [85.0] * n
    alt_data = [100.0 + i * 0.5 for i in range(n)]
    grade_data = [0.5] * n
    latlng_data = [[3.1416 + i * 0.0001, 101.6869 + i * 0.0001] for i in range(n)]
    moving_data = [True] * n

    return {
        "time": _make_stream_entry(time_data),
        "distance": _make_stream_entry(dist_data),
        "velocity_smooth": _make_stream_entry(vel_data),
        "heartrate": _make_stream_entry(hr_data),
        "cadence": _make_stream_entry(cad_data),
        "altitude": _make_stream_entry(alt_data),
        "grade_smooth": _make_stream_entry(grade_data),
        "latlng": _make_stream_entry(latlng_data),
        "moving": _make_stream_entry(moving_data),
    }


STREAMS_URL_PREFIX = "https://www.strava.com/api/v3/activities/12345/streams"
DETAIL_URL = "https://www.strava.com/api/v3/activities/12345"
ACCESS_TOKEN = "fake_access_token"


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — happy path
# ---------------------------------------------------------------------------

async def test_fetch_streams_happy_path():
    """
    Full 9-key streams response → compact dict with correct keys and values.
    """
    payload = _full_streams_payload(n=10)

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = payload

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    mock_context = MagicMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_client)
    mock_context.__aexit__ = AsyncMock(return_value=False)

    with patch("services.strava.httpx.AsyncClient", return_value=mock_context):
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is not None
    # All compact keys must be present
    for key in ("n", "time", "dist", "vel", "hr", "cad", "alt", "grade", "latlng"):
        assert key in result, f"Missing key: {key}"

    # n must equal the length of the time array (10 points, no downsampling needed)
    assert result["n"] == 10
    assert len(result["time"]) == result["n"]
    assert len(result["dist"]) == result["n"]
    assert len(result["vel"]) == result["n"]
    assert len(result["hr"]) == result["n"]
    assert len(result["cad"]) == result["n"]
    assert len(result["alt"]) == result["n"]
    assert len(result["grade"]) == result["n"]
    assert len(result["latlng"]) == result["n"]


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — downsampling
# ---------------------------------------------------------------------------

async def test_fetch_streams_downsampling():
    """
    When the stream has >500 data points, the stored n field is ≤500 and
    every stored array is exactly n elements long.
    """
    n_raw = 1200  # well above 500 threshold
    payload = _full_streams_payload(n=n_raw)

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = payload

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    mock_context = MagicMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_client)
    mock_context.__aexit__ = AsyncMock(return_value=False)

    with patch("services.strava.httpx.AsyncClient", return_value=mock_context):
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is not None
    assert result["n"] <= 500

    n_stored = result["n"]
    for key in ("time", "dist", "vel", "hr", "cad", "alt", "grade", "latlng"):
        assert len(result[key]) == n_stored, (
            f"Array '{key}' has {len(result[key])} elements, expected {n_stored}"
        )

    # Verify the stride math: stride = ceil(1200/500) = 3; 1200[::3] = 400 elements
    expected_stride = max(1, math.ceil(n_raw / 500))
    expected_n = len(range(0, n_raw, expected_stride))
    assert result["n"] == expected_n


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — partial streams (missing optional keys)
# ---------------------------------------------------------------------------

async def test_fetch_streams_partial_missing_optional_keys():
    """
    Response has time/distance/velocity but is missing heartrate, cadence, altitude.
    hr, cad, alt keys in the result must be None.
    """
    n = 10
    partial_payload = {
        "time": _make_stream_entry(list(range(n))),
        "distance": _make_stream_entry([i * 10.0 for i in range(n)]),
        "velocity_smooth": _make_stream_entry([3.0] * n),
        # heartrate, cadence, altitude intentionally absent
        "grade_smooth": _make_stream_entry([0.5] * n),
        "latlng": _make_stream_entry([[3.0 + i * 0.0001, 101.0 + i * 0.0001] for i in range(n)]),
        "moving": _make_stream_entry([True] * n),
    }

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = partial_payload

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    mock_context = MagicMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_client)
    mock_context.__aexit__ = AsyncMock(return_value=False)

    with patch("services.strava.httpx.AsyncClient", return_value=mock_context):
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is not None
    assert result["hr"] is None
    assert result["cad"] is None
    assert result["alt"] is None
    # Keys that were present should be populated
    assert result["vel"] is not None
    assert result["grade"] is not None
    assert result["latlng"] is not None


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — missing time or distance → None
# ---------------------------------------------------------------------------

async def test_fetch_streams_missing_time_returns_none():
    """
    Response with no time array → returns None (not a crash).
    """
    n = 10
    payload_no_time = {
        "distance": _make_stream_entry([i * 10.0 for i in range(n)]),
        "velocity_smooth": _make_stream_entry([3.0] * n),
    }

    with respx.mock:
        respx.get(url__startswith=STREAMS_URL_PREFIX).mock(
            return_value=Response(200, json=payload_no_time)
        )
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is None


async def test_fetch_streams_missing_distance_returns_none():
    """
    Response with no distance array → returns None (not a crash).
    """
    n = 10
    payload_no_dist = {
        "time": _make_stream_entry(list(range(n))),
        "velocity_smooth": _make_stream_entry([3.0] * n),
    }

    with respx.mock:
        respx.get(url__startswith=STREAMS_URL_PREFIX).mock(
            return_value=Response(200, json=payload_no_dist)
        )
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is None


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — HTTP errors → None (fallback triggered)
# ---------------------------------------------------------------------------

async def test_fetch_streams_404_returns_none():
    """
    Streams endpoint returns 404 → function returns None without raising.
    """
    with respx.mock:
        respx.get(url__startswith=STREAMS_URL_PREFIX).mock(
            return_value=Response(404, json={"message": "Not Found"})
        )
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is None


async def test_fetch_streams_400_returns_none():
    """
    Streams endpoint returns 400 → function returns None without raising.
    """
    with respx.mock:
        respx.get(url__startswith=STREAMS_URL_PREFIX).mock(
            return_value=Response(400, json={"message": "Bad Request"})
        )
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is None


# ---------------------------------------------------------------------------
# _fetch_streams_for_activity — vel derived from dist/time when absent
# ---------------------------------------------------------------------------

async def test_fetch_streams_vel_derived_when_absent():
    """
    When velocity_smooth is absent, vel is derived from consecutive dist/time deltas.
    The resulting vel array should be non-None and have the correct length.
    """
    n = 5
    time_data = [0, 1, 2, 3, 4]
    dist_data = [0.0, 3.0, 6.0, 9.0, 12.0]  # 3 m/s constant

    payload = {
        "time": _make_stream_entry(time_data),
        "distance": _make_stream_entry(dist_data),
        # No velocity_smooth key
    }

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = payload

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    mock_context = MagicMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_client)
    mock_context.__aexit__ = AsyncMock(return_value=False)

    with patch("services.strava.httpx.AsyncClient", return_value=mock_context):
        result = await _fetch_streams_for_activity("12345", ACCESS_TOKEN)

    assert result is not None
    assert result["vel"] is not None
    assert len(result["vel"]) == result["n"]
    # Second point onward: dd=3, dt=1 → 3.0 m/s
    # First point is 0.0 (no prior delta); after downsampling (stride=1 for n=5) check index 1
    assert result["vel"][0] == pytest.approx(0.0)
    assert result["vel"][1] == pytest.approx(3.0)


# ---------------------------------------------------------------------------
# _fetch_splits_metric_fallback — happy path
# ---------------------------------------------------------------------------

async def test_fetch_splits_metric_fallback_happy_path():
    """
    Strava detail endpoint returns splits_metric → cleaned list returned.
    """
    detail_payload = {
        "id": 12345,
        "splits_metric": [
            {
                "split": 1,
                "moving_time": 360,
                "distance": 1000.0,
                "average_speed": 2.78,
                "average_heartrate": 148.0,
                "average_cadence": 86.5,
                "elevation_difference": 5.0,
            },
            {
                "split": 2,
                "moving_time": 370,
                "distance": 1000.0,
                "average_speed": 2.70,
                "average_heartrate": 152.0,
                "average_cadence": 85.0,
                "elevation_difference": -3.0,
            },
        ],
    }

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = detail_payload

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    mock_context = MagicMock()
    mock_context.__aenter__ = AsyncMock(return_value=mock_client)
    mock_context.__aexit__ = AsyncMock(return_value=False)

    with patch("services.strava.httpx.AsyncClient", return_value=mock_context):
        result = await _fetch_splits_metric_fallback("12345", ACCESS_TOKEN)

    assert result is not None
    assert len(result) == 2
    assert result[0]["km"] == 1
    assert result[0]["moving_time"] == 360
    assert result[0]["distance"] == pytest.approx(1000.0)
    assert result[0]["avg_speed_ms"] == pytest.approx(2.78)
    assert result[0]["hr"] == pytest.approx(148.0)
    assert result[0]["cad"] == pytest.approx(86.5)
    assert result[0]["elev"] == pytest.approx(5.0)

    assert result[1]["km"] == 2


# ---------------------------------------------------------------------------
# _fetch_splits_metric_fallback — HTTP errors → None
# ---------------------------------------------------------------------------

async def test_fetch_splits_metric_fallback_404_returns_none():
    """Strava detail endpoint returns 404 → None without raising."""
    with respx.mock:
        respx.get(DETAIL_URL).mock(return_value=Response(404, json={"message": "Not Found"}))
        result = await _fetch_splits_metric_fallback("12345", ACCESS_TOKEN)

    assert result is None


async def test_fetch_splits_metric_fallback_400_returns_none():
    """Strava detail endpoint returns 400 → None without raising."""
    with respx.mock:
        respx.get(DETAIL_URL).mock(return_value=Response(400, json={"message": "Bad Request"}))
        result = await _fetch_splits_metric_fallback("12345", ACCESS_TOKEN)

    assert result is None


async def test_fetch_splits_metric_fallback_no_splits_metric_returns_none():
    """Detail endpoint returns 200 but no splits_metric field → None."""
    detail_payload = {"id": 12345, "name": "Run with no splits"}

    with respx.mock:
        respx.get(DETAIL_URL).mock(return_value=Response(200, json=detail_payload))
        result = await _fetch_splits_metric_fallback("12345", ACCESS_TOKEN)

    assert result is None


# ---------------------------------------------------------------------------
# _derive_splits_from_streams — splits derivation and pace math
# ---------------------------------------------------------------------------

def test_derive_splits_from_streams_basic():
    """
    Known velocity/time arrays → correct number of km-split entries and
    correct avg_speed_ms values.

    Run: 3 km at a steady 3.0 m/s.  One data point per second (601 points,
    0 to 600 s covering 0 to 1800 m → 1 full km completed at t=334, t=667
    so we get 1 full km when total_dist_m = 3000 m).

    Use a simpler scenario: build a 2-km run with uniform 2 m/s speed.
    time:  [0, 1, 2, ..., 1000]   (1001 points, 0..1000 s)
    dist:  [0, 2, 4, ..., 2000]   (1001 points, 0..2000 m at 2 m/s)
    """
    n = 1001
    time_arr = list(range(n))         # 0..1000 seconds
    dist_arr = [i * 2.0 for i in range(n)]  # 0..2000 m

    streams = {
        "n": n,
        "time": time_arr,
        "dist": dist_arr,
        "vel": [2.0] * n,
        "hr": [145] * n,
        "cad": [85.0] * n,
        "alt": [100.0] * n,
        "grade": [0.0] * n,
        "latlng": None,
    }

    splits = _derive_splits_from_streams(streams)

    assert splits is not None
    # 2000 m total → 2 full km splits
    assert len(splits) == 2

    # First km: dist[0]=0 to first point where dist>=1000, which is index 500 (dist=1000)
    # seg_dist ≈ 1000 m, seg_time = 500 s → avg_speed = 1000/500 = 2.0 m/s
    km1 = splits[0]
    assert km1["km"] == 1
    assert km1["avg_speed_ms"] == pytest.approx(2.0, abs=0.01)
    assert km1["distance"] == pytest.approx(1000.0, abs=1.0)

    km2 = splits[1]
    assert km2["km"] == 2
    assert km2["avg_speed_ms"] == pytest.approx(2.0, abs=0.01)


def test_derive_splits_from_streams_pace_math():
    """
    Verify pace math: given avg_speed_ms, pace in min/km = 1000 / (avg_speed_ms * 60).

    Use 3 m/s (exactly 5:33 min/km) and verify the formula holds.
    """
    n = 1001
    speed = 3.0  # m/s
    time_arr = list(range(n))             # 0..1000 s
    dist_arr = [i * speed for i in range(n)]  # 0..3000 m

    streams = {
        "n": n,
        "time": time_arr,
        "dist": dist_arr,
        "vel": [speed] * n,
        "hr": None,
        "cad": None,
        "alt": None,
        "grade": None,
        "latlng": None,
    }

    splits = _derive_splits_from_streams(streams)

    assert splits is not None
    assert len(splits) == 3  # 3000 m total → 3 km splits

    for split in splits:
        # pace = 1000 / (avg_speed_ms * 60) → should be ~5.556 min/km
        expected_pace = 1000 / (split["avg_speed_ms"] * 60)
        assert expected_pace == pytest.approx(1000 / (speed * 60), abs=0.05)


def test_derive_splits_from_streams_hr_averaged():
    """
    HR values in each km segment are averaged; result is rounded to int.
    """
    # Simple 1-km run with two distinct HR zones
    n = 201
    time_arr = list(range(n))
    dist_arr = [i * 5.0 for i in range(n)]  # 0..1000 m at 5 m/s

    # First 100 points: hr=140, last 100 points: hr=160, so mean ~150
    hr_arr = [140] * 100 + [160] * (n - 100)

    streams = {
        "n": n,
        "time": time_arr,
        "dist": dist_arr,
        "vel": [5.0] * n,
        "hr": hr_arr,
        "cad": None,
        "alt": None,
        "grade": None,
        "latlng": None,
    }

    splits = _derive_splits_from_streams(streams)

    assert splits is not None
    assert len(splits) == 1  # 1000 m
    hr_result = splits[0]["hr"]
    assert isinstance(hr_result, int)
    # With 200 data points in total (0..200), the km ends at index 200 (dist=1000).
    # Segment: start_idx=0, end_idx=200 → hr_arr[0:201] = 100×140 + 101×160
    # average = (100*140 + 101*160) / 201 ≈ 150.5 → rounded to 150 or 151
    assert 149 <= hr_result <= 152


def test_derive_splits_from_streams_elevation_diff():
    """
    Elevation difference per split = alt[end] - alt[start].
    """
    n = 201
    time_arr = list(range(n))
    dist_arr = [i * 5.0 for i in range(n)]  # 0..1000 m
    # Altitude climbs 50 m across the km
    alt_arr = [100.0 + i * 0.25 for i in range(n)]

    streams = {
        "n": n,
        "time": time_arr,
        "dist": dist_arr,
        "vel": [5.0] * n,
        "hr": None,
        "cad": None,
        "alt": alt_arr,
        "grade": None,
        "latlng": None,
    }

    splits = _derive_splits_from_streams(streams)

    assert splits is not None
    assert len(splits) == 1
    # elev = alt[200] - alt[0] = (100 + 200*0.25) - 100 = 50.0
    assert splits[0]["elev"] == pytest.approx(50.0, abs=0.5)


def test_derive_splits_empty_streams_returns_none():
    """Empty dist/time arrays → returns None gracefully."""
    streams = {"n": 0, "time": [], "dist": [], "vel": [], "hr": None, "cad": None, "alt": None, "grade": None, "latlng": None}
    result = _derive_splits_from_streams(streams)
    assert result is None


def test_derive_splits_single_point_returns_none():
    """A single data point (no segments) → returns None gracefully."""
    streams = {"n": 1, "time": [0], "dist": [0.0], "vel": [3.0], "hr": None, "cad": None, "alt": None, "grade": None, "latlng": None}
    result = _derive_splits_from_streams(streams)
    assert result is None


def test_derive_splits_sub_km_distance_produces_partial_split():
    """
    Total distance < 1 km: num_km = max(1, 0) = 1, so the function still produces
    1 partial split covering the available data. The split km=1 is returned with
    whatever distance and time the run actually covered.
    """
    n = 50
    streams = {
        "n": n,
        "time": list(range(n)),
        "dist": [i * 10.0 for i in range(n)],  # 0..490 m
        "vel": [10.0] * n,
        "hr": None,
        "cad": None,
        "alt": None,
        "grade": None,
        "latlng": None,
    }
    result = _derive_splits_from_streams(streams)
    # The impl forces at least 1 km split via max(1, ...). The split covers
    # whatever data is available — km=1, distance≈490m, avg_speed≈10 m/s.
    assert result is not None
    assert len(result) == 1
    assert result[0]["km"] == 1
    assert result[0]["distance"] == pytest.approx(490.0, abs=10.0)


# ---------------------------------------------------------------------------
# Sentinel guard: activities with streams={} must not trigger a second fetch
# ---------------------------------------------------------------------------

async def test_sync_activities_skips_sentinel_streams(
    db_session: Session,
    test_user: User,
    monkeypatch,
):
    """
    An activity with streams={} (the fallback sentinel) must NOT result in
    a call to _fetch_streams_for_activity during sync_activities.

    Method: monkeypatch fetch_activities to return 1 run whose strava_id
    already exists in the DB with streams={}. Then assert the fetch function
    is never called.
    """
    from services.strava import sync_activities

    # Use a numeric Strava ID so normalize_activity("id") → str matches the seeded id
    strava_id = "99001"

    # Seed the activity with the sentinel value
    activity = Activity(
        user_id=test_user.id,
        strava_activity_id=strava_id,
        name="Sentinel Run",
        distance_km=5.0,
        moving_time_seconds=1800,
        average_pace_min_per_km=6.0,
        average_hr=None,
        max_hr=None,
        elevation_gain_m=0,
        activity_date=datetime.now(timezone.utc) - timedelta(days=1),
        sync_status="synced",
        streams={},  # sentinel — must never be re-fetched
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    raw_strava_activity = {
        "id": 99001,
        "name": "Sentinel Run",
        "type": "Run",
        "distance": 5000.0,
        "moving_time": 1800,
        "average_speed": 2.778,
        "total_elevation_gain": 0,
        "start_date_local": "2026-05-12T07:00:00",
    }

    async def mock_fetch_activities(_token, _days=90):
        return [raw_strava_activity]

    streams_call_count = 0

    async def mock_fetch_streams(strava_activity_id, access_token):
        nonlocal streams_call_count
        streams_call_count += 1
        return None

    monkeypatch.setattr("services.strava.fetch_activities", mock_fetch_activities)
    monkeypatch.setattr("services.strava._fetch_streams_for_activity", mock_fetch_streams)

    await sync_activities(test_user.id, ACCESS_TOKEN, db_session)

    # The pipeline query filters Activity.streams.is_(None) — a sentinel {} is NOT NULL,
    # so it must be excluded and _fetch_streams_for_activity must never be called.
    assert streams_call_count == 0, (
        f"_fetch_streams_for_activity was called {streams_call_count} time(s) "
        "for an activity with the sentinel streams={} — it should have been skipped."
    )


# ---------------------------------------------------------------------------
# Fallback path: streams fetch fails → _fetch_splits_metric_fallback called,
# and streams is set to {} sentinel
# ---------------------------------------------------------------------------

async def test_sync_activities_fallback_sets_sentinel_and_splits(
    db_session: Session,
    test_user: User,
    monkeypatch,
):
    """
    When _fetch_streams_for_activity returns None for a new activity,
    _fetch_splits_metric_fallback must be called and streams must be set to {}.
    """
    from services.strava import sync_activities

    strava_id = "fallback_test_77"

    raw_strava_activity = {
        "id": 77,
        "name": "Fallback Run",
        "type": "Run",
        "distance": 5000.0,
        "moving_time": 1800,
        "average_speed": 2.778,
        "total_elevation_gain": 0,
        "start_date_local": "2026-05-12T07:00:00",
    }

    mock_splits = [
        {"km": 1, "moving_time": 360, "distance": 1000.0, "avg_speed_ms": 2.78, "hr": 148.0, "cad": 85.0, "elev": 2.0},
    ]

    async def mock_fetch_activities(_token, _days=90):
        return [raw_strava_activity]

    async def mock_fetch_streams(_strava_id, _token):
        # Simulate streams endpoint failure
        return None

    fallback_called = False

    async def mock_fetch_splits_fallback(_strava_id, _token):
        nonlocal fallback_called
        fallback_called = True
        return mock_splits

    monkeypatch.setattr("services.strava.fetch_activities", mock_fetch_activities)
    monkeypatch.setattr("services.strava._fetch_streams_for_activity", mock_fetch_streams)
    monkeypatch.setattr("services.strava._fetch_splits_metric_fallback", mock_fetch_splits_fallback)

    await sync_activities(test_user.id, ACCESS_TOKEN, db_session)

    assert fallback_called, "_fetch_splits_metric_fallback was not called when streams fetch returned None"

    # The activity should now have streams={} (sentinel) and splits set
    saved = db_session.query(Activity).filter(Activity.strava_activity_id == "77").first()
    assert saved is not None
    assert saved.streams == {}, f"Expected sentinel streams={{}}, got {saved.streams!r}"
    assert saved.splits == mock_splits
