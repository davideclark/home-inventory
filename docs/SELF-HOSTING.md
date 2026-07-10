# Self-Hosting Guide

Run your own Home Inventory server with Docker. Everything — the database, the API, and the web app — runs on your own hardware; nothing leaves your network.

## What you need

- A machine that's always on: a NAS, a home server, a mini-PC, or a cheap VPS.
- **An amd64 (x86-64) machine.** The published Docker images are amd64-only — a Raspberry Pi or ARM NAS won't work without building the images from source.
- Docker with Compose v2 (`docker compose version` should work).

## 1. Set up the directory

```bash
mkdir -p /path/to/home-inventory/images
cd /path/to/home-inventory
```

Copy `docker-compose.yml` from this repository into that directory.

## 2. Create the `.env` file

Create `.env` next to `docker-compose.yml`:

```env
DOCKERHUB_USERNAME=davideclark

# Generate both secrets with: openssl rand -hex 32
POSTGRES_PASSWORD=<random secret>
JWT_SECRET=<random secret>

# Initial admin account — you are forced to change this password on first login
ADMIN_USERNAME=<your username>
ADMIN_PASSWORD=<initial password>

SERVER_NAME=My Home Inventory

# Host path where photos & receipts are stored — BACK THIS FOLDER UP
IMAGES_PATH=/path/to/home-inventory/images

# Ports (change if they clash with something else on the machine)
API_PORT=3000
WEB_PORT=3001
POSTGRES_PORT=5433
```

**`SECURE_COOKIES`**: only add `SECURE_COOKIES=true` if you serve the web app over HTTPS (e.g. behind a reverse proxy with a certificate). On plain HTTP it must be left unset (or `false`) — otherwise browsers silently drop the session cookies and login appears to succeed but immediately loops back to the login page.

## 3. First run

```bash
docker compose up -d
```

That's it. On first startup the API creates the database tables automatically and seeds your admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Open `http://<machine-ip>:3001`, log in, and complete the forced password change.

## 4. Using it

- **Web app** (`http://<machine-ip>:3001`): full-featured — catalogues, items, container hierarchy, search, photos, receipts, valuation report with CSV export.
- **Valuation for insurance**: give a catalogue a *Currency* field with "Counts toward valuation" ticked, enter replacement values on your items, then check the **Valuation** page — it totals everything by catalogue and by room and compares against your coverage figure.
- **Receipts**: attach photos and PDF receipts to any item as proof of ownership (item Edit dialog on web, item detail screen on mobile).

## 5. Backups

Web app → **Settings → Export Backup** downloads a ZIP containing all data plus every photo and receipt. Keep a copy somewhere safe (restore is Settings → Import Backup — note it wipes and replaces everything).

Optionally also dump the database on a schedule:

```bash
docker compose exec postgres pg_dump -U inventory home_inventory > backup.sql
```

## 6. Updating

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on startup.

## 7. The mobile app

The app is not on the App Store / Play Store. Options:

- **Android**: easiest. Build a shareable APK with `eas build --platform android --profile preview` (requires an [Expo](https://expo.dev) account, run from this repository) and sideload it. In the app: Settings tab → enter `http://<machine-ip>:3000` → Sign In.
- **iOS**: needs an Apple Developer account ($99/yr) belonging to whoever builds it:
  - *Ad-hoc / internal build*: your device's UDID must be registered on the builder's developer account, and the app rebuilt after registering. Fine for one or two devices.
  - *TestFlight*: needs App Store Connect setup once; builds expire after 90 days but no UDID dance. Recommended if iOS matters.
- **Or skip the app entirely** — the web app does everything except offline access.

## 8. Remote access

The server binds to plain HTTP, so don't port-forward it to the internet. For access away from home use a mesh VPN like [Tailscale](https://tailscale.com) (free for personal use): install it on the server and your devices, then use the server's Tailscale IP in place of the LAN IP.

If you do want a public HTTPS domain, put a reverse proxy (Caddy, nginx, Synology's built-in one) with a certificate in front of the web port and set `SECURE_COOKIES=true` in `.env`.
