// Quizfragen: q = Frage, a = Antworten A/B/C, c = Index der richtigen Antwort (0 = A, 1 = B, 2 = C)
// Eigene Fragen einfach im gleichen Format ergänzen.
export const QUESTIONS = [
  // Tiere
  { q: 'Womit schmecken Fliegen ihr Essen?', a: ['Mit den Füßen', 'Mit den Flügeln', 'Mit den Augen'], c: 0 },
  { q: 'Wie viele Herzen hat ein Oktopus?', a: ['Eins', 'Zwei', 'Drei'], c: 2 },
  { q: 'Welches ist das größte Tier der Welt?', a: ['Afrikanischer Elefant', 'Blauwal', 'Pottwal'], c: 1 },
  { q: 'Welches Tier schläft im Stehen?', a: ['Pferd', 'Hund', 'Katze'], c: 0 },
  { q: 'Wie viele Beine hat eine Spinne?', a: ['Sechs', 'Acht', 'Zehn'], c: 1 },
  { q: 'Welche Farbe hat die Haut eines Eisbären?', a: ['Weiß', 'Rosa', 'Schwarz'], c: 2 },
  { q: 'Welches Säugetier kann wirklich fliegen?', a: ['Flughörnchen', 'Fledermaus', 'Gleitbeutler'], c: 1 },
  { q: 'Wie nennt man eine Gruppe von Löwen?', a: ['Rudel', 'Herde', 'Schwarm'], c: 0 },
  { q: 'Welches Tier hat den längsten Hals?', a: ['Kamel', 'Strauß', 'Giraffe'], c: 2 },
  { q: 'Was fressen Pandas hauptsächlich?', a: ['Bambus', 'Fisch', 'Beeren'], c: 0 },
  { q: 'Wie viele Arme hat ein Seestern meistens?', a: ['Vier', 'Fünf', 'Acht'], c: 1 },
  { q: 'Welcher Vogel kann rückwärts fliegen?', a: ['Kolibri', 'Spatz', 'Adler'], c: 0 },

  // Weltall
  { q: 'Welcher Planet ist der Sonne am nächsten?', a: ['Venus', 'Merkur', 'Mars'], c: 1 },
  { q: 'Welcher ist der größte Planet unseres Sonnensystems?', a: ['Saturn', 'Jupiter', 'Neptun'], c: 1 },
  { q: 'Wie nennt man einen Meteoriten, bevor er die Erde trifft, wenn er am Himmel leuchtet?', a: ['Meteor', 'Komet', 'Nova'], c: 0 },
  { q: 'Woraus besteht ein Komet hauptsächlich?', a: ['Eis und Staub', 'Eisen', 'Gas aus der Sonne'], c: 0 },
  { q: 'Wie heißt der Rote Planet?', a: ['Venus', 'Mars', 'Merkur'], c: 1 },
  { q: 'Wie lange braucht das Licht der Sonne ungefähr bis zur Erde?', a: ['8 Sekunden', '8 Minuten', '8 Stunden'], c: 1 },
  { q: 'Welcher Planet hat die auffälligsten Ringe?', a: ['Saturn', 'Mars', 'Venus'], c: 0 },
  { q: 'Wer war der erste Mensch auf dem Mond?', a: ['Juri Gagarin', 'Neil Armstrong', 'Buzz Aldrin'], c: 1 },
  { q: 'Wie viele Planeten hat unser Sonnensystem?', a: ['Acht', 'Neun', 'Zehn'], c: 0 },

  // Körper
  { q: 'Wie viele Knochen hat ein erwachsener Mensch ungefähr?', a: ['106', '206', '306'], c: 1 },
  { q: 'Welches ist das größte Organ des Menschen?', a: ['Leber', 'Haut', 'Lunge'], c: 1 },
  { q: 'Wo im Körper liegt der kleinste Knochen?', a: ['Im Ohr', 'Im Finger', 'In der Nase'], c: 0 },
  { q: 'Wie viele Zähne hat ein Erwachsener normalerweise (mit Weisheitszähnen)?', a: ['28', '32', '36'], c: 1 },
  { q: 'Welche Blutgruppe gilt als „Universalspender“?', a: ['AB positiv', '0 negativ', 'A positiv'], c: 1 },
  { q: 'Was ist bei Gänsehaut eigentlich passiert?', a: ['Kleine Muskeln stellen die Haare auf', 'Die Haut schrumpft', 'Das Blut wird kälter'], c: 0 },

  // Erde & Natur
  { q: 'Welcher Fluss fließt durch Köln?', a: ['Rhein', 'Elbe', 'Donau'], c: 0 },
  { q: 'Welcher ist der höchste Berg der Welt?', a: ['K2', 'Mount Everest', 'Kilimandscharo'], c: 1 },
  { q: 'Welcher ist der höchste Berg Deutschlands?', a: ['Zugspitze', 'Watzmann', 'Brocken'], c: 0 },
  { q: 'Welcher ist der größte Ozean?', a: ['Atlantik', 'Indischer Ozean', 'Pazifik'], c: 2 },
  { q: 'Welche ist die größte Wüste der Erde (inkl. Kältewüsten)?', a: ['Sahara', 'Antarktis', 'Gobi'], c: 1 },
  { q: 'Warum ist der Himmel blau?', a: ['Blaues Licht wird stärker gestreut', 'Das Meer spiegelt sich', 'Die Luft ist blau gefärbt'], c: 0 },
  { q: 'Bei wie viel Grad Celsius kocht Wasser auf Meereshöhe?', a: ['90 °C', '100 °C', '120 °C'], c: 1 },
  { q: 'Welches Gas brauchen Pflanzen für die Fotosynthese?', a: ['Sauerstoff', 'Kohlendioxid', 'Helium'], c: 1 },
  { q: 'Wie viele Kontinente gibt es (übliche Zählung)?', a: ['Fünf', 'Sechs', 'Sieben'], c: 2 },

  // Geografie
  { q: 'Was ist die Hauptstadt von Australien?', a: ['Sydney', 'Canberra', 'Melbourne'], c: 1 },
  { q: 'Was ist die Hauptstadt der Niederlande?', a: ['Amsterdam', 'Den Haag', 'Rotterdam'], c: 0 },
  { q: 'Wie viele Bundesländer hat Deutschland?', a: ['14', '16', '18'], c: 1 },
  { q: 'Welches Land hat die meisten Einwohner?', a: ['China', 'Indien', 'USA'], c: 1 },
  { q: 'In welchem Land steht der Eiffelturm?', a: ['Italien', 'Frankreich', 'Belgien'], c: 1 },
  { q: 'Welches ist das flächenmäßig größte Land der Welt?', a: ['Kanada', 'China', 'Russland'], c: 2 },
  { q: 'Welche Stadt ist die größte Deutschlands?', a: ['Hamburg', 'Berlin', 'München'], c: 1 },

  // Technik & Alltag
  { q: 'Wofür steht „www“ in Internetadressen?', a: ['World Wide Web', 'Wide World Web', 'Web World Wide'], c: 0 },
  { q: 'Wer gilt als Erfinder des Buchdrucks mit beweglichen Lettern in Europa?', a: ['Martin Luther', 'Johannes Gutenberg', 'Albert Einstein'], c: 1 },
  { q: 'Welches Metall ist bei Zimmertemperatur flüssig?', a: ['Quecksilber', 'Blei', 'Zinn'], c: 0 },
  { q: 'Was misst ein Thermometer?', a: ['Luftdruck', 'Temperatur', 'Luftfeuchtigkeit'], c: 1 },
  { q: 'Wie viele Minuten hat ein Tag?', a: ['1.240', '1.440', '1.640'], c: 1 },
  { q: 'Welche Farbe entsteht, wenn man Blau und Gelb mischt (Malfarben)?', a: ['Grün', 'Lila', 'Orange'], c: 0 },
  { q: 'Was ist schwerer: 1 kg Federn oder 1 kg Eisen?', a: ['Federn', 'Eisen', 'Beides gleich schwer'], c: 2 },

  // Psychologie & Kurioses
  { q: 'Was beschreibt Empathie am besten?', a: ['Jemanden nett finden', 'Sich in andere hineinversetzen', 'Jemandem etwas schenken'], c: 1 },
  { q: 'Warum gähnen wir oft, wenn andere gähnen?', a: ['Gähnen ist ansteckend', 'Wegen Sauerstoffmangel im Raum', 'Aus Langeweile'], c: 0 },
  { q: 'Welches Tier gilt als Wappentier der „Wissens-City“?', a: ['Der Löwe 🦁', 'Die Fliege 🪰', 'Der Pinguin 🐧'], c: 0 },
  { q: 'Wie viele Sekunden hat eine Stunde?', a: ['3.600', '6.000', '360'], c: 0 },
  { q: 'Wie viele Tage hat ein Schaltjahr?', a: ['365', '366', '364'], c: 1 },
  { q: 'Welche Zahl ist eine Primzahl?', a: ['21', '27', '29'], c: 2 },
  { q: 'Was ist größer: ein Kilobyte oder ein Megabyte?', a: ['Kilobyte', 'Megabyte', 'Gleich groß'], c: 1 },
];
