# Contributing to DBSurfer

Thanks for your interest. This is a small, readable codebase and PRs of all sizes are welcome.

## Dev setup

```bash
npm install
npm run dev
```

- API: Express on http://localhost:4400 (`server/`)
- UI: Vite + React on http://localhost:5175 (`client/`), proxies `/api` to the server

Type-check the client with `npx tsc --noEmit -p client/tsconfig.app.json` and lint with `npm run lint -w client`.

## Project layout

```
server/
  index.js          API routes
  store.js          connection storage (~/.dbsurfer/connections.json)
  pools.js          connection pool lifecycle
  aiStore.js, ai.js AI Assist (BYOK) storage and provider adapters
  drivers/          one module per database type
client/src/
  App.tsx           state, tabs, query execution
  api.ts            typed API client
  sqlgen.ts         dialect-aware SQL generation
  components/       Sidebar, editor, results grid, modals
```

## Adding a database driver

Each driver in `server/drivers/` exports the same interface: `create`, `close`, `test`, `getSchema`, `getColumns`, `query`, `isAuthError`, and optionally `getCompletion`, `getIndexes`, `getForeignKeys`, `getSchemaInfo`. Register it in `server/drivers/index.js` and add the type to `client/src/dbTypes.ts` and `client/src/api.ts`. Use `drivers/postgres.js` as the reference implementation.

## Guidelines

- Keep PRs focused; one feature or fix per PR
- Match the existing code style; no new dependencies without a good reason
- Test against a real database when touching a driver (a throwaway Docker container is fine)
- Never commit credentials; connection data lives in `~/.dbsurfer`, outside the repo

## Good first issues

Some approachable ideas if you want to jump in:

- Add keyboard shortcut to format/beautify the current SQL script
- Add a light theme
- Column sorting in the results grid
- Add a driver: CockroachDB, ClickHouse, or Cassandra
- Package for `npx` (bin entry + publish workflow)
- Windows/Linux desktop launchers (the macOS one is in `scripts/`)

Open an issue first if you're planning something large.
