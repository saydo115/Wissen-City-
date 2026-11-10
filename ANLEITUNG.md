# 🦁 Wissens-City LIVE – Anleitung

Ein interaktives TikTok-LIVE-Spiel: Deine Zuschauer bauen gemeinsam eine 3D-Stadt.

| Zuschauer macht … | Im Spiel passiert … |
|---|---|
| 💬 schreibt **„Haus“** (oder „mitmachen“, „join“) | bekommt ein Grundstück mit seinem Namen (Baustelle) |
| 🌹 schickt **Geschenke** | 1 Coin = 1 Baupunkt. **Alle 100 Baupunkte = 1 Level** (Level 10 = 1.000, Level 20 = 2.000 …, ohne Obergrenze). Das Haus wird mit jedem Level schöner: Zelt → Hütte → Villa → Große Villa mit Garten → Hochhaus (jedes Level ein Stockwerk mehr, Antenne, Hubschrauberlandeplatz) → **Gold-Turm** (ab 20) → **Löwen-Turm** (ab 30) → **Diamant-Turm** (ab 40) → **Weltwunder** (ab 50). Über jedem Haus: Name, Level und Fortschrittsbalken |
| 🏆 erreicht ein **neues Level** | **Level × 1 Sekunde** für die ganze Stadt (Level 9 = +9 Sek., Level 10 = +10 Sek., Level 20 = +20 Sek. …); bei Level 10, 20, 30 … große Einblendung |
| 🧠 antwortet beim **Quiz** mit **A, B oder C** | jede Person kann **einmal** antworten (die erste Antwort zählt); richtig = **+10 Baupunkte** (wie 10 Rosen), die Namen der Richtigen werden eingeblendet. **Timer:** jede richtige Antwort +0,2 Sek., jede falsche −0,5 Sek. (nie unter 30 Sek. Restzeit) |
| ❤️ schickt **Likes** | füllt das Like-Ziel (Löwen-Statue …) + alle 50 Likes 1 Baupunkt |
| 🪙 alle Coins zusammen | füllen das Coin-Ziel (Stadion, Riesenrad …) mit Feuerwerk |
| ➕ **folgt** dir | große Einblendung „❤️ Danke fürs Folgen, **Name**!“ + bekommt ein Grundstück |
| 🔁 **teilt** den LIVE | „🔁 **Name** hat geteilt! +10 Baupunkte“ (max. 3× pro Person und Runde) |
| 🎁 Geschenk ab **2 Coins** (alles außer Rose) | Einblendung mit Namen + **gesprochenes Dankeschön** („Danke, Lisa!“ … bei großen Geschenken „Unglaublich! Lisa, tausend Dank für Galaxy!“) |
| 🌹 einzelne **Rosen** (1 Coin) | zählen als Baupunkte, werden aber **nicht** eingeblendet oder angesagt (sonst wird es zu voll) |
| 🎆 Geschenk ab **100 Coins** | Feuerwerk über seinem Haus + Dank-Einblendung mit Namen |
| 🌌 Geschenk ab **1.000 Coins** (z. B. Galaxy) | Mega-Effekt: Feuerwerk über der ganzen Stadt, Lichtblitz, Riesen-Banner „GALAXY! von **Name** – DANKE!“ **+ startet 4 Minuten Happy Hour** |
| 👑 **Top 3 ändert sich** | freundliche Ansage, z. B. „👑 **Lisa** erobert den Thron! **Tom** wird ganz sanft vom Thron geschubst – Revanche gefällig? 😄“ |
| 🎉 **Happy Hour** | kommt **alle 2 Minuten** (2 Minuten Pause nach jeder Happy Hour) und dauert zufällig 1, 2, 3 oder 4 Minuten: **alle Baupunkte x2** (Geschenke, Quiz, Teilen), Party-Lichter und Countdown |

Alle 70 Sekunden kommt eine Quizfrage. Wenn die Zeit abläuft, werden die Top 3 gefeiert und danach **alles gelöscht** (Häuser, Ziele, Bauwerke) – eine **neue Stadt** beginnt. Geschenke verlängern die Zeit (30 Coins = +1 Sekunde, auch viele kleine Geschenke zählen zusammen).

---

## 1. Einmalig einrichten (ca. 10 Minuten)

1. **Node.js installieren:** https://nodejs.org → die **LTS**-Version herunterladen und installieren (einfach immer „Weiter“).
2. **Diesen Ordner `live-game`** auf den PC kopieren (z. B. auf den Desktop).
3. In der Datei **`config.json`** (mit Editor öffnen) deinen TikTok-Namen eintragen – **ohne @**:
   ```json
   "tiktokUsername": "dein_tiktok_name",
   ```

## 2. Erst testen (ohne LIVE)

Doppelklick auf **`TESTMODUS.bat`** → der Browser öffnet sich mit dem Spiel und einem **Test-Panel** rechts unten.
Damit kannst du Geschenke, Likes, Quiz-Antworten simulieren. Mit **„Auto-Demo“** läuft alles von selbst.

