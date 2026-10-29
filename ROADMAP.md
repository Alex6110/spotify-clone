# Musica: roadmap

Aggiornata il 29/10/2026. Cosa c'è, cosa manca, in che ordine lo facciamo.

## 1. Cosa è già fatto

**Base e sicurezza**
- Backend Node + Express + Prisma (SQLite), login con codice invito, token, tema salvato per utente, chiavi segrete fuori dal repository.
- Scanner incrementale della libreria (ID brano stabili: playlist e preferiti sopravvivono a ogni scansione), test automatici (`npm test`, `npm run smoke`).

**Ascolto**
- Streaming con scorrimento (Range), coda, casuale/ripeti, timer di spegnimento, Media Session (comandi da schermata di blocco), ripresa dell'ascolto su un altro dispositivo, telecomando tra dispositivi.
- Preferiti, playlist (crea, rinomina, elimina, aggiungi/rimuovi brani), menu "..." su ogni brano, "Riproduci dopo", "Aggiungi alla coda".

**Interfaccia**
- Grafica rifatta (nessuna emoji, solo icone), colore principale e forma delle copertine personalizzabili per utente, due pannelli laterali su desktop, tab bar su telefono.

**App**
- PWA installabile su iPhone, ascolto offline di brani/album/playlist scaricati, pagina "Scaricati".
- Carica musica dall'app (archiviazione automatica per artista e album, artista creato se nuovo), download ZIP di album e playlist, download del singolo file.

## 2. Problemi aperti (priorità alta)

| Problema | Causa probabile | Come lo risolviamo |
|---|---|---|
| Brani con durata 0:00 o che non partono | file con intestazione mancante/danneggiata, o file incompleti dal ripping | `npm run doctor` li elenca; `npm run doctor -- --fix-durations` recupera quelli recuperabili. Lo scanner ora rilegge tutto il file quando la durata manca. |
| Brani tagliati | file incompleti, o intestazione mp3 che promette più musica di quella presente | `npm run doctor -- --deep` trova gli mp3 tagliati |
| Foto artista sbagliata (es. persona diversa) | le foto vengono dal vecchio archivio, abbinate solo per nome | `npm run doctor -- --reset-photos`, poi foto affidabili (fase 3) |
| Copertine mancanti o diverse da pagina a pagina | album senza immagine né nei file né nelle cartelle; copertine duplicate tra artisti | il report le elenca; recupero online (fase 3) |
| App spostata in alto su iPhone | margini della barra di stato / altezza dello schermo nell'app installata | correzione in `global.css` + pagina "Diagnostica schermo" per misurare cosa vede davvero il telefono |

## 3. Cosa resta da fare, in ordine

**Fase 3: libreria pulita e affidabile** (subito)
1. Report `doctor` e correzioni di durata (fatto, da eseguire).
2. Foto artista e copertine affidabili: prima i file tuoi (cartella, tag), poi ricerca online con corrispondenza esatta del nome (Cover Art Archive / MusicBrainz, Deezer), mai "il primo risultato".
3. Unione dei doppioni di artista (es. "Bennato" e "Eugenio Bennato") e correzione di titoli/artisti dall'app.
4. Cambio manuale di copertina e foto dall'app.

**Fase 4: scoperta e personalizzazione**
5. Mix automatici dai tuoi ascolti: Mix del giorno, Riscoperti, Simili a..., Radio dell'artista, i più ascoltati.
6. Home "per te" e statistiche; ricerca più tollerante (errori di battitura).

**Fase 5: riproduzione avanzata**
7. Riordino delle playlist col trascinamento, menu "..." nel player a schermo intero, coda con brani ripetuti.
8. Gapless/crossfade, equalizzatore, testi.
9. Vero "Spotify Connect" (un dispositivo attivo, gli altri lo comandano).
10. Qualità dei download offline (copia compressa più leggera dei FLAC).

**Fase 6: server di casa** (vedi sotto)
11. Docker Compose, Postgres, HTTPS, backup automatici, aggiornamenti, utenti amici.

**Più avanti**
12. Cartella "inbox" per nuovi CD con riconoscimento automatico (MusicBrainz).
13. Compatibilità con app Subsonic esterne.
14. Richiesta di brani/album/artisti al creatore del sito (molto dopo, come da accordi).

