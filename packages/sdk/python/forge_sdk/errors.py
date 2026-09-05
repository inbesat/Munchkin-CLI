"""Exceptions raised by the Forge Python SDK."""

from __future__ import annotations

from typing import Any


class ForgeTransportError(Exception):
    """Network/transport failure (could not start, EOF, timeout, etc.)."""


class ForgeApiError(Exception):
    """The server returned a JSON-RPC error response or a non-2xx HTTP error.

    Attributes:
        code: Numeric or string error code from the server.
        message: Human-readable message.
        data: Optional structured detail from the server.
    """

    def __init__(self, code: int | str, message: str, data: Any | None = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.data = data
