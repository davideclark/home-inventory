# Synology NAS Setup Guide

A complete guide for deploying the Home Inventory app on a Synology NAS, including HTTPS setup for secure remote access via Tailscale.

---

## Prerequisites

- Synology NAS running **DSM 7.2 or later**
- **Container Manager** installed (Package Center → search "Container Manager")
- **Tailscale** installed and signed in to your tailnet (Package Center → search "Tailscale")
- The **Home Inventory mobile app** installed on your iPhone or Android

---

## Part 1 — Deploy the app

### Step 1 — Create a folder for the app

Open **File Station** and create a folder for the app, e.g.:

```
/volume1/docker/home-inventory/
```

### Step 2 — Create `docker-compose.yml`

Inside that folder, create a file named `docker-compose.yml` with the following content:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: home_inventory
      POSTGRES_USER: inventory
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U inventory -d home_inventory"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    image: davideclark/home-inventory-api:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://inventory:${POSTGRES_PASSWORD}@postgres:5432/home_inventory
      PORT: 3000
      API_TOKEN: ${API_TOKEN}
      SERVER_NAME: ${SERVER_NAME:-Home Inventory}
      IMAGE_PATH: /images
    volumes:
      - ${IMAGES_PATH:-/volume1/docker/home-inventory/images}:/images
    ports:
      - "${API_PORT:-3000}:3000"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    image: davideclark/home-inventory-web:latest
    restart: unless-stopped
    environment:
      API_URL: http://api:3000
      API_TOKEN: ${API_TOKEN}
    ports:
      - "${WEB_PORT:-3001}:3001"
    depends_on:
      - api

volumes:
  postgres_data:
```

### Step 3 — Create `.env`

In the same folder, create a file named `.env`:

```
POSTGRES_PASSWORD=choose_a_strong_password
API_TOKEN=choose_a_secret_token
SERVER_NAME=My Home Inventory
IMAGES_PATH=/volume1/docker/home-inventory/images
```

> **Tip:** `API_TOKEN` is what the mobile app and web UI use to authenticate with the API. Choose something long and random — treat it like a password.

> **Images:** `IMAGES_PATH` is the folder on your NAS where item photos are stored. The folder is created automatically if it doesn't exist. If you change this path later, move the existing images folder to the new location before restarting.

### Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL database password |
| `API_TOKEN` | Yes | — | Token required by the mobile app and web UI to access the API |
| `SERVER_NAME` | No | `Home Inventory` | Display name shown in the mobile app Settings screen |
| `IMAGES_PATH` | No | `/volume1/docker/home-inventory/images` | Host path where item photos are stored |
| `API_PORT` | No | `3000` | External port for the API (change to `13000` when adding HTTPS — see Part 3) |
| `WEB_PORT` | No | `3001` | External port for the web UI (change to `13001` when adding HTTPS — see Part 3) |

### Step 4 — Start via Container Manager

1. Open **Container Manager** → **Project** → **Create**
2. Set the project path to the folder you created (e.g. `/volume1/docker/home-inventory`)
3. Container Manager detects the `docker-compose.yml` automatically
4. On the environment variables screen, confirm your values are present
5. Click **Done** — Container Manager pulls the images and starts all three containers

### Step 5 — Verify it's running

Open a browser and navigate to:

- `http://<nas-local-ip>:3001` — the web UI should load
- `http://<nas-local-ip>:3000/api/health` — should return `{"status":"ok"}`

Find your NAS local IP in DSM → **Control Panel** → **Network**.

---

## Part 2 — Connect the mobile app (local network)

1. Open the Home Inventory app → **Settings** tab
2. Enter the **Server URL**: `http://<nas-local-ip>:3000`
3. Enter the **Token**: the `API_TOKEN` value from your `.env` file
4. Tap **Test & Save** — it should show "Connected" and your server name

This works on your home Wi-Fi. For remote access, continue to Part 3.

---

## Part 3 — HTTPS with Tailscale (remote access + App Store build)

HTTPS is required to:
- Use the app from anywhere via Tailscale (not just home Wi-Fi)
- Run an App Store distribution build of the iOS app (Apple blocks plain HTTP connections)

This setup uses a free Synology DDNS hostname to obtain a trusted Let's Encrypt certificate, then routes Tailscale traffic to the NAS without exposing any ports to the public internet.

### Step 1 — Register a Synology DDNS hostname

