"""End-to-end test: drive a real `forge rpc` subprocess via the Python SDK.

Run with: `python -m unittest tests.test_e2e` from packages/sdk/python.

Skipped automatically if the `forge` binary is not on PATH (or `FORGE_BIN`
is not set) so the suite stays green in environments without the build.
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent))

from forge_sdk import ForgeClient, ForgeApiError  # noqa: E402
from forge_sdk.errors import ForgeTransportError  # noqa: E402


def _resolve_forge() -> str | None:
    """Return the path to the `forge` binary, or None if not found."""
    env = os.environ.get("FORGE_BIN")
    if env and os.path.isfile(env):
        return env
    found = shutil.which("forge")
    if found:
        return found
    # Fall back to the workspace build artifact so the test runs from the repo.
    repo_root = Path(__file__).resolve().parents[4]
    candidate = repo_root / "packages" / "server" / "dist" / "bin" / "forge.js"
    if candidate.is_file():
        return str(candidate)
    return None


@unittest.skipIf(_resolve_forge() is None, "no `forge` binary on PATH or in dist/")
class TestEndToEnd(unittest.TestCase):
    def test_full_lifecycle(self) -> None:
        forge = _resolve_forge()
        assert forge is not None
        with tempfile.TemporaryDirectory(prefix="forge-py-sdk-") as tmp:
            client = ForgeClient.spawn(
                forge_path=forge,
                base_dir=tmp,
            )
            try:
                # system.ready
                ready = client.system.ready()
                self.assertTrue(ready["ready"])

                # tools.list
                tools = client.tools.list()
                self.assertIsInstance(tools, list)
                self.assertGreater(len(tools), 0)
                self.assertTrue(any(t["name"] == "read" for t in tools))

                # tools.get
                read = client.tools.get("read")
                self.assertEqual(read["name"], "read")

                # tools.execute (read a real file from the package)
                pkg = ROOT / "forge_sdk" / "__init__.py"
                out = client.tools.execute("read", {"path": str(pkg)})
                self.assertIn("__version__", out["result"])

                # sessions.create
                session = client.sessions.create(cwd=tmp, model="auto", title="py-sdk-test")
                self.assertIn("id", session)
                self.assertEqual(session["model"], "auto")
                self.assertEqual(session["status"], "active")

                # sessions.list
                sessions = client.sessions.list()
                self.assertTrue(any(s["id"] == session["id"] for s in sessions))

                # sessions.get
                fetched = client.sessions.get(session["id"])
                self.assertEqual(fetched["id"], session["id"])

                # sessions.delete
                deleted = client.sessions.delete(session["id"])
                self.assertTrue(deleted["success"])

                # 404 / error path — sessions.get for a missing id should
                # raise ForgeApiError with the server-defined code (-32004).
                with self.assertRaises(ForgeApiError) as ctx:
                    client.sessions.get("no-such-session")
                self.assertEqual(ctx.exception.code, -32004)
            finally:
                client.close()

    def test_invalid_method_returns_method_not_found(self) -> None:
        forge = _resolve_forge()
        assert forge is not None
        with tempfile.TemporaryDirectory(prefix="forge-py-sdk-") as tmp:
            client = ForgeClient.spawn(forge_path=forge, base_dir=tmp)
            try:
                # The server does not register bogus.do_thing, so it should
                # respond with a JSON-RPC method-not-found error envelope.
                from forge_sdk.protocol import RpcRequest
                client._t.send(RpcRequest(method="bogus.do_thing", params={}))
                resp = client._t.receive()
                self.assertIsNotNone(resp.error)
                self.assertEqual(resp.error["code"], -32601)
            finally:
                client.close()


if __name__ == "__main__":
    unittest.main()
