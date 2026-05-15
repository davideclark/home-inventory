# Home Inventory

A self-hosted home inventory app for cataloguing hardware collections. Includes a REST API, PostgreSQL database, and web frontend. Pairs with an iOS/Android mobile app for offline-first inventory management.

## Quick Start

**Prerequisites:** Docker and Docker Compose installed.

**1. Create a folder and add a `docker-compose.yml`:**

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

**2. Create a `.env` file in the same folder:**

```
POSTGRES_PASSWORD=choose_a_strong_password
API_TOKEN=choose_a_secret_token
SERVER_NAME=My Inventory
```

**3. Start:**

```bash
docker compose up -d
```

**4. Open the web app at `http://localhost:3001`**

The database is created and migrated automatically on first start.

---

## Synology Container Manager

1. **File Station** — create a folder, e.g. `/volume1/docker/home-inventory`
2. Upload `docker-compose.yml` into that folder
3. **Container Manager → Project → Create**
   - Set the path to your folder — it will detect the compose file automatically
4. On the environment variables screen, add:

   | Variable | Value |
   |---|---|
   | `POSTGRES_PASSWORD` | your chosen password |
   | `API_TOKEN` | your chosen token |
   | `SERVER_NAME` | My Inventory |

5. Click **Done** — Container Manager pulls the images and starts everything

Access the web app at `http://<nas-ip>:3001`.

---

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `API_TOKEN` | Yes | — | Token required by all API requests |
| `SERVER_NAME` | No | `Home Inventory` | Display name shown in the mobile app |
| `API_PORT` | No | `3000` | Host port for the API |
| `WEB_PORT` | No | `3001` | Host port for the web app |

---

## Mobile App

In the app's Settings tab, enter:
- **Server URL:** `http://<your-server-ip>:3000`
- **Token:** the `API_TOKEN` value you chose

The app syncs over your local network (or via VPN for remote access).

---

## Running Multiple Instances

Each instance needs its own folder, unique ports, and a separate token. Add port overrides to the `.env` file:

```
POSTGRES_PASSWORD=choose_a_strong_password
API_TOKEN=choose_a_secret_token
SERVER_NAME=Work Inventory
API_PORT=3002
WEB_PORT=3003
```

The same `docker-compose.yml` works for every instance — only the `.env` values differ.
