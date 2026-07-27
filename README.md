# DBSurfer

A local, browser-based SQL client for Postgres, like Azure/DBeaver/pgAdmin, but in your browser.

## Features

- Connect to any number of Postgres databases (local Docker, Railway, etc.)
- Connection details saved to `~/.dbsurfer/connections.json` for fast reconnects
- Passwords are optional to save: keep them in memory only (session), or persist them, and clear credentials any time with one click
- Database browser in the left pane: schemas → tables/views → columns (double-click a table to open a `SELECT` in a new tab)
- Infinite SQL script tabs (persisted across reloads), each pinned to a connection of your choice
- Highlight lines and press `⌘⏎` (or hit ▶ Run) to execute just the selection; with no selection the whole script runs
- Results grid with row counts, timing, multi-statement results, and error position context

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5175.

### Desktop launcher (macOS)

For one-click access without opening a terminal, generate double-clickable
`.app` launchers on your Desktop:

```bash
scripts/make-desktop-app.sh
```

This creates **DBSurfer.app** (starts the servers if needed and opens the UI
in your browser — safe to click repeatedly, it won't spawn duplicates) and
**Stop DBSurfer.app** (stops them) on your Desktop. Server output is logged
to `~/.dbsurfer/run/dev.log`.

Re-run this script if you move the repo (the launcher's path is baked in at
generation time).

- API server: Express + `node-postgres` on port 4400
- UI: Vite + React + CodeMirror on port 5175 (proxies `/api` to the server)

## Notes

- Saved connections (and optionally passwords) live in `~/.dbsurfer/connections.json` (file mode 600), **outside this repo**, so they're never committed. Use the lock icon on a connection to clear its credentials.
- Session-only passwords are held in server memory and vanish when the server restarts.

## Security

Never commit real credentials. This repo's `.gitignore` excludes `.env*` files, but DBSurfer doesn't use any by design  connection info lives in `~/.dbsurfer/connections.json` on your machine only. If you fork/deploy this, keep it local or put it behind auth before exposing it beyond localhost.

## License

MIT: see [LICENSE](LICENSE).
