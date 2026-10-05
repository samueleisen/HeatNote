# HeatNote

A lightweight canvas and note-taking app that visualizes your daily progress and writing streaks with an activity heatmap.

---

## Quick Start (No Setup Required)

You don't need Node.js, compilers, or the source code to run HeatNote. All you need is **Docker**.

### 1. Download & Launch

Create an empty directory and run:

```bash
# Download the release configuration
curl -O https://raw.githubusercontent.com/samueleisen/HeatNote/main/docker-compose.release.yml

# Start HeatNote
docker compose -f docker-compose.release.yml up -d
```

### 2. Open the App

Visit **`http://localhost:8080`** in your browser.

> [!TIP]
> **Port 8080 in use?**
> If another application or container on your machine is already using port `8080`, simply choose another port using the `HEATNOTE_PORT` environment variable:
> ```bash
> HEATNOTE_PORT=9000 docker compose -f docker-compose.release.yml up -d
> ```
> Then access the app at `http://localhost:9000`.

---

## Managing HeatNote

- **Stop the app:**
  ```bash
  docker compose -f docker-compose.release.yml down
  ```
- **Start it back up:**
  ```bash
  docker compose -f docker-compose.release.yml up -d
  ```
- **Update to the latest release:**
  ```bash
  docker compose -f docker-compose.release.yml pull
  docker compose -f docker-compose.release.yml up -d
  ```

> [!NOTE]
> All notes, workspaces, and uploaded images are saved in a persistent Docker volume (`heatnote-data`). Your data survives stops, restarts, and version updates.

---

## For Developers (Running from Source)

If you want to contribute or build the containers from source:

```bash
git clone https://github.com/samueleisen/HeatNote.git
cd HeatNote
docker compose up --build
```
