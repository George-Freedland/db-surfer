# DBSurfer

A local, browser-based SQL client. Think DBeaver or pgAdmin, but it runs in your browser on your machine.
<img width="1433" height="698" alt="DBSurfer" src="https://github.com/user-attachments/assets/880f9e2e-9438-471a-894b-d8402cdc4e16" />

## Features

- Connect to PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, and Redis
- Save connections locally for fast reconnects (paste a URL to autofill)
- Optional saved passwords, or session-only, clearable any time
- Schema browser: tables, columns, indexes, foreign keys, procedures
- Right-click to generate SELECT / INSERT / UPDATE / DELETE / CREATE / DROP SQL
- Unlimited SQL tabs, each pinned to a connection
- Run the highlighted selection (or the whole script) with `⌘⏎`
- Import/export `.sql` files and connection settings
- Results as a table or JSON; export CSV or JSON
- Docs cheat sheet per database type
- Optional AI Assist (bring your own OpenAI / Anthropic / Google key)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5175.

### Desktop launcher (macOS)

```bash
scripts/make-desktop-app.sh
```

Creates **DBSurfer.app** and **Stop DBSurfer.app** on your Desktop. Safe to click repeatedly. Logs go to `~/.dbsurfer/run/dev.log`. Re-run the script if you move the repo.

- API: Express on port 4400
- UI: Vite + React + CodeMirror on port 5175

## Notes

- Connections (and optional passwords) live in `~/.dbsurfer/connections.json` outside this repo
- AI keys live in `~/.dbsurfer/ai.json`
- Both files are mode 600 and never leave your machine except when talking to a DB or AI provider you chose
- Keep it local, or put auth in front before exposing it beyond localhost

## License

MIT. See [LICENSE](LICENSE).
