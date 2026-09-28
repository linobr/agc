# AGC — Arbeitsstand

Stand: 2026-09-28. Repo `linobr/agc`.

- Aktueller Entwicklungsstand: Optimized-Modus, wiederholbare Crops mit Preview/Undo, getrennte Collision-Proxies und Projektformat v5 auf dem bestehenden No-Code-Gameplay (aktueller Abschnitt unten). Cleanup v4 ist als `v1.3.0-cleanup` auf `6c7f71a` gesichert. Gameplay bleibt als `v1.2.0-gameplay` auf `334b36d` gesichert. Walkability bleibt als Release `v1.1.0-walkability` exakt auf `b9af19e` gesichert; der erste Walk-Test als `v1.0.0` auf `6594030`.
- Öffentliche App: **https://linobr.github.io/agc/**. GitHub Pages deployt automatisch von `main`; Produktionsprüfskripte prüfen Preview und Live-App mit synthetischen Scans.
- Git-Strategie: `main` ist der aktuelle funktionierende und geprüfte Source-Stand. Featurebranches nur temporär für konkrete Arbeiten; wichtige stabile Wiederherstellungspunkte zusätzlich mit Tags / GitHub Releases markieren. Secrets, Runtime- und private Nutzerdaten bleiben außerhalb von Git und Releases.

## Projekte speichern und wieder öffnen

- **Save Project** lädt `scene.agc` als lokale JSON-Datei herunter.
- **Open Project** validiert die Einstellungen und fordert bei Scanprojekten ausdrücklich die ursprüngliche GLB an. Dateiname und Bytezahl werden geprüft, auf HTTPS/localhost zusätzlich SHA-256. Abbrechen und fehlerhafte Dateien erhalten die bestehende Szene.
- Wiederhergestellt werden Scan-Metadaten, Namen, Position, Quaternion-Rotation, Skalierung, statisches/dynamisches Verhalten, Colliderform und -sichtbarkeit, Primitive inklusive Farbe, Reset-Basis, Auswahl, Werkzeug und Kamera.
- Physikzustände werden nicht eingefroren: Export während eines Tests sichert die bearbeitete Ausgangsszene; Öffnen startet im Editor. Das bisherige Verhalten bleibt: Start eines Physiktests setzt auch die Transform-Reset-Basis auf den bearbeiteten Start.
- Fehler bleiben im Projektstatus lesbar: ungültiges JSON, unbekannte Version, ungültige Zustandsfelder, unpassender oder defekter Scan und Größenlimits.
- Keine zusätzlichen Abhängigkeiten, keine Uploads oder absoluten Quelldateipfade im Export.

## Projektformat und Autosave

Version 1: `format: "agc-project"`, `version: 1`, `objects` und `editor`.
Die vollständige Feldbeschreibung steht in [AGC_PROJECT_FORMAT.md](AGC_PROJECT_FORMAT.md).

Die GLB wird nicht eingebettet: Bei bis zu 250 MiB würde Base64 etwa 333 MiB plus zusätzliche Speicherkopien beanspruchen. `.agc` enthält nur eine Scanreferenz (Basisdateiname, Bytezahl, optionale Prüfsumme). Der Originalscan muss separat aufbewahrt und beim Öffnen erneut gewählt werden. Projekte sind auf 2 MiB Einstellungen, 500 Objekte und einen Scan begrenzt.

Autosave bewusst nicht implementiert: localStorage könnte nur Einstellungen retten; eine robuste IndexedDB-Sicherung großer Scans braucht Quoten-/Fehlerbehandlung und einen Wiederherstellungsablauf. Manueller Export bleibt notwendig, im UI ausdrücklich vermerkt.

## Bestehender MVP

- Three.js-Studioansicht, Orbit-Kamera, Raster, Fokus, lokaler GLB-Import mit Dateiauswahl/Drag-and-drop und Ladefortschritt.
- Move/Rotate/Scale, numerische Werte, Boden-Ausrichtung und Transform-Reset.
- Cannon-es-Physiktest, Greifen/Ziehen/Fallenlassen, Reset auf bearbeiteten Start.
- Grobe Box- und segmentierte Collider; Sichtbarkeit folgt Objekttransformationen.
- Ein neuer Scan ersetzt den vorherigen und entsorgt dessen Ressourcen. Originalqualität wird nicht reduziert.

## Prüfungen

Die ursprünglichen drei Playwright-Szenarien verwenden jetzt eine im Test erzeugte, selbständige GLB statt einer privaten Datei außerhalb des Repos. Screenshots landen in ignorierten Testausgaben; die historischen Aufnahmen in `artifacts/` werden nicht überschrieben. Ein eigener Testserver auf Port 4188 verhindert Tests gegen eine veraltete Vorschau auf 4187.

Bisherige Funktionsabnahme am 2026-09-28 (vor diesem Dokumentations-Cleanup):

