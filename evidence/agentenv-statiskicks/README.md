# statiskicks-web-env

An agent environment exported by REA from one retained browser scenario capture.
Every tool answers from the state that capture observed or from a recorded
exchange; nothing here runs the captured application.

The bundle contains captured application content. Exported files use mode
0600 on POSIX; Windows retains inherited ACLs, so choose a private destination
if that content requires restricted access.

## Provenance

- Scenario definition SHA-256: `6604ac3af4938c477122ca1d9caf0508f4c80f2e5d019afde813e566beef0791`
- Capture Evidence (the manifest's parent): `ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8`
- Manifest Evidence: `ev_2a416540743f01211773d024f1b6ec086aed58b9ab30fbdfd9c73a7fc62aa27a`
- Manifest view digest: `0527912dd5686ad1a62f96bc3b92ea734fa2c1ca5b7401054d82c06fa912b482`
- Primary origin: `https://www.statiskicks.com`
- Tools: 1
- State: `ev_eaecbc89f6ba36b48f95351cbed442c6d8b060da93393a9c8ad6fbac39204a7d`, derived from the capture
- Serving CLI: `rea-agents@6.8.0` from the npm registry

## What the environment serves

`envs/statiskicks-web-env/` builds an image that runs `rea environment-serve` on the
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
`ev_eaecbc89f6ba36b48f95351cbed442c6d8b060da93393a9c8ad6fbac39204a7d`, and the server serves 1 of the manifest's
2 tools.

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
`artifacts/check_statiskicks-web-env/verify.py` against its MCP endpoint: it lists
the tools and checks the count equals 1, and calls `get_robots` without arguments and checks the call succeeds with `status` 200, the status of record 42 its answer carries.
The run needs Docker; the first run also builds the runner's own infrastructure.

## Rights

The recorded content in `evidence.json` belongs to the captured application.
Do not publish this bundle without the rights to that content.
