# NEXUS

**One Panel. Total Control.**

Nexus is a private Discord remote-administration bot. You operate it from a **control server**. It performs official Discord API moderation on a linked **target server**. Your personal Discord account does not need to be in the target server.

Nexus does **not** hide activity from Discord. Bans appear in Discord’s native audit log. Nexus only keeps the control panel, progress, and reports inside your private control server.

## What you get

- Persistent control panel: **NEXUS | Remote Administration**
- One management button: **Ban All** (Danger)
- Protected workflow: authorize → examine members → **manual selection** → confirm → execute selected bans
- Live progress in the control server
- Accurate moderation reports, with a CSV attachment when the result set is large
- Owner allowlist, control guild/channel checks, operation lock, and no auto-resume of bans after restart

There is no one-click “ban every member” action. Eligible members start **unselected**.

## Requirements

- Node.js **22.12+** (uses `node:sqlite`)
- One Discord bot application / one token
- Privileged Gateway Intent: **Server Members Intent**
- Bot invited to both servers
- Target-server role high enough to ban the accounts you select (Administrator does **not** bypass role hierarchy)
- **Railway** account for production hosting (Windows works for local testing)

## Discord Developer Portal

1. Create an application named **Nexus**.
2. Open **Bot** and create the bot.
3. Enable **Server Members Intent**. Presence intent is not required.
4. Copy the bot token. Never commit it.
5. OAuth2 → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Administrator` (required for the target server by this project’s design)
6. Invite Nexus to the **control** server.
7. Invite Nexus to the **target** server with Administrator.
8. In the target server, drag the Nexus role **above** roles you intend to moderate. The server owner cannot be banned.

Copy IDs (Developer Mode → right-click → Copy ID):

| Value | Where |
| --- | --- |
| `CONTROL_GUILD_ID` | Control server |
| `TARGET_GUILD_ID` | Target server |
| `CONTROL_CHANNEL_ID` | Channel for the persistent panel |
| `LOG_CHANNEL_ID` | Channel for previews, progress, reports |
| `OWNER_USER_ID` | Your Discord user ID (comma-separated for extra operators) |

## Local run (Windows)

```powershell
cd "C:\Claude Code\Nexus"
copy .env.example .env
notepad .env
npm install
npm start
```

On first ready, Nexus registers `/panel` **only** on the control server. Run `/panel` in `CONTROL_CHANNEL_ID`.

## Railway (production)

Nexus is a long-running bot, not a public website. Do **not** attach a Railway public domain unless you want the `/health` endpoint exposed.

### 1. Push or deploy the repo

From this directory, with the Railway CLI:

```powershell
npm i -g @railway/cli
railway login
railway init --name nexus
railway up -y -m "Deploy Nexus"
```

Or connect the GitHub/Origin repo in the Railway dashboard and deploy from git.

### 2. Variables

In the service → **Variables**, set:

```
DISCORD_TOKEN=
CONTROL_GUILD_ID=
TARGET_GUILD_ID=
CONTROL_CHANNEL_ID=
LOG_CHANNEL_ID=
OWNER_USER_ID=
DATA_DIR=/data
```

Start command is already `node src/index.js` via `railway.json`. Nixpacks uses Node 22.

### 3. Volume (SQLite panel persistence)

Railway disks are ephemeral without a volume. Attach a volume to **`/data`** so `nexus.db` survives redeploys.

If you skip the volume, the panel message ID is lost on each deploy and `/panel` creates a new panel message.

### 4. Health check (optional)

If Railway injects `PORT`, Nexus listens on `0.0.0.0:$PORT` and answers `GET /` and `GET /health` with `Nexus operational`. That is only for platform health checks. It is not a public control panel.

Disable app sleeping so the WebSocket stays connected.

### 5. After deploy

Watch deploy logs until you see `Nexus online as ...`. Then in the control server run `/panel`.

Redeploy after changing variables.

## Commands

| Command | Where | Who |
| --- | --- | --- |
| `/panel` | Control server, control channel | Owner allowlist |

## Ban All workflow

1. Authorized operator clicks **Ban All**.
2. Nexus fetches target members and classifies them (owner, hierarchy, not bannable, Nexus itself).
3. A selection UI is posted in the **log channel**. Nothing is pre-checked.
4. Paginated select menus (25 per page). Confirm Selection → explicit Execute / Cancel (5 minute expiry).
5. Confirmed IDs are banned through `guild.members.ban`. Rate limits are respected. Failures are recorded, never invented.
6. Progress edits one message. The final report stays in the control server.

Interrupted runs are marked `interrupted` in SQLite and **are not resumed**.

## Testing (use a throwaway target server)

Do not test destructive bans on a populated production community.

| Case | Expected |
| --- | --- |
| Authorized `/panel` | Panel upserted, no duplicate if message still exists |
| Unauthorized user clicks Ban All | Ephemeral access denied |
| Command in target server | Rejected / not registered there |
| Missing Ban Members | Permission error, no bans |
| Server owner in list | Always excluded |
| Higher role than Nexus | Excluded (hierarchy) |
| Empty selection | Confirm stays disabled |
| Cancel | No bans |
| Wait out confirmation | Expired, no bans |
| Restart mid-selection | Lock cleared; must start over |
| Large selection | Summary embed + CSV of every attempt |

## Project layout

```text
nexus/
├── src/
│   ├── index.js
│   ├── config/config.js
│   ├── commands/panel.js
│   ├── components/buttons.js
│   ├── components/menus.js
│   ├── services/
│   ├── security/authorization.js
│   ├── storage/database.js
│   └── utils/
├── railway.json
├── nixpacks.toml
├── .env.example
└── package.json
```

## Security notes

- Tokens and IDs live in environment variables only.
- Every button and menu is re-checked against owner ID, control guild, and control/log channel.
- Concurrent Ban All operations are blocked.
- Nexus never posts the control panel or progress in the target server.
- Nexus never DMs banned users and never deletes Discord audit logs.
