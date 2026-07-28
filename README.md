<p align="center">
  <img src="client/public/logo.svg" width="72" alt="DBSurfer logo" />
</p>

<h1 align="center">DBSurfer</h1>

<p align="center"><strong>Open-source, browser-based DBeaver alternative. Multi-DB, local-first.</strong></p>

<p align="center">Connect to Postgres, MySQL, SQL Server, SQLite, MongoDB, and Redis from one clean UI that runs entirely on your machine.</p>

![DBSurfer demo](docs/demo.gif)

## Install

Works on macOS, Linux, and Windows. Needs [Node.js](https://nodejs.org) 20+. There is no installer `.exe` or `.dmg` yet. DBSurfer is a local Node server plus a browser UI.

### macOS / Linux

```bash
git clone https://github.com/George-Freedland/db-surfer.git
cd db-surfer
npm install
npm start
```

Open http://localhost:4400

### Windows

Same commands in PowerShell or Command Prompt (Node.js 20+ installed):

```powershell
git clone https://github.com/George-Freedland/db-surfer.git
cd db-surfer
npm install
npm start
```

Open http://localhost:4400 in your browser. Connection data is stored under `%USERPROFILE%\.dbsurfer\`.

### One-liner (Docker)

Closest thing to a single command today:

```bash
docker build -t dbsurfer . && docker run -p 4400:4400 -v dbsurfer-data:/root/.dbsurfer dbsurfer
```

To reach a database on the Docker host, use `host.docker.internal` instead of `localhost` in the connection form.

`npx dbsurfer` is not published yet. That needs an npm package release.

### Desktop launcher (macOS only)

```bash
scripts/make-desktop-app.sh
```

Creates **DBSurfer.app** and **Stop DBSurfer.app** on your Desktop. Safe to click repeatedly. Logs go to `~/.dbsurfer/run/dev.log`. Re-run the script if you move the repo.

Windows/Linux desktop shortcuts are not built yet. Use `npm start` or Docker.

## Features

- Connect to PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, and Redis
- Save connections locally for fast reconnects (paste a URL to autofill)
- Optional saved passwords, or session-only, clearable any time
- Schema browser: tables, columns, indexes, foreign keys, procedures
- Right-click to generate SELECT / INSERT / UPDATE / DELETE / CREATE / DROP SQL
- Edit values directly in the results grid and save them as a batch UPDATE
- Unlimited SQL tabs, each pinned to a connection
- Run the highlighted selection (or the whole script) with `Cmd/Ctrl + Enter`
- Import/export `.sql` files and connection settings
- Results as a table or JSON; export CSV or JSON
- Docs cheat sheet per database type
- Optional AI Assist (bring your own OpenAI / Anthropic / Google key)

## Development

```bash
npm install
npm run dev
```

Runs the API (Express, port 4400) and the UI (Vite + React + CodeMirror, port 5175) with hot reload. Open http://localhost:5175.

## Data and security

- Connections (and optional passwords) live in `~/.dbsurfer/connections.json`, outside this repo
- AI keys live in `~/.dbsurfer/ai.json`
- Both files never leave your machine except when talking to a database or AI provider you chose
- DBSurfer is local-first by design. Keep it on localhost, or put auth in front before exposing it to a network

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and ideas for a first PR.

## License

MIT. See [LICENSE](LICENSE).
