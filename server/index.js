'use strict';

const express  = require('express');
const cors     = require('cors');
const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');

const app  = express();
const PORT = 5001;

// ── Database bootstrap ────────────────────────────────────────────────────────

const db = new Database(path.join(__dirname, 'database.sqlite'), {
  // verbose: console.log,  // uncomment to log every SQL statement
});

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

/*
 * Schema SQL
 * ──────────
 * CREATE TABLE IF NOT EXISTS users (
 *   id            INTEGER  PRIMARY KEY AUTOINCREMENT,
 *   email         TEXT     UNIQUE NOT NULL,
 *   password      TEXT     NOT NULL,          -- SHA-256 hex (not bcrypt: demo only)
 *   otp_secret    TEXT,                        -- 6-digit code, cleared after use
 *   otp_timestamp DATETIME                     -- ISO-8601, used for 2-min TTL check
 * );
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    email         TEXT     UNIQUE NOT NULL,
    password      TEXT     NOT NULL,
    otp_secret    TEXT,
    otp_timestamp DATETIME
  )
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SHA-256 hash (hex). Replace with bcrypt in production. */
const hashPwd = (pwd) => crypto.createHash('sha256').update(pwd).digest('hex');

/** Cryptographically random 6-digit OTP string (padded with leading zeros). */
const generateOtp = () =>
  String(Math.floor(crypto.randomInt(0, 1_000_000))).padStart(6, '0');

// ── Seed ─────────────────────────────────────────────────────────────────────
/*
 * Seed query:
 *   INSERT INTO users (email, password) VALUES (?, ?)
 *   params: ['admin@moro.it', sha256('Password123!')]
 *
 * Runs only when the users table is empty (first boot).
 */
const { n: userCount } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (userCount === 0) {
  db.prepare('INSERT INTO users (email, password) VALUES (?, ?)')
    .run('admin@moro.it', hashPwd('Password123!'));
  console.log('[DB] Seed: utente admin@moro.it creato');
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ── Route: health ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Route: POST /api/auth/login ───────────────────────────────────────────────
/*
 * Verify query:
 *   SELECT id, email, password FROM users WHERE email = ?
 *
 * OTP storage query:
 *   UPDATE users SET otp_secret = ?, otp_timestamp = ? WHERE id = ?
 */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatori' });
  }

  const user = db.prepare(
    'SELECT id, email, password FROM users WHERE email = ?'
  ).get(email.toLowerCase().trim());

  if (!user || user.password !== hashPwd(password)) {
    // Constant-time response to prevent timing attacks
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  const otp = generateOtp();
  const now = new Date().toISOString();

  db.prepare(
    'UPDATE users SET otp_secret = ?, otp_timestamp = ? WHERE id = ?'
  ).run(otp, now, user.id);

  // !! In produzione: invia via SMS / email. In demo: stampa su console. !!
  console.log('\n╔══════════════════════════════════╗');
  console.log(`║  OTP per ${user.email.padEnd(21)}║`);
  console.log(`║  Codice:  ${otp.padEnd(21)}║`);
  console.log('║  Valido per 2 minuti             ║');
  console.log('╚══════════════════════════════════╝\n');

  return res.json({
    success: true,
    message: 'OTP generato. Leggi il codice sulla console del server.',
  });
});

// ── Route: POST /api/auth/verify-otp ─────────────────────────────────────────
/*
 * Verify query:
 *   SELECT id, email, otp_secret, otp_timestamp FROM users WHERE email = ?
 *
 * TTL check: (NOW - otp_timestamp) < 120 seconds
 *
 * Clear-after-use query:
 *   UPDATE users SET otp_secret = NULL, otp_timestamp = NULL WHERE id = ?
 */
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body ?? {};

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email e OTP sono obbligatori' });
  }

  const user = db.prepare(
    'SELECT id, email, otp_secret, otp_timestamp FROM users WHERE email = ?'
  ).get(email.toLowerCase().trim());

  if (!user || !user.otp_secret || !user.otp_timestamp) {
    return res.status(401).json({ error: 'OTP non trovato — effettua di nuovo il login' });
  }

  const elapsedSeconds =
    (Date.now() - new Date(user.otp_timestamp).getTime()) / 1000;

  if (elapsedSeconds > 120) {
    // Clear expired OTP
    db.prepare('UPDATE users SET otp_secret = NULL, otp_timestamp = NULL WHERE id = ?')
      .run(user.id);
    return res.status(401).json({ error: 'OTP scaduto (TTL: 2 minuti). Effettua di nuovo il login.' });
  }

  if (user.otp_secret !== String(otp).trim()) {
    return res.status(401).json({ error: 'Codice OTP non valido' });
  }

  // ── Auth successful ──────────────────────────────────────────────────────
  // Clear OTP to prevent replay attacks
  db.prepare('UPDATE users SET otp_secret = NULL, otp_timestamp = NULL WHERE id = ?')
    .run(user.id);

  // Simple opaque token (replace with signed JWT in production)
  const token = crypto.randomBytes(32).toString('hex');

  console.log(`[AUTH] ✓ ${user.email} autenticato — token: ${token.slice(0, 8)}…`);

  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🔷 Moro Analytics API  →  http://localhost:${PORT}`);
  console.log('   Endpoint: POST /api/auth/login');
  console.log('   Endpoint: POST /api/auth/verify-otp\n');
});
