# 🦁 Wissens-City LIVE – Anleitung

Ein interaktives TikTok-LIVE-Spiel: Deine Zuschauer bauen gemeinsam eine 3D-Stadt.

| Zuschauer macht … | Im Spiel passiert … |
|---|---|
| 💬 schreibt **„Haus“** (oder „mitmachen“, „join“) | bekommt ein Grundstück mit seinem Namen (Baustelle) |
| 🌹 schickt **Geschenke** | 1 Coin = 1 Baupunkt → das Haus wächst (Zelt → Hütte → … → Villa → Hochhaus → **Löwen-Turm**) |
| 🧠 antwortet beim **Quiz** mit **A, B oder C** | richtig = +2 Baupunkte, die/der Schnellste +5 extra |
| ❤️ schickt **Likes** | füllt das Like-Ziel (Löwen-Statue …) + alle 50 Likes 1 Baupunkt |
| 🪙 alle Coins zusammen | füllen das Coin-Ziel (Stadion, Riesenrad …) mit Feuerwerk |
| ➕ **folgt** dir | große Einblendung „❤️ Danke fürs Folgen, **Name**!“ + bekommt ein Grundstück |
| 🔁 **teilt** den LIVE | „🔁 **Name** hat geteilt! +10 Baupunkte“ (max. 3× pro Person und Runde) |
| 🎆 Geschenk ab **100 Coins** | Feuerwerk über seinem Haus + Dank-Einblendung mit Namen |
| 🌌 Geschenk ab **1.000 Coins** (z. B. Galaxy) | Mega-Effekt: Feuerwerk über der ganzen Stadt, Lichtblitz, Riesen-Banner „GALAXY! von **Name** – DANKE!“ |

Alle 70 Sekunden kommt eine Quizfrage. Nach 20 Minuten startet eine **neue Stadt** – Geschenke verlängern die Zeit (30 Coins = +1 Sekunde, auch viele kleine Geschenke zählen zusammen).

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

## 4. Anpassen (`config.json`)

| Einstellung | Bedeutung |
|---|---|
| `roundMinutes` | Länge einer Runde bis zur neuen Stadt |
| `timerBonus` | Zeitverlängerung durch Coins an/aus (`"enabled": false`) |
| `coinGoal` / `likeGoal` | Namen und Größe der Gemeinschafts-Ziele |
| `quiz` | Abstand der Fragen, Antwortzeit, Punkte |
| `bigGifts` | ab wie vielen Coins Feuerwerk (`fireworksFrom`) bzw. der Mega-Effekt (`megaFrom`) kommt |
| `follow.bonusPoints` | Baupunkte fürs Folgen (Standard 0 = nur Dank + Grundstück) |
| `share` | Baupunkte fürs Teilen und wie oft pro Person und Runde |
| `joinWords` | Wörter, mit denen man mitmachen kann |

**Quizfragen:** Es gibt über 200 Fragen. Keine Frage wiederholt sich, bevor nicht alle einmal dran waren – auch nicht nach einem Neustart oder in deinem nächsten LIVE (der Browser merkt sich die gestellten Fragen). Eigene Fragen kannst du in `public/questions.js` im gleichen Format ergänzen.

---

## ⚠️ Wichtig zu wissen
- Die Verbindung zu TikTok läuft über die Bibliothek **„TikTok-Live-Connector“** – das ist **keine offizielle TikTok-Schnittstelle**. Viele Streamer nutzen so etwas, aber TikTok kann sie jederzeit ändern oder blockieren.
- Lies vor dem Start die aktuellen **TikTok-LIVE-Richtlinien**: Spiele, die gezielt um Geschenke werben, werden genauer geprüft. Halte das Spiel fair (Quiz = jeder kann ohne Geld mitbauen).
- Geschenke empfangen ist bei TikTok erst ab **18 Jahren** erlaubt.
- Wenn etwas nicht klappt: Das schwarze Fenster zeigt die Fehlermeldung – schick mir einfach ein Foto davon.