1. DSM → **Control Panel** → **External Access** → **DDNS** tab → **Add**
2. Service Provider: **Synology**
3. Hostname: choose a name, e.g. `my-inventory` → your domain will be `my-inventory.synology.me`
4. Leave External Address as the auto-detected value
5. Click **Test Connection**, then **OK**

### Step 2 — Get a Let's Encrypt certificate

1. DSM → **Control Panel** → **Security** → **Certificate** tab → **Add**
2. Choose **Get a certificate from Let's Encrypt**
3. Domain name: `my-inventory.synology.me` (the hostname you chose above)
4. Email: your email address (for expiry notices only)
5. Click **Done**

> DSM handles the ACME challenge through Synology's own servers — **you do not need to open port 80** on your router. The certificate is valid for 90 days and renews automatically.

### Step 3 — Move Docker to internal ports

The DSM reverse proxy needs to own ports 3000 and 3001. Move the Docker containers to internal-only ports by adding two lines to your `.env` file:

```
API_PORT=13000
WEB_PORT=13001
```

Then restart the project in Container Manager:
**Container Manager → Project → home-inventory → Action → Restart**

The containers now bind on ports 13000/13001 internally. Nothing external can reach them directly — the reverse proxy handles all incoming traffic.

### Step 4 — Create DSM Reverse Proxy rules

DSM → **Control Panel** → **Application Portal** → **Reverse Proxy** tab → **Create**

**Rule 1 — API**

| Field | Value |
|-------|-------|
| Description | Home Inventory API |
| Source Protocol | HTTPS |
| Source Hostname | `*` |
| Source Port | `3000` |
| Destination Protocol | HTTP |
| Destination Hostname | `localhost` |
| Destination Port | `13000` |

**Rule 2 — Web**

| Field | Value |
|-------|-------|
| Description | Home Inventory Web |
| Source Protocol | HTTPS |
| Source Hostname | `*` |
| Source Port | `3001` |
| Destination Protocol | HTTP |
| Destination Hostname | `localhost` |
| Destination Port | `13001` |

For each rule, click **Edit** after saving and set the **Certificate** to `my-inventory.synology.me`.

### Step 5 — Open DSM firewall ports

DSM → **Control Panel** → **Security** → **Firewall**

Add **Allow** rules for TCP ports **3000** and **3001**. If you want to restrict access to Tailscale devices only, set the source IP range to `100.64.0.0/10`.

### Step 6 — Add a Tailscale DNS override

This makes your `synology.me` domain resolve to the NAS's Tailscale IP for all devices in your tailnet — so the app can reach it from anywhere without port forwarding.

1. Open [https://login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns)
2. Scroll to **Extra Records** → click **Add**
3. Fill in:
   - **Name**: `my-inventory.synology.me`
   - **Type**: `A`
   - **Value**: your NAS's Tailscale IP (find it in Tailscale admin → **Machines**)
4. Click **Save**

All Tailscale-connected devices now resolve `my-inventory.synology.me` to the NAS directly, without going through the public internet.

### Step 7 — Update app Settings

1. Open the Home Inventory app → **Settings** tab
2. Change the **Server URL** to: `https://my-inventory.synology.me:3000`
3. Tap **Test & Save** — should show "Connected"

The app now communicates over HTTPS from anywhere your Tailscale is connected.

---

## Part 4 — Keeping up to date

### Updating to a new version

Container Manager → **Project** → **home-inventory** → **Action** → **Pull and Restart**

Container Manager fetches the latest image versions and restarts the containers with no data loss.

### Certificate renewal

Automatic — DSM renews the Let's Encrypt certificate before it expires. No action needed.

### Tailscale IP change

Tailscale IPs are stable and don't change unless you remove and re-add the machine to your tailnet. If the IP does change, update the Extra Record value in the [Tailscale admin DNS settings](https://login.tailscale.com/admin/dns).

---

## Troubleshooting

**"Connection failed" in app Settings**
- Confirm the containers are running: Container Manager → Project → check all three containers show green
- Test `https://my-inventory.synology.me:3000/api/health` in a browser on a Tailscale-connected device
- Check the Tailscale DNS Extra Record is saved correctly and points to the right IP

**Web UI blank or "502 Bad Gateway"**
- The reverse proxy rule may be pointing to the wrong port — confirm the destination is `13000` (API) or `13001` (Web), not the old `3000`/`3001`
- Restart the project in Container Manager and wait 30 seconds for the health check to pass

**Certificate error in browser**
- The cert is issued for `my-inventory.synology.me` — make sure you're accessing the site via that hostname, not an IP address
- Check the cert is assigned to the reverse proxy rules (Step 4, Edit → Certificate)
