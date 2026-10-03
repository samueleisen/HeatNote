// =============================================================================
// HeatNote Backend — Express + SQLite + Multer
// =============================================================================
// A lightweight REST API that persists workspaces, custom boards, and uploaded
// images to an embedded SQLite database and local file storage.
//
// Architecture:
//   Browser  ──(fetch)──►  Nginx ──(/api/ proxy)──►  This Server
//                                                        │
//                                       ┌────────────────┼────────────────┐
//                                       │  /data/heatnote.db  (SQLite)   │
//                                       │  /data/uploads/*    (Images)   │
//                                       └────────────────────────────────┘
//
// The frontend (app.js) writes to localStorage instantly for 0ms latency,
// then syncs to this backend in the background via debounced fetch() calls.
// =============================================================================

import express from 'express';
import Database from 'better-sqlite3';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

// =============================================================================
// Configuration
// =============================================================================
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = join(DATA_DIR, 'heatnote.db');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');

// Ensure directories exist
mkdirSync(UPLOADS_DIR, { recursive: true });

// =============================================================================
// Database Setup (SQLite via better-sqlite3)
// =============================================================================
// better-sqlite3 is synchronous — no connection pools, no promises, no callbacks.
// Each call is a direct C++ function invocation. This is ideal for single-user
// local workloads where microsecond latency matters more than concurrency.
const db = new Database(DB_PATH);

// WAL mode allows reads and writes to happen concurrently without blocking.
// It also makes the database more resilient to crashes.
db.pragma('journal_mode = WAL');

// Create tables if they don't exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    date       TEXT PRIMARY KEY,
    notes      TEXT NOT NULL DEFAULT '[]',
    drawings   TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boards (
    name       TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
`);

// =============================================================================
// Prepared Statements (Compiled once, executed many times — faster than ad-hoc)
// =============================================================================
const stmts = {
  getWorkspace: db.prepare('SELECT * FROM workspaces WHERE date = ?'),
  getAllWorkspaces: db.prepare('SELECT * FROM workspaces ORDER BY date DESC'),
  upsertWorkspace: db.prepare(`
    INSERT INTO workspaces (date, notes, drawings, updated_at)
    VALUES (@date, @notes, @drawings, @updated_at)
    ON CONFLICT(date) DO UPDATE SET
      notes      = @notes,
      drawings   = @drawings,
      updated_at = @updated_at
  `),
  deleteWorkspace: db.prepare('DELETE FROM workspaces WHERE date = ?'),

  getAllBoards: db.prepare('SELECT name FROM boards ORDER BY created_at ASC'),
  clearBoards: db.prepare('DELETE FROM boards'),
  insertBoard: db.prepare('INSERT OR IGNORE INTO boards (name, created_at) VALUES (?, ?)'),
};

// =============================================================================
// Multer — File Upload Handling
// =============================================================================
// Images are saved to /data/uploads/<uuid>.<ext> and served by Nginx.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// =============================================================================
// Express App
// =============================================================================
const app = express();
app.use(express.json({ limit: '50mb' }));

// -- Health Check -------------------------------------------------------------
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// =============================================================================
// Auth Endpoints (Local Single-User — No Real Auth)
// =============================================================================
// HeatNote runs locally. There is no login flow. The /auth/me endpoint always
// returns a local user object so the frontend activates sync mode immediately.
// If you later want multi-user auth, replace these stubs with real session logic.

const LOCAL_USER = {
  id: 'local',
  name: 'Local User',
  email: '',
  avatarUrl: '',
};

app.get('/auth/me', (_req, res) => {
  res.json(LOCAL_USER);
});

app.post('/auth/login', (_req, res) => {
  res.json(LOCAL_USER);
});

app.post('/auth/logout', (_req, res) => {
  res.json({ ok: true });
});

// =============================================================================
// Workspace Endpoints
// =============================================================================

// GET /workspaces — List all workspaces (used by Activity Rail heatmap)
// Returns the full notes array so the frontend can extract counts, colors, titles.
app.get('/workspaces', (_req, res) => {
  try {
    const rows = stmts.getAllWorkspaces.all();
    const result = rows.map((row) => ({
      date: row.date,
      notes: JSON.parse(row.notes),
      drawings: JSON.parse(row.drawings),
      updatedAt: row.updated_at,
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /workspaces error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /workspaces/:date — Load a specific workspace
app.get('/workspaces/:date', (req, res) => {
  try {
    const row = stmts.getWorkspace.get(req.params.date);
    if (!row) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({
      date: row.date,
      notes: JSON.parse(row.notes),
      drawings: JSON.parse(row.drawings),
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('GET /workspaces/:date error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /workspaces/:date — Save (upsert) a workspace
app.put('/workspaces/:date', (req, res) => {
  try {
    const { notes, drawings, updatedAt } = req.body;
    stmts.upsertWorkspace.run({
      date: req.params.date,
      notes: JSON.stringify(notes || []),
      drawings: JSON.stringify(drawings || []),
      updated_at: updatedAt || Date.now(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /workspaces/:date error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /workspaces?before=<date> — Prune all workspaces older than a cutoff date
// Used by pruneExpiredWorkspaces() in app.js to clean up old daily canvases.
app.delete('/workspaces', (req, res) => {
  try {
    const before = req.query.before;
    if (!before) {
      return res.status(400).json({ error: 'Missing ?before= query parameter' });
    }
    // Only delete date-formatted workspaces (YYYY-MM-DD), not custom boards
    const deleteOld = db.prepare(
      `DELETE FROM workspaces WHERE date < ? AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
    );
    const result = deleteOld.run(before);
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    console.error('DELETE /workspaces?before= error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /workspaces/:date — Delete a workspace
app.delete('/workspaces/:date', (req, res) => {
  try {
    stmts.deleteWorkspace.run(req.params.date);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /workspaces/:date error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Custom Boards Endpoints
// =============================================================================

// GET /boards — List custom board names
app.get('/boards', (_req, res) => {
  try {
    const rows = stmts.getAllBoards.all();
    res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error('GET /boards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /boards — Replace the entire boards list
app.put('/boards', (req, res) => {
  try {
    const list = req.body; // expected: ["board-a", "board-b"]
    if (!Array.isArray(list)) {
      return res.status(400).json({ error: 'Expected an array of board names' });
    }

    // Transactional replacement: clear all, then insert fresh list
    const replaceBoards = db.transaction((names) => {
      stmts.clearBoards.run();
      const now = Date.now();
      for (const name of names) {
        if (typeof name === 'string' && name.trim()) {
          stmts.insertBoard.run(name.trim().toLowerCase(), now);
        }
      }
    });
    replaceBoards(list);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /boards error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// File Upload Endpoint
// =============================================================================

// POST /upload — Accept a single image file, return its URL
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // The URL path /uploads/<filename> will be served by Nginx directly,
  // proxied to this container's static file serving.
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Serve uploaded files directly (fallback if Nginx proxy is not configured)
app.use('/uploads', express.static(UPLOADS_DIR));

// =============================================================================
// Start Server
// =============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HeatNote Backend] Running on port ${PORT}`);
  console.log(`[HeatNote Backend] Database: ${DB_PATH}`);
  console.log(`[HeatNote Backend] Uploads:  ${UPLOADS_DIR}`);
});
