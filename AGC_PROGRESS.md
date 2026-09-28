# AGC — Arbeitsstand

Stand: 2026-09-28. Repo `linobr/agc`.

- `main` enthält die Erweiterung um verbundene Regionen, Step-Up, manuellen Spawn und Projektformat v2 (aktueller Abschnitt unten). Der erste Walk-Test-MVP bleibt als Release `v1.0.0` auf `6594030` erhalten.
- Öffentliche App: **https://linobr.github.io/agc/**. Das Pages-Deployment mit `67e84f6` wurde erfolgreich getestet.
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

- Original-GLB bleibt für Scanprojekte notwendig; kein Autosave, nur ein Scan gleichzeitig; v1-Projekte werden jetzt zu v2 migriert.
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
