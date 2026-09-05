"""Typed Python client for the Forge server.

Wraps a `Transport` and dispatches every method call as a JSON-RPC request.
Resource groups mirror the surface exposed by `registerRpcMethods` in
`packages/server/src/rpc/bindings.ts`.

Phase 80: capability handshake (`initialize`), `$/cancelRequest`, and
`prompts.submit_streaming` for live event consumption alongside the final
result.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import queue
import subprocess
import threading
from collections.abc import Iterator
from typing import Any

from .errors import ForgeApiError, ForgeTransportError
from .protocol import RpcErrorCode, RpcNotification, RpcRequest, RpcResponse
from .transport import ProcessTransport, Transport


def _sync_call(
    transport: Transport,
    method: str,
    params: dict[str, Any] | None = None,
) -> Any:
    req = RpcRequest(method=method, params=params)
    transport.send(req)
    resp = transport.receive()
    if resp.error is not None:
        raise ForgeApiError(
            code=resp.error.get("code", RpcErrorCode.INTERNAL_ERROR),
            message=resp.error.get("message", "unknown error"),
            data=resp.error.get("data"),
        )
    return resp.result


class _SystemResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def health(self) -> dict[str, Any]:
        return _sync_call(self._t, "system.health")

    def ready(self) -> dict[str, Any]:
        return _sync_call(self._t, "system.ready")


class _SessionsResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def create(
        self,
        cwd: str,
        model: str | None = None,
        title: str | None = None,
        parent_session_id: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"cwd": cwd}
        if model is not None:
            params["model"] = model
        if title is not None:
            params["title"] = title
        if parent_session_id is not None:
            params["parentSessionId"] = parent_session_id
        return _sync_call(self._t, "sessions.create", params)

    def list(self, limit: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        return _sync_call(self._t, "sessions.list", params)

    def get(self, session_id: str) -> dict[str, Any]:
        return _sync_call(self._t, "sessions.get", {"id": session_id})

    def delete(self, session_id: str) -> dict[str, Any]:
        return _sync_call(self._t, "sessions.delete", {"id": session_id})

    def search(self, q: str = "") -> list[dict[str, Any]]:
        return _sync_call(self._t, "sessions.search", {"q": q})

    def events(self, session_id: str, from_index: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"id": session_id}
        if from_index is not None:
            params["fromIndex"] = from_index
        return _sync_call(self._t, "sessions.events", params)


class _PromptsResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def submit(
        self,
        session_id: str,
        prompt: str,
        *,
        model: str | None = None,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        max_iterations: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"sessionId": session_id, "prompt": prompt}
        if model is not None:
            params["model"] = model
        if system_prompt is not None:
            params["systemPrompt"] = system_prompt
        if tools is not None:
            params["tools"] = tools
        if max_iterations is not None:
            params["maxIterations"] = max_iterations
        return _sync_call(self._t, "prompts.submit", params)

    def cancel(self) -> dict[str, Any]:
        return _sync_call(self._t, "prompts.cancel")


class _ToolsResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self) -> list[dict[str, Any]]:
        return _sync_call(self._t, "tools.list")

    def get(self, name: str) -> dict[str, Any]:
        return _sync_call(self._t, "tools.get", {"name": name})

    def execute(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        return _sync_call(self._t, "tools.execute", {"name": name, "args": args})


class _ConfigResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def all(self) -> dict[str, Any]:
        return _sync_call(self._t, "config.all")

    def defaults(self) -> dict[str, Any]:
        return _sync_call(self._t, "config.defaults")


class _SSEResource:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def subscribe(self, session_ids: list[str] | None = None, client_id: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if client_id is not None:
            params["clientId"] = client_id
        if session_ids is not None:
            params["sessionIds"] = session_ids
        return _sync_call(self._t, "sse.subscribe", params)

    def unsubscribe(self, client_id: str) -> dict[str, Any]:
        return _sync_call(self._t, "sse.unsubscribe", {"clientId": client_id})


class ForgeClient:
    """Synchronous typed client for the Forge server.

    Use `ForgeClient.spawn()` to launch a `forge rpc` subprocess, or pass
    your own `Transport` (e.g. for tests).
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport
        self.system = _SystemResource(transport)
        self.sessions = _SessionsResource(transport)
        self.prompts = _PromptsResource(transport)
        self.tools = _ToolsResource(transport)
        self.config = _ConfigResource(transport)
        self.sse = _SSEResource(transport)
        self._server_info: dict[str, str] | None = None
        self._capabilities: dict[str, Any] | None = None

    @classmethod
    def spawn(
        cls,
        *,
        forge_path: str | None = None,
        base_dir: str | None = None,
        extra_args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> "ForgeClient":
        transport = ProcessTransport(
            forge_path=forge_path,
            base_dir=base_dir,
            extra_args=extra_args,
            env=env,
        )
        return cls(transport)

    # ── Phase 80: capability handshake ──────────────────────

    def initialize(
        self,
        client_info: dict[str, str] | None = None,
        capabilities: dict[str, Any] | None = None,
        protocol_version: str | None = None,
    ) -> dict[str, Any]:
        """LSP-style capability handshake. Returns the server's `InitializeResult`.

        Always call this once after `ForgeClient.spawn()` and before any
        other RPC method. Subsequent calls re-negotiate (idempotent on the
        server side).
        """
        params: dict[str, Any] = {}
        if client_info is not None:
            params["clientInfo"] = client_info
        if capabilities is not None:
            params["capabilities"] = capabilities
        if protocol_version is not None:
            params["protocolVersion"] = protocol_version
        result = _sync_call(self._t, "initialize", params)
        self._server_info = result.get("serverInfo")
        self._capabilities = result.get("capabilities")
        # Per the LSP model, send the `initialized` notification as a follow-up.
        # It's a notification, so we don't expect a response.
        self._t.notify("initialized", {})
        return result

    @property
    def server_info(self) -> dict[str, str] | None:
        return self._server_info

    @property
    def capabilities(self) -> dict[str, Any] | None:
        return self._capabilities

    def cancel_request(self, request_id: int | str) -> dict[str, Any]:
        """Cancel an in-flight request (LSP `$/cancelRequest`)."""
        return _sync_call(self._t, "$/cancelRequest", {"id": request_id})

    def notifications(self) -> Iterator[Any]:
        return self._t.notifications()

    def close(self) -> None:
        self._t.close()

    def __enter__(self) -> "ForgeClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------


async def _async_call(transport: Transport, method: str, params: dict[str, Any] | None = None) -> Any:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_call, transport, method, params)


