const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, "evsync.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  downloads_left INTEGER NOT NULL,
  password_hash TEXT
);
`);

module.exports = db;
