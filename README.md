# Musica: il tuo player personale

Libreria musicale privata (i tuoi CD masterizzati) con interfaccia in stile Spotify: web app oggi, PWA e server di casa domani.

- **Frontend**: React + Vite (cartella principale)
- **Backend**: Node + Express + Prisma + Socket.io (cartella `server/`)
- **Database**: SQLite ora (gratis, un solo file). Sul server di casa si passa a Postgres cambiando due righe.
- **Costo**: tutto open source e gratuito.

## Avvio in locale

Servono Node 20 o superiore e il disco con la musica collegato.

```bash
# 1. dipendenze
npm install
cd server && npm install && cd ..

# 2. configurazione del backend
cd server
cp .env.example .env
#   - JWT_SECRET: genera con  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
#   - MUSIC_DIR: percorso della cartella musica (con il disco rinominato: /Volumes/TOSHIBA_EXT/Raccolta musica)
#   - INVITE_CODE: codice che dovranno inserire gli altri per registrarsi (il primo account non ne ha bisogno)

# 3. database
mkdir -p data
npx prisma migrate dev --name init     # crea il database e la migrazione iniziale (da committare)

# 4. scansione della libreria (la prima volta richiede qualche minuto)
npm run scan

# 5. avvio
npm run dev                            # backend su http://localhost:5001
```

In un secondo terminale, dalla cartella principale: `npm run dev` e apri http://localhost:5173.

### Prova automatica
Con il backend acceso: `cd server && npm run smoke`. Prova registrazione, login, tema, libreria, streaming con seek, preferiti, ascolti, stato di riproduzione e ricerca, e stampa OK o ERRORE per ogni passo. Per la logica dei nomi: `npm test` in `server/`.

### Riusare le vecchie cover
Se hai ancora le cartelle `img/covers` e `img/artist` del vecchio progetto, indica i loro percorsi in `.env` (`LEGACY_COVERS_DIR`, `LEGACY_ARTIST_DIR`) prima di `npm run scan`: lo scanner le userà quando una cartella non ha una cover propria.

## Scansione della libreria

```bash
npm run scan                  # incrementale: legge solo file nuovi o modificati
npm run scan -- --full        # rilegge tutti i tag
npm run scan -- --prune       # toglie dal database i brani spariti dal disco
npm run scan -- --no-covers   # salta cover e foto
```

- Gli album vengono riconosciuti dalle **cartelle** (`Artista/Album/NN - Titolo.mp3`, anche `Artista - Album/` e sottocartelle `CD1`, `CD2`), non dai tag, che sui CD masterizzati sono spesso incoerenti. I tag servono per titolo, durata, anno, genere e cover incorporata.
- Nomi con maiuscole e accenti originali; la ricerca li ignora.
- **Gli ID dei brani non cambiano** tra una scansione e l'altra: playlist, preferiti e cronologia sopravvivono.
- Se il disco non è collegato lo scanner si ferma senza toccare nulla, e `--prune` rifiuta di cancellare oltre il 50% dei brani senza `--force`.

## Cosa è cambiato rispetto alla versione precedente

**Sicurezza**
- Le chiavi Spotify e Last.fm non sono più nel codice (lo script Python è stato sostituito dallo scanner Node). **Revoca e rigenera quelle vecchie**: restano nella cronologia di git.
- Database, JSON della libreria e `.env` non sono più nel repository.
- Ogni API richiede il token; l'utente viene letto dal token, mai dal body. Socket.io e streaming sono autenticati. `JWT_SECRET` è obbligatorio. Limite ai tentativi di login, registrazione su invito, CORS chiuso di default.

**Dati e backend**
- Schema nuovo: artisti, album, brani (percorso relativo, numero traccia, disco, durata, formato), preferiti, artisti seguiti, ascolti, playlist (tabelle pronte), stato di riproduzione con la sola lista di ID.
- Il percorso della musica arriva da `MUSIC_DIR`; niente più `/music2` né percorsi del Mac nel codice.
- Streaming con `Range` (seek), anche per nomi di file con `#`, `?`, `%`, accenti (NFC/NFD).

