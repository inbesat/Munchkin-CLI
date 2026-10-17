# @forge/mobile

React Native (Expo) companion app for forge (Phase 155). Connects a phone to a
running forge server over HTTP: connect screen (server URL + API key), session
list, and a per-session prompt runner with streamed-response display.

## Run on a device or emulator (human step)

```sh
cd packages/mobile
bun install
npx expo start          # scan the QR code (Expo Go) or press a/android
```

Prerequisites on the machine running forge:

```sh
forge auth create --name phone        # mint an API key
forge serve --host 0.0.0.0 --port 3000
```

Then connect from the app using your computer's LAN IP (e.g.
`http://192.168.1.10:3000`) plus the minted key. Without `--host 0.0.0.0` the
server only listens on localhost and the phone cannot reach it.

## Architecture

- `src/config.ts` — connection persistence over a pluggable `ConnectionStorage`
  KV seam (structurally satisfied by `@react-native-async-storage/async-storage`,
  passed directly in `App.tsx`). Storage failures become results, never throws.
- `src/api.ts` — `ForgeMobileApi`: `connect` (health probe), `listSessions`,
  `listEvents`, `sendPrompt` (lazy session creation). Result-shaped errors.
- `src/screens/` — thin RN wrappers; all logic lives in the two modules above
  and is Bun-testable.
- `App.tsx` — restores the saved connection on start, routes between screens.

Tests (`bun test`) run the config modules and the API wire contract with an
injected `fetchImpl` — no device or native toolchain needed for the gate.
