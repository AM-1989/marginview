'use strict';

// Load .env from server/ directory — explicit path so it works regardless of CWD
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const cors       = require('cors');
const Database   = require('better-sqlite3');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 5001;

// ── DEMO MODE detection ───────────────────────────────────────────────────────
//
// DEMO_MODE = true  → OTP returned in JSON response (no email sent)
// DEMO_MODE = false → OTP sent via real SMTP email, not exposed in JSON
//
const SMTP = {
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  user:   process.env.SMTP_USER,
  pass:   process.env.SMTP_PASS,
  from:   process.env.SMTP_FROM || 'security@moro.it',
  // SMTP_SECURE=false → STARTTLS su porta 587 (MAIL_ENCRYPTION=tls)
  // SMTP_SECURE=true  → SSL diretto su porta 465
  // Se non impostato: auto-detect dalla porta
  secure: process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : parseInt(process.env.SMTP_PORT || '587', 10) === 465,
};

const DEMO_MODE = !SMTP.host || !SMTP.user || !SMTP.pass;

// Nodemailer transporter — created only when SMTP is fully configured
// SMTP_DEBUG=true nel .env per log SMTP completo (conversazione raw)
const mailer = DEMO_MODE
  ? null
  : nodemailer.createTransport({
      host:   SMTP.host,
      port:   SMTP.port,
      secure: SMTP.secure,
      auth:   { user: SMTP.user, pass: SMTP.pass },
      logger: true,                                    // log ogni step SMTP
      debug:  process.env.SMTP_DEBUG === 'true',       // log conversazione raw
    });

if (DEMO_MODE) {
  console.log('[OTP] ⚠  DEMO_MODE attivo — OTP restituito nel JSON (no email reale)');
  console.log('[OTP]    Per attivare email reali: crea server/.env con SMTP_HOST/USER/PASS');
} else {
  console.log(`[OTP] ✉  SMTP configurato → ${SMTP.host}:${SMTP.port} (from: ${SMTP.from})`);
  if (!process.env.FRONTEND_URL && !process.env.APP_URL) {
    console.warn('[CONFIG] ⚠  FRONTEND_URL non impostato — i link nelle email di attivazione useranno localhost:5173');
    console.warn('[CONFIG]    Aggiungi FRONTEND_URL=https://tuodominio.it al file server/.env');
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origine non consentita — ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// ── Database bootstrap ────────────────────────────────────────────────────────
// DATABASE_PATH can point to a persistent directory (e.g. on Hostinger use an
// absolute path outside the app folder so deploys/restarts don't lose data).
// Default: server/database.sqlite (same directory as this file).

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
console.log(`[DB] Path: ${DB_PATH}`);

// Warn when using the default in-repo path — on Hostinger this file is wiped on every deploy.
// Fix: set DATABASE_PATH in server/.env to a directory outside the project folder.
// Esempio: DATABASE_PATH=/home/u976446016/databases/marginview.sqlite
if (!process.env.DATABASE_PATH) {
  console.warn('[DB] ⚠  DATABASE_PATH non impostato — il database è dentro la cartella del progetto.');
  console.warn('[DB]    Su Hostinger (o qualsiasi piattaforma che ricrea la directory al deploy)');
  console.warn('[DB]    TUTTI GLI UTENTI VENGONO PERSI ad ogni deploy/restart!');
  console.warn('[DB]    → Aggiungi DATABASE_PATH=/percorso/esterno/marginview.sqlite in server/.env');
}

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    email         TEXT     UNIQUE NOT NULL,
    password      TEXT     NOT NULL,
    otp_secret    TEXT,
    otp_timestamp DATETIME
  )
`);

// Schema migrations — idempotent (catch ignores "duplicate column" errors)
for (const sql of [
  "ALTER TABLE users ADD COLUMN name TEXT",
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN can_export INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN allowed_modules TEXT",
  "ALTER TABLE users ADD COLUMN activation_token TEXT",
  "ALTER TABLE users ADD COLUMN activation_expires DATETIME",
]) { try { db.exec(sql); } catch (_) {} }

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT     PRIMARY KEY,
    user_id    INTEGER  NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
  )
`);