**Frontend**
- `AuthContext` al posto di `localStorage` sparso e dei `window.location.reload()`; cambiando utente player e socket si ricreano da soli.
- Tema per utente: colore e forma salvati nell'account, applicati con variabili CSS, sincronizzati tra dispositivi, validati.
- Player: bug del brano singolo/ripeti corretto, "indietro" riparte dall'inizio dopo 3 secondi, shuffle uguale su desktop e mobile, un solo dispositivo decide il brano successivo, controlli da schermata di blocco (Media Session), ascolti registrati per i mix futuri.
- Onboarding: ora salva anche gli artisti scelti (come artisti seguiti) e salta il passo dei generi se la libreria non ne ha.
- Nuove pagine: ricerca, artista, libreria con ordinamento e "mostra altri", preferiti con il cuore ovunque. Nessuna emoji: icone Lucide e indicatore animato "sta suonando".
- Il nome mostrato è in `src/lib/config.js` (`APP_NAME`).

## Come ci si porta sul server di casa

1. Copia la musica su un disco ext4 del server e imposta `MUSIC_DIR`.
2. `npm run build` nella cartella principale: il backend serve da solo la cartella `dist/`.
3. Esegui il backend con Docker o con `node src/index.js` sotto systemd; Caddy o `tailscale serve` davanti per HTTPS.
4. Per Postgres: in `schema.prisma` cambia `provider = "postgresql"`, imposta `DATABASE_URL` e lancia `npx prisma migrate dev`.

## Caricare e scaricare musica dall'app

**Carica musica** (Libreria → "Carica musica", oppure Impostazioni): scegli file, cartelle (da computer) o trascinali sulla pagina. Per ogni brano il server legge i tag e lo archivia in `MUSIC_DIR/Artista/Album/NN - Titolo.ext`:
- se l'artista o l'album esistono già (anche scritti diversamente, es. "AC/DC" e "ac dc") usa le loro cartelle, altrimenti li crea;
- se i tag mancano usa i nomi delle cartelle da cui arrivano i file;
- un brano già presente (stesso nome e stessa dimensione) viene saltato; i file non audio o corrotti vengono rifiutati;
- a caricamento finito la libreria si aggiorna da sola (scansione incrementale).

In `server/.env` puoi impostare `ALLOW_UPLOAD=false` per disattivarlo e `MAX_UPLOAD_MB` per cambiare il limite per file (predefinito 600). I file arrivano prima in `MUSIC_DIR/.incoming` e poi vengono spostati.

**Scarica**: dalla pagina di un album o di una playlist, l'icona del disco con la freccia scarica un file ZIP (limite ~4 GB); dal menu "..." di un brano, "Scarica il file".

## Installarla come app sull'iPhone (PWA)

Il telefono permette l'installazione e i download offline **solo con HTTPS**. Il modo gratuito e più semplice è Tailscale: nessuna porta da aprire sul router, funziona anche con l'IP condiviso (CGNAT).

1. Compila il frontend e lascia che sia il backend a servirlo (così tutto sta sulla stessa origine, requisito dei download offline):
   ```bash
   npm run build          # nella cartella principale: crea dist/
   cd server && npm start # serve API e app sulla porta 5001
   ```
2. Installa Tailscale sul computer che fa da server e sull'iPhone (stesso account). Nel pannello di Tailscale abilita **MagicDNS** e **HTTPS Certificates**.
3. Sul computer:
   ```bash
   tailscale serve --bg 5001
   ```
   Tailscale ti stampa un indirizzo del tipo `https://nome-pc.tuo-tailnet.ts.net`.
4. Sull'iPhone apri quell'indirizzo in **Safari** → Condividi → **Aggiungi alla schermata Home**. Da quel momento Musica si apre a tutto schermo, con la sua icona.
5. Per ascoltare senza rete: apri un album o una playlist e tocca la freccia di download (oppure "Scarica sul dispositivo" dal menu "..." di un brano). Trovi tutto in Libreria → Playlist → **Scaricati**.

Note:
- I download stanno nello spazio del browser. iOS può svuotarlo se il telefono è quasi pieno: dalle impostazioni di Musica c'è il pulsante per proteggerli. Un'app installata sulla Home è trattata meglio di una scheda di Safari.
- Dopo ogni `npm run build` l'app si aggiorna da sola alla riapertura successiva.
- In sviluppo (`npm run dev`) il service worker è spento di proposito.

## Prossimi passi
1. PWA vera (manifest, icone, service worker con cache e supporto Range, download offline)
2. Playlist e coda "aggiungi a"
3. Caricamento e download dall'app
4. Mix automatici e consigli dagli ascolti
5. Richieste di brani/album all'amministratore
