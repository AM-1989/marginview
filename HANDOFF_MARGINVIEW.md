# MarginView — Documento di handoff

> **Ultimo aggiornamento:** settembre 2026  
> **Redatto da:** Luca Pantea (sviluppatore)  
> **Destinatari:** Alessio Moro, futuri sviluppatori

---

## 1. Cos'è MarginView

MarginView è una web application di controllo di gestione costruita su misura per Moro Analytics. Permette di caricare dati aziendali tramite Excel e ottenere analisi interattive, dashboard visive e report PDF, con la possibilità di generare commenti automatici via intelligenza artificiale.

### Moduli principali

| Modulo | Nome nell'app | Funzione |
|--------|--------------|----------|
| **Matrice ABC / Pareto** | "Matrice ABC" | Classifica le referenze per fatturato e marginalità (A/B/C), curva di Pareto, heatmap, analisi di rotazione magazzino se disponibile |
| **Analisi Varianza Marginalità** | "Analisi Varianza" | Confronta due periodi, scompone la variazione di margine in effetti Volume, Mix, Prezzo e Costo con dettaglio gerarchico (Canale → Brand → Categoria → Sottocategoria → Formato → Referenza) |
| **Analisi di Bilancio** | "Bilancio" | Calcola KPI da conto economico e stato patrimoniale (EBITDA, ROE, ROI, PFN, CCC, FCF) su più anni |
| **Dashboard** | "Dashboard" | Panoramica sintetica con link ai moduli |
| **Impostazioni** | "Impostazioni" *(solo admin)* | Gestione utenti, ruoli, permessi di accesso e di export |

### Tipi di output disponibili

