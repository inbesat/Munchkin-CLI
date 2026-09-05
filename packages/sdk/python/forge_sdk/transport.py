"""Transport layer for the Forge Python SDK.

A `Transport` is anything that can send JSON-RPC requests and yield
notifications from the server. The default implementation, `ProcessTransport`,
spawns a `forge` subprocess and talks newline-delimited JSON over its
stdin/stdout.
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
from collections.abc import Iterator
from typing import Any, Protocol

from .errors import ForgeTransportError
from .protocol import (
    JSONRPC_VERSION,
    RpcErrorCode,
    RpcNotification,
    RpcRequest,
    RpcResponse,
)


class Transport(Protocol):
    """Abstract transport for JSON-RPC over stdio."""

    def send(self, request: RpcRequest) -> None: ...
    def receive(self, timeout: float | None = None) -> RpcResponse: ...
    def notifications(self) -> Iterator[RpcNotification]: ...
    def notify(self, method: str, params: dict[str, Any] | None = None) -> None: ...
    def close(self) -> None: ...


def _now() -> float:
    import time

    return time.monotonic()


class ProcessTransport:
    """Spawn a `forge rpc` subprocess and talk JSON-RPC over its stdio.

    Args:
        forge_path: Path to the `forge` binary. Defaults to `FORGE_BIN` env var
            or the first `forge` on PATH.
        base_dir: Optional `--base-dir` value to pass to `forge rpc`.
        extra_args: Additional CLI args passed to `forge rpc`.
        env: Optional environment overrides for the subprocess.
    """

    def __init__(
        self,
        *,
        forge_path: str | None = None,
        base_dir: str | None = None,
        extra_args: list[str] | None = None,
        env: dict[str, str] | None = None,
        spawn: bool = True,
        stdin_stream=None,
        stdout_stream=None,
    ) -> None:
        self._lock = threading.Lock()
        self._proc: subprocess.Popen | None = None
        self._pending: dict[int | str, RpcResponse] = {}
        self._notifications: queue.Queue[RpcNotification | None] = queue.Queue()
        self._reader_thread: threading.Thread | None = None
        self._closed = False
        self._next_id = 0
        self._stdin = None
        self._stdout = None
        self._stderr = None

        if not spawn:
            # For tests: pipe in pre-built streams. Caller is responsible for
            # driving the read loop manually.
            self._stdin = stdin_stream
            self._stdout = stdout_stream
            return

        binary = forge_path or os.environ.get("FORGE_BIN") or shutil.which("forge") or "forge"
        if binary.endswith(".js"):
            # Treat a .js entry as a bun-runnable script (e.g. the monorepo
            # build artifact at packages/server/dist/bin/forge.js).
            cmd = ["bun", "run", binary, "rpc"]
        elif binary == "forge" and not shutil.which("forge"):
            raise ForgeTransportError(
                "Could not find the `forge` binary on PATH. Set FORGE_BIN or pass forge_path=..."
            )
        else:
            cmd = [binary, "rpc"]
        if base_dir:
            cmd.extend(["--base-dir", base_dir])
        if extra_args:
            cmd.extend(extra_args)

        merged_env = {**os.environ, **(env or {})}
        try:
            self._proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=merged_env,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError as e:
            raise ForgeTransportError(f"Failed to spawn forge rpc: {e}") from e

        self._stdin = self._proc.stdin
        self._stdout = self._proc.stdout
        self._stderr = self._proc.stderr

        self._reader_thread = threading.Thread(target=self._read_loop, name="forge-rpc-reader", daemon=True)
        self._reader_thread.start()

    def _read_loop(self) -> None:
        assert self._stdout is not None
        try:
            for raw in self._stdout:
                line = raw.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    self._notifications.put(
                        RpcNotification(method="__parse_error__", params={"raw": line})
                    )
                    continue
                if payload.get("jsonrpc") != JSONRPC_VERSION:
                    self._notifications.put(
                        RpcNotification(method="__bad_version__", params=payload)
                    )
                    continue
                if "method" in payload and "id" not in payload:
                    self._notifications.put(
                        RpcNotification(
                            method=payload.get("method", ""),
                            params=payload.get("params"),
                        )
                    )
                elif "id" in payload and ("result" in payload or "error" in payload):
                    resp = RpcResponse.from_json(payload)
                    with self._lock:
                        self._pending[resp.id] = resp
                    self._notifications.put(RpcNotification(method="__response__", params=resp.id))
        except (OSError, ValueError):
            pass
        finally:
            self._notifications.put(None)  # EOF sentinel

    def _write(self, line: str) -> None:
        if self._stdin is None or self._stdin.closed:
            raise ForgeTransportError("transport is closed")
        try:
            self._stdin.write(line)
            self._stdin.flush()
        except (BrokenPipeError, OSError) as e:
            raise ForgeTransportError(f"write failed: {e}") from e

    def send(self, request: RpcRequest) -> None:
        if self._closed:
            raise ForgeTransportError("transport is closed")
        with self._lock:
            self._next_id += 1
            request.id = self._next_id
        self._write(json.dumps(request.to_json()) + "\n")

    def receive(self, timeout: float | None = None) -> RpcResponse:
        """Block until a response matching our next-issued id arrives."""
        expected = self._next_id
        deadline = None if timeout is None else _now() + timeout
        while True:
            with self._lock:
                if expected in self._pending:
                    return self._pending.pop(expected)
            remaining = None if deadline is None else max(0.0, deadline - _now())
            try:
                notif = self._notifications.get(timeout=remaining)
            except queue.Empty as e:
                raise ForgeTransportError(f"timed out waiting for response to id={expected}") from e
            if notif is None:
                raise ForgeTransportError(f"server EOF before response id={expected}")

    def notifications(self) -> Iterator[RpcNotification]:
        """Yield server-pushed notifications. Stops on EOF."""
        while True:
            notif = self._notifications.get()
            if notif is None:
                return
            if notif.method in ("__response__", "__parse_error__", "__bad_version__"):
                continue
            yield notif

    def notify(self, method: str, params=None) -> None:
        if self._closed:
            raise ForgeTransportError("transport is closed")
        payload = {"jsonrpc": JSONRPC_VERSION, "method": method}
        if params is not None:
            payload["params"] = params
        self._write(json.dumps(payload) + "\n")

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._proc is not None:
            try:
                if self._proc.stdin and not self._proc.stdin.closed:
                    self._proc.stdin.close()
            except OSError:
                pass
            try:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                    self._proc.wait(timeout=2.0)
            except OSError:
                pass
        if self._stdin is not None and not self._stdin.closed:
            try:
                self._stdin.close()
            except OSError:
                pass
        if self._stdout is not None and not self._stdout.closed:
            try:
                self._stdout.close()
            except OSError:
                pass
        if self._stderr is not None and not self._stderr.closed:
            try:
                self._stderr.close()
            except OSError:
                pass

    def __enter__(self) -> "ProcessTransport":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


def make_loopback_transport(stdin_writer, stdout_reader) -> "ProcessTransport":
    """Create a `ProcessTransport` that talks to in-process streams (for tests)."""
    return ProcessTransport(spawn=False, stdin_stream=stdin_writer, stdout_stream=stdout_reader)


__all__ = ["ProcessTransport", "RpcErrorCode", "Transport"]
