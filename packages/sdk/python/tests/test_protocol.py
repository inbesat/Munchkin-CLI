"""Tests for the JSON-RPC protocol codec."""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent))

from forge_sdk.protocol import (  # noqa: E402
    JSONRPC_VERSION,
    RpcErrorCode,
    RpcRequest,
    decode_message,
    is_request,
    is_notification,
    is_response,
)


def make_error(id, code, message, data=None):
    err = {"jsonrpc": JSONRPC_VERSION, "id": id, "error": {"code": code, "message": message}}
    if data is not None:
        err["error"]["data"] = data
    return err


class TestCodec(unittest.TestCase):
    def test_round_trip_success(self) -> None:
        msg = RpcRequest(id=1, method="echo", params={"x": 1})
        wire = json.dumps(msg.to_json())
        back = decode_message(wire)
        self.assertTrue(is_request(back))
        self.assertEqual(back["method"], "echo")
        self.assertEqual(back["params"], {"x": 1})

    def test_round_trip_error(self) -> None:
        wire = json.dumps(make_error(1, RpcErrorCode.METHOD_NOT_FOUND, "nope"))
        back = decode_message(wire)
        self.assertTrue(is_response(back))
        self.assertEqual(back["error"]["code"], RpcErrorCode.METHOD_NOT_FOUND)

    def test_classify(self) -> None:
        req = {"jsonrpc": JSONRPC_VERSION, "id": 1, "method": "foo"}
        notif = {"jsonrpc": JSONRPC_VERSION, "method": "foo"}
        resp = {"jsonrpc": JSONRPC_VERSION, "id": 1, "result": None}
        self.assertTrue(is_request(req))
        self.assertTrue(is_notification(notif))
        self.assertTrue(is_response(resp))
        self.assertFalse(is_response(req))

    def test_rejects_bad_version(self) -> None:
        with self.assertRaises(Exception):
            decode_message(json.dumps({"jsonrpc": "1.0", "id": 1}))

    def test_rejects_invalid_json(self) -> None:
        with self.assertRaises(Exception):
            decode_message("not json")

    def test_rejects_empty(self) -> None:
        with self.assertRaises(Exception):
            decode_message("")


if __name__ == "__main__":
    unittest.main()