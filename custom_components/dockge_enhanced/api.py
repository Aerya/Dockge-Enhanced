"""Scoped Enhanced API client. Inspired by darthrater78/ha-dockge."""
import asyncio
from urllib.parse import quote, urlsplit, urlunsplit

import aiohttp


class AuthenticationError(Exception):
    """The API token is invalid or lacks the required permission."""


class ApiError(Exception):
    """A safe, credential-free API error."""


def normalize_url(value):
    """Accept HTTP(S) instance URLs, never embedded credentials or queries."""
    parts = urlsplit(value.strip())
    if (parts.scheme not in ("http", "https") or not parts.hostname
            or parts.username or parts.password or parts.query or parts.fragment):
        raise ValueError("Invalid instance URL")
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


class DockgeApi:
    def __init__(self, session, url, token):
        self.session = session
        self.url = normalize_url(url)
        self._token = token

    async def request(self, method, path):
        try:
            async with self.session.request(
                method, f"{self.url}/api/v1/{path}",
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=aiohttp.ClientTimeout(total=120 if method == "POST" else 15),
                allow_redirects=False,
            ) as response:
                if response.status in (401, 403):
                    raise AuthenticationError("API token rejected")
                if response.status != 200:
                    raise ApiError(f"HTTP {response.status}")
                body = await response.json()
                if not isinstance(body, dict) or body.get("ok") is not True:
                    raise ApiError("Invalid API response")
                return body.get("data")
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
            raise ApiError("Cannot contact Dockge Enhanced") from error

    async def stacks(self):
        rows = await self.request("GET", "stacks")
        if not isinstance(rows, list) or any(
            not isinstance(row, dict) or not isinstance(row.get("name"), str)
            or not isinstance(row.get("status"), int) for row in rows
        ):
            raise ApiError("Invalid stacks response")
        return {row["name"]: row for row in rows}

    async def action(self, name, action):
        if action not in ("start", "stop", "restart"):
            raise ApiError("Unsupported action")
        result = await self.request("POST", f"stacks/{quote(name, safe='')}/actions/{action}")
        if not isinstance(result, dict) or result.get("success") is not True:
            raise ApiError("Stack action failed")
        return result
