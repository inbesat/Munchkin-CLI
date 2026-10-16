"""Offline regression tests for subprocess response/notification demultiplexing."""

import io
import json
import threading
import unittest

from forge_sdk.errors import ForgeTransportError
from forge_sdk.protocol import RpcRequest
from forge_sdk.transport import ProcessTransport


def make_transport(*messages):
    wire = "\n".join(json.dumps(message) for message in messages) + "\n"
    return ProcessTransport(
        spawn=False, stdin_stream=io.StringIO(), stdout_stream=io.StringIO(wire)
    )


class TestTransportAudit(unittest.TestCase):
    def test_receive_does_not_consume_user_notifications(self):
        transport = make_transport(
            {"jsonrpc": "2.0", "method": "event", "params": {"delta": "hello"}},
            {"jsonrpc": "2.0", "id": 1, "result": "ok"},
        )
        transport.send(RpcRequest(method="test"))
        # Finish the reader deterministically during receive's first wait.
        original_get = transport._notifications.get

        def read_then_get(*args, **kwargs):
            transport._read_loop()
            return original_get(*args, **kwargs)

        transport._notifications.get = read_then_get
        try:
            self.assertEqual(transport.receive(timeout=0.1).result, "ok")
            notifications = list(transport.notifications())
            self.assertEqual([n.method for n in notifications], ["event"])
        finally:
            transport.close()

    def test_reader_ignores_non_object_json_and_continues(self):
        transport = make_transport(
            [], None, 42,
            {"jsonrpc": "2.0", "id": 1, "result": "survived"},
        )
        try:
            transport.send(RpcRequest(method="test"))
            transport._read_loop()
            self.assertEqual(transport.receive(timeout=0.1).result, "survived")
        finally:
            transport.close()

    def test_reader_ignores_unhashable_response_ids_and_continues(self):
        transport = make_transport(
            {"jsonrpc": "2.0", "id": [], "result": "invalid"},
            {"jsonrpc": "2.0", "id": 1, "result": "valid"},
        )
        try:
            transport.send(RpcRequest(method="test"))
            transport._read_loop()
            self.assertEqual(transport.receive(timeout=0.1).result, "valid")
        finally:
            transport.close()

    def test_concurrent_callers_receive_their_own_response(self):
        transport = make_transport(
            {"jsonrpc": "2.0", "id": 2, "result": "second"},
            {"jsonrpc": "2.0", "id": 1, "result": "first"},
        )
        sent_first = threading.Event()
        sent_second = threading.Event()
        read_finished = threading.Event()
        results = {}

        def first():
            transport.send(RpcRequest(method="first"))
            sent_first.set()
            read_finished.wait(timeout=1)
            try:
                results["first"] = transport.receive(timeout=0.1).result
            except ForgeTransportError as error:
                results["first"] = str(error)

        def second():
            sent_first.wait(timeout=1)
            transport.send(RpcRequest(method="second"))
            sent_second.set()
            read_finished.wait(timeout=1)
            try:
                results["second"] = transport.receive(timeout=0.1).result
            except ForgeTransportError as error:
                results["second"] = str(error)

        threads = [threading.Thread(target=first), threading.Thread(target=second)]
        try:
            for thread in threads:
                thread.start()
            self.assertTrue(sent_second.wait(timeout=1))
            transport._read_loop()
            read_finished.set()
            for thread in threads:
                thread.join(timeout=1)
                self.assertFalse(thread.is_alive())
            self.assertEqual(results, {"first": "first", "second": "second"})
        finally:
            read_finished.set()
            for thread in threads:
                thread.join(timeout=1)
            transport.close()


if __name__ == "__main__":
    unittest.main()
