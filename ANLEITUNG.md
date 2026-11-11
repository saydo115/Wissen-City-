# 🦁 Wissens-City LIVE – Anleitung

Ein interaktives TikTok-LIVE-Spiel: Deine Zuschauer bauen gemeinsam eine 3D-Stadt.

| Zuschauer macht … | Im Spiel passiert … |
|---|---|
| 💬 schreibt **„Haus“** (oder „mitmachen“, „join“) | bekommt ein Grundstück mit seinem Namen und sofort ein **kleines Bauernhaus (Level 1)** – die Kamera zoomt hin. Die Stadt hat Platz für **384 Häuser** |
| 🌹 schickt **Geschenke** | 1 Coin = 1 Baupunkt. Die ersten Level gehen schnell: **Level 2 ab 10, Level 3 ab 30, Level 4 ab 60, Level 5 ab 100 Baupunkten**, danach **alle 100 Baupunkte = 1 Level** (ohne Obergrenze). Bei jedem Geschenk und jedem Level-Aufstieg zoomt die Kamera auf das Haus. Das Haus wird mit jedem Level schöner: Bauernhaus → Bauernhof mit Scheune → Landhaus → Stadthaus → Villa → Große Villa mit Garten → Hochhaus (jedes Level ein Stockwerk mehr, Antenne, Hubschrauberlandeplatz) → **Gold-Turm** (ab 20) → **Löwen-Turm** (ab 30) → **Diamant-Turm** (ab 40) → **Weltwunder** (ab 50). Über jedem Haus: Name, Level und Fortschrittsbalken (in der Übersicht nur bei den Top 10). Jeder neue Haustyp wird angesagt, z. B. „Mia, dein Haus ist jetzt eine Villa!“ |
| 🏆 erreicht ein **neues Level** | **Level × 1 Sekunde** für die ganze Stadt (Level 9 = +9 Sek., Level 10 = +10 Sek., Level 20 = +20 Sek. …); bei Level 10, 20, 30 … große Einblendung |
| 🧠 antwortet beim **Quiz** mit **A, B oder C** | **5 Sekunden** Zeit (plus 2 Sek. Puffer für die TikTok-Verzögerung); jede Person kann **einmal** antworten (die erste Antwort zählt); richtig = **+10 Baupunkte** (wie 10 Rosen), die Namen der Richtigen werden eingeblendet. **Timer:** jede richtige Antwort +0,2 Sek., jede falsche −0,5 Sek. (nie unter 30 Sek. Restzeit) |
| ❤️ schickt **Likes** | **alle 5.000 Likes** wird etwas gebaut, das die Stadt braucht: Riesenrad → Bushaltestelle → Lampen → Feuerwerk → Spielplatz → Springbrunnen → Leuchtturm → Löwen-Statue (+ alle 50 Likes 1 Baupunkt) |
| ⚡ **alle 20.000 Likes** | ein **Zeit-Generator**: gibt alle 10 Sekunden **+2 Sekunden** Zeit. Mehrere Generatoren zählen zusammen (2 Generatoren = +4 Sek. alle 10 Sek.) |
| 🪙 alle Coins zusammen | füllen das Coin-Ziel (Stadion, Riesenrad …) mit Feuerwerk |
| ➕ **folgt** dir | große Einblendung „❤️ Danke fürs Folgen, **Name**!“ + bekommt ein Grundstück |
| 🔁 **teilt** den LIVE | „🔁 **Name** hat geteilt! +10 Baupunkte“ (max. 3× pro Person und Runde) |
| 🎁 Geschenk ab **2 Coins** (alles außer Rose) | Einblendung mit Namen + **gesprochenes Dankeschön** („Danke, Lisa!“ … bei großen Geschenken „Unglaublich! Lisa, tausend Dank für Galaxy!“) |
| 🌹 einzelne **Rosen** (1 Coin) | zählen als Baupunkte, werden aber **nicht** eingeblendet oder angesagt (sonst wird es zu voll) |
| 🎆 Geschenk ab **100 Coins** | Feuerwerk über seinem Haus + Dank-Einblendung mit Namen |
| 🌌 Geschenk ab **1.000 Coins** (z. B. Galaxy) | Mega-Effekt: Feuerwerk über der ganzen Stadt, Lichtblitz, Riesen-Banner „GALAXY! von **Name** – DANKE!“ **+ startet 4 Minuten Happy Hour** |
| 👑 **Top 3 ändert sich** | freundliche Ansage, z. B. „👑 **Lisa** erobert den Thron! **Tom** wird ganz sanft vom Thron geschubst – Revanche gefällig? 😄“ |
| 🎉 **Happy Hour** | kommt **alle 2 Minuten** (2 Minuten Pause nach jeder Happy Hour) und dauert zufällig 1, 2, 3 oder 4 Minuten: **alle Baupunkte x2** (Geschenke, Quiz, Teilen), Party-Lichter und Countdown |