// Pulizia sessioni scadute all'avvio (>8h)
const { changes: expiredSessions } = db.prepare(
  `DELETE FROM sessions WHERE created_at <= datetime('now', '-8 hours')`
).run();
if (expiredSessions > 0) console.log(`[DB] Sessioni scadute rimosse: ${expiredSessions}`);

const hashPwd    = pwd => crypto.createHash('sha256').update(pwd).digest('hex');
const generateOtp = () => String(Math.floor(crypto.randomInt(0, 1_000_000))).padStart(6, '0');

const { n: userCount } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (userCount === 0) {
  console.warn('[DB] ⚠  Database VUOTO — database azzerato o primo avvio.');
  db.prepare('INSERT INTO users (email, password, name, role, active) VALUES (?, ?, ?, ?, ?)')
    .run('admin@moro.it', hashPwd('Password123!'), 'Amministratore', 'admin', 1);
  console.log('[DB] Seed: admin@moro.it creato');
} else {
  console.log(`[DB] Utenti registrati: ${userCount}`);
  // Ensure existing admin has correct role (handles DB migrated from old schema)
  db.prepare("UPDATE users SET role='admin', active=1 WHERE email='admin@moro.it' AND (role IS NULL OR role='' OR role='user')")
    .run();
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

const SESSION_TTL_HOURS = 8;

function getUserFromToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.active, u.can_export, u.allowed_modules
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND u.active = 1
      AND s.created_at > datetime('now', '-${SESSION_TTL_HOURS} hours')
  `).get(token) ?? null;
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Sessione non valida o scaduta.' });
  req.user = user;
  req._token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Accesso negato — richiesto ruolo Admin.' });
  next();
}

function serializeUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role: u.role,
    canExport: u.can_export === 1,
    allowedModules: u.allowed_modules ? JSON.parse(u.allowed_modules) : null,
  };
}

// ── Email HTML template ───────────────────────────────────────────────────────

function buildActivationEmail(activationUrl, recipientEmail) {
  return {
    from:    `"MarginView" <${SMTP.from}>`,
    to:      recipientEmail,
    subject: 'Attiva il tuo account MarginView',
    text:
      `Attivazione account MarginView\n\n` +
      `Sei stato invitato ad accedere a MarginView.\n` +
      `Clicca (o copia) il link qui sotto per impostare la password e attivare l'account:\n\n` +
      `${activationUrl}\n\n` +
      `Il link è valido per 7 giorni.\n` +
      `Se non hai richiesto questo invito, ignora questa email.\n`,
    html: `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#0f2540;padding:28px 36px;text-align:center;">
          <p style="color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">MARGINVIEW</p>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">Attivazione Account</h1>
        </td></tr>
        <tr><td style="background:#ffffff;padding:36px;">
          <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Sei stato invitato ad accedere a <strong>MarginView</strong>.<br>
            Clicca il pulsante per impostare la tua password e attivare l'account.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <a href="${activationUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;">
              Attiva il mio account
            </a>
          </div>
          <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;border-top:1px solid #f1f5f9;padding-top:16px;">
            Il link è valido per 7 giorni. Se non hai richiesto questo invito, ignora questa email.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 36px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Messaggio automatico — non rispondere. © 2026 MarginView</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

function buildOtpEmail(otp, recipientEmail) {
  return {
    from:    `"MarginView Security" <${SMTP.from}>`,
    to:      recipientEmail,
    subject: `${otp} — Il tuo codice di verifica MarginView`,
    text:
      `Il tuo codice OTP MarginView: ${otp}\n\n` +
      `Valido per 2 minuti.\n` +
      `Se non hai effettuato nessun tentativo di accesso, ignora questa email.\n`,
    html: `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0f2540;padding:28px 36px;text-align:center;">
            <p style="color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">
              MARGINVIEW
            </p>
            <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-0.5px;">
              Verifica Identità
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 36px 28px;">
            <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 28px;">
              È stata richiesta l'autenticazione a due fattori per l'account
              <strong>${recipientEmail}</strong>.<br>
              Usa il codice seguente per completare l'accesso:
            </p>

            <!-- OTP box -->
            <div style="background:#f1f5f9;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
              <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin:0 0 14px;">
                Codice OTP
              </p>
              <p style="color:#1e3a5f;font-size:48px;font-weight:900;letter-spacing:14px;margin:0;font-family:'Courier New',monospace;">
                ${otp}
              </p>
              <p style="color:#94a3b8;font-size:13px;margin:14px 0 0;">
                Valido per <strong style="color:#64748b;">2 minuti</strong>
              </p>
            </div>

            <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;border-top:1px solid #f1f5f9;padding-top:20px;">
              Se non hai effettuato nessun tentativo di accesso, ignora questa email
              e valuta di aggiornare la password.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center;">
            <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;">
              Messaggio automatico — non rispondere.<br>
              © 2026 MarginView
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: DEMO_MODE ? 'demo' : 'production', ts: new Date().toISOString() });
});