- Dashboard interattiva con grafici (Recharts)
- Import da file Excel (template scaricabile dall'app)
- Commenti AI generati da Claude Sonnet (Anthropic) — ricevono dati JSON elaborati, **mai** il file Excel grezzo
- Export Excel con dati calcolati
- Export PDF (report formattato per ciascun modulo)

---

## 2. Architettura in parole semplici

Il sistema è composto da parti diverse che lavorano insieme. Ecco come si differenziano:

| Componente | URL / Dove vive | A cosa serve | Note |
|-----------|----------------|-------------|------|
| **Landing page pubblica** | `marginview.it` | Presentazione commerciale del prodotto, non contiene l'app vera | Gestita su **Lovable** (piattaforma no-code), **non è in questo repository Git**. Si modifica dal pannello Lovable. |
| **Applicazione** | `app.marginview.it` *(DA COMPLETARE/VERIFICARE)* | L'app vera — login, moduli di analisi, dashboard | Ospitata su **Hostinger**, i file vengono aggiornati via `deploy.sh` |
| **API / server** | Stesso host di `app.marginview.it`, porta `5001` | Autenticazione OTP, gestione utenti, commenti AI, invio email | Node.js/Express, gestito da **PM2** (processo sempre attivo) |
| **Database** | File SQLite sul server Hostinger | Salva utenti, ruoli, sessioni | File locale sul server — vedi nota critica nella sezione 4 |
| **Repository Git** | `github.com/AM-1989/marginview` | Contiene tutto il codice sorgente (frontend + backend). Git serve a versionare e salvare la storia del codice, **non** a ospitare il sito | Il codice "vive" su GitHub; il sito "vive" su Hostinger |
| **Claude Code** | Strumento CLI usato dallo sviluppatore | Permette di modificare il codice del repository con assistenza AI | Ogni modifica va **revisionata** prima di essere committata e pubblicata in produzione. Non modifica mai il sito direttamente senza un passaggio di deploy esplicito. |

---

## 3. Stack tecnico effettivo

Tutto ciò che segue è verificato direttamente da `package.json`, dai file di configurazione e dal codice sorgente.

| Voce | Tecnologia / Servizio | Funzione | Dove si gestisce |
|------|-----------------------|----------|-----------------|
| **Linguaggio frontend** | TypeScript + React 19 | UI dell'app, logica di calcolo client-side | File in `src/` |
| **Build frontend** | Vite 8 | Compila e ottimizza il codice React in file statici (`dist/`) | `vite.config.ts` |
| **CSS / stile** | Tailwind CSS 3 | Stile dell'interfaccia | `tailwind.config.js` |
| **Backend** | Node.js + Express 4 | API REST: autenticazione, AI, email, gestione utenti | `server/index.js` |
| **Gestore processi** | PM2 | Mantiene il server Express sempre attivo sul server Linux | Via SSH o `deploy.sh` |
| **Database** | SQLite (better-sqlite3) | Archivia utenti, sessioni, OTP | File `server/database.sqlite` |
| **Grafici** | Recharts | Grafici interattivi nella dashboard | `src/pages/` e `src/components/` |
| **PDF** | @react-pdf/renderer + jsPDF + html2canvas | Genera i report PDF scaricabili | `src/lib/pdf/` |
| **Excel import/export** | SheetJS (xlsx) | Legge i file Excel caricati dall'utente, esporta i risultati | `src/pages/` (logica di parse) e `src/lib/` |
| **AI / commenti** | Anthropic SDK → modello `claude-sonnet-4-6` | Genera commenti di analisi in linguaggio naturale | Chiamata in `server/index.js` via `/api/ai-comment` |
| **Email** | Nodemailer + **Brevo SMTP** | Invia OTP di login e link di attivazione account | Configurato in `server/.env` (SMTP_HOST/USER/PASS) — vedi nota account |
| **Hosting** | Hostinger (Linux VPS / hosting condiviso) | Ospita sia i file statici del frontend (Apache) sia il server API (PM2) | Pannello Hostinger o via SSH |
| **Web server** | Apache 2 con mod_rewrite | Serve i file statici React e gestisce il routing SPA | Configurazione generata da `deploy.sh` (`.htaccess`) |
| **Dominio / DNS** | Hostinger | Gestione di `marginview.it` e sottodomini | Pannello Hostinger di Alessio |
| **Repository** | GitHub (`AM-1989/marginview`) | Versioning del codice | github.com |
| **Deploy** | Script `deploy.sh` | Automatizza git pull → build → copia file → restart PM2 | Da eseguire sul server via SSH (o via webhook `/api/deploy`) |

> **Nota account email (importante):** L'invio delle email (OTP + attivazione account) avviene tramite l'account **Brevo** di Luca Pantea (cripantea@gmail.com). Per eliminare questa dipendenza, si consiglia ad Alessio di creare un proprio account Brevo (gratuito fino a 300 email/giorno) e aggiornare le variabili `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` nel file `server/.env` sul server.

---

## 4. Ambienti, URL e hosting

| Ambiente | URL | Provider / Hosting | Funzione | Dove si modificano i file | Note importanti |
|----------|-----|--------------------|----------|--------------------------|-----------------|
| **Landing pubblica** | `https://marginview.it` | Lovable | Presentazione commerciale | Pannello Lovable | Non è in questo repo Git. Modifiche solo da Lovable. |
| **App web** | DA COMPLETARE/VERIFICARE | Hostinger | L'applicazione vera (login + moduli) | Via `deploy.sh` o SSH | I file statici vengono copiati in `/var/www/html/margin-analysis/` |
| **API backend** | Stesso host dell'app, porta `5001` | Hostinger (PM2) | Autenticazione, AI, email | SSH → `cd server && pm2 restart moro-api` | PM2 app name: `moro-api` |
| **Database** | `/home/u976446016/databases/marginview.sqlite` | Hostinger (file locale) | Utenti, sessioni | SSH (accesso diretto al file SQLite) | Percorso esterno al progetto — al sicuro dai deploy |
| **Repository** | `github.com/AM-1989/marginview` | GitHub | Codice sorgente | `git push` dal computer di sviluppo | `main` è il branch di produzione |

> **Database: configurazione corretta.** Il file è posizionato in `/home/u976446016/databases/marginview.sqlite` — fuori dalla cartella del progetto, configurato tramite pannello Hostinger. Sopravvive ai deploy e ai riavvii del server. Gli utenti e i dati di accesso sono al sicuro.

**Non esporre mai** nel documento (né altrove) password, token API, chiavi SMTP o il contenuto del file `.env`.

---

## 5. Repository e flusso di lavoro

### Repository

- **URL:** `https://github.com/AM-1989/marginview`
- **Utente GitHub:** AM-1989 (Alessio Moro)
- **Branch principale:** `main` — questo è il branch che viene deployato in produzione

### Come funziona il flusso di lavoro

```
Modifica codice (locale/Claude Code)
        ↓
Commit (git commit) — salva la modifica nella storia locale
        ↓
Push (git push) — invia la modifica a GitHub
        ↓
Deploy (deploy.sh sul server) — scarica il codice aggiornato,
  fa il build, copia i file su Apache, riavvia il server API
        ↓
Produzione aggiornata
```

**In pratica:** una modifica al codice non va online da sola. Deve essere committata, pushata su GitHub e poi deployata esplicitamente sul server con `deploy.sh`.

### Regola pratica per ogni modifica

1. **Crea un branch** separato (o almeno esegui un backup del repository)
2. **Modifica** i file necessari
3. **Esegui il build locale** (`npm run build`) per verificare che non ci siano errori
4. **Controlla il diff** (`git diff`) — leggi cosa è cambiato prima di committare
5. **Commit e push** su GitHub
6. **Deploy** sul server con `./deploy.sh`
7. **Verifica** su produzione

> **Regola assoluta:** il file `server/.env` (che contiene password, chiavi API, credenziali SMTP) **non deve mai** essere committato su Git. È già escluso dal file `.gitignore`. Se dovesse comparire in un commit per errore, considera quelle credenziali compromesse e cambiale immediatamente.

---

## 6. Dove si trovano le parti principali

| Area funzionale | File / Cartella principale | Cosa contiene | Quando modificarla |
|-----------------|---------------------------|---------------|--------------------|
| **Logica calcolo ABC** | `src/lib/abcAnalysis.ts` | Classificazione A/B/C per fatturato e margine, Gini, Pareto | Quando cambiano le regole di rating o soglie |
| **Logica calcolo Matrice ABC** | `src/lib/abcMatrixCalc.ts` | Matrice bidimensionale Fatturato × Margine, segmenti, what-if | Quando cambia la logica della matrice |
| **Logica calcolo Varianza** | `src/lib/varianceAnalysis.ts` | Scomposizione effetti Volume/Mix/Prezzo/Costo, gerarchia | Quando cambia il metodo di calcolo |
| **Logica calcolo Bilancio** | `src/lib/balanceAnalysis.ts` | KPI economico-finanziari (EBITDA, ROE, PFN, CCC…) | Quando cambiano le formule di bilancio |
| **Pagina Matrice ABC** | `src/pages/ABCMatrix.tsx` | UI completa del modulo ABC: import, tabelle, grafici, export | Quando cambiano layout, filtri, grafici del modulo ABC |
| **Pagina Varianza** | `src/pages/VarianceAnalysis.tsx` | UI completa del modulo Varianza: upload, waterfall, bridge | Quando cambiano layout, filtri, grafici della varianza |
| **Pagina Bilancio** | `src/pages/BalanceAnalysis.tsx` | UI completa del modulo Bilancio: input manuale, grafici KPI | Quando cambiano layout o input del bilancio |
| **Dashboard** | `src/pages/Dashboard.tsx` | Schermata iniziale di riepilogo | Quando cambia la homepage |
| **Impostazioni (admin)** | `src/pages/Settings.tsx` | Gestione utenti, ruoli, permessi | Quando cambia la gestione degli utenti |
| **PDF — Varianza** | `src/lib/pdf/VariancePDF.tsx` | Template del report PDF del modulo Varianza | Quando cambia il layout/contenuto del PDF Varianza |
| **PDF — ABC** | `src/lib/pdf/ABCMatrixPDF.tsx` | Template del report PDF del modulo ABC | Quando cambia il layout/contenuto del PDF ABC |
| **PDF — Bilancio** | `src/lib/pdf/BalancePDF.tsx` | Template del report PDF del Bilancio | Quando cambia il layout/contenuto del PDF Bilancio |
| **Tema PDF** | `src/lib/pdf/pdfTheme.ts` | Colori, font, stili condivisi tra i PDF | Quando si vuole cambiare lo stile di tutti i report |
| **Export PDF (wrapper)** | `src/lib/exportPDF.ts` | Funzione che avvia il download del PDF | Se cambia la modalità di download |
| **Tipi condivisi** | `src/types/index.ts` | Interfacce TypeScript per i dati (RowExcel, AbcResult, BalanceKPI…) | Quando si aggiungono nuovi campi ai dati |
| **Server / API** | `server/index.js` | Tutto il backend: auth, OTP, AI, gestione utenti, deploy webhook | Quando cambiano le API, l'autenticazione o la configurazione SMTP |
| **Variabili ambiente server** | `server/.env` *(non in Git)* | SMTP, API key Anthropic, DATABASE_PATH, CORS, DEPLOY_SECRET | Quando cambiano le credenziali o la configurazione di produzione |
| **Esempio variabili** | `server/.env.example` | Template documentato delle variabili (senza valori reali) | Riferimento per configurare un nuovo ambiente |
| **Script di deploy** | `deploy.sh` | Automatizza il deploy su server Linux (Apache + PM2) | Se cambia la struttura del server o le cartelle |
| **Template Excel Varianza** | `public/template-variance-analysis.xlsx` | File Excel scaricabile dall'utente come guida all'import | Quando cambia il formato di input richiesto |

---

## 7. Regole importanti di manutenzione

Queste regole sono state definite durante lo sviluppo e devono essere rispettate per non rompere i calcoli o l'affidabilità dell'app.

1. **Distinguere `0`, dato assente e `N/D`:** un valore a zero è diverso da un dato mancante. Nel codice questi tre stati hanno significati diversi e non vanno confusi nei calcoli.

2. **L'AI riceve solo JSON elaborato, mai l'Excel grezzo:** quando viene richiesto un commento AI, il server invia ad Anthropic solo i valori numerici già calcolati (margini, varianze, effetti…), formattati come testo strutturato. Il file Excel originale non viene mai trasmesso all'esterno.

3. **Non cambiare i calcoli per interventi grafici:** se si modifica solo l'aspetto visivo (colori, layout, testi), non toccare i file `src/lib/`. I calcoli vivono separati dalla UI proprio per evitare errori accidentali.

4. **Prima verificare i calcoli, poi la UI:** quando si interviene su un modulo, prima controllare che la logica in `src/lib/` sia corretta, poi occuparsi dell'aspetto.

5. **Non committare `.env` o credenziali:** già garantito dal `.gitignore`, ma vale ribadirlo. Chiavi API, password SMTP, token devono restare solo nel file `server/.env` sul server, mai su GitHub.

6. **Separare logica di business dalla UI:** la logica di calcolo in `src/lib/` deve restare indipendente dai componenti React in `src/pages/` e `src/components/`. Questo rende i calcoli testabili e sostituibili senza toccare l'interfaccia.

7. **CORS in produzione:** i domini autorizzati a chiamare le API sono configurati tramite la variabile `CORS_ORIGIN` nel file `server/.env`. Se si cambia dominio, va aggiornata questa variabile (e riavviato PM2), non modificato il codice sorgente. Il default in assenza di configurazione accetta solo `localhost` — in produzione `CORS_ORIGIN` deve essere impostato correttamente.

8. **Database path su Hostinger:** come descritto nella sezione 4, verificare sempre che `DATABASE_PATH` punti a una directory esterna al progetto sul server.

---

## 8. Procedura sicura per una modifica

Checklist da seguire ogni volta che si interviene sul codice:

- [ ] **1. Capire il modulo coinvolto** — leggere la tabella della sezione 6 per identificare quale file toccare
- [ ] **2. Creare un branch o fare un backup** — `git checkout -b nome-modifica` oppure annota il commit attuale con `git log --oneline -1`
- [ ] **3. Modificare** — intervenire solo sui file necessari, senza espandere il perimetro
- [ ] **4. Build locale** — eseguire `npm run build` e verificare che non ci siano errori TypeScript o di compilazione
- [ ] **5. Test funzionale** — avviare l'app in locale (`npm run dev:full`), caricare un file Excel di test, verificare dashboard, tabelle e grafici
- [ ] **6. Controllare dashboard, Excel e PDF** se coinvolti dalla modifica
- [ ] **7. Rivedere il diff** — `git diff` o `git diff --staged` prima di committare: leggere ogni riga modificata
- [ ] **8. Commit e push** — messaggio di commit descrittivo (es. `fix(abc): corretta soglia rating margine`)
- [ ] **9. Deploy sul server** — eseguire `./deploy.sh` via SSH, oppure chiamare il webhook `/api/deploy` se configurato
- [ ] **10. Verifica finale su produzione** — aprire l'app nel browser, caricare un file reale e controllare che tutto funzioni

---

## 9. Accessi e proprietà

> Questa tabella non contiene password. I valori di accesso devono essere custoditi in un gestore di password sicuro (es. Bitwarden, 1Password) e condivisi solo con i diretti interessati.

| Servizio | Funzione | Proprietario / Account di riferimento | Dove sono le credenziali |
|----------|----------|--------------------------------------|--------------------------|
| **Dominio `marginview.it`** | DNS e sottodomini | Alessio Moro — gestito su Hostinger | Pannello Hostinger |
| **Hostinger** | Hosting frontend + backend + database | DA COMPLETARE | DA COMPLETARE |
| **Lovable** | Landing page `marginview.it` | Alessio Moro | Account Lovable di Alessio |
| **GitHub** (`AM-1989/marginview`) | Repository del codice | AM-1989 (Alessio Moro) | Account GitHub AM-1989 |
| **Server Express / PM2** | Backend API in produzione | Gestito via Hostinger SSH | Credenziali SSH Hostinger |
| **Database SQLite** | Utenti e sessioni | File sul server Hostinger | Accesso via SSH Hostinger |
| **Anthropic (Claude API)** | Commenti AI | Alessio Moro — chiave già sua | Pannello Hostinger (voce `ANTHROPIC_API_KEY`) |
| **Brevo (SMTP email)** | Invio email OTP e attivazione | **Da migrare** — attualmente account Luca Pantea | Pannello Hostinger (voci `SMTP_HOST/USER/PASS`) — vedi guida migrazione sotto |
| **Analytics / Email marketing** | DA COMPLETARE | DA COMPLETARE | DA COMPLETARE |

> **Azione consigliata — email:** creare un account proprio su [Brevo](https://www.brevo.com) (gratuito fino a 300 email/giorno), generare le credenziali SMTP e aggiornare `server/.env`. In questo modo l'app non dipende dall'account personale dello sviluppatore.

---

## 10. Stato attuale e punti da verificare

### Funzionalità implementate e verificate

- Autenticazione con OTP via email (2FA), sessioni 8 ore, ruoli admin/user
- Gestione utenti con inviti via email e link di attivazione
- Modulo **Matrice ABC**: import Excel, classificazione A/B/C, matrice bidimensionale Fatturato × Margine, curva di Pareto, analisi per categoria, soglie configurabili, what-if simulator, export Excel e PDF, commento AI
- Modulo **Analisi Varianza**: import Excel, scomposizione effetti Volume/Mix/Prezzo/Costo, gerarchia a 5 livelli (Canale → Brand → Categoria → Sottocategoria → Formato), tabella pivot, grafico waterfall, export Excel e PDF, commento AI
- Modulo **Analisi di Bilancio**: inserimento manuale dati multi-anno, calcolo KPI (EBITDA, EBIT, ROE, ROI, PFN/EBITDA, CCC, FCF), grafici temporali, export PDF, commento AI
- Sistema di deploy automatizzato via `deploy.sh` (Apache + PM2)
- Webhook deploy remoto via `POST /api/deploy` (con token segreto)
- Template Excel scaricabile per il modulo Varianza

### Punti da verificare o completare

- **URL dell'app in produzione:** verificare che `app.marginview.it` sia correttamente configurato su Hostinger e che il CORS (`CORS_ORIGIN` nel `.env`) includa questo dominio
- **DATABASE_PATH:** verificare sul server che la variabile sia impostata a un percorso esterno alla cartella del progetto
- **Account email Brevo:** migrare dall'account di Luca Pantea a un account di proprietà del cliente
- **ANTHROPIC_API_KEY:** verificare a chi è intestata e che sia attiva
- **Rapporto Lovable ↔ GitHub:** la landing page `marginview.it` (Lovable) e l'app (questo repo) sono indipendenti — verificare che i link tra le due siano corretti
- **Backup database:** non è presente un sistema automatico di backup del file SQLite — valutare un cron job su Hostinger per copiare periodicamente il file in una posizione sicura

### Ultime modifiche richieste (pendenti al momento della stesura)

Le seguenti funzionalità sono state richieste da Alessio e sono in coda di sviluppo:

| Richiesta | Modulo / Area | Stato |
|-----------|--------------|-------|
| Rotazione magazzino: miglioramenti alla visualizzazione/calcolo | Matrice ABC | In attesa |
| Rating solo numerico (rimozione lettere A/B/C visive in alcuni contesti) | Matrice ABC | In attesa |
| Pulizia heatmap e note ABC | Matrice ABC | In attesa |
| Spostamento commento AI sotto il grafico Pareto | Matrice ABC | In attesa |
| Revisione layout e contenuto dei report PDF | PDF (tutti i moduli) | In attesa |
| Righe grigie nell'export Excel del modulo Varianza | Varianza — export Excel | In attesa |
| Visualizzazione percentuali nel grafico waterfall | Varianza — grafici | In attesa |

---

*Documento generato a partire dal codice sorgente del repository `AM-1989/marginview` — settembre 2026.*
