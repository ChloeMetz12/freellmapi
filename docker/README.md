# Docker Guide

Docker Compose is the recommended way to run FreeLLMAPI for personal use. The container serves the Express API and the built React dashboard from one process on port 3001, with SQLite persisted in a named volume.

## Prerequisites

- Docker
- Docker Compose
- OpenSSL for generating `ENCRYPTION_KEY`

## Quick Start

Create a `.env` file with a 32-byte encryption key:

```bash
ENCRYPTION_KEY="$(openssl rand -hex 32)"
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$ENCRYPTION_KEY" > .env
```

Start the app:

```bash
docker compose up -d
```

Open http://localhost:3001, add provider keys on the **Keys** page, then use the generated `freellmapi-...` key with any OpenAI-compatible client.

## Example API Call

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer freellmapi-your-unified-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Say hello from FreeLLMAPI."}]
  }'
```

## Operations

Check status:

```bash
docker compose ps
```

Tail logs:

```bash
docker compose logs -f freellmapi
```

Stop the app:

```bash
docker compose down
```

Update to the latest GHCR image after a release:

```bash
docker compose pull
docker compose up -d
```

Rebuild locally from source:

```bash
docker compose up -d --build
```

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ENCRYPTION_KEY` | Yes | None | 64-character hex key used to encrypt provider API keys at rest. Generate it once and keep it stable. |
| `PORT` | No | `3001` | Host port exposed by Docker Compose. The container listens on port 3001. |
| `FREEAPI_DB_PATH` | No | `/app/server/data/freellmapi.db` | SQLite file path. Set this when your host only persists one mounted directory. |
| `FREEAPI_DB_BACKUP_PATH` | No | None | Local encrypted backup file. Restored on startup if the DB file is missing, then refreshed while the app runs. |
| `FREEAPI_DB_BACKUP_URL` | No | None | HTTP(S) encrypted backup target. Startup uses `GET`; periodic backups use `PUT`. |
| `FREEAPI_DB_BACKUP_TOKEN` | No | None | Optional bearer token for `FREEAPI_DB_BACKUP_URL`. |
| `FREEAPI_DB_BACKUP_KEY` | No | `ENCRYPTION_KEY` | 64-character hex key for backup encryption. Use a separate stable key if possible. |
| `FREEAPI_CONFIG_PATH` | No | None | JSON config file applied idempotently after migrations on every boot. |
| `FREEAPI_CONFIG_JSON` | No | None | Inline JSON config. Takes precedence over `FREEAPI_CONFIG_PATH`. |

The `freellmapi-data` volume stores SQLite data at `/app/server/data`. Keep the same volume and `ENCRYPTION_KEY` when upgrading, otherwise existing encrypted provider keys cannot be decrypted.

Example `freellmapi.config.json`:

```json
{
  "keys": [
    { "platform": "groq", "key": "gsk_...", "label": "main" }
  ],
  "customProviders": [
    {
      "baseUrl": "http://host.docker.internal:11434/v1",
      "label": "Ollama",
      "models": [
        { "model": "llama3.1:8b", "displayName": "Local Llama", "supportsTools": true }
      ]
    }
  ],
  "routing": { "strategy": "balanced" }
}
```

## Remote Access via Cloudflare Tunnel

By default the container's port is only published on `127.0.0.1` (see
`HOST_BIND` above) because FreeLLMAPI is single-user with no auth beyond the
unified API key. If you want to reach it from outside your LAN, an optional
`cloudflared` service can expose it through a [Cloudflare
Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
instead of opening a port on your router.

1. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/),
   create a tunnel (Networks → Tunnels) and add a public hostname that points
   at `http://freellmapi:3001` — that's the app's service name and port on
   the Docker Compose network, not `localhost`.
2. Copy the connector token the dashboard gives you into `.env`:

   ```bash
   echo "TUNNEL_TOKEN=your-token-here" >> .env
   ```

   Treat this token like a password — anyone with it can run a connector for
   your tunnel. Never commit it; `.env` is already gitignored.
3. **Add a Cloudflare Access policy** to the public hostname before exposing
   it. The app itself only checks the unified API key on `/v1/*` — the
   dashboard has no additional login gate reachable from the public
   internet, so Access is what actually keeps strangers out.
4. Start everything, including the tunnel, with the `tunnel` profile:

   ```bash
   docker compose --profile tunnel up -d
   ```

   Leave off `--profile tunnel` (or just run `docker compose up -d`) to run
   without the tunnel, as before.

## Published Image

Images are published to GitHub Container Registry:

```bash
docker pull ghcr.io/tashfeenahmed/freellmapi:latest
```

The Docker workflow builds pull requests without pushing. After this repository receives the workflow on `main`, pushes to `main` and version tags publish images to GHCR automatically.