Stima: fasi 3-5 sono una decina di passi come quelli già fatti; la fase 6 sono 2-3 passi, ma dipende da quando compri l'hardware.

## 4. Il server: quando e cosa

**Ora**: il tuo Mac con l'SSD fa da server. Va benissimo per sviluppare, ma l'app funziona solo finché il Mac è acceso e sveglio, e fuori casa serve Tailscale.

**Quando comprare**: non prima di aver finito le fasi 3 e 4. Ha senso comprare quando (a) l'app ti piace e la usi ogni giorno, (b) vuoi che funzioni sempre, anche a Mac spento, (c) vuoi farla usare ad amici o familiari. Prima non serve: spendere ora significa migrare un'app ancora in cambiamento.

**Cosa comprare** (prezzi indicativi, da ricontrollare al momento dell'acquisto):
- Mini PC con Intel N100/N150, 16 GB RAM, SSD 256-512 GB per il sistema: circa 150-250 euro (offerte viste intorno ai 199 euro per un N150 16/512).
- La libreria resta sul tuo SSD esterno (o su un disco da 2-4 TB).
- Un secondo disco per la copia di sicurezza: la libreria ripata è il tuo bene più prezioso. Regola 3-2-1: 3 copie, 2 supporti, 1 fuori casa.
- Un UPS piccolo è facoltativo ma consigliato per proteggere il disco dagli spegnimenti.
- Consumi: pochi watt, qualche euro l'anno di corrente.

**Cloud totalmente gratuito**: non è adatto a tenere la musica.
- Oracle Cloud "Always Free": 4 core Arm e 24 GB di RAM, ma solo 200 GB di disco in totale e 20 GB di archiviazione oggetti; inoltre le macchine poco usate (sotto il 20% di CPU, rete e memoria per 7 giorni) possono essere recuperate da Oracle.
- La tua libreria è di 34.000 brani: quasi certamente supera i 200 GB (lo dice `npm run doctor`).
- Quindi la musica deve stare su un tuo disco. Il cloud gratuito può servire a: copia del database (è piccolo) e accesso da fuori casa.
- Accesso da fuori casa gratis: Tailscale (piano personale gratuito, fino a 6 utenti secondo il loro sito; per far entrare amici senza app serve Funnel, da verificare nel piano).

**Migrazione, in pratica** (2-3 passi): installare Docker sul mini PC, copiare cartella `server/data` e database, cambiare `DATABASE_URL`/`MUSIC_DIR`, `tailscale serve`, rifare il login sul telefono. Il frontend non cambia.

## 5. Come funziona l'offline

- **L'app si apre senza rete**: dopo la prima apertura online, l'app salva se stessa. Si carica anche in modo aereo.
- **Funziona offline**: la pagina "Scaricati", la riproduzione dei brani scaricati (con scorrimento), le pagine già visitate (con l'ultima copia salvata), le copertine già viste.
- **Non funziona offline**: ricerca, pagine mai aperte, brani non scaricati, caricamento di musica, preferiti nuovi.
- **Peso dei download**: i brani sono salvati come sono. Mp3 a 128-320 kbps: circa 1-2,4 MB al minuto, 4-10 MB a brano, 70-120 MB per un album. FLAC: circa 20-40 MB a brano, 250-400 MB per un album.
- **Spotify**: fino a 10.000 brani su ciascuno di 5 dispositivi, e bisogna collegarsi almeno una volta ogni 30 giorni. I file sono cifrati e nascosti dentro l'app. Per ridurre lo spazio usa una qualità più bassa (da quanto mi risulta, circa 96-320 kbps a seconda dell'impostazione).
- **Il file vero**: "Scarica il file" e lo ZIP salvano i file nei File dell'iPhone, utilizzabili con qualsiasi lettore. Sono cose diverse dall'offline dentro l'app.
- **Limiti da iPhone**: lo spazio delle app web è gestito da iOS e può essere ripulito se il telefono è pieno (il pulsante "Proteggi i download" in Impostazioni lo riduce). Provalo in modo aereo.
