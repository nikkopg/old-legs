"""
Tests for services/notifications.py.

Coverage:
- _resolve_url: bare topic name → https://ntfy.sh/<topic>
- _resolve_url: http:// full URL → passthrough unchanged
- _resolve_url: https:// full URL → passthrough unchanged
- send_ntfy: successful POST — correct URL, Title header, Tags header
- send_ntfy: non-2xx response — does not raise (fire-and-forget)
- send_ntfy: httpx.ConnectError — does not raise
- send_ntfy: httpx.TimeoutException — does not raise

Design decisions:
- httpx.AsyncClient.post is mocked via unittest.mock to avoid real network calls
- send_ntfy is fire-and-forget: all exception paths must complete without raising
"""

import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from services.notifications import _resolve_url, send_ntfy


# ---------------------------------------------------------------------------
# _resolve_url unit tests (pure, no I/O)
# ---------------------------------------------------------------------------

class TestResolveUrl:
    def test_bare_topic_prepends_ntfy_sh(self):
        assert _resolve_url("myrunlogs") == "https://ntfy.sh/myrunlogs"

    def test_bare_topic_with_slash_prepends_ntfy_sh(self):
        """A topic like 'my/topic' is still treated as bare — not http(s) prefixed."""
        result = _resolve_url("my/topic")
        assert result == "https://ntfy.sh/my/topic"

    def test_http_url_passthrough(self):
        url = "http://self-hosted.example.com/topic"
        assert _resolve_url(url) == url

    def test_https_url_passthrough(self):
        url = "https://ntfy.sh/myrunlogs"
        assert _resolve_url(url) == url

    def test_https_self_hosted_passthrough(self):
        url = "https://ntfy.internal.corp/oldlegs"
        assert _resolve_url(url) == url


# ---------------------------------------------------------------------------
# send_ntfy integration tests (mocked httpx)
# ---------------------------------------------------------------------------

class TestSendNtfy:

    @pytest.mark.asyncio
    async def test_happy_path_posts_to_correct_url(self):
        """Successful POST: URL, Title, and Tags headers are set correctly."""
        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await send_ntfy(
                topic="myrunlogs",
                title="Old Legs",
                message="Your plan is ready.",
                tags=["calendar"],
            )

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args

        # URL must be the resolved ntfy.sh address
        assert call_kwargs.args[0] == "https://ntfy.sh/myrunlogs"

        # Headers must include Title and Tags
        headers = call_kwargs.kwargs["headers"]
        assert headers["Title"] == "Old Legs"
        assert headers["Tags"] == "calendar"

    @pytest.mark.asyncio
    async def test_multiple_tags_joined_with_comma(self):
        """Tags list must be comma-joined in the Tags header."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await send_ntfy(
                topic="myrunlogs",
                title="Old Legs",
                message="Review ready.",
                tags=["memo", "running"],
            )

        headers = mock_post.call_args.kwargs["headers"]
        assert headers["Tags"] == "memo,running"

    @pytest.mark.asyncio
    async def test_no_tags_omits_tags_header(self):
        """When tags=None, the Tags header must not be sent."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await send_ntfy(
                topic="myrunlogs",
                title="Old Legs",
                message="No tags here.",
                tags=None,
            )

        headers = mock_post.call_args.kwargs["headers"]
        assert "Tags" not in headers

    @pytest.mark.asyncio
    async def test_non_2xx_response_does_not_raise(self):
        """Non-2xx response (e.g. 403) must be logged and silently dropped."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            # Must complete without raising
            await send_ntfy(topic="myrunlogs", title="T", message="M")

    @pytest.mark.asyncio
    async def test_server_error_response_does_not_raise(self):
        """5xx response must also be swallowed — fire-and-forget contract."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await send_ntfy(topic="myrunlogs", title="T", message="M")

    @pytest.mark.asyncio
    async def test_connect_error_does_not_raise(self):
        """httpx.ConnectError (ntfy unreachable) must not propagate."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(
                side_effect=httpx.ConnectError("connection refused")
            )
            mock_client_cls.return_value = mock_client

            # Must complete without raising
            await send_ntfy(topic="myrunlogs", title="T", message="M")

    @pytest.mark.asyncio
    async def test_timeout_does_not_raise(self):
        """httpx.TimeoutException must not propagate."""
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(
                side_effect=httpx.TimeoutException("timed out")
            )
            mock_client_cls.return_value = mock_client

            await send_ntfy(topic="myrunlogs", title="T", message="M")

    @pytest.mark.asyncio
    async def test_body_sent_as_encoded_bytes(self):
        """Message body must be sent as UTF-8 encoded bytes via the content kwarg."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await send_ntfy(topic="myrunlogs", title="T", message="Run again.")

        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["content"] == b"Run again."
