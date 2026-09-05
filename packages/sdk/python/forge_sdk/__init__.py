"""forge_sdk — typed Python client for the Forge server.

Phase 79: drives the `forge rpc` JSON-RPC 2.0 server over a subprocess
(stdin/stdout newline-delimited JSON). Zero external dependencies.

Usage:

    from forge_sdk import ForgeClient

    with ForgeClient.spawn() as forge:
        health = forge.system.health()
        session = forge.sessions.create(cwd="/tmp", model="auto")
        result = forge.prompts.submit(session["id"], "Summarize the repo")
        print(result["response"])

Or with an async client:

    from forge_sdk import AsyncForgeClient

    async with await AsyncForgeClient.spawn() as forge:
        ...
"""

from .client import AsyncForgeClient, ForgeClient
from .errors import ForgeApiError, ForgeTransportError
from .protocol import (
    RpcErrorCode,
    RpcNotification,
    RpcRequest,
    RpcResponse,
    decode_message,
    encode_message,
    is_notification,
    is_request,
    is_response,
)
from .transport import ProcessTransport, Transport

__all__ = [
    "AsyncForgeClient",
    "ForgeApiError",
    "ForgeClient",
    "ForgeTransportError",
    "ProcessTransport",
    "RpcErrorCode",
    "RpcNotification",
    "RpcRequest",
    "RpcResponse",
    "Transport",
    "decode_message",
    "encode_message",
    "is_notification",
    "is_request",
    "is_response",
]

__version__ = "0.1.0"