## 3. Live gehen

1. **Zuerst bei TikTok LIVE starten** (das Spiel verbindet sich erst, wenn du live bist).
2. Doppelklick auf **`START.bat`** – das schwarze Fenster offen lassen! Dort steht „Verbunden mit @…“, sobald es klappt.
3. Den Browser mit dem Spiel ins **Hochformat** bringen (oder Vollbild mit **F11**).
4. In **TikTok LIVE Studio** eine Quelle hinzufügen → **Fenster aufnehmen** → das Browser-Fenster mit dem Spiel wählen. Layout auf **Hochformat** stellen.
   - Alternative mit **OBS**: Quelle **„Browser“** → URL `http://localhost:8080`, Breite **1080**, Höhe **1920**.
5. Im Spiel kannst du mit der Taste **D** das Test-Panel ein-/ausblenden.
6. **Ton & Stimme aktivieren:** Beim Start erscheint ein gelber Knopf „🔊 Einmal hier klicken …“ – **einmal anklicken** (Browser erlauben Ton erst nach einem Klick). Der Knopf verschwindet dann.

## 🔊 Die Dankes-Stimme
- Die Stimme kommt von deinem PC (Sprachausgabe des Browsers). **Am schönsten klingt sie in Microsoft Edge** – dort gibt es die natürlichen Stimmen „Katja“ und „Conrad“. In Chrome wird „Google Deutsch“ genutzt.
- Damit die Zuschauer die Stimme hören, muss **TikTok LIVE Studio den PC-Ton mit aufnehmen**: in LIVE Studio bei den Audio-Einstellungen den **Desktop-/System-Ton (Lautsprecher)** aktivieren. Bei OBS mit Browser-Quelle: „Audio über OBS steuern“ anhaken.
- Lautstärke, Tempo und ab wie vielen Coins gedankt wird: in `config.json` unter `voice` (`volume`, `rate`, `minCoinsPerGift`). Ausschalten mit `"enabled": false`.

## 4. Anpassen (`config.json`)

| Einstellung | Bedeutung |
|---|---|
| `roundMinutes` | Länge einer Runde bis zur neuen Stadt |
| `timerBonus` | Zeitverlängerung durch Coins an/aus (`"enabled": false`) |
| `coinGoal` / `likeGoal` | Namen und Größe der Gemeinschafts-Ziele |
| `quiz` | Abstand der Fragen, Antwortzeit, Punkte, Zeit pro richtiger/falscher Antwort (`timeCorrectSeconds`, `timeWrongSeconds`), Mindest-Restzeit (`minSecondsLeft`) |
| `bigGifts` | ab wie vielen Coins Feuerwerk (`fireworksFrom`) bzw. der Mega-Effekt (`megaFrom`) kommt |
| `follow.bonusPoints` | Baupunkte fürs Folgen (Standard 0 = nur Dank + Grundstück) |
| `share` | Baupunkte fürs Teilen und wie oft pro Person und Runde |
| `levels` | Punkte pro Level (`pointsPerLevel`, Standard 100) und Zeitbonus pro Level (`bonusSecondsPerLevel`, Standard 1 → Level × 1 Sek.) |
| `mentions` | ab wie vielen Coins **pro Geschenk** jemand eingeblendet wird (`minCoinsPerGift`, Standard 2 = keine einzelnen Rosen) |
| `voice` | gesprochener Dank: an/aus, ab wie vielen Coins, Lautstärke, Tempo, bevorzugte Stimmen |
| `happyHour` | Faktor (`multiplier`), wie oft (`randomEveryMinutes`), wie lange (`randomDurationMinutes`), ab wie vielen Coins sie ausgelöst wird (`triggerCoins`) und wie lange dann (`triggerMinutes`) |
| `joinWords` | Wörter, mit denen man mitmachen kann |

**Quizfragen:** Es gibt über 200 Fragen. Keine Frage wiederholt sich, bevor nicht alle einmal dran waren – auch nicht nach einem Neustart oder in deinem nächsten LIVE (der Browser merkt sich die gestellten Fragen). Eigene Fragen kannst du in `public/questions.js` im gleichen Format ergänzen.

---

## ⚠️ Wichtig zu wissen
- Die Verbindung zu TikTok läuft über die Bibliothek **„TikTok-Live-Connector“** – das ist **keine offizielle TikTok-Schnittstelle**. Viele Streamer nutzen so etwas, aber TikTok kann sie jederzeit ändern oder blockieren.
- Lies vor dem Start die aktuellen **TikTok-LIVE-Richtlinien**: Spiele, die gezielt um Geschenke werben, werden genauer geprüft. Halte das Spiel fair (Quiz = jeder kann ohne Geld mitbauen).
- Geschenke empfangen ist bei TikTok erst ab **18 Jahren** erlaubt.
- Wenn etwas nicht klappt: Das schwarze Fenster zeigt die Fehlermeldung – schick mir einfach ein Foto davon.
