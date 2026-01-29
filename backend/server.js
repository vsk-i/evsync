const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const archiver = require("archiver");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();

if (process.env.NODE_ENV !== "production") {
  app.use(cors());
}

app.use(express.json());

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const PORT = process.env.PORT || 3001;

const UPLOAD_DIR = path.join(__dirname, "uploads");

// ---------- utils ----------
function ensureDirs() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

// пароль: PBKDF2
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 150000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.pbkdf2Sync(password, salt, 150000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

// ---------- multer ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const unique =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// multer error handler
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Файл слишком большой", maxSizeMb: 50 });
  }
  if (err) {
    console.error(err);
    return res.status(500).json({ error: "Ошибка загрузки файла" });
  }
  next();
});

// ---------- health ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "server is running" });
});

// ---------- upload ----------
app.post("/upload", upload.single("file"), (req, res) => {
  ensureDirs();
  if (!req.file) return res.status(400).json({ error: "no file uploaded" });

  const maxDownloads =
    req.body.maxDownloads ? Math.max(1, Math.min(1000, +req.body.maxDownloads)) : 1;

  const ttlMinutes =
    req.body.ttlMinutes ? Math.max(1, Math.min(43200, +req.body.ttlMinutes)) : 60;

  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

  const id = randomToken(12);
  const token = randomToken(24);
  const tokenHash = sha256(token);

  const passwordHash = req.body.password ? hashPassword(req.body.password) : null;

  db.prepare(`
    INSERT INTO links (
      id, token_hash, stored_file_name, original_name,
      size, created_at, expires_at, downloads_left, password_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tokenHash,
    req.file.filename,
    req.file.originalname,
    req.file.size,
    Date.now(),
    expiresAt,
    maxDownloads,
    passwordHash
  );

  const downloadUrl = `${req.protocol}://${req.get("host")}/d/${id}?t=${token}`;

  res.json({
    id,
    downloadUrl,
    expiresAt,
    downloadsLeft: maxDownloads,
    passwordRequired: !!passwordHash,
  });
});

// ---------- legacy GET download ----------
app.get("/d/:id", (req, res) => {
  ensureDirs();

  const { id } = req.params;
  const { t: token, p: password, zip } = req.query;

  if (!token) return res.status(401).json({ error: "token required" });

  const link = db.prepare("SELECT * FROM links WHERE id = ?").get(id);
  if (!link) return res.status(404).json({ error: "link not found" });
  if (Date.now() > link.expires_at) return res.status(410).json({ error: "link expired" });
  if (sha256(token) !== link.token_hash) return res.status(403).json({ error: "invalid token" });
  if (link.downloads_left <= 0)
    return res.status(410).json({ error: "download limit reached" });

  if (link.password_hash) {
    if (!password) return res.status(401).json({ error: "password required" });
    if (!verifyPassword(password, link.password_hash))
      return res.status(403).json({ error: "wrong password" });
  }

  const filePath = path.join(UPLOAD_DIR, link.stored_file_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file missing on disk" });

  db.prepare("UPDATE links SET downloads_left = downloads_left - 1 WHERE id = ?").run(id);

  if (zip !== "1") {
    return res.download(filePath, link.original_name);
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(link.original_name)}.zip"`
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.file(filePath, { name: link.original_name });
  archive.finalize();
});

// ---------- link meta ----------
app.get("/link/:id", (req, res) => {
  const link = db.prepare("SELECT * FROM links WHERE id = ?").get(req.params.id);
  if (!link) return res.status(404).json({ error: "link not found" });

  res.json({
    id: link.id,
    originalName: link.original_name,
    size: link.size,
    expiresAt: link.expires_at,
    downloadsLeft: link.downloads_left,
    passwordRequired: !!link.password_hash,
    expired: Date.now() > link.expires_at,
  });
});

// ---------- secure POST download ----------
app.post("/link/:id/download", downloadLimiter, (req, res) => {
  ensureDirs();

  const { token, password, zip } = req.body || {};
  if (!token) return res.status(401).json({ error: "token required" });

  const link = db.prepare("SELECT * FROM links WHERE id = ?").get(req.params.id);
  if (!link) return res.status(404).json({ error: "link not found" });
  if (Date.now() > link.expires_at) return res.status(410).json({ error: "link expired" });
  if (sha256(token) !== link.token_hash) return res.status(403).json({ error: "invalid token" });
  if (link.downloads_left <= 0)
    return res.status(410).json({ error: "download limit reached" });

  if (link.password_hash) {
    if (!password) return res.status(401).json({ error: "password required" });
    if (!verifyPassword(password, link.password_hash))
      return res.status(403).json({ error: "wrong password" });
  }

  const filePath = path.join(UPLOAD_DIR, link.stored_file_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file missing on disk" });

  db.prepare("UPDATE links SET downloads_left = downloads_left - 1 WHERE id = ?").run(link.id);

  if (!zip) {
    return res.download(filePath, link.original_name);
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(link.original_name)}.zip"`
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.file(filePath, { name: link.original_name });
  archive.finalize();
});

// ---------- cleanup ----------
function cleanupOnce() {
  const now = Date.now();

  const rows = db.prepare(`
    SELECT stored_file_name FROM links
    WHERE expires_at < ? OR downloads_left <= 0
  `).all(now);

  for (const r of rows) {
    const fp = path.join(UPLOAD_DIR, r.stored_file_name);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); } catch {}
    }
  }

  db.prepare(`
    DELETE FROM links
    WHERE expires_at < ? OR downloads_left <= 0
  `).run(now);
}

setInterval(cleanupOnce, 60 * 1000);

// ---------- serve frontend ----------
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  ensureDirs();
  console.log(`Evsync listening on http://localhost:${PORT}`);
});
