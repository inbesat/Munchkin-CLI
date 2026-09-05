"""JSON-RPC 2.0 wire types and constants for the Forge Python SDK.

Spec: https://www.jsonrpc.org/specification
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Union

JSONRPC_VERSION = "2.0"

RpcId = Union[int, str]


class RpcErrorCode:
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603


@dataclass
class RpcRequest:
    jsonrpc: str = JSONRPC_VERSION
    id: RpcId = 0
    method: str = ""
    params: Any | None = None

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"jsonrpc": self.jsonrpc, "id": self.id, "method": self.method}
        if self.params is not None:
            out["params"] = self.params
        return out


@dataclass
class RpcResponse:
    jsonrpc: str = JSONRPC_VERSION
    id: RpcId | None = None
    result: Any = None
    error: dict[str, Any] | None = None

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "RpcResponse":
        return cls(
            jsonrpc=payload.get("jsonrpc", JSONRPC_VERSION),
            id=payload.get("id"),
            result=payload.get("result"),
            error=payload.get("error"),
        )


@dataclass
class RpcNotification:
    """A server→client push (no id; no reply expected)."""

    method: str = ""
    params: Any | None = field(default=None)

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "RpcNotification":
        return cls(method=payload.get("method", ""), params=payload.get("params"))


class RpcProtocolError(Exception):
    """Raised by `decode_message` for malformed wire input."""


def encode_message(message: dict[str, Any]) -> str:
    """Encode a JSON-RPC message as a single newline-terminated string."""
    return json.dumps(message)


def decode_message(line: str) -> dict[str, Any]:
    """Parse one JSON-RPC message from a wire line. Raises `RpcProtocolError`."""
    text = (line or "").strip()
    if not text:
        raise RpcProtocolError("empty line")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as e:
        raise RpcProtocolError(f"invalid JSON: {e}") from e
    if not isinstance(payload, dict):
        raise RpcProtocolError("expected an object")
    if payload.get("jsonrpc") != JSONRPC_VERSION:
        raise RpcProtocolError(f"unsupported jsonrpc version: {payload.get('jsonrpc')!r}")
    return payload


def is_request(payload: dict[str, Any]) -> bool:
    return "id" in payload and "method" in payload


def is_notification(payload: dict[str, Any]) -> bool:
    return "method" in payload and "id" not in payload


def is_response(payload: dict[str, Any]) -> bool:
    return ("result" in payload or "error" in payload) and "method" not in payload
