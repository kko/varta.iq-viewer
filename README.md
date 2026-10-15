# VARTA – lokale Datenansicht

Start mit `npm start` oder per Doppelklick auf `Start-Varta.cmd`.
Dann http://127.0.0.1:8787 im Browser öffnen. Node.js ab Version 20 wird benötigt; es sind keine weiteren Pakete nötig.

## Docker

Voraussetzung: Docker Engine mit Linux-Containern und Docker Compose v2 (unter Windows z. B. Docker Desktop).
Im Projektordner bauen und starten:

```sh
docker compose build
docker compose up -d
docker compose ps
```

Die Website ist unter http://127.0.0.1:8787 erreichbar. Falls der lokale Node-Server noch läuft, diesen vorher beenden, damit Port 8787 frei ist. Der Container muss die Gateway-IP im lokalen Netzwerk erreichen können. Die IP lässt sich weiterhin auf der Website speichern.

Der Dienst läuft im Container als Benutzer `node`. Compose speichert Verlauf und Einstellungen in den benannten Volumes `varta-data` und `varta-config`; diese bleiben bei Container-Neustarts, Neubauten und `docker compose down` erhalten. `docker compose down -v` löscht auch die gespeicherten Daten. Vorhandene lokale Dateien aus `data/` und `config.json` werden nicht automatisch übernommen und sind nicht im Image enthalten. Der Healthcheck prüft den HTTP-Dienst; Gateway-Verbindungsfehler werden separat in der Website angezeigt.

```sh
docker compose logs -f
docker compose down
```

Nur das Image bauen: `docker build -t varta-local-viewer:local .`.

Für Zugriff von anderen Rechnern eine `.env`-Datei im Projektordner anlegen (Beispiele durch Adresse und Namen des Docker-Hosts ersetzen):

```dotenv
VARTA_BIND_ADDRESS=0.0.0.0
ALLOWED_HOSTS=192.168.4.15:8787,veilpi.local:8787,veilpi:8787
```

Dann `docker compose up -d --build` ausführen und z. B. http://192.168.4.15:8787 öffnen. Dadurch funktionieren Einstellungsänderungen auch über diese ausdrücklich erlaubten Hostnamen. Origin und Host müssen übereinstimmen. Die Anwendung hat keine Anmeldung; den Port nur im vertrauenswürdigen lokalen Netz freigeben. Das Node-22-Image unterstützt auch Raspberry Pis mit 32-Bit-ARMv7. Falls Docker-Berechtigungen fehlen, die Befehle mit `sudo` ausführen.

Optionale Server-Umgebungsvariablen: `HOST` (lokal standardmäßig `127.0.0.1`, im Image `0.0.0.0`), `PORT` (8787), `DATA_DIR`, `CONFIG_DIR` und `ALLOWED_HOSTS` (kommagetrennte zusätzliche Host-Header einschließlich Port). Ohne Verzeichnisvariablen verwendet der lokale Node-Prozess weiterhin `data/` und `config.json` im Projektordner.

Der Backend-Dienst ruft ausschließlich `GET http://192.168.4.119/v2/point` und `GET http://192.168.4.119/v2/devices` alle zehn Sekunden ab, unabhängig von geöffneten Browsern. Das Frontend liest den letzten Abruf aus dem Backend-Cache; zusätzliche Browser erzeugen keine weiteren Gateway-Abfragen. Die vollständigen JSON-Antworten stehen unter der jeweiligen Übersicht. Die Aktualisierung der Anzeige erfolgt alle zehn Sekunden, solange der Tab sichtbar ist, und lässt sich abschalten.

Der lokale Server leitet die beiden fest definierten Endpunkte weiter, damit der Browser die Daten ohne CORS-Probleme lesen kann. Er ist nur unter 127.0.0.1 erreichbar. Der Rechner muss im gleichen Netz wie das Gateway sein; das Serverfenster muss geöffnet bleiben. Beenden mit Strg+C.

Keine Cloud und keine Änderung am Gateway. Die Ansicht enthält aktuelle Daten und den Verlauf der bereits lokal aufgezeichneten Messungen. Feldbezeichnungen werden im Original angezeigt; die wichtigsten Leistungs- und Ladezustandsfelder haben zusätzliche Erläuterungen.

## Lokale Aufzeichnung

Die Gateway-IP lässt sich auf der Website unter „VARTA.iQ Energy Manager“ ändern. „Speichern & verbinden“ speichert die IPv4-Adresse in `config.json` im Projektordner. Sie bleibt bei Browser- und Server-Neustarts erhalten. Ohne gespeicherte Einstellung ist `192.168.4.119` voreingestellt. Nach dem Speichern startet der Abruf mit der neuen Adresse; bei einem nicht erreichbaren Gerät erscheint ein Verbindungsfehler. Bestehende Verlaufsdateien bleiben erhalten und enthalten weiterhin die Quelladresse jedes Messwerts.

Solange der Server läuft, fragt er unabhängig vom Browser alle 10 Sekunden beide Endpunkte ab. Messwerte werden als `data/point-YYYY-MM-DD.jsonl` gespeichert. Die Geräteliste wird bei Änderungen als `data/devices-YYYY-MM-DD.jsonl` gespeichert. Jede Zeile enthält Abrufzeit, Quelladresse und die vollständige JSON-Antwort. Dateinamen und gespeicherte Zeitstempel verwenden UTC; die Website zeigt Zeiten für Europe/Berlin an.

Identische Messzeitstempel werden innerhalb einer Serverlaufzeit nicht erneut gespeichert. Nach einem Neustart kann derselbe Messwert nochmals vorkommen. Dateien werden fortlaufend ergänzt und nicht automatisch gelöscht. Ohne laufenden Server oder bei Netzwerkausfällen entstehen Datenlücken; eine rückwirkende Abfrage ist nicht eingerichtet. Das Abschalten der automatischen Browser-Aktualisierung stoppt nur die Anzeige, die Server-Aufzeichnung läuft weiter. Ihr Zustand ist im Fußbereich der Website sichtbar.

## Verlaufsansicht

Zeiträume: letzte Stunde, 6 Stunden, 24 Stunden und 7 Tage. Diagramme zeigen Leistung in Watt und Ladezustand in Prozent getrennt. Messreihen sind über die Legende einzeln einblendbar, einschließlich Leistung und Ladezustand einzelner Geräte. Mit Maus oder Schieberegler unter dem Diagramm lassen sich Messzeitpunkte ansehen.

`GET /api/history?hours=24` liefert den Verlauf aus den gespeicherten JSONL-Dateien. Zeitstempel werden sortiert und doppelte Messzeitpunkte zusammengeführt. Es werden nur endliche Zahlen verwendet; fehlende Werte werden nicht als Null interpretiert. Für eine Stunde liefert die API Mittelwerte in 10-Sekunden-Fenstern, bis 24 Stunden Minutenmittelwerte und darüber 5-Minuten-Mittelwerte. Die originalen Messwerte bleiben auf der Festplatte erhalten. Größere Lücken zwischen den ausgegebenen Zeitfenstern werden im Diagramm nicht überbrückt; kurze Unterbrechungen innerhalb eines Mittelungsfensters sind darin nicht einzeln sichtbar. Unlesbare Speicherzeilen werden übersprungen und im Frontend gemeldet.

Bereits vorhandene Dateien werden automatisch eingebunden, auch nach einem Neustart. Vergangene Zeiten vor Beginn der lokalen Aufzeichnung sind nicht verfügbar. Der Dienst läuft als lokaler Node-Prozess, nicht als automatisch beim Windows-Start installierter Systemdienst. Tests: `npm test`.
