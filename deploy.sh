#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Moro Analytics — deploy.sh
#  Uso:  ./deploy.sh [--no-pull]
#
#  Prerequisiti sul server Linux:
#    - Node.js 20+ e npm
#    - PM2 installato globalmente:  npm install -g pm2
#    - Apache2 con mod_rewrite abilitato:  a2enmod rewrite && systemctl restart apache2
#    - La cartella Apache deve essere di proprietà dell'utente che esegue lo script:
#        sudo mkdir -p /var/www/html/margin-analysis
#        sudo chown -R cristi:www-data /var/www/html/margin-analysis
#        sudo chmod -R 755 /var/www/html/margin-analysis
#    - Opzionale: server/.env con SMTP_HOST/USER/PASS per email reali
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configurazione (override via variabili d'ambiente) ────────────────────────

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APACHE_DIR="${APACHE_DIR:-/var/www/html/margin-analysis}"
PM2_APP_NAME="${PM2_APP_NAME:-moro-api}"
GIT_BRANCH="${GIT_BRANCH:-main}"

# ── Colori terminale ──────────────────────────────────────────────────────────

BOLD='\033[1m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${BLUE}${BOLD}▶  $1${NC}"; }
ok()    { echo -e "   ${GREEN}✓  $1${NC}"; }
warn()  { echo -e "   ${YELLOW}⚠  $1${NC}"; }
die()   { echo -e "   ${RED}✗  $1${NC}" >&2; exit 1; }

echo -e "\n${BOLD}════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   Moro Analytics — Deploy Script${NC}"
echo -e "${BOLD}   $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════${NC}"

# ── Controllo dipendenze ──────────────────────────────────────────────────────

command -v node  >/dev/null 2>&1 || die "Node.js non trovato. Installa Node 20+."
command -v npm   >/dev/null 2>&1 || die "npm non trovato."
command -v pm2   >/dev/null 2>&1 || die "PM2 non trovato. Esegui: npm install -g pm2"
command -v rsync >/dev/null 2>&1 || die "rsync non trovato. Installa: apt install rsync"

# ── 1. Git pull ───────────────────────────────────────────────────────────────

SKIP_PULL=false
[[ "${1:-}" == "--no-pull" ]] && SKIP_PULL=true

if [ "$SKIP_PULL" = false ]; then
  step "Git pull → branch '$GIT_BRANCH'"
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" reset --hard "origin/$GIT_BRANCH"
  ok "Codice sincronizzato con origin/$GIT_BRANCH"
else
  warn "git pull saltato (--no-pull)"
fi

# ── 2. Frontend: install + build ──────────────────────────────────────────────

step "Frontend — npm install"
cd "$REPO_DIR"
# Usa ci quando esiste package-lock.json (più veloce e deterministico)
if [ -f package-lock.json ]; then
  npm ci --prefer-offline
else
  npm install
fi
ok "Dipendenze frontend installate"

step "Frontend — npm run build"
npm run build
ok "Build completata → $REPO_DIR/dist/"

# ── 3. Deploy dist/ in Apache ────────────────────────────────────────────────

step "Deploy in Apache: $APACHE_DIR"
mkdir -p "$APACHE_DIR"

# rsync: copia solo i file modificati, elimina quelli obsoleti.
# --exclude='.htaccess' per non sovrascrivere la configurazione Apache.
rsync -av --delete --exclude='.htaccess' "$REPO_DIR/dist/" "$APACHE_DIR/"
ok "File statici copiati in $APACHE_DIR"

# ── 4. Genera .htaccess per React SPA ────────────────────────────────────────

step "Generazione .htaccess (SPA routing + sicurezza)"
tee "$APACHE_DIR/.htaccess" > /dev/null <<'HTACCESS'
# Moro Analytics — Apache config
Options -MultiViews -Indexes

# ── Sicurezza base ────────────────────────────────────────────────────────────
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"
Header set X-XSS-Protection "1; mode=block"
Header set Referrer-Policy "strict-origin-when-cross-origin"

# ── Cache statica per asset con hash nel nome ─────────────────────────────────
<FilesMatch "\.(js|css|woff2|png|svg|ico)$">
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
<FilesMatch "^index\.html$">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
</FilesMatch>

# ── React SPA routing: ogni percorso non-file → index.html ───────────────────
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [QSA,L]

# ── Proxy API verso Express (abilita mod_proxy su Apache) ────────────────────
# Decommentare e aggiornare la porta se Apache e Express sono sullo stesso host:
# ProxyPreserveHost On
# ProxyPass        /api http://127.0.0.1:5001/api
# ProxyPassReverse /api http://127.0.0.1:5001/api
HTACCESS
ok ".htaccess generato in $APACHE_DIR"

# ── 5. Server Express: install produzione + PM2 ───────────────────────────────

step "Server Express — npm install --omit=dev"
cd "$REPO_DIR/server"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --prefer-offline
else
  npm install --omit=dev
fi
ok "Dipendenze server installate (solo prod)"

step "PM2 — restart / start '$PM2_APP_NAME'"
cd "$REPO_DIR/server"

if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
  # App già registrata in PM2 → semplice restart
  pm2 restart "$PM2_APP_NAME" --update-env
  ok "PM2 restart OK"
else
  # Prima avvio — cerca .env per le variabili SMTP/CORS
  ENV_FILE="$REPO_DIR/server/.env"
  if [ -f "$ENV_FILE" ]; then
    warn ".env trovato — caricato tramite node --env-file (richiede Node 20.6+)"
    NODE_OPTIONS="--env-file=$ENV_FILE" \
      pm2 start index.js --name "$PM2_APP_NAME" --env production
  else
    warn ".env non trovato — il server partirà in DEMO_MODE"
    warn "Per la produzione crea server/.env (vedi server/.env.example)"
    pm2 start index.js --name "$PM2_APP_NAME" --env production
  fi
  ok "PM2 start OK (primo avvio)"
fi

# Persiste la config PM2 tra i reboot
pm2 save --force
ok "PM2 config salvata (pm2 startup per i reboot)"

# ── Riepilogo ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  ✅  Deploy completato con successo!                  ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Frontend:  ${APACHE_DIR}"
echo -e "${GREEN}${BOLD}║${NC}  API PM2:   ${PM2_APP_NAME} → http://localhost:5001"
echo -e "${GREEN}${BOLD}║${NC}  Ramo:      ${GIT_BRANCH}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Comandi utili:"
echo -e "    pm2 logs ${PM2_APP_NAME}     # log in tempo reale"
echo -e "    pm2 monit                   # dashboard PM2"
echo -e "    ./deploy.sh --no-pull       # rebuild senza git pull"
echo ""
