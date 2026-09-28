# AGC MVP — Arbeitsstand

Stand: 2026-09-28. Separat geklontes öffentliches Repo `linobr/agc`, Branch `jarvis/agc-mvp-20260928`, Basis und unverändertes `main`: `dca95ac87dd7ec20547ca4344fc62ef8ce37a657`. Keine Pushes, Merges oder Deployments.

## MVP umgesetzt

- Lokaler Browsereditor auf Vite-Basis `/agc/`: Three.js-Studioansicht, Orbit-Kamera, Raster, Fokus, GLB-Dateiauswahl/Drag-and-drop, Ladefortschritt und verständliche Parserfehler.
- Move/Rotate/Scale, numerische Werte, Boden-Ausrichtung und Transform-Reset.
- Statisch/Physik-Verhalten, separater Cannon-es-Testmodus, Maus greifen/ziehen/fallen lassen, Reset auf die bearbeitete Ausgangsszene.
- Sichtbarer orientierter Collider folgt Meshposition, Rotation und Skalierung. Schnelle Box oder segmentierte Boxen. Collider sind bewusst grob; kein Rohscan-Durchsuchen und keine Behauptung reparierter Scanlöcher.
- Neuer GLB-Import ersetzt den zuvor importierten Scan und entsorgt dessen Ressourcen. Dateien werden nur im Browser geparst; keine Upload-Schnittstelle. Originalqualität bleibt unangetastet, keine automatische Reduktion.
- Scaniverse-GLB lokal ausserhalb des Repos geprüft. SHA-256 stimmt mit dem JARVIS-Original überein: `c9e14c5135b99082f0d92ca0fd7275cd6fb12c6762ea6db649c4263aa17bd6d2`. Kein privates Modell im Git.

## Prüfung

- Playwright 3/3 erfolgreich am laufenden Preview: echter GLB-Import und Colliderabgleich nach Drehen/Skalieren; Testbox fällt, lässt sich per Maus greifen und ziehen und Reset stellt den bearbeiteten Start wieder her; wiederholter GLB-Import hält Three.js-Geometrie-/Textur-Ressourcen konstant, ungültige Datei zeigt Fehler und bewahrt die vorherige Szene.
- Vite Produktionsbuild erfolgreich. Bundle ~714 kB minifiziert / 184 kB gzip; Vite weist auf Chunkgrösse >500 kB hin. `npm audit --audit-level=moderate`: keine Advisories.
- Chromium ARM64 mit SwiftShader (Software-WebGL); daher keine Aussage zu Hardware-/Mobil-GPU-Performance.
- Preview: `http://192.168.178.200:4187/agc/`, HTTP 200. Vite-Prozess bleibt als lokale Vorschau aktiv.
- Screenshots: `artifacts/agc-start.png`, `artifacts/agc-scan-collider.png`, `artifacts/agc-physics.png`, `artifacts/agc-reset.png`.

## Grenzen / Fortsetzung

Ein Scanobjekt zur Zeit; erneuter GLB-Import ersetzt den vorherigen Scan. Nur GLB. Box-/segmentierte Box-Kollisionen approximieren Form und Topologie; die Palme ist kein begehbarer Untergrundnachweis. Kein Export, Persistenz, Walkable-Surface-Erkennung, mobiles Layout oder echte GPU-/Mobilabnahme. Der Palmen-Prototyp-Branch und Mooslicht wurden nicht verändert. Nächste spätere Entscheidung: ob ein MVP-Export/Projektformat und bessere scanabhängige Colliderpriorität den nächsten sinnvollen Umfang bilden; zuerst diesen Prototyp am Zielgerät begutachten.
