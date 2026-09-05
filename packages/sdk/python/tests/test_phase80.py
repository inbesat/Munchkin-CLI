"""Tests for the Phase 80 capability handshake + cancel/notification flow."""

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent))

from forge_sdk import ForgeClient, ForgeApiError  # noqa: E402
from forge_sdk.errors import ForgeTransportError  # noqa: E402
from forge_sdk.protocol import RpcNotification, RpcRequest  # noqa: E402


def _resolve_forge() -> str | None:
    env = os.environ.get("FORGE_BIN")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("forge")
    if found:
        return found
    repo_root = Path(__file__).resolve().parents[4]
    candidate = repo_root / "packages" / "server" / "dist" / "bin" / "forge.js"
    if candidate.is_file():
        return str(candidate)
    return None


@unittest.skipIf(_resolve_forge() is None, "no `forge` binary on PATH or in dist/")
class TestInitializeHandshake(unittest.TestCase):
    def test_initialize_returns_capabilities(self) -> None:
        forge = _resolve_forge()
        assert forge is not None
        with tempfile.TemporaryDirectory(prefix="forge-py-init-") as tmp:
            client = ForgeClient.spawn(forge_path=forge, base_dir=tmp)
            try:
                # Send the handshake.
                result = client.initialize(
                    client_info={"name": "py-sdk-test", "version": "0.1"},
                    capabilities={"streaming": True, "cancellation": True, "structuredErrors": True},
                )
                self.assertIn("serverInfo", result)
                self.assertEqual(result["serverInfo"]["name"], "forge")
                self.assertEqual(result["serverInfo"]["version"], "0.1.0")
                caps = result["capabilities"]
                self.assertTrue(caps["streaming"])
                self.assertTrue(caps["cancellation"])
                self.assertTrue(caps["structuredErrors"])
                self.assertIsInstance(caps["methods"], list)
                self.assertIn("prompts.submit", caps["methods"])
                self.assertIn("$/cancelRequest", caps["methods"])
                self.assertIn("initialize", caps["methods"])
                # Cached on the client for later use.
                self.assertEqual(client.server_info, result["serverInfo"])
                self.assertEqual(client.capabilities, caps)
            finally:
                client.close()

    def test_initialize_without_capabilities_omits_features(self) -> None:
        forge = _resolve_forge()
        assert forge is not None
        with tempfile.TemporaryDirectory(prefix="forge-py-init2-") as tmp:
            client = ForgeClient.spawn(forge_path=forge, base_dir=tmp)
            try:
                result = client.initialize()
                caps = result["capabilities"]
                # No client capabilities advertised → all disabled.
                self.assertFalse(caps["streaming"])
                self.assertFalse(caps["cancellation"])
                self.assertFalse(caps["structuredErrors"])
            finally:
                client.close()


@unittest.skipIf(_resolve_forge() is None, "no `forge` binary on PATH or in dist/")
class TestCancel(unittest.TestCase):
    def test_cancel_unknown_request_is_acknowledged(self) -> None:
        forge = _resolve_forge()
        assert forge is not None
        with tempfile.TemporaryDirectory(prefix="forge-py-cancel-") as tmp:
            client = ForgeClient.spawn(forge_path=forge, base_dir=tmp)
            try:
                client.initialize()
                # Cancelling an unknown id is still acknowledged with cancelled=false.
                out = client.cancel_request(99999)
                self.assertEqual(out, {"cancelled": False})
            finally:
                client.close()



if __name__ == "__main__":
    unittest.main()