**Alle 40 Sekunden** kommt eine Quizfrage. **Alle 10 Fragen wird das Quiz eine Stufe schwerer** (Stufe 1 leicht → 2 mittel → 3 schwer → 4 sehr schwer, in einer neuen Stadt geht es wieder bei Stufe 1 los). Während das Quiz läuft, hat es **Vorrang**: Danke-Ansagen für Geschenke, Folgen und Teilen werden dann nicht vorgelesen (Ziel-Ansagen kommen danach). Am Ende sagt die Stimme die richtige Antwort und wie viele richtig lagen. Wenn die Zeit abläuft, werden die Top 3 gefeiert und danach **alles gelöscht** (Häuser, Ziele, Bauwerke) – eine **neue Stadt** beginnt. **Nur die Top-5-Häuser bleiben stehen** – mit Level und Baupunkten. Geschenke verlängern die Zeit (30 Coins = +1 Sekunde, auch viele kleine Geschenke zählen zusammen).

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
- Die Stimme kommt von deinem PC (Sprachausgabe des Browsers). **Am schönsten klingt sie in Microsoft Edge** – dort gibt es kostenlose, sehr natürliche Online-Stimmen: **Seraphina** und **Katja** (weiblich), **Florian** und **Conrad** (männlich). `START.bat` und `TESTMODUS.bat` öffnen das Spiel deshalb automatisch in Edge. In Chrome klingt es roboterhafter.
- **Stimme auswählen:** `TESTMODUS.bat` starten → im Test-Panel oben bei **🔊 Stimme** eine Stimme wählen → **Test** drücken. Die Auswahl merkt sich der Browser, sie gilt dann auch im LIVE. Alternativ fest in `config.json`: `"voiceName": "Seraphina"`.
- Die Online-Stimmen brauchen Internet. Fällt eine weg, nimmt das Spiel automatisch die nächste deutsche Stimme.
- Damit die Zuschauer die Stimme hören, muss **TikTok LIVE Studio den PC-Ton mit aufnehmen**: in LIVE Studio bei den Audio-Einstellungen den **Desktop-/System-Ton (Lautsprecher)** aktivieren. Bei OBS mit Browser-Quelle: „Audio über OBS steuern“ anhaken.
- Lautstärke, Tempo und ab wie vielen Coins gedankt wird: in `config.json` unter `voice` (`volume`, `rate`, `minCoinsPerGift`). Ausschalten mit `"enabled": false`.

## 4. Anpassen (`config.json`)

| Einstellung | Bedeutung |
|---|---|
| `roundMinutes` | Länge einer Runde bis zur neuen Stadt (Standard 10 Minuten, plus Bonuszeit) |
| `keepTop` | so viele der besten Häuser bleiben bei einer neuen Stadt stehen (Standard 5, `0` = alles neu) |
| `timerBonus` | Zeitverlängerung durch Coins an/aus (`"enabled": false`) |
| `coinGoal` / `likeGoal` | Namen und Größe der Gemeinschafts-Ziele (Like-Ziel: `target` = alle wie viele Likes, Standard 5.000) |
| `generator` | Zeit-Generator: `everyLikes` (20.000), `intervalSeconds` (10), `bonusSeconds` (2) |
| `quiz` | Abstand der Fragen (`everySeconds`, 40), Antwortzeit (`answerSeconds`, 5), Puffer für späte Antworten (`graceSeconds`, 2), alle wie viele Fragen es schwerer wird (`harderEvery`, 10), Punkte, Zeit pro richtiger/falscher Antwort (`timeCorrectSeconds`, `timeWrongSeconds`), Mindest-Restzeit (`minSecondsLeft`) |
| `bigGifts` | ab wie vielen Coins Feuerwerk (`fireworksFrom`) bzw. der Mega-Effekt (`megaFrom`) kommt |
| `follow.bonusPoints` | Baupunkte fürs Folgen (Standard 0 = nur Dank + Grundstück) |
| `share` | Baupunkte fürs Teilen und wie oft pro Person und Runde |
| `levels` | schnelle erste Level (`firstSteps`, Standard 10/30/60/100), danach Punkte pro Level (`pointsPerLevel`, Standard 100) und Zeitbonus pro Level (`bonusSecondsPerLevel`, Standard 1 → Level × 1 Sek.) |
| `mentions` | ab wie vielen Coins **pro Geschenk** jemand eingeblendet wird (`minCoinsPerGift`, Standard 2 = keine einzelnen Rosen) |
| `voice` | gesprochener Dank: an/aus, feste Stimme (`voiceName`, z. B. `"Seraphina"`), ab wie vielen Coins, Lautstärke, Tempo, bevorzugte Stimmen |
| `happyHour` | Faktor (`multiplier`), wie oft (`randomEveryMinutes`), wie lange (`randomDurationMinutes`), ab wie vielen Coins sie ausgelöst wird (`triggerCoins`) und wie lange dann (`triggerMinutes`) |
| `joinWords` | Wörter, mit denen man mitmachen kann |

**Quizfragen:** Es gibt über 300 Fragen in 4 Stufen (`d: 2`, `d: 3`, `d: 4` = Stufe; ohne `d` = Stufe 1). Keine Frage einer Stufe wiederholt sich, bevor nicht alle dieser Stufe einmal dran waren – auch nicht nach einem Neustart oder in deinem nächsten LIVE (der Browser merkt sich die gestellten Fragen). Eigene Fragen kannst du in `public/questions.js` im gleichen Format ergänzen.

---

## ⚠️ Wichtig zu wissen
- Die Verbindung zu TikTok läuft über die Bibliothek **„TikTok-Live-Connector“** – das ist **keine offizielle TikTok-Schnittstelle**. Viele Streamer nutzen so etwas, aber TikTok kann sie jederzeit ändern oder blockieren.
- Lies vor dem Start die aktuellen **TikTok-LIVE-Richtlinien**: Spiele, die gezielt um Geschenke werben, werden genauer geprüft. Halte das Spiel fair (Quiz = jeder kann ohne Geld mitbauen).
- Geschenke empfangen ist bei TikTok erst ab **18 Jahren** erlaubt.
- Wenn etwas nicht klappt: Das schwarze Fenster zeigt die Fehlermeldung – schick mir einfach ein Foto davon.
