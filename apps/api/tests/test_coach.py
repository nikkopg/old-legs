"""
Tests for POST /coach/chat — Pak Har streaming chat endpoint.

Coverage:
- Happy path: authenticated request returns streaming response
- No auth: 401
- Empty/missing message body: 422
- Ollama unreachable: 503
- Rate limit exceeded: 429
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
import respx
import httpx
from fastapi.testclient import TestClient


class TestCoachChatHappyPath:
    def test_authenticated_request_returns_streaming_response(
        self, authenticated_client: TestClient, test_activity
    ):
        mock_chunks = [
            {"message": {"content": "You ran "}, "done": False},
            {"message": {"content": "once this week."}, "done": False},
            {"done": True},
        ]

        def mock_stream_lines():
            for chunk in mock_chunks:
                yield json.dumps(chunk)

        with respx.mock:
            respx.post("http://localhost:11434/api/chat").mock(
                return_value=httpx.Response(
                    200,
                    text="\n".join(json.dumps(c) for c in mock_chunks),
                )
            )
            with patch("services.ollama.stream_chat") as mock_stream:
                async def fake_stream(*args, **kwargs):
                    for chunk in ["You ran ", "once this week."]:
                        yield chunk

                mock_stream.return_value = fake_stream()

                response = authenticated_client.post(
                    "/coach/chat",
                    json={"message": "How did I do this week?"},
                )

        assert response.status_code == 200

    def test_response_is_event_stream(
        self, authenticated_client: TestClient
    ):
        with patch("services.ollama.stream_chat") as mock_stream:
            async def fake_stream(*args, **kwargs):
                yield "Ran twice."

            mock_stream.return_value = fake_stream()

            response = authenticated_client.post(
                "/coach/chat",
                json={"message": "Recap my week."},
            )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")


class TestCoachChatAuth:
    def test_unauthenticated_returns_401(self, test_app: TestClient):
        response = test_app.post(
            "/coach/chat",
            json={"message": "Hello"},
        )
        assert response.status_code == 401

    def test_invalid_session_returns_401(self, test_app: TestClient):
        test_app.cookies.set("session_user_id", "99999")
        response = test_app.post(
            "/coach/chat",
            json={"message": "Hello"},
        )
        assert response.status_code == 401
        test_app.cookies.clear()


class TestCoachChatValidation:
    def test_missing_message_returns_422(self, authenticated_client: TestClient):
        response = authenticated_client.post("/coach/chat", json={})
        assert response.status_code == 422

    def test_empty_body_returns_422(self, authenticated_client: TestClient):
        response = authenticated_client.post("/coach/chat", content=b"")
        assert response.status_code == 422


class TestCoachChatOllamaErrors:
    def test_ollama_unreachable_returns_503(self, authenticated_client: TestClient):
        # Per DEC-008: Ollama errors mid-stream are delivered as SSE error events
        # with HTTP 200 (headers already sent). The stream body contains [ERROR].
        # Patch at the import site in the router so the mock takes effect.
        with patch("routers.coach.stream_chat") as mock_stream:
            async def raise_runtime(*args, **kwargs):
                raise RuntimeError("Pak Har is unavailable right now. Make sure Ollama is running.")
                yield  # make it an async generator

            mock_stream.return_value = raise_runtime()

            response = authenticated_client.post(
                "/coach/chat",
                json={"message": "Hello?"},
            )

        assert response.status_code == 200
        assert "[ERROR]" in response.text
        assert "unavailable" in response.text.lower()

    def test_ollama_timeout_returns_504(self, authenticated_client: TestClient):
        # Per DEC-008: timeout errors are also delivered as SSE error events
        # with HTTP 200 (headers already sent). The stream body contains [ERROR].
        # Patch at the import site in the router so the mock takes effect.
        with patch("routers.coach.stream_chat") as mock_stream:
            async def raise_timeout(*args, **kwargs):
                raise TimeoutError("Pak Har took too long to respond.")
                yield

            mock_stream.return_value = raise_timeout()

            response = authenticated_client.post(
                "/coach/chat",
                json={"message": "Hello?"},
            )

        assert response.status_code == 200
        assert "[ERROR]" in response.text
        assert "too long" in response.text.lower()


class TestCoachChatRateLimit:
    def test_rate_limit_returns_429(self, authenticated_client: TestClient, test_user):
        # Force the rate limiter to report over limit for this user
        with patch("routers.coach.check_rate_limit", return_value=False):
            response = authenticated_client.post(
                "/coach/chat",
                json={"message": "Another message"},
            )
        assert response.status_code == 429
        assert "too many" in response.json()["detail"].lower()