class _AsyncSystemResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def health(self) -> dict[str, Any]:
        return await _async_call(self._t, "system.health")

    async def ready(self) -> dict[str, Any]:
        return await _async_call(self._t, "system.ready")


class _AsyncSessionsResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def create(
        self,
        cwd: str,
        model: str | None = None,
        title: str | None = None,
        parent_session_id: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"cwd": cwd}
        if model is not None:
            params["model"] = model
        if title is not None:
            params["title"] = title
        if parent_session_id is not None:
            params["parentSessionId"] = parent_session_id
        return await _async_call(self._t, "sessions.create", params)

    async def list(self, limit: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        return await _async_call(self._t, "sessions.list", params)

    async def get(self, session_id: str) -> dict[str, Any]:
        return await _async_call(self._t, "sessions.get", {"id": session_id})

    async def delete(self, session_id: str) -> dict[str, Any]:
        return await _async_call(self._t, "sessions.delete", {"id": session_id})

    async def search(self, q: str = "") -> list[dict[str, Any]]:
        return await _async_call(self._t, "sessions.search", {"q": q})

    async def events(self, session_id: str, from_index: int | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"id": session_id}
        if from_index is not None:
            params["fromIndex"] = from_index
        return await _async_call(self._t, "sessions.events", params)


class _AsyncPromptsResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def submit(
        self,
        session_id: str,
        prompt: str,
        *,
        model: str | None = None,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        max_iterations: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"sessionId": session_id, "prompt": prompt}
        if model is not None:
            params["model"] = model
        if system_prompt is not None:
            params["systemPrompt"] = system_prompt
        if tools is not None:
            params["tools"] = tools
        if max_iterations is not None:
            params["maxIterations"] = max_iterations
        return await _async_call(self._t, "prompts.submit", params)

    async def cancel(self) -> dict[str, Any]:
        return await _async_call(self._t, "prompts.cancel")


class _AsyncToolsResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def list(self) -> list[dict[str, Any]]:
        return await _async_call(self._t, "tools.list")

    async def get(self, name: str) -> dict[str, Any]:
        return await _async_call(self._t, "tools.get", {"name": name})

    async def execute(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        return await _async_call(self._t, "tools.execute", {"name": name, "args": args})


class _AsyncConfigResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def all(self) -> dict[str, Any]:
        return await _async_call(self._t, "config.all")

    async def defaults(self) -> dict[str, Any]:
        return await _async_call(self._t, "config.defaults")


class _AsyncSSEResource:
    def __init__(self, transport: Transport, loop: asyncio.AbstractEventLoop) -> None:
        self._t = transport
        self._loop = loop

    async def subscribe(self, session_ids: list[str] | None = None, client_id: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if client_id is not None:
            params["clientId"] = client_id
        if session_ids is not None:
            params["sessionIds"] = session_ids
        return await _async_call(self._t, "sse.subscribe", params)

    async def unsubscribe(self, client_id: str) -> dict[str, Any]:
        return await _async_call(self._t, "sse.unsubscribe", {"clientId": client_id})


class AsyncForgeClient:
    """Asynchronous typed client for the Forge server.

    The async client wraps a sync `Transport` and dispatches every call
    through a worker thread, so the JSON-RPC line discipline stays simple
    (one in-flight request per id; responses map back by id) and the
    asyncio loop remains responsive.
    """

    def __init__(self, transport: Transport) -> None:
        self._t = transport
        loop = asyncio.get_event_loop()
        self.system = _AsyncSystemResource(transport, loop)
        self.sessions = _AsyncSessionsResource(transport, loop)
        self.prompts = _AsyncPromptsResource(transport, loop)
        self.tools = _AsyncToolsResource(transport, loop)
        self.config = _AsyncConfigResource(transport, loop)
        self.sse = _AsyncSSEResource(transport, loop)
        self._server_info: dict[str, str] | None = None
        self._capabilities: dict[str, Any] | None = None

    @classmethod
    async def spawn(
        cls,
        *,
        forge_path: str | None = None,
        base_dir: str | None = None,
        extra_args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> "AsyncForgeClient":
        transport = ProcessTransport(
            forge_path=forge_path,
            base_dir=base_dir,
            extra_args=extra_args,
            env=env,
        )
        return cls(transport)

    async def initialize(
        self,
        client_info: dict[str, str] | None = None,
        capabilities: dict[str, Any] | None = None,
        protocol_version: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if client_info is not None:
            params["clientInfo"] = client_info
        if capabilities is not None:
            params["capabilities"] = capabilities
        if protocol_version is not None:
            params["protocolVersion"] = protocol_version
        result = await _async_call(self._t, "initialize", params)
        self._server_info = result.get("serverInfo")
        self._capabilities = result.get("capabilities")
        # The `initialized` follow-up is a notification — fire-and-forget.
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._t.notify, "initialized", {})
        return result

    @property
    def server_info(self) -> dict[str, str] | None:
        return self._server_info

    @property
    def capabilities(self) -> dict[str, Any] | None:
        return self._capabilities

    async def cancel_request(self, request_id: int | str) -> dict[str, Any]:
        return await _async_call(self._t, "$/cancelRequest", {"id": request_id})

    async def close(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._t.close)

    async def __aenter__(self) -> "AsyncForgeClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()