// GET /api/auth/me — restores session from stored token
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(serializeUser(req.user));
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req._token);
  res.json({ success: true });
});

// POST /api/auth/activate — sets password from activation link
app.post('/api/auth/activate', (req, res) => {
  const { token, password, name } = req.body ?? {};
  if (!token || !password) return res.status(400).json({ error: 'Token e password obbligatori.' });
  if (password.length < 8) return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri.' });

  const user = db.prepare(`
    SELECT id, email FROM users
    WHERE activation_token = ? AND datetime(activation_expires) > datetime('now') AND active = 0
  `).get(token);

  if (!user) return res.status(400).json({ error: 'Link di attivazione non valido o scaduto.' });

  db.prepare(`
    UPDATE users
    SET password = ?, name = COALESCE(?, name), active = 1,
        activation_token = NULL, activation_expires = NULL
    WHERE id = ?
  `).run(hashPwd(password), name || null, user.id);

  console.log(`[AUTH] ✓ Account attivato: ${user.email}`);
  res.json({ success: true, email: user.email });
});

// ── Admin — gestione utenti ───────────────────────────────────────────────────

// GET /api/admin/users
app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT id, email, name, role, active, can_export, allowed_modules,
      (activation_token IS NOT NULL AND datetime(activation_expires) > datetime('now')) AS pending
    FROM users ORDER BY id
  `).all();
  res.json(rows.map(u => ({
    ...serializeUser(u),
    active: u.active === 1,
    pendingActivation: !!u.pending,
  })));
});

// POST /api/admin/users — crea utente e invia email di attivazione
app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { email, name, role, canExport, allowedModules } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email obbligatoria.' });

  const normalized = email.toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalized))
    return res.status(409).json({ error: 'Email già registrata.' });

  const activationToken   = crypto.randomBytes(32).toString('hex');
  const activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const modulesJson       = allowedModules ? JSON.stringify(allowedModules) : null;

  db.prepare(`
    INSERT INTO users (email, password, name, role, active, can_export, allowed_modules, activation_token, activation_expires)
    VALUES (?, '', ?, ?, 0, ?, ?, ?, ?)
  `).run(normalized, name || null, role || 'user', canExport !== false ? 1 : 0, modulesJson, activationToken, activationExpires);

  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || req.get('origin') || 'http://localhost:5173').replace(/\/$/, '');
  const activationUrl = `${appUrl}/?activate=${activationToken}`;

  if (DEMO_MODE) {
    console.log(`[USERS] ✓ Utente creato: ${normalized}`);
    console.log(`[USERS]   Link attivazione (DEMO): ${activationUrl}`);
    return res.json({ success: true, activationUrl, demo: true });
  }

  try {
    await mailer.sendMail(buildActivationEmail(activationUrl, normalized));
    console.log(`[USERS] ✓ Email attivazione inviata a: ${normalized}`);
    console.log(`[USERS]   Link attivazione: ${activationUrl}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] ✗ Errore invio email:', err.message);
    console.log(`[USERS]   Link attivazione (fallback manuale): ${activationUrl}`);
    res.status(500).json({ error: 'Utente creato ma errore nell\'invio email.', activationUrl });
  }
});

