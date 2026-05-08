const Database = require("better-sqlite3");

const db = new Database("gold-diggers.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prospecting_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    geometry_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS claim_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    query TEXT,
    limit_count INTEGER NOT NULL,
    geojson TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const defaultUser = db
  .prepare("SELECT id FROM users WHERE email = ?")
  .get("demo@gold-diggers.local");

if (!defaultUser) {
  db.prepare(`
    INSERT INTO users (email, name)
    VALUES (?, ?)
  `).run("demo@gold-diggers.local", "Demo User");
}

module.exports = db;
