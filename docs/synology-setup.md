# Synology NAS Setup Guide

A complete guide for deploying the Home Inventory app on a Synology NAS, including HTTPS setup for secure remote access.

---

## Prerequisites

- Synology NAS running **DSM 7.2 or later**
- **Container Manager** installed (Package Center → search "Container Manager")
- The **Home Inventory mobile app** installed on your iPhone or Android

---

## Part 1 — Deploy the app

### Step 1 — Create folders for the app

Open **File Station** and create two folders:

```
/volume1/docker/home-inventory/
/volume1/docker/home-inventory/images/
```

The `images` folder is where item photos are stored. You can create it in File Station by navigating into `home-inventory` and clicking **Create → Create folder**, or via SSH:

```bash
mkdir -p /volume1/docker/home-inventory/images
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
      - "${API_PORT:-3002}:3000"
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
      - "${WEB_PORT:-3003}:3001"
    depends_on:
      - api

volumes:
  postgres_data:
```

> **Note:** Docker runs on ports `3002` (API) and `3003` (web) on the host. Ports `3000` and `3001` are reserved for the HTTPS reverse proxy set up in Part 3. This avoids any port conflict when adding HTTPS later.

### Step 3 — Create `.env`

In the same folder, create a file named `.env`:

```
POSTGRES_PASSWORD=choose_a_strong_password
API_TOKEN=choose_a_secret_token
SERVER_NAME=My Home Inventory
IMAGES_PATH=/volume1/docker/home-inventory/images
```

> **Tip:** `API_TOKEN` is what the mobile app and web UI use to authenticate with the API. Choose something long and random — treat it like a password.

> **Images:** `IMAGES_PATH` is the folder on your NAS where item photos are stored (created in Step 1). If you change this path later, move the existing images folder to the new location before restarting.

### Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL database password |
| `API_TOKEN` | Yes | — | Token required by the mobile app and web UI to access the API |
| `SERVER_NAME` | No | `Home Inventory` | Display name shown in the mobile app Settings screen |
| `IMAGES_PATH` | No | `/volume1/docker/home-inventory/images` | Host path where item photos are stored |
| `API_PORT` | No | `3002` | Host port for the API container |
| `WEB_PORT` | No | `3003` | Host port for the web container |

### Step 4 — Start via Container Manager

1. Open **Container Manager** → **Project** → **Create**
2. Set the project path to the folder you created (e.g. `/volume1/docker/home-inventory`)
3. Container Manager detects the `docker-compose.yml` automatically
4. On the environment variables screen, confirm your values are present
5. Click **Done** — Container Manager pulls the images and starts all three containers

### Step 5 — Verify it's running

Open a browser and navigate to:

- `http://<nas-local-ip>:3003` — the web UI should load
- `http://<nas-local-ip>:3002/api/health` — should return `{"status":"ok"}`

Find your NAS local IP in DSM → **Control Panel** → **Network**.

---

## Part 2 — Connect the mobile app (local network)

1. Open the Home Inventory app → **Settings** tab
2. Enter the **Server URL**: `http://<nas-local-ip>:3002`
3. Enter the **Token**: the `API_TOKEN` value from your `.env` file
4. Tap **Test & Save** — it should show "Connected" and your server name

This works on your home Wi-Fi. For remote access over HTTPS, continue to Part 3.

---

## Part 3 — HTTPS setup (remote access + App Store build)

HTTPS is required to:
- Access the app securely from anywhere, not just home Wi-Fi
- Run an App Store distribution build of the iOS app (Apple blocks plain HTTP connections)

This setup adds an HTTPS reverse proxy in front of the Docker containers using a free Synology DDNS hostname and a Let's Encrypt certificate.

### Step 1 — Register a Synology DDNS hostname and get a certificate

1. DSM → **Control Panel** → **External Access** → **DDNS** tab → **Add**
2. Fill in the form:
   - **Service Provider**: Synology
   - **Hostname**: choose a name, e.g. `my-inventory` → your domain will be `my-inventory.synology.me`
   - **Synology Account**: sign in if prompted
   - **External Address**: leave as Auto (detected public IP)
3. Tick **Get a certificate from Let's Encrypt and set it as default**
4. Click **Test Connection** to confirm the hostname is available, then click **OK**

DSM registers the hostname and obtains a Let's Encrypt certificate in one step. The certificate is valid for 90 days and renews automatically. **You do not need to open any ports on your router for this step** — Synology handles the ACME challenge through their own servers.

### Step 2 — Create DSM Reverse Proxy rules

DSM → **Control Panel** → **Login Portal** → **Advanced** tab → **Reverse Proxy** → **Create**

