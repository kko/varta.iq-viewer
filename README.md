# VARTA.iq Viewer - local network viewer

This viewer displays data from a VARTA.iQ Energy Manager on the local network.

Before using the viewer, enable access to the local API in the [VARTA Cloud](https://iq.varta.energy/) under **Settings → Local API** (German interface: **Einstellungen → Lokale API**).

Start the service with `npm start` or by double-clicking `Start-Varta.cmd`.
Then open http://127.0.0.1:8787 in your browser. Node.js version 20 or later is required; no additional packages are needed.

## Docker

Requirements: Docker Engine with Linux containers and Docker Compose v2 (for example, Docker Desktop on Windows).
Build and start the service from the project folder:

```sh
docker compose build
docker compose up -d
docker compose ps
```

The website is available at http://127.0.0.1:8787. If the local Node server is still running, stop it first to free port 8787. The container must be able to reach the gateway's IP address on the local network. You can still save the gateway IP through the website.

The service runs inside the container as the `node` user. Compose stores history and settings in the named volumes `varta-data` and `varta-config`; these survive container restarts, image rebuilds, and `docker compose down`. Running `docker compose down -v` also deletes the stored data. Existing local files in `data/` and `config.json` are not imported automatically and are not included in the image. The health check checks the HTTP service; gateway connection errors are shown separately on the website.

```sh
docker compose logs -f
docker compose down
```

To build only the image: `docker build -t varta-local-viewer:local .`.

To allow access from other computers, create a `.env` file in the project folder (replace the example addresses and hostnames with those of your Docker host):

```dotenv
VARTA_BIND_ADDRESS=0.0.0.0
ALLOWED_HOSTS=192.168.4.15:8787,veilpi.local:8787,veilpi:8787
```

Then run `docker compose up -d --build` and open, for example, http://192.168.4.15:8787. Settings can also be changed through these explicitly allowed hostnames. The request's origin must match its host. The application has no login; expose the port only on a trusted local network. The Node 22 image also supports Raspberry Pis running 32-bit ARMv7. If your account lacks Docker permissions, run the commands with `sudo`.

Optional server environment variables: `HOST` (defaults to `127.0.0.1` locally and `0.0.0.0` in the image), `PORT` (8787), `DATA_DIR`, `CONFIG_DIR`, and `ALLOWED_HOSTS` (additional comma-separated Host header values, including the port). Without directory variables, the local Node process continues to use `data/` and `config.json` in the project folder.

The backend polls only `GET http://192.168.4.119/v2/point` and `GET http://192.168.4.119/v2/devices` every ten seconds, regardless of whether any browsers are open. The frontend reads the latest response from the backend cache; additional browsers do not generate additional gateway requests. The complete JSON responses are available below their respective summaries. The display refreshes every ten seconds while the tab is visible, and automatic refreshing can be disabled.

The local server forwards the two fixed endpoints so the browser can read the data without CORS issues. When started directly with Node using the default settings, it is accessible only at 127.0.0.1. The computer must be on the same network as the gateway; keep the server window open. Stop the server with Ctrl+C.

The viewer reads data locally without cloud requests or changes to the gateway. The view includes current data and the history of measurements already recorded locally. Field names are displayed in their original form; the main power and state-of-charge fields include additional explanations.

## Local recording

You can change the gateway IP on the website under “VARTA.iQ Energy Manager”. The “Speichern & verbinden” (“Save & connect”) button saves the IPv4 address in `config.json` in the project folder, or in `CONFIG_DIR` when configured. It persists across browser and server restarts. If no setting has been saved, the default is `192.168.4.119`. After saving, polling starts using the new address; a connection error appears if the device cannot be reached. Existing history files are preserved and continue to include the source address of each measurement.

While the server is running, it polls both endpoints every 10 seconds independently of the browser. Measurements are saved as `data/point-YYYY-MM-DD.jsonl`. The device list is saved as `data/devices-YYYY-MM-DD.jsonl` whenever it changes. Each line contains the retrieval time, source address, and complete JSON response. Filenames and stored timestamps use UTC; the website displays times in Europe/Berlin.

Identical measurement timestamps are not saved again during a single server run. After a restart, the same measurement may appear again. Files are continuously appended to and are not deleted automatically. Gaps occur when the server is not running or the network is unavailable; historical backfilling is not configured. Disabling automatic browser refreshing stops only display updates; server-side recording continues. Its status is visible in the website footer.

## History view

Available time ranges: the last hour, 6 hours, 24 hours, and 7 days. Charts display power in watts and state of charge as a percentage separately. Individual series can be toggled through the legend, including power and state of charge for individual devices. Use the mouse or the slider below the chart to inspect measurement times.

`GET /api/history?hours=24` returns history from the stored JSONL files. Timestamps are sorted and duplicate measurement times are merged. Only finite numbers are used; missing values are not interpreted as zero. For a one-hour range, the API returns averages in 10-second windows; for ranges up to 24 hours, it returns one-minute averages; for longer ranges, it returns five-minute averages. The original measurements remain on disk. Larger gaps between output windows are not connected in the chart; short interruptions within an averaging window are not shown individually. Unreadable stored lines are skipped and reported in the frontend.

Existing files are included automatically, including after a restart. Data from before local recording began is not available. When started directly, the service runs as a local Node process, rather than a system service installed to start automatically with Windows. Run the tests with `npm test`.
