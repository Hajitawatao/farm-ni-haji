# Farm Ni Haji — LAN systems monitor

A 3D farm where each animal is one of your systems. The server checks every system
from its own PC (real HTTP status code + response time) and any browser on the LAN
can watch the farm.

| Animal | Meaning |
|---|---|
| Grazing, green ring | Online (answered with 2xx/3xx/4xx under `slowMs`) |
| Slow, wobbly, yellow ring | Sick — answered, but slower than `slowMs` |
| Lying on its side, red flashing ring, siren | Down — refused, timed out, or returned a **5xx** error, `failuresBeforeDown` times in a row |
| Sleeping with "z z" | Maintenance (`"maint": true`) or no URL set |

## Setup (Windows)

1. Install **Node.js LTS** (v18 or newer) from https://nodejs.org on the monitoring PC.
   Prefer a PC *other than* 10.10.2.78 — a monitor on the same server can't report that server dying.
2. Copy this folder to that PC.
3. Right-click **open-firewall.bat** → *Run as administrator* (once).
4. Double-click **start-monitor.bat**. The window shows the address, e.g. `http://10.10.2.50:8080`.
5. Open that address from any PC or TV browser on the LAN.
6. Optional: run **autostart-on-login.bat** so it starts after reboots.

No `npm install` needed — there are no packages. Everything (3D engine, fonts) is bundled, so it works without internet.

## Changing the systems

Edit **config.json**. The server picks up changes on the next check — no restart needed.

```json
{ "id": "rabis", "name": "RABIS", "short": "RABIS", "desc": "Rabies records",
  "species": "pig", "url": "http://10.10.2.78:8090/login" }
```

- `species`: horse, cow, goat, pig, sheep, duck, chicken, hen, rabbit
- `"maint": true` puts the animal to sleep (no alerts)
- `"insecure": true` accepts self-signed HTTPS certificates
- Point `url` at a page that touches the database (e.g. the login page) — a static page can load fine while the app behind it is broken.

Global settings: `port`, `checkEverySeconds`, `slowMs`, `timeoutMs`, `failuresBeforeDown`.

## Page options

- `?time=day` or `?time=night` — lock the sky
- `?quality=low` — for weak PCs or smart TVs

## Alerts

Click **Enable alerts** once per browser. You get a siren sound when something goes down and a chime when it recovers.
Desktop pop-up notifications only work on `https://` or `localhost`, so on a LAN IP you get the sound, red banner and flashing siren instead.

## Data

Incident history and uptime are saved in `data/state.json` (not committed to git).
