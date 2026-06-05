'use strict';

// Load .env from server/ directory before everything else
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const Database   = require('better-sqlite3');
const crypto     = require('crypto');
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

const db = new Database(path.join(__dirname, 'database.sqlite'));
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

const hashPwd    = pwd => crypto.createHash('sha256').update(pwd).digest('hex');
const generateOtp = () => String(Math.floor(crypto.randomInt(0, 1_000_000))).padStart(6, '0');

const { n: userCount } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (userCount === 0) {
  db.prepare('INSERT INTO users (email, password) VALUES (?, ?)')
    .run('admin@moro.it', hashPwd('Password123!'));
  console.log('[DB] Seed: utente admin@moro.it creato');
}

// ── Email HTML template ───────────────────────────────────────────────────────

function buildOtpEmail(otp, recipientEmail) {
  return {
    from:    `"Moro Analytics Security" <${SMTP.from}>`,
    to:      recipientEmail,
    subject: `${otp} — Il tuo codice di verifica Moro Analytics`,
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
              MORO ANALYTICS
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
              © 2026 Moro Analytics · Evolution Group
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

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatori' });
  }

  const user = db.prepare(
    'SELECT id, email, password FROM users WHERE email = ?'
  ).get(email.toLowerCase().trim());

  if (!user || user.password !== hashPwd(password)) {
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
    'SELECT id, email, otp_secret, otp_timestamp FROM users WHERE email = ?'
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
  console.log(`[AUTH] ✓ ${user.email} autenticato`);

  return res.json({ success: true, token, user: { id: user.id, email: user.email } });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🔷 Moro Analytics API  →  http://localhost:${PORT}`);
  console.log(`   Mode: ${DEMO_MODE ? '⚡ DEMO' : '🔒 PRODUCTION (SMTP)'}\n`);
});