- `npm run build`: erfolgreich; JS ca. 722 kB minifiziert / 187 kB gzip. Bestehende Warnung für Chunkgröße >500 kB.
- `npm test`: **8/8 erfolgreich** (ca. 1,1 Minuten). Enthalten: bisheriger Import/Transform/Collider-Abgleich, Fallen/Greifen/Reset, wiederholter Import/Ressourcen; zusätzlich Export/Neuladen mit vollständigem Zustandsvergleich, primitive/leere Projekte, Fehler/Versionen, falscher und beschädigter Scan, Abbruch, Web-Crypto-Grenzen und Größen-/Geometrievalidierung.
- `npm audit --audit-level=moderate`: **0 Schwachstellen**.
- `git diff --check`: erfolgreich.
- Desktop-Testaufnahme mit neuen Projektaktionen und Statuszeile visuell geprüft. Kein privater Scan außerhalb des Repos gelesen oder verwendet.

## Dokumentations-Cleanup — 28.09.2026

Nur Dokumentation und `package.json`-Homepage aktualisiert; keine Funktions- oder Workflowänderungen. Erneut geprüft: `npm run build` erfolgreich (bekannte Chunkgrößenwarnung), `npm test` **8/8 bestanden**, `npm audit --audit-level=moderate` **0 Schwachstellen**, `git diff --check` erfolgreich. Der Dokumentationscommit verwendet `[skip ci]`, damit sein Push keinen neuen Pages-Deploy auslöst.

## Bekannte Grenzen / nächste Schritte

- Original-GLB bleibt für Scanprojekte notwendig; kein Autosave, nur ein Scan gleichzeitig; v1/v2-Projekte werden jetzt zu v3 migriert.
- Ohne Web Crypto ist die Scanreferenz nur durch Dateiname/Größe geprüft. Projekte mit SHA-256 verlangen HTTPS oder localhost; fehlende Prüfmöglichkeit führt zu einem verständlichen Fehler.
- Nur selbständige GLB-Dateien; externe Textur-/Bufferreferenzen werden abgewiesen.
- Physics Test behält grobe Boxen; Walk Test nutzt statische Dreiecke. Keine reparierten oder garantiert begehbaren Scanflächen.
- Browserprüfungen mit Chromium/SwiftShader belegen keine Hardware-/Mobil-GPU-Performance. Große echte Scans wurden in diesem Turn nicht verwendet; keine privaten Assets im Commit.
- Bestehende Vite-Warnung für einen JS-Chunk über 500 kB bleibt bestehen.
- Nächster Schritt: abbrechbare Worker-Vorverarbeitung, repräsentative Zielgerätetests und explizite Regions-/Navigationsverknüpfungen.

## Walk Test MVP — 28.09.2026

- Auf sauberem `main` nach `git pull --ff-only origin main` implementiert.
- Weltkoordinaten-Normalen, Neigungs- und Flächenfilter erkennen Bodendreiecke; Anzahl/Fläche und abschaltbare Overlays im Inspector. Keine vollständige Rekonstruktion, keine zusammenhängenden Regionen.
- Spawn auf niedrigen Kandidaten mit fünf Auflageproben und Spieler-/Kopffreiheitsprüfung. Fehlender Spawn verhindert den Start verständlich.
- Eigener statischer Dreieckskollisionspfad für Walk Test: räumliches 2-m-Raster, 100.000 Dreiecke, 500.000 Referenzen, 4.000 Dreiecke/Zelle als harte Grenzen. Keine Dreiecksbodies, kein Sampling mit Kollisionslöchern, Original-GLB unverändert. Bestehender Cannon-Physiktest bleibt erhalten.
- Spieler mit fünf Kugeln als grober Kapsel, Schwerkraft, 120-Hz-Schritten, Wandkollision und Bodenhaftung. WASD/Pfeile, R/Respawn, Esc/zurück zum Editor. Keine Sprünge, kein Treppensteigen; feste Folgekamera ohne Wandkollision.
- Transformationen verwerfen abgeleitete Daten; explizite Neuberechnung nötig. Import/Projektöffnung analysiert einmal. Kein Analysepfad im Renderloop.
- Format bleibt v1. Neue Einstellungen und Spawn sind sitzungsbezogen; Projekte enthalten keine abgeleiteten Geometriedaten. Save/Open und Editoransicht bleiben erhalten.
- Neue Tests nutzen ausschließlich generierte Scans: Boden, Wand, fehlende Kopffreiheit, fehlender Boden, Grenzwerte, Bewegung, Fall/Stabilität, Respawn, Editor-Rückkehr und Neuberechnung nach Transformation.
- Grenzen: fehlerhafte Windung, Löcher, feine/raue Dreiecke, Treppen, Vegetation, falscher Maßstab, diskrete Kollisionsauflösung und Kameraclipping. Große reale Scans wurden nicht als Leistungsbeweis verwendet. Details und technische Entscheidung siehe README.