// PATCH /api/admin/users/:id — modifica utente
app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'ID non valido.' });

  if (id === req.user.id) {
    if (req.body.role === 'user') return res.status(400).json({ error: 'Non puoi cambiare il tuo ruolo.' });
    if (req.body.active === false) return res.status(400).json({ error: 'Non puoi disabilitare il tuo account.' });
  }

  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id))
    return res.status(404).json({ error: 'Utente non trovato.' });

  const { name, email, role, active, canExport, allowedModules } = req.body;
  const sets = [], params = [];

  if (name         !== undefined) { sets.push('name = ?');            params.push(name); }
  if (email        !== undefined) { sets.push('email = ?');           params.push(email.toLowerCase().trim()); }
  if (role         !== undefined) { sets.push('role = ?');            params.push(role); }
  if (active       !== undefined) { sets.push('active = ?');          params.push(active ? 1 : 0); }
  if (canExport    !== undefined) { sets.push('can_export = ?');      params.push(canExport ? 1 : 0); }
  if (allowedModules !== undefined) {
    sets.push('allowed_modules = ?');
    params.push(allowedModules === null ? null : JSON.stringify(allowedModules));
  }

  if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });

  params.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // Invalida sessioni se l'utente è stato disabilitato
  if (active === false) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

  res.json({ success: true });
});

