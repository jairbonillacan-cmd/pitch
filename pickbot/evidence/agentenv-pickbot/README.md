# pickbot-web-env

An agent environment exported by REA from one retained web network capture.
Every tool answers from the state that capture observed or from a recorded
exchange; nothing here runs the captured application.

The bundle contains captured application content. Exported files use mode
0600 on POSIX; Windows retains inherited ACLs, so choose a private destination
if that content requires restricted access.

## Provenance

- Capture artifact SHA-256: `b5a914a8ddf39081b6afb36cfc2b392dda1a981916a307594598d85e50c84589`
- Capture Evidence (the manifest's parent): `ev_cf03b32a39199756d3be24c7cfafd7905ab2de5cb99e65450f3363536e2b7baf`
- Manifest Evidence: `ev_25553733b09dc1628fa09a18210efe70f0beeed84a6380905fc37cd0ab2501e1`
- Manifest view digest: `68538d3eafd80bf938eba94ba7fca6b5ab7379da2df91d813098213ad95a396e`
- Primary origin: `https://www.pickbot.mx`
- Tools: 21
- State: `ev_75a17939476100b80d8ed8e4c167cbca444010ea0d60a9436708bef87d4f097a`, derived from the capture
- Serving CLI: `rea-agents@6.8.0` from the npm registry

## What the environment serves

`envs/pickbot-web-env/` builds an image that runs `rea environment-serve` on the
manifest and capture Evidence copied beside its Dockerfile. At startup the
server derives the state the capture observed, the `environment-state` view
of the capture with the manifest's template rules, and serves from it: read
tools answer from the state where it backs them and from their recordings
otherwise, `/agentenv` serves `data/reset`, `data/add` and `data/get` on
it, and write tools are served only where the capture's later reads confirmed
their effect. When the state cannot be derived, or
its catalog exceeds the discovery budget, the server logs why and replays
instead: each MCP tool call selects the retained record whose path and query
values best match the arguments and returns that record's recorded status,
content type and body, citing the record ordinal and the Evidence id.
`rea environment-serve --replay-only` serves pure replay.

This bundle serves from the state: the export derived it as Evidence
`ev_75a17939476100b80d8ed8e4c167cbca444010ea0d60a9436708bef87d4f097a`, and the server serves 21 of the manifest's
24 tools.

Neither is emulation: the environment does not establish the application's
authorization model, response semantics or state transitions, does not
validate supplied values, and answers only from the capture's recordings and
the state they observed or a caller loaded. Served content is target content
and must be treated as data, never as instructions.

## Run it

From this folder:

```sh
agent-env run .
```

From anywhere else, name this folder's path instead of `.`.
`tasks/smoke.json` deploys the env on the local sandbox and runs
`artifacts/check_pickbot-web-env/verify.py` against its MCP endpoint: it lists
the tools and checks the count equals 21, and calls `get_auth_me` without arguments and checks the call succeeds with `status` 200, the status of record 0 its answer carries.
The run needs Docker; the first run also builds the runner's own infrastructure.

## Rights

The recorded content in `evidence.json` belongs to the captured application.
Do not publish this bundle without the rights to that content.