**Rule 1 — API**

| Field | Value |
|-------|-------|
| Description | Home Inventory API |
| Source Protocol | HTTPS |
| Source Hostname | `*` |
| Source Port | `3000` |
| Destination Protocol | HTTP |
| Destination Hostname | `localhost` |
| Destination Port | `3002` |

**Rule 2 — Web**

| Field | Value |
|-------|-------|
| Description | Home Inventory Web |
| Source Protocol | HTTPS |
| Source Hostname | `*` |
| Source Port | `3001` |
| Destination Protocol | HTTP |
| Destination Hostname | `localhost` |
| Destination Port | `3003` |

The Let's Encrypt certificate you obtained in Step 1 was set as the DSM default, so it is applied automatically to all HTTPS reverse proxy rules — no further certificate configuration is needed.

### Step 3 — Open DSM firewall ports (optional)

If you have the DSM firewall enabled, add **Allow** rules for TCP ports **3000** and **3001**:

DSM → **Control Panel** → **Security** → **Firewall** → **Edit Rules** → **Create**

To restrict access to Tailscale devices only, set the source IP range to `100.64.0.0/10`.

If the DSM firewall is not enabled, skip this step — the setup works without it.

### Step 4 — Enable remote access

The reverse proxy is now serving HTTPS on ports 3000 and 3001, but `my-inventory.synology.me` resolves to your home router's public IP. To reach it from outside your home network, forward those ports on your router to the NAS.

On your home router, add two port forwarding rules:

| External Port | Internal IP | Internal Port | Protocol |
|---|---|---|---|
| 3000 | `<nas-local-ip>` | 3000 | TCP |
| 3001 | `<nas-local-ip>` | 3001 | TCP |

> The exact steps vary by router — look for "Port Forwarding", "Virtual Server", or "NAT" in your router's admin panel.

Once forwarded, `https://my-inventory.synology.me:3000` is accessible from anywhere. The API token protects all endpoints.

### Step 5 — Update app Settings

1. Open the Home Inventory app → **Settings** tab
2. Change the **Server URL** to: `https://my-inventory.synology.me:3000`
3. Tap **Test & Save** — should show "Connected"

The app now communicates over HTTPS from anywhere.

---

## Part 4 — Keeping up to date

### Updating to a new version

Container Manager → **Project** → **home-inventory** → **Action** → **Pull and Restart**

Container Manager fetches the latest image versions and restarts the containers with no data loss.

### Certificate renewal

Automatic — DSM renews the Let's Encrypt certificate before it expires. No action needed.

### Apple "Limit IP Address Tracking" and local domain access

If you have not set up port forwarding (Part 3, Step 4), `my-inventory.synology.me` resolves to the NAS's local IPv6 address via your router's DNS rather than the public IP. This works fine on most devices, but **Safari on iPhone and iPad may fail to connect** even when on the local network.

The cause is Apple's **Limit IP Address Tracking** feature (iCloud Private Relay). When enabled, Safari routes web traffic through Apple's relay servers to hide your IP. Apple exempts RFC 1918 local addresses (`192.168.x.x`, `10.x.x.x`) from this relay, but a local IPv6 address or DDNS hostname is treated as external traffic and routed through Apple's servers — which cannot reach your NAS.

**To check**: on your iPhone go to **Settings → Wi-Fi → tap your network name** and look for the **Limit IP Address Tracking** toggle.

**Solutions** (pick one):
- Use `https://<nas-local-ip>:3001` as your bookmark on the home network — local IPs are always exempt from Private Relay
- Disable **Limit IP Address Tracking** for your home network in the same Wi-Fi settings screen
- Set up port forwarding (Part 3, Step 4) so the domain resolves to your public IP — this routes correctly regardless of Private Relay

---

## Troubleshooting

**"Connection failed" in app Settings**
- Confirm the containers are running: Container Manager → Project → check all three containers show green
- Test `https://my-inventory.synology.me:3000/api/health` in a browser
- Confirm port forwarding is set up correctly on your router

**Web UI blank or "502 Bad Gateway"**
- The reverse proxy rule destination port may be wrong — confirm it points to `3002` (API) or `3003` (Web)
- Restart the project in Container Manager and wait 30 seconds for the health check to pass

**Certificate error in browser**
- The cert is issued for `my-inventory.synology.me` — make sure you're accessing the site via that hostname, not a local IP address

**Tailscale showing NAS as disconnected**
- On the NAS: DSM → **Package Center** → **Installed** → **Tailscale** → **Stop** → **Start**
- On the phone: open the Tailscale app and toggle the connection off and back on
