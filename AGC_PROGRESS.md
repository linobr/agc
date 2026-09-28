# AGC — Arbeitsstand

Stand: 2026-09-28. Repo `linobr/agc`.

- `main` enthält jetzt zusätzlich den Walk-Test-MVP (Details und aktuelle Prüfung unten). Basis: Editor (`0c80cba`), Save/Open Project (`6b145dd`) und GitHub Pages (`67e84f6`).
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

- Original-GLB bleibt für Scanprojekte notwendig; kein Autosave, keine Versionsmigration, nur ein Scan gleichzeitig.
- Ohne Web Crypto ist die Scanreferenz nur durch Dateiname/Größe geprüft. Projekte mit SHA-256 verlangen HTTPS oder localhost; fehlende Prüfmöglichkeit führt zu einem verständlichen Fehler.
- Nur selbständige GLB-Dateien; externe Textur-/Bufferreferenzen werden abgewiesen.
- Physics Test behält grobe Boxen; Walk Test nutzt statische Dreiecke. Keine reparierten oder garantiert begehbaren Scanflächen.
- Browserprüfungen mit Chromium/SwiftShader belegen keine Hardware-/Mobil-GPU-Performance. Große echte Scans wurden in diesem Turn nicht verwendet; keine privaten Assets im Commit.
- Bestehende Vite-Warnung für einen JS-Chunk über 500 kB bleibt bestehen.
- Nächster Schritt: zusammenhängende Bodenregionen, manueller Spawn, Worker-Vorverarbeitung und repräsentative Zielgerätetests.

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