Prüfung dieses MVP: `npm run build` erfolgreich (731 kB JS / 190 kB gzip; bekannte Chunkwarnung), `npm test` **11/11 bestanden**, Audit **0 Schwachstellen**, `git diff --check` erfolgreich. Produktions-Smoke über `scripts/verify-production.js` am Preview: HTTP 200, keine JS/CSS-Fehler, Import/Walk/Boden/Bewegung/Respawn/Editor erfolgreich. Screenshot des Produktionsbuilds visuell geprüft; keine privaten Scans verwendet. Produktions-Smoke nach UI-/Statuskorrekturen erneut erfolgreich; Abschluss-Testlauf ebenfalls vor dem Push.


## Regionen, Step-Up und Projekt v2 — 28.09.2026

- Ausgangspunkt: sauberer `main` auf `6594030e3ebe7c7b85a58d4ee5896cb5938b8ae1`, nach `git pull --ff-only origin main`. Ausschließlich dieses Repository verwendet, keine privaten Scans hinzugefügt.
- Nach ausdrücklicher Klärung des Release-Widerspruchs wurde **[v1.0.0](https://github.com/linobr/agc/releases/tag/v1.0.0)** genau auf diesem alten Commit als Source-Backup veröffentlicht. Der Tag wurde zurückgeholt und sein Commit geprüft. Die neuen Verbesserungen erhalten keinen weiteren Release; Pages folgt weiterhin `main`.
- Regionen: Union/Find über gemeinsame Kanten mit 1-mm-Schlüsseln, räumliche Suche nur für offene Kanten (Endpunkte höchstens 3 cm auseinander, vertikal höchstens 2 cm, Normalenabweichung höchstens 45°). Kein Verbinden nur über einen Punkt. Fläche, Höhenbereich, gewichteter Mittelpunkt und Triangle-Anzahl pro Region; größte Region mit gefundenem plausiblem Spawn bevorzugt.
- Robustere Filter: geometrische statt importierter Shading-Normalen; winzige Dreiecke innerhalb zusammenhängender Böden bleiben erhalten. Minimum ist jetzt Regionsfläche (Default 0,1 m²). Submillimeter-quantisierte doppelte Dreiecke werden in abgeleiteten Daten entfernt. Keine allgemeine Überlappungs-/T-Junction-/Mesh-Reparatur. Ein fehlender äußerer Spawn-Auflagepunkt ist toleriert, der Mittelpunkt bleibt zwingend unterstützt.
- Slope Limit: Default 40°, Bereich 0–50°. Steile Flächen bleiben Collider und liefern keinen Grounded-Kontakt. Zusätzlicher Bewegungstest bestätigt: flache Rampe begehbar, steile Rampe blockiert. Auto-Spawn berücksichtigt die Fußfreiheit auf geneigten Flächen.
- Step-Up: Default 20 cm, Bereich 0–40 cm, 0 deaktiviert. Nur aus Bodenkontakt; Vorwärtsprobe, Höhen- und Freiraumprüfung, begrenzte Hebung mit 1,5 m/s bei 120 Hz. Kein horizontaler Positionssprung; hoher Absatz, niedrige Decke, Richtungswechsel oder Timeout blockieren/beenden den Versuch. 15-cm-Stufe und 35-cm-Hindernis gezielt geprüft.
- Spawn: Marker im Editor, eigener **Place Spawn**-Klickmodus plus X/Y/Z-Weltkoordinaten. **Auto Spawn / Reset** stellt den Vorschlag wieder her. Ungültige Position rot und mit verständlichem Grund; Validierung erneut unmittelbar beim Start. Manueller Spawn bleibt beim Transformieren des Scans in Weltkoordinaten und muss ggf. angepasst werden.
- Projektformat **v2** speichert Slope, Step Height, Minimum Region Area, Spawn-Modus und -Position. **v1 lädt weiter**, erhält Defaults und exportiert als v2. Ungültiger geometrischer Spawn blockiert nur den Walk-Test, nicht das Öffnen im Editor. Alte v1-only-Versionen können v2 nicht öffnen. Schema und Migrationsregeln stehen in `AGC_PROJECT_FORMAT.md`.
- Grenzen unverändert: 100.000 Eingabedreiecke, 500.000 räumliche Referenzen, 4.000 Dreiecke/Zelle; zusätzlich maximal 2.000.000 Nahtvergleiche. Keine Analyse im Frame-Loop. Analyse weiterhin synchron; Worker ist der nächste sinnvolle Performanceschritt. Reale Großscans und mobile Hardware wurden nicht als Leistungsbeweis verwendet.

Die Benchmarkdatei `scripts/benchmark-walk.js` erzeugt 100×100-m-Böden mit exakt 10.000 / 50.000 / 100.000 Dreiecken. Messung über `performance.now()`, drei Läufe pro Größe, Median jeder Phase ohne harte CI-Zeitgrenze. Erfassung/Walkability, Regionsbau, Collider-Index und Gesamtzeit inklusive Spawn werden separat ausgegeben; keine GLB-Decodierung, GPU-Overlays oder Rendering enthalten. Die Tests prüfen Struktur/Ergebnis/Limits, nicht einen geräteabhängigen Geschwindigkeitswert.

Messwerte dieser Umgebung (Linux, Node v22.21.1, Cortex-A78AE; Median aus drei Läufen, ms):

| Eingabedreiecke | Erfassung / Walkability | Regionsbau | Collider-Index | Gesamt inkl. Spawn | Referenzen |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10.000 | 60,6 | 74,5 | 43,2 | 178,9 | 120.000 |
| 50.000 | 281,8 | 271,8 | 94,6 | 655,7 | 280.000 |
| 100.000 | 553,2 | 570,1 | 158,8 | 1.286,7 | 420.000 |

Jeweils eine zusammenhängende Region. Phasenmediane addieren sich nicht zwingend zum Median der Gesamtzeit. Parallel laufende Browserprüfungen lagen bei 100k teilweise um 1,8 s; die Werte sind Orientierung, kein Leistungsversprechen. Der anfängliche Nahtabgleich über sämtliche Kanten wurde nach Messung auf direkte gemeinsame Kanten plus räumlichen Abgleich nur offener Kanten reduziert.

Abnahme: **21/21 Playwright-Tests bestanden**, einschließlich aller bisherigen elf (die Export-Versionserwartung wurde auf v2 aktualisiert). Neue Abdeckung: Inseln/übereinanderliegende Böden, Hauptregion, kleine Dreiecke, Duplikate/Nahtnähe, Slope-Filter und Rampenbewegung, niedrige/hohe Stufe, fehlende Kopffreiheit, manueller/ungültiger Spawn, Place-Spawn-Klickmodus, v2-Roundtrip, v1-Migration und ungültige v2-Werte; außerdem 10k/50k/100k-Strukturprüfungen ohne Zeit-Assertions.

`npm run build` erfolgreich (ca. 739 kB JS / 193 kB gzip, bekannte Chunkgrößenwarnung), `npm audit --audit-level=moderate` ohne Schwachstellen und `git diff --check` sauber. Produktions-Smoke am lokalen Preview: HTTP 200, keine JS/CSS-Fehler; Regionen, manueller/ungültiger Spawn, Bodenhaftung, Bewegung, Respawn, v2-Save/Open und niedrige Stufe über echte Tastatureingabe erfolgreich, ohne Produktions-Debug-API. Produktionsansicht visuell geprüft. Screenshots/Downloads bleiben in ignorierten Testausgaben.


## No-Code-Gameplay und Projekt v3 — 28.09.2026

- Vor Änderungen: sauberer `main`, `git pull --ff-only origin main`, bestätigter HEAD `b9af19ea672fa1dbd0ec4daeca75156c320cf622`. Auf ausdrücklichen Wunsch als **[v1.1.0-walkability](https://github.com/linobr/agc/releases/tag/v1.1.0-walkability)** veröffentlicht. Zurückgeholter Tag zeigt exakt auf diesen Commit. Keine privaten Scans, gespeicherten Projekte oder zusätzlichen Assets angehängt. Gameplay-Entwicklung direkt auf `main`.
- **Gameplay Objects:** Trigger (blau), Goal (grün), Collectible (gold). Eigener Inspector mit Dropdown/Scene-Picking, Name, Weltposition, XYZ-Größe, Aktivierung beim Start und Löschen. Einfache lokale Shapes; keine neuen Asset-/Bibliotheksabhängigkeiten. Gameplay bleibt separat von `objects[]`, Scan-Normalenanalyse und physikalischen Collidern.
- **Regeln:** Enter/Leave auf Triggern, Collected auf Items. Definierte Actions: Show Message, Activate, Deactivate, Complete Objective, Finish Game. Bis zu acht Regeln pro Objekt, bis zu 100 Gameplay-Objekte. Targets müssen vorhandene Gameplay-IDs sein. Beim Löschen eines Targets werden referenzierende Regeln entfernt und gemeldet.
- **Sicherheit:** strikte Feld-/Typ-/String-/Vektor-/Referenzvalidierung vor Szenenersetzung. Unbekannte Actions/Events, Code- und Laufzeitfelder werden abgewiesen. Namen/Meldungen über Text-APIs. Kein eval, Script-Parser, Netzwerk- oder Timer-Action. Kontakte werden zunächst gesammelt, danach Actions ausgeführt; Actions erzeugen keine neuen Events. Selbstreferenzen können deshalb keine rekursive Action-Schleife auslösen.
- **Game Test:** nutzt den bestehenden WalkPlayer unverändert für Bewegung/Slope/Step; zusätzliche Gameplay-Auswertung pro festem Physikschritt. Eigenes HUD für Items, Zeit, Objective-Labels und Messages. Goal beendet beim Kontakt, optional nach allen Items. Auch anfänglich deaktivierte Items zählen zur Gesamtzahl; die Konfiguration muss sie ggf. aktivieren. Finish-Game-Regeln sind ein unabhängiger Win-Pfad.
- **Win/Restart:** Overlay mit Zeit/Items, eingefrorener Bewegung, Restart und Editor-Rückkehr. Restart, R, Respawn und automatische Fall-Respawns setzen Items, aktive Zustände, Objectives und Zeit zurück. Zeit misst reale Sekunden inklusive verborgenem Browser-Tab. Walk Test bleibt als reiner Bewegungstest erhalten; der ursprüngliche Physics Test ebenfalls.
- **Projekt v3:** `gameplay[]` speichert ausschließlich Definitionen/Regeln. v1 ergänzt zuerst Walk-Defaults; v1 und v2 erhalten leeres Gameplay und exportieren v3. Save während des Spiels speichert keine gesammelten Items, Win-/Zeit-/Kontaktzustände oder Aktivierungsänderungen. Open kehrt stets zum Editor und den Startdefinitionen zurück. Schema und Migration sind in `AGC_PROJECT_FORMAT.md` aktualisiert.
- **Grenzen:** nicht feste, achsenparallele Kontaktvolumen mit Player-Bounding-Box, keine Sichtlinienprüfung (Items hinter sehr dünnen Wänden können erreichbar sein), keine Rotation dieser Volumen. Objectives sind abgeschlossene Labels, keine Abhängigkeitsgraphen. Kein eigenständiger Game-Export, Inventar, Gegner oder beliebiges Scripting. Die bisherigen Scan-/Colliderlimits bleiben bestehen. Spiele mit deaktivierten, unerreichbaren Items oder ohne Win-Pfad werden noch nicht automatisch als unlösbar erkannt.
- **Nächster Schritt:** Spiel-Konfigurationsprüfung für fehlende/unlösbare Ziele und unerreichbare/deaktivierte Items, danach eigenständiger spielbarer Export. Worker-Analyse und repräsentative Scan-/Gerätetests bleiben Performancethemen.

Neue Prüfungen verwenden ausschließlich generierte Geometrie und Inspector-Eingaben. Die Browser-Tests nutzen für genaue Kontakte teilweise das vorhandene DEV-Interface; der eigenständige Produktions-Smoke `scripts/verify-gameplay.js` benötigt keinerlei Debug-API und spielt mit echten Tastatureingaben. Er erstellt Regeln/Objekte, prüft gesperrtes Ziel, Pickup/Objective, Win, Restart, v3-Save/Open sowie anschließende Editor-Bearbeitung. Die bisherigen Tests bleiben erhalten; reine Export-Versionsassertions wurden von v2 auf v3 angepasst.


Produktionsbuild lokal geprüft: Walk- und Gameplay-Smoke erfolgreich, HTTP 200 und keine JS/CSS-Fehler. Gameplay-Smoke durchläuft den Spielablauf mit echten WASD-Eingaben; Win-Overlay visuell geprüft. Build ca. 751 kB JS / 197 kB gzip (bekannte Chunkwarnung), Audit ohne Schwachstellen, Diff-Prüfung sauber. Der bestehende Spawn-Klicktest wurde nach einem Timingfehler stabilisiert: Bildschirmprojektion erst nach Auswahl des Spawn-Modus und mit aktualisierter Kamera-Weltmatrix. Der unveränderte Klick-/Spawn-Funktionsumfang wurde dreimal hintereinander erfolgreich geprüft; keine zusätzliche Wartezeit oder gelockerte Assertion nötig.

Finaler Gesamtlauf: **28/28 Tests bestanden** (ca. 1,9 Minuten), einschließlich aller bisherigen 21 Szenarien. Neue Abdeckung: Enter/Leave und feste Actions, nicht rekursive Aktivierung, Collectible/Goal-Gating, Zeit-Freeze/Restart/Respawn, HUD und Win-Overlay, Editor-Rückkehr, v3-Roundtrip, v1/v2-Migration, Ablehnung unbekannter Actions/Codefelder/Referenzen/Übergrößen, Größenbearbeitung und Löschbereinigung. Beide lokalen Produktions-Smokes (Walk und Gameplay) sind erfolgreich. Es wurden keine privaten Scans oder Projekte für Tests/Commits verwendet.

## 2026-09-28 — Reversible Scan-Bereinigung und Projekt v4

- Gameplay-Backup vor jeder Cleanup-Änderung: Release `v1.2.0-gameplay`, exakt
  `334b36dc2e7d5ee553586f1110dbc6079c719f31`; Tag-Ziel über GitHub API geprüft.
- Scananalyse: Dreiecke, Meshes, Bounds/Dimensionen, Komponenten innerhalb eines Meshes
  (exakte Positionsverbindungen über UV-/Normalennähte), kleine getrennte Inseln,
  fehlende/ungültige/gegenläufige Normalen und grob aufgeblähte Bounds. Status ausdrücklich heuristisch.
- Auto Clean arbeitet auf eigenen BufferGeometries. Konservative relative Flächen-/Abstandsgrenzen
  erhalten die Hauptkomponente; fehlerhafte Normalen werden geometrisch neu berechnet.
  Zentrieren und Grounding erfolgen als angezeigter, gespeicherter Offset der Ableitung.
- Crop Scan: sichtbare blaue Box, Center/Size für X/Y/Z, Keep Inside, Remove Inside und
  Reset Crop. Kein Triangle-Picking nötig. Jede Anwendung ersetzt den vorigen Crop.
  Abgeschnittene Dreiecke werden nicht gekappt; ein vollständig leerer Crop wird abgelehnt.
- Original/Cleaned-Vergleich und Reset Cleanup; Originalattribute, Materialien und GLB-Datei bleiben erhalten.
  Eigene Objekttransformationen bleiben unabhängig vom Cleanup-Reset.
- Studio/Neutral/Original, Exposure und heller/dunkler Hintergrund. sRGB und ACES bleiben aktiv.
- Projekt v4 speichert Rezept und Präsentation, keine Meshdaten. v1/v2/v3 migrieren.
  Opening bereitet Analyse/Ableitung vor, bevor die bestehende Szene ersetzt wird.
- Walkability und Spawn werden nach jeder Geometrieumschaltung neu geprüft. Gameplay bleibt erhalten.
  Walk-Kollisionen verwenden verbleibende Dreiecke; Physics Test bleibt eine Bounds-Näherung
  mit Box/Compound und kann daher weiterhin leeren Raum innerhalb der Bounds überbrücken.
- Grenze: 600k Dreiecke für detaillierte Analyse/Cleanup, statische nicht-instanzierte Meshes;
  das bestehende Walk-Limit bleibt 100k. Fortschritt mit regelmäßigen Yield-Punkten,
  pausiertes 3D-Rendering während Verarbeitung; keine Geometrieanalyse pro Frame.
- Keine Simplification: sichere Erhaltung texturierter Scan-Silhouetten/UV-Nähte erfordert
  mehr als den verfügbaren einfachen Decimator. Keine neue Abhängigkeit.

### Reale lokale Sichtprüfung

Ein vorhandener privater Pflanzenscan außerhalb des Repositories wurde ausschließlich auf
localhost im Produktionsbuild geöffnet. Kein Scan und kein Screenshot wird eingecheckt.
Original, Auto Clean, Crop-Box, angewendeter Crop, Original-Rückkehr und dunkler Hintergrund
wurden als lokale Screenshots unter `artifacts/scan-verification/` gesichert (Git-ignoriert).

- Original: 448.567 Dreiecke, 1 Mesh, 44 Komponenten; Dimensionen 3,638 × 3,408 × 3,707.
- Auto Clean: gleiche Dreieckzahl/Bounds, 0 entfernte Komponenten. Keine klar isolierten
  kleinen Teile erkannt. Fehlende Normalen waren bereits durch den GLTF-Import ergänzt;
  die erneute geometrische Berechnung erzeugt deshalb keinen deutlichen sichtbaren Sprung.
- Moderater Crop: 441.172 Dreiecke, Dimensionen 2,910 × 3,408 × 3,707. X-Bounds etwa
  −1,81…1,83 → −1,45…1,46. Randfragmente werden sichtbar begrenzt.
- Kein fertiges Game-Asset: die verbundenen ausgefransten Pflanzenflächen, Löcher und
  gebackenen Texturfehler bleiben. Der Scan überschreitet auch nach diesem Crop das
  Walk-Limit. Eine gezielte kleinere Sektion oder externe Meshbearbeitung ist erforderlich.
- Software-GPU-Prüfung reduziert im Prüfskript die Renderfrequenz; der App-Build ist unverändert.

Nächster sinnvoller Schritt: Crop mit einem tatsächlichen Tastatur-/Tischscan abstimmen;
für dichte Scans eine separate, kontrollierte Kollisionsproxy-Pipeline statt automatischer
starker visueller Decimation evaluieren.

### Validierung des Cleanup-Stands

- `npm run build`: erfolgreich; bekannte Vite-Warnung zum großen Three.js/Cannon-Bundle.
- `npm test`: 41/41 erfolgreich, einschließlich aller bisherigen 28 Tests.
- Nach zusätzlicher Absicherung des Cleanup-Limits auch für reine gespeicherte Offsets:
  `npm test -- tests/scan-cleanup.spec.js`: 13/13 erfolgreich.
- `npm audit --audit-level=moderate`: 0 Schwachstellen. `git diff --check`: sauber.
- Production Preview im Browser: Walk-/Stufen-/Spawn-/v4-Roundtrip und Gameplay mit
  Tastatur-Pickup, gesperrtem Ziel, Win/Restart und Editor-Rückkehr ohne JS-/Assetfehler.
- Cleanup-Browserprüfung ergänzt die synthetischen Tests durch echte GLB-Importwege,
  Auto Clean, Crop, Original-Rückkehr und Beleuchtungsumschaltung.


## 2026-09-28 — Optimized, Crop-Schritte, Collision-Proxies und v5

- Vor Beginn stabilen Release `v1.3.0-cleanup` erstellt, exakt auf
  `6c7f71ab89d5059974472ba0f5e0a26ffb919703`; Tag-Ziel per GitHub API geprüft.
- Drei Modi: Original, Cleaned und optional Optimized. Cleaned bildet immer die Basis
  der visuellen Vereinfachung. Ziel 50k/100k/200k oder Zahl; Default 200k bei geschätztem
  relativen Fehler 0,1%. Ziel darf zugunsten von Qualität/Topologie überschritten werden.
- Kleiner, gepinnter `meshoptimizer@1.3.0`-Simplifier mit eingebettetem WASM, ohne externe
  Ressourcen im Browser. UVs, Normalen und Farben in der Fehlermetrik; Materialgruppen und
  offene Ränder geschützt. Original und Cleaned bleiben separat erhalten. Bundle-Zuwachs
  gegenüber Cleanup v4: ungefähr 23 KB gzip, keine weiteren transitiven Abhängigkeiten.
- Bis zu 32 Crop-Schritte: Keep/Remove, echte Vorschau der verbleibenden Geometrie,
  Cancel, Undo der letzten Rezeptänderung (20 Schritte), Reset Crop und Reset Cleanup.
  Vorschau verändert weder gespeicherte Einstellungen noch Kollisionsdaten; Save/Test
  beendet die Vorschau. Undo hält nur Rezepte im RAM, keine Geometriehistorie.
- Position-only Collision-Proxies separat vom Visual Mesh. Exaktes Positions-Welding,
  randgeschützte Vereinfachung, keine willkürliche Triangle-Auswahl/Lochfüllung. Default
  20k, geschätzter Fehler 0,01 Scan-Einheiten; nur bei größerer Ausgangsgeometrie generiert.
  Original bekommt seinen eigenen Proxy, Cleaned/Optimized teilen die bereinigte Basis.
- Walkability und Walk Test verwenden passende Proxies. Schutzgrenzen: ≤100k Dreiecke
  und geschätzter Weltfehler ≤0,025; spätere Skalierung kann den Proxy unpassend machen.
  Dann Visual-Fallback mit allen bestehenden Limits. UI nennt einen blockierten Walk-Test
  ausdrücklich. Proxy-Overlay magenta; vorhandenes Walk-Collision-Overlay zeigt tatsächliche
  Kollisionsdreiecke. Physics Test behält die bestehenden Box-/Compound-Näherungen.
- v5 speichert nur Modus, Crop-Operationen, Optimierungs-/Proxyparameter und bisherige
  Einstellungen. v1–v4 migrieren, v4-Crop/Offset bleiben erhalten. Original-GLB weiterhin
  separat erforderlich; keine privaten GLBs/Screenshots in Git.

### Prüfungen und reale Ergebnisse

- `npm run build` erfolgreich (bekannte Bundlegrößen-Warnung).
- Vollständige Suite: **46/46** erfolgreich, einschließlich aller bisherigen 41 Tests.
- Nach Präzisierung des Proxy-Status: Optimierungs-/Proxytests erneut **5/5** erfolgreich.
- `npm audit --audit-level=moderate`: **0 Schwachstellen**; `git diff --check` sauber.
- Lokaler Production-Build, vorhandener privater Pflanzenscan, keine Uploads:

| Variante | Dreiecke |
| --- | ---: |
| Original | 448.567 |
| Cleaned (Auto Clean, kein Crop) | 448.567 |
| Optimized (Ziel 200k, Fehler 0,1%) | 199.999 |
| Proxy Standard (Ziel 20k, Fehler 0,01) | 19.939 |
| Proxy angepasst (Ziel 5k, Fehler 0,02) | 7.195 |

- Optimized reduziert Renderdreiecke um etwa **55,4%**; keine deutliche optische
  Verschlechterung in geprüfter Gesamt- und näherer Ansicht. Kleine Schattierungs-/Detailschwankungen
  möglich. Bereits vorhandene Löcher, ausgefranste Blätter und Texturfehler bleiben sichtbar.
- Standardproxy: unter Gesamtbudget, aber lokale Dreieckdichte überschreitet den bestehenden
  Zellschutz. Angepasster Proxy: etwa **98,4%** weniger Geometrie; geschätzter Fehler 0,01983.
  7.101 Walk-Kollisionstriangle nach 94 Duplikaten, 531 Kandidaten; gültiger Spawn,
  Grounding, Respawn und Rückkehr zum Editor im realen Production-Walk-Test geprüft.
- Letzter lokaler Lauf: Optimierung ca. 1,17 s, Proxy-Erstellung ca. 1,78 s; gemessene
  Walk-Teilphasen 44,1 ms Analyse + 39,4 ms Regionen + 8,1 ms Collider. Keine FPS-Garantie:
  Texturen, Overdraw, Hardware und zusätzliche gespeicherte Varianten beeinflussen RAM/Renderzeit.
- Lokale Belege: `artifacts/scan-verification/real-v5-*.png` und JSON-Messwerte, Git-ignoriert.
  Die Software-GPU-Prüfung drosselt nur im Prüfbrowser die Renderfrequenz.

Bekannte Grenzen: Fehlermetriken sind Näherungen, Zielzahlen nicht garantiert. Topologie,
UV-Nähte und Randartefakte können Vereinfachung begrenzen. Proxies ersetzen keine manuell
geprüfte Gameplay-Kollision; alle Spawn-/Region-/Dichtegrenzen bleiben bestehen. Analyse
und Ableitungen bleiben auf unterstützte statische Scans bis 600k Dreiecke begrenzt.

- Abschließende lokale Production-Smokes: Optimized/Proxy-Walk, Crop-Preview/Undo und v5
  Save/Open sowie bisheriger Walk-/Stufentest und kompletter Gameplay-Flow erfolgreich,
  ohne JS-/Assetfehler. Veröffentlichte App wird nach dem Push mit generierten Scans geprüft.

## Scan Auto-Tuning, Presets und Performance-HUD (v5-Erweiterung)

- Begrenztes Proxy-Tuning mit höchstens sechs Ziel-/Fehlerpaaren; nach 30 Sekunden
  beginnt kein weiterer Kandidat. Kleinste tatsächlich erzeugte Variante mit gültiger
  Walkability und Spawn gewinnt. Bestehende Weltfehler-, Dichte-, Regions- und
  Kollisionslimits bleiben aktiv; alle Szenenobjekte und manuelle Spawns werden geprüft.
- Automatisch bei größeren neuen Imports sowie aktivierter Option nach Optimierung/Crop/
  Cleanup. Expliziter Button jederzeit im Editor. Manuelles Rebuild deaktiviert automatische
  Abstimmung; erfolglose Versuche behalten bisherige Kollisionsdaten. Keine GLB-Änderungen.
- Object/Room/Outdoor/Vegetation setzen editierbare Zielzahlen, Proxy-Fehler, Slope,
  Step Height und minimale Regionsfläche. Keine automatische Geometrieentfernung.
- Scan Health zeigt Render-/Collision-Komplexität, Walkability/Spawn, heuristische
  Preset-Empfehlung und nächste Aktion. Die Empfehlung verändert keine Werte.
- Optionaler Walk-/Game-HUD mit geglätteter FPS/Framezeit und tatsächlichen Render-/Proxy-
  Dreiecken; kein Profiler, keine Analyse pro Frame. HUD-Sichtbarkeit bleibt session-only.
- v5 bleibt bestehen: optionale validierte `cleanup.preset`/`autoTune`, gespeicherte
  konkrete Proxy-Parameter; alte v5-Dateien bleiben ohne automatische Neuabstimmung.
  Auch v1–v4 laden weiter. README und Formatdokumentation beschreiben Grenzen und Defaults.

Realer lokaler Production-Test (keine privaten Uploads):

- Original 448.567 Dreiecke; Empfehlung **Vegetation** über Größen-/Dichteheuristik.
- Automatischer Import: sechs Versuche, gültiger Proxy **7.195 Dreiecke**.
- Kontrollvergleich: manuelle 20k/0,01 ergeben **19.939**, wegen lokaler Dichte blocked;
  Auto Tune wählt **5k/0,02 → 7.195** (geschätzter Fehler 0,01983), valid.
- Optimized ohne vorheriges Auto Clean: **199.996** Renderdreiecke. Erneute automatische
  Abstimmung nach Optimierung erfolgreich. Walk verwendet nach Duplikatfilter **7.101**
  Dreiecke, 531 begehbare Kandidaten / 7,9 m², gültigen Auto-Spawn; tatsächlicher Walk
  geerdet. Gemessene Walk-Teilphasen: 96,8 + 46,0 + 10,6 ≈ **153 ms**.
- HUD-Stichproben: **1,5–1,9 FPS / 515–676 ms**, 200.164 tatsächlich gerenderte Dreiecke
  einschließlich Hilfsgeometrie, Proxy 7.195. Chromium/SwiftShader (Software-GPU), keine
  künstliche RAF-Drosselung in diesem Prüflauf. Kein Hardwarebenchmark/FPS-Versprechen.
- Lokale Screenshots `real-intelligence-health.png` / `real-intelligence-walk.png` und
  JSON-Messwerte im ignorierten `artifacts/scan-verification` visuell geprüft. Keine
  zusätzlichen sichtbaren Reparaturen: vorhandene Scanlöcher und Texturfehler bleiben.

Grenzen: begrenzte Kandidatensuche, kein globales Optimum oder vollständiger Navigationstest;
Fehlerschranken bleiben Näherungen. Dichte kompakte Objekte können als Vegetation empfohlen
werden; Maße setzen Meter voraus. Einzelne synchrone Geometrie-/Walk-Phasen können trotz
Fortschrittsanzeige blockieren. Desktop-Hardware separat messen, bevor FPS-Ziele zugesagt werden.

Validierung: finale vollständige Suite **52/52** erfolgreich (alle bisherigen 46 plus sechs
neue Tests). Ein vorheriger Projekt-Testlauf wurde durch Vite-Neuladen während einer letzten
Quelltextänderung unterbrochen; der unveränderte finale Stand besteht vollständig. Build
und lokale Production-Smokes für Auto-Tuning/HUD, Walk/Spawn/Stufen/Save/Open und Gameplay
sind erfolgreich, ohne JavaScript-/Assetfehler. Audit: keine Schwachstellen; Diff-Check sauber.
