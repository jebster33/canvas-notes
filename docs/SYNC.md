# Sync with your own server (preview)

Canvas Notes has **no central cloud**. If you want your boards on more than one computer, you run a
small sync server yourself and point the app at it. Only you (and anyone you give the token to) can
read what's on it.

The server is a few hundred lines of plain JavaScript in [`server/`](../server). It stores whole
boards with a version number. When two computers change the same board, the second upload is held
back and the app asks which copy to keep, so nothing gets silently overwritten.

> **Preview:** for now you upload and download boards by hand from **App settings → Sync**.
> Automatic background sync and live editing together are planned and will use this same server.

## 1. Pick a token

The token is the password for your server. Make it long and random (at least 16 characters):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Keep it private. Anyone with the token and the address can read and change your synced boards.

## 2. Host the server (pick one)

### Option A: Netlify (free tier works, nothing to keep running)

1. Fork this repository on GitHub (or use your own copy).
2. In Netlify: **Add new site → Import an existing project**, and pick your fork.
   The included `netlify.toml` deploys only the `server/` folder; the desktop app isn't built.
3. Under **Site configuration → Environment variables**, add `CANVAS_SYNC_TOKEN` with your token.
4. **Deploys → Trigger deploy**. Open your site address: the page should say *Ready*.

Boards are stored in [Netlify Blobs](https://docs.netlify.com/blobs/overview/) on your own Netlify account.

### Option B: Docker (home server, NAS, VPS)

```powershell
docker build -t canvas-notes-sync server
```

```powershell
docker run -d --name canvas-notes-sync -p 8787:8787 -e CANVAS_SYNC_TOKEN=your-long-token -v canvas-notes-data:/data --restart unless-stopped canvas-notes-sync
```

### Option C: Plain Node (any computer with Node 18 or newer)

```powershell
$env:CANVAS_SYNC_TOKEN = "your-long-token"; node server/node.mjs
```

Settings (environment variables): `PORT` (default `8787`) and `DATA_DIR` (default `./data`, one
JSON file per board).

**Reaching it from other places:** the app only talks to `https://` addresses, except servers on your
own network (`localhost`, `192.168.x.x`, `10.x.x.x`, `*.local`). To reach a home server from outside,
put it behind HTTPS, for example with Caddy, a Cloudflare Tunnel or Tailscale.

## 3. Connect the app

1. Open **App settings** (gear on the start screen, or **Sheet settings → App**).
2. Under **Sync**, paste the server address (like `https://my-notes.netlify.app`) and the token.
3. Press **Save and test**. It lists the boards on the server.
4. Open a board and press **Upload**. On another computer, connect the same way and download it.

The address is saved in your vault (`sync.json`); the token stays on that computer only.

## API (for your own tools)

Every request except `/api/health` needs `Authorization: Bearer <token>`.

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/health` | `{ ok, service, version, configured }` |
| GET | `/api/boards` | `{ boards: [{ id, name, rev, updatedAt }] }` |
| GET | `/api/boards/:id` | `{ id, board, rev, updatedAt, name }` |
| PUT | `/api/boards/:id` | body `{ board, baseRev }`. `baseRev` is the version you started from (`null` for a new board). Returns `{ rev }`, or **409** with the server's newer copy |
| DELETE | `/api/boards/:id?baseRev=N` | removes the board when `N` is still the newest version |
| GET | `/api/changes?since=<ms>` | every board changed after that time |

Run the server's tests with `node --test server/test.mjs`.
