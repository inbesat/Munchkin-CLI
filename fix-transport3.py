with open('packages/sdk/python/forge_sdk/transport.py') as f:
    c = f.read()

# The protocol block: replace the broken double-notify with a single notify
# abstract method, no body.
broken = (
    '    def send(self, request: RpcRequest) -> None: ...\n'
    '    def receive(self, timeout: float | None = None) -> RpcResponse: ...\n'
    '    def notifications(self) -> Iterator[RpcNotification]: ...\n'
    '    def notify(self, method: str, params: dict[str, Any] | None = None) -> None: ...\n'
    '    def notify(self, method: str, params=None) -> None:\n'
    '        if self._closed:\n'
    '            raise ForgeTransportError("transport is closed")\n'
    '        payload = {"jsonrpc": JSONRPC_VERSION, "method": method}\n'
    '        if params is not None:\n'
    '            payload["params"] = params\n'
    '        self._write(json.dumps(payload) + "\\n")\n'
    '\n'
    '    def close(self) -> None: ...\n'
)
fixed = (
    '    def send(self, request: RpcRequest) -> None: ...\n'
    '    def receive(self, timeout: float | None = None) -> RpcResponse: ...\n'
    '    def notifications(self) -> Iterator[RpcNotification]: ...\n'
    '    def notify(self, method: str, params: dict[str, Any] | None = None) -> None: ...\n'
    '    def close(self) -> None: ...\n'
)
assert broken in c, "broken block not found"
c = c.replace(broken, fixed)

# Add the concrete notify() method to ProcessTransport, right before close().
proc_close = (
    "    def notifications(self) -> Iterator[RpcNotification]:\n"
    '        """Yield server-pushed notifications. Stops on EOF."""\n'
    "        while True:\n"
    "            notif = self._notifications.get()\n"
    "            if notif is None:\n"
    "                return\n"
    "            if notif.method in (\"__response__\", \"__parse_error__\", \"__bad_version__\"):\n"
    "                continue\n"
    "            yield notif\n"
    "\n"
    "    def close(self) -> None:\n"
)
proc_with_notify = (
    "    def notifications(self) -> Iterator[RpcNotification]:\n"
    '        """Yield server-pushed notifications. Stops on EOF."""\n'
    "        while True:\n"
    "            notif = self._notifications.get()\n"
    "            if notif is None:\n"
    "                return\n"
    "            if notif.method in (\"__response__\", \"__parse_error__\", \"__bad_version__\"):\n"
    "                continue\n"
    "            yield notif\n"
    "\n"
    "    def notify(self, method: str, params=None) -> None:\n"
    "        if self._closed:\n"
    '            raise ForgeTransportError("transport is closed")\n'
    "        payload = {\"jsonrpc\": JSONRPC_VERSION, \"method\": method}\n"
    "        if params is not None:\n"
    "            payload[\"params\"] = params\n"
    "        self._write(json.dumps(payload) + \"\\n\")\n"
    "\n"
    "    def close(self) -> None:\n"
)
assert proc_close in c, "proc close not found"
c = c.replace(proc_close, proc_with_notify, 1)

with open('packages/sdk/python/forge_sdk/transport.py', 'w') as f:
    f.write(c)
print('done')