// POST /api/admin/users/:id/resend-activation — reinvia email di attivazione
app.post('/api/admin/users/:id/resend-activation', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, email, active FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utente non trovato.' });
  if (user.active) return res.status(400).json({ error: 'L\'utente è già attivo.' });

  const activationToken   = crypto.randomBytes(32).toString('hex');
  const activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET activation_token = ?, activation_expires = ? WHERE id = ?')
    .run(activationToken, activationExpires, id);

  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || req.get('origin') || 'http://localhost:5173').replace(/\/$/, '');
  const activationUrl = `${appUrl}/?activate=${activationToken}`;

  if (DEMO_MODE) {
    console.log(`[USERS] ✓ Nuovo link attivazione (DEMO): ${activationUrl}`);
    return res.json({ success: true, activationUrl, demo: true });
  }

  try {
    await mailer.sendMail(buildActivationEmail(activationUrl, user.email));
    console.log(`[USERS] ✓ Email attivazione reinviata a: ${user.email}`);
    console.log(`[USERS]   Link attivazione: ${activationUrl}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] ✗ Errore rinvio email:', err.message);
    console.log(`[USERS]   Link attivazione (fallback manuale): ${activationUrl}`);
    res.status(500).json({ error: 'Errore invio email.', activationUrl });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatori' });
  }

  const user = db.prepare(
    'SELECT id, email, password, active FROM users WHERE email = ?'
  ).get(email.toLowerCase().trim());

  if (!user || !user.active || user.password !== hashPwd(password)) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  const otp = generateOtp();
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET otp_secret = ?, otp_timestamp = ? WHERE id = ?')
    .run(otp, now, user.id);

  // Always log to console regardless of mode
  console.log('\n╔══════════════════════════════════╗');
  console.log(`║  OTP per ${user.email.padEnd(21)}║`);
  console.log(`║  Codice:  ${otp.padEnd(21)}║`);
  console.log(`║  Modalità: ${(DEMO_MODE ? 'DEMO' : 'EMAIL').padEnd(20)}║`);
  console.log('╚══════════════════════════════════╝\n');

  if (DEMO_MODE) {
    // ── Demo: expose OTP in response so the frontend can show the popup ──────
    return res.json({
      success: true,
      demoOtp: otp,
      message: 'DEMO_MODE: OTP incluso nella risposta (non usare in produzione).',
    });
  }

  // ── Production: send email, never expose OTP in JSON ─────────────────────
  try {
    const info = await mailer.sendMail(buildOtpEmail(otp, user.email));
    // Log risposta completa Brevo/SMTP per debug
    console.log(`[OTP] ✉  Accettata da SMTP per ${user.email}`);
    console.log(`[OTP]    messageId : ${info.messageId}`);
    console.log(`[OTP]    response  : ${info.response}`);
    console.log(`[OTP]    accepted  : ${JSON.stringify(info.accepted)}`);
    console.log(`[OTP]    rejected  : ${JSON.stringify(info.rejected)}`);
    if (info.rejected && info.rejected.length > 0) {
      console.error(`[OTP] ✗ Destinatari rifiutati: ${info.rejected.join(', ')}`);
      return res.status(500).json({ error: 'Email rifiutata dal server SMTP.' });
    }
    return res.json({
      success: true,
      message: `Codice OTP inviato via email a ${user.email}.`,
    });
  } catch (err) {
    console.error('[OTP] ✗ Errore invio email:', err.message);
    console.error('[OTP]    Dettaglio:', err);
    return res.status(500).json({ error: 'Errore invio email OTP. Contatta il supporto.' });
  }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body ?? {};

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email e OTP sono obbligatori' });
  }

  const user = db.prepare(
    'SELECT id, email, name, role, can_export, allowed_modules, otp_secret, otp_timestamp FROM users WHERE email = ?'
  ).get(email.toLowerCase().trim());

  if (!user || !user.otp_secret || !user.otp_timestamp) {
    return res.status(401).json({ error: 'OTP non trovato — effettua di nuovo il login' });
  }

  const elapsed = (Date.now() - new Date(user.otp_timestamp).getTime()) / 1000;

  if (elapsed > 120) {
    db.prepare('UPDATE users SET otp_secret = NULL, otp_timestamp = NULL WHERE id = ?')
      .run(user.id);
    return res.status(401).json({ error: 'OTP scaduto (TTL: 2 minuti). Effettua di nuovo il login.' });
  }

  if (user.otp_secret !== String(otp).trim()) {
    return res.status(401).json({ error: 'Codice OTP non valido' });
  }

  db.prepare('UPDATE users SET otp_secret = NULL, otp_timestamp = NULL WHERE id = ?')
    .run(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  console.log(`[AUTH] ✓ ${user.email} autenticato (${user.role})`);

  return res.json({ success: true, token, user: serializeUser(user) });
});

// ── Route: POST /api/deploy ───────────────────────────────────────────────────
// Lancia deploy.sh tramite una chiamata HTTP autenticata con token segreto.
// Imposta DEPLOY_SECRET nel .env — senza di esso l'endpoint è disabilitato.
//
// Uso:
//   curl -X POST https://tuodominio.it/api/deploy \
//        -H "x-deploy-token: IL_TUO_SECRET"

// child_process usato inline nel webhook deploy

app.post('/api/deploy', (req, res) => {
  const secret = process.env.DEPLOY_SECRET;

  if (!secret) {
    return res.status(503).json({ error: 'Deploy webhook non configurato (manca DEPLOY_SECRET nel .env).' });
  }

  const token = req.headers['x-deploy-token'];
  if (!token || token !== secret) {
    console.warn('[DEPLOY] ✗ Tentativo non autorizzato da', req.ip);
    return res.status(401).json({ error: 'Token non valido.' });
  }

  const scriptPath = path.join(__dirname, '..', 'deploy.sh');
  console.log('[DEPLOY] ▶ Avvio deploy.sh...');

  const logFile = path.join(__dirname, 'deploy.log');


  // Intestazione nel log
  fs.appendFileSync(logFile, `\n=== DEPLOY ${new Date().toISOString()} ===\n`);

  // spawn detached: il processo figlio sopravvive al pm2 restart del padre
  // stdout e stderr vanno direttamente sul file di log
  const logFd = fs.openSync(logFile, 'a');
  const child = require('child_process').spawn('bash', [scriptPath], {
    cwd:      path.join(__dirname, '..'),
    detached: true,
    stdio:    ['ignore', logFd, logFd],
  });
  child.unref(); // non aspettare — il processo padre può morire liberamente

  console.log(`[DEPLOY] ▶ Deploy avviato (PID ${child.pid}) — log: server/deploy.log`);

  // Risponde subito
  res.json({ success: true, message: 'Deploy avviato.', logFile });
});

// ── Route: GET /api/deploy/log ────────────────────────────────────────────────
// Restituisce le ultime righe del log di deploy (stesso token di autenticazione)

app.get('/api/deploy/log', (req, res) => {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) return res.status(503).json({ error: 'Deploy non configurato.' });

  const token = req.headers['x-deploy-token'];
  if (!token || token !== secret) return res.status(401).json({ error: 'Token non valido.' });

  const logFile = path.join(__dirname, 'deploy.log');
  if (!fs.existsSync(logFile)) return res.json({ log: '(nessun deploy eseguito ancora)' });

  const content = fs.readFileSync(logFile, 'utf8');
  // Ultime 100 righe
  const lines = content.split('\n').slice(-100).join('\n');
  res.setHeader('Content-Type', 'text/plain');
  res.send(lines);
});

// ── Route: POST /api/ai-comment ──────────────────────────────────────────────
// Genera un commento AI per un modulo specifico usando Anthropic claude-sonnet-4-6.
// Richiede autenticazione. Non logga mai la chiave API.

const SYSTEM_PROMPT_BASE =
  'Sei un controller di gestione senior. Scrivi in italiano, in prosa, ' +
  'senza elenchi puntati. Struttura la risposta in esattamente 4 paragrafi ' +
  'separati da una riga vuota: (1) risultato principale con i numeri chiave, ' +
  '(2) driver dominante che lo spiega con dettaglio quantitativo, ' +
  '(3) implicazioni strategiche e rischi da monitorare, ' +
  '(4) due raccomandazioni operative concrete e prioritizzate. ' +
  'Tra 180 e 220 parole in totale. Tono professionale e diretto. ' +
  'REGOLA ASSOLUTA: non usare mai le parole "margine di contribuzione" — ' +
  'usa esclusivamente "margine". FAI UN COMMENTO APPROFONDITO SUL MIX E TUTTE LE SCOMPOSIZIONI NON LIMITARTI A DIRE IL VALORE DI OGNI MIX MA COMMENTALO';

const SYSTEM_PROMPTS = {
  varianza: SYSTEM_PROMPT_BASE,
  bilancio: SYSTEM_PROMPT_BASE,
  abc:      SYSTEM_PROMPT_BASE,
};

function buildVarianzaPrompt(data) {
  const {
    marginPctP1, marginPctP2, varianzaTotale,
    effVolume, effMix, effPrezzo, effCosto,
    totalRev1, totalRev2, totalMargin1, totalMargin2,
    mixCanale, mixBrand, mixCategoria, mixSottocategoria, mixFormato, mixResiduo,
  } = data;
  const pp  = v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)} pp`;
  const pct = v => `${(v * 100).toFixed(2)}%`;
  const eur = v => `€${Math.round(v).toLocaleString('it-IT')}`;

  const mixDetail = [
    mixCanale        != null ? `Canale ${pp(mixCanale)}`               : null,
    mixBrand         != null ? `Brand ${pp(mixBrand)}`                 : null,
    mixCategoria     != null ? `Categoria ${pp(mixCategoria)}`         : null,
    mixSottocategoria!= null ? `Sottocategoria ${pp(mixSottocategoria)}`: null,
    mixFormato       != null ? `Formato ${pp(mixFormato)}`             : null,
    mixResiduo       != null ? `Residuo referenze ${pp(mixResiduo)}`   : null,
  ].filter(Boolean).join(' | ');

  return [
    'Analisi varianza margine:',
    `Margine P1: ${pct(marginPctP1)} → Margine P2: ${pct(marginPctP2)} (variazione totale: ${pp(varianzaTotale)})`,
    `Margine assoluto: ${eur(totalMargin1)} → ${eur(totalMargin2)}`,
    `Fatturato: ${eur(totalRev1)} → ${eur(totalRev2)}`,
    '',
    'Scomposizione effetti:',
    `• Effetto Volume: ${pp(effVolume)} — misura l'impatto della variazione delle quantità totali vendute a parità di mix e prezzi P1; per costruzione tende a zero.`,
    `• Effetto Mix: ${pp(effMix)} — misura come il cambiamento nella composizione del portafoglio (canali, brand, categorie, formati, referenze) ha impattato il margine a prezzi P1.`,
    mixDetail ? `  Dettaglio mix gerarchico: ${mixDetail}` : null,
    `  — Mix Canale: spostamento di volumi tra canali di vendita (es. online vs retail).`,
    `  — Mix Brand: variazione del peso dei brand all'interno di ogni canale.`,
    `  — Mix Categoria/Sottocategoria: riequilibrio tra famiglie di prodotto.`,
    `  — Mix Formato: spostamento tra formati/confezioni (alto vs basso margine).`,
    `  — Residuo referenze: effetto mix puro a livello di singola referenza/servizio.`,
    `• Effetto Prezzo: ${pp(effPrezzo)} — impatto della variazione dei prezzi di vendita unitari a quantità e costi P1 invariati.`,
    `• Effetto Costo: ${pp(effCosto)} — impatto della variazione dei costi unitari di acquisto/produzione a quantità e prezzi P2 invariati.`,
  ].filter(v => v != null).join('\n');
}

function buildBilancioPrompt(data) {
  const { anno, ricavi, ebitdaPerc, ebitPerc, utileNettoPerc, roe, roi, pfnEbitda, currentRatio, ccc, freeCashFlow } = data;
  const pct = v => v != null && isFinite(v) ? `${Number(v).toFixed(1)}%` : 'N/D';
  const x   = v => v != null && isFinite(v) ? `${Number(v).toFixed(2)}×` : 'N/D';
  const eur = v => v != null ? `€${Math.round(v).toLocaleString('it-IT')}` : 'N/D';
  return [
    `Bilancio ${anno}:`,
    `Ricavi ${eur(ricavi)} | EBITDA% ${pct(ebitdaPerc)} | EBIT% ${pct(ebitPerc)} | Utile% ${pct(utileNettoPerc)}`,
    `ROE ${pct(roe)} | ROI ${pct(roi)} | PFN/EBITDA ${x(pfnEbitda)} | Current Ratio ${x(currentRatio)}`,
    `CCC ${ccc != null ? Math.round(ccc) + ' gg' : 'N/D'} | FCF ${eur(freeCashFlow)}`,
  ].join('\n');
}

function buildAbcPrompt(data) {
  const { numReferenze, classACount, classASharePct, classCCount, criticalAC, margineGlobale, top3SharePct } = data;
  const pct = v => `${Number(v).toFixed(1)}%`;
  return [
    `Analisi ABC — ${numReferenze} referenze:`,
    `Classe A: ${classACount} ref. (${pct(classASharePct)} fatturato) | Classe C: ${classCCount} ref.`,
    `Critici AC: ${criticalAC} | Top-3 share: ${pct(top3SharePct)} | Margine medio: ${pct(margineGlobale)}`,
  ].join('\n');
}

const PROMPT_BUILDERS = { varianza: buildVarianzaPrompt, bilancio: buildBilancioPrompt, abc: buildAbcPrompt };

app.post('/api/ai-comment', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Commento AI non disponibile (chiave non configurata).' });

  const { module: mod, data } = req.body ?? {};
  if (!mod || !data) return res.status(400).json({ error: 'Parametri mancanti.' });

  const systemPrompt = SYSTEM_PROMPTS[mod];
  const buildPrompt  = PROMPT_BUILDERS[mod];
  if (!systemPrompt || !buildPrompt) return res.status(400).json({ error: `Modulo non supportato: ${mod}` });

  let userPrompt;
  try { userPrompt = buildPrompt(data); }
  catch { return res.status(400).json({ error: 'Dati non validi.' }); }

  try {
    const _sdk = require('@anthropic-ai/sdk');
    const Anthropic = _sdk.default ?? _sdk;
    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    res.json({ comment: msg.content?.[0]?.text ?? '' });
  } catch (err) {
    console.error('[AI] Errore chiamata Anthropic:', err.message);
    res.status(500).json({ error: 'Errore generazione commento AI.' });
  }
});

// ── Serve frontend (dist/) in production ─────────────────────────────────────

const distPath = path.join(__dirname, '..', 'dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — tutte le route non-API tornano a index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[STATIC] Serving frontend from ${distPath}`);
} else {
  console.warn('[STATIC] dist/ non trovata — solo API attiva (esegui il build prima)');
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[START] MarginView in ascolto su 0.0.0.0:${PORT}`);
  console.log(`[START] Mode: ${DEMO_MODE ? 'DEMO (OTP nel JSON)' : 'PRODUCTION (SMTP)'}`);
  console.log(`[START] Database: ${DB_PATH}`);
  console.log(`[START] Frontend URL: ${(process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173 (FALLBACK — impostare FRONTEND_URL)')}`);
  console.log(`[START] Frontend: ${fs.existsSync(distPath) ? distPath : 'NON TROVATO'}`);
  if (process.env.DEPLOY_SECRET) {
    console.log('[START] Webhook deploy: POST /api/deploy (token configurato)');
  }
  console.log('');
});
