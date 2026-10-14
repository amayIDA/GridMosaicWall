# Mosaic

Two apps served by one small server. **No install needed** — `runtime\node.exe` is bundled, so you can copy this whole folder to any Windows PC and run it.

| App | Where | What it does |
|---|---|---|
| **Wall** | on the PC: `http://localhost:3000/` | Full-screen colour mosaic. Every so often a logo (from `wall/overlays/`) fades in as a spotlight; when someone registers, the wall forms their portrait as a collage. |
| **Registration kiosk** | on the iPad: `https://<PC-IP>:3443/register/` | Just the camera (back camera by default, flip button for the front one): take a photo, tap **Put me on the wall**. No typing. |
| **Admin** | on the PC: `http://localhost:3000/admin/` | See everyone on the wall, remove people (restorable), set the wall's **columns × rows** and background. Asks for the admin PIN. |

All data lives on the PC (`data/registrations.json`, `data/photos/`). The iPad only runs the form in Safari — nothing is stored on it.

> Always open the kiosk from the address the server prints. Opening the files directly, or from Live Server / `python -m http.server`, can't submit (the kiosk says so on screen).

## Get it on any Windows PC

```bash
git clone https://github.com/amayIDA/GridMosaicWall.git
cd GridMosaicWall
```

Then double-click **`start.bat`**. Node.js is bundled in `runtime\`, so nothing else needs installing. On a new PC also run `allow-network.bat` once as administrator (see below), and trust the certificate once on each iPad.

Your registrations live in `data\` and are **not** in the repo (they hold personal details) — copy that folder across by hand if you want the same people on another PC.

## Run it (every time)

Double-click **`start.bat`**. It refreshes the https certificate for the PC's current IP, starts the server, and opens the wall full-screen (Alt+F4 exits). The server window prints the iPad addresses — keep that window open.

## First time on a new PC / new network

1. Copy the whole folder (including `runtime\`) to the PC.
2. Connect the PC and iPad to the **same Wi‑Fi/router**. Offline is fine — no internet is used. (Guest/venue Wi‑Fi often blocks devices from seeing each other; use a small router of your own if so.)
3. Right‑click **`allow-network.bat` → Run as administrator** (opens ports 3000/3443 on Private networks only) and make sure the PC's network is set to **Private**.
4. Double-click `start.bat`.

## First time on each iPad (the camera needs https)

Safari only allows the live camera on secure pages, so every iPad trusts the Mosaic certificate once:

1. Safari → `http://<PC-IP>:3000/ca.crt` (printed in the server window) → **Allow**.
2. Settings → **Profile Downloaded** → Install.
3. Settings → General → About → **Certificate Trust Settings** → turn **Mosaic Local CA** on.
4. Safari → `https://<PC-IP>:3443/register/` → Share → **Add to Home Screen** for a full-screen kiosk.

The same certificate authority is reused every run, so an iPad that has done this keeps working even if the PC's IP changes. Copying the folder (including `certs\`) to another PC keeps already-trusted iPads working too.

*No-setup alternative:* open `http://<PC-IP>:3000/register/`. No live preview over plain http, but the **“choose a photo”** button opens the iPad's normal camera.

### iPad kiosk tips
- Settings → Display & Brightness → Auto-Lock → **Never**; keep it plugged in.
- Settings → Accessibility → **Guided Access** (triple-click the side/home button) to lock it to the form.
- A red “Can't reach the Mosaic server” banner means the Wi‑Fi dropped or the server window on the PC was closed.

## Admin page

Open `http://localhost:3000/admin/` and enter the **admin PIN** (printed in the server window every start; stored in `data/config.json`, or set `ADMIN_PIN` yourself).

- Every person on the wall, with photo, name, email, mobile and join time. Search by name / email / mobile.
- **Remove from wall** (tap twice): the tile flips back to a normal face on the wall immediately. Nothing is destroyed — they move to **Removed**, where you can **Restore** them or **Delete forever**. A toast also offers **Undo**.
- **Wall layout** (top of the page): a **Logo every** slider (seconds between logo overlays, or switch it Off), a **Photo stays** slider (how many seconds a newly revealed photo stays on the wall, 2–30), sliders for **Columns** and **Rows** (or leave on *Auto* to fit the screen), and the **Background** for tiles nobody has claimed — *Real photos* (the registered photos repeated), *Illustrations* (the generated vector faces), or *Empty*. Changes apply to the live wall within a second, with a fresh page-flip.
- **Remove all** (top right, tap twice): takes everyone off the wall in one go. They all move to **Removed**, so it is reversible (Undo in the toast, or Restore one by one).
- Guests are named *Guest 001, 002 …* automatically. **Export CSV** downloads the list (name and time; contact columns are empty now that the kiosk doesn't ask for them).
- Updates live as people register.

## Your data is kept

Everything is stored in the `data\` folder and survives stopping/starting the server and restarting the PC:

- `registrations.json` (+ `.bak`, the previous version, used automatically if the main file is ever damaged) — people on the wall
- `photos\` — their portraits · `removed.json` + `removed\` — people removed from the wall · `config.json` — admin PIN
- **Back this folder up** (copy it) before an event. To start with a clean wall, delete the contents of `data\`.
- Run on a different folder of data for testing with `set MOSAIC_DATA=C:\mosaic-test-data` before `node server.js`.

## Data & privacy
- `data/registrations.json` — name, email, mobile, time. **Never sent to the wall or iPad.**
- `data/photos/<id>.jpg` — captured portraits (public, shown on the wall).
- Registered people reload in colour after a restart, from the centre of the wall outwards.
- `certs\ca.key` is the private key for your local authority — keep it on the PC.
- No login: use only on your own private network. Contact details are only visible on the PIN-protected admin page.

## The "something is happening" effect
When a new photo is submitted, the wall first plays a short effect: a teal-to-navy gradient (from the `mosaic.ai` artwork) drifts over the wall's photos — which stay faintly visible through it — then fades away, and only then is the portrait revealed. It stretches to any screen shape. The asset is `wall/fx/gradient.jpg`. No names are shown during a reveal.

## The logo spotlight
The logos in `wall/overlays/` (“2026 · Proud of you”, “Proud of you”, DHA) are used only as shapes, one after another: every ~22 s the wall dims everywhere except inside the next logo's shape, where the photos are lifted — brighter, a touch more vivid, with a soft glow around the edge — and a sheen sweeps across it before it all fades away. Add, replace or delete PNGs in that folder to change the rotation (they play in file-name order) — no restart needed. Timing and strength are in `wall/people.js` (`overlay: { first, every, hold, dim, glow }`; `dim` is how dark the rest of the wall gets, 0–1).

## Your own background faces
Drop `1.jpg … N.jpg` in `wall/photos/` and set `photos.count` in `wall/people.js`.

## Without start.bat
`runtime\node.exe tools\make-cert.js` then `runtime\node.exe server.js` (or plain `node` if you have Node installed).
