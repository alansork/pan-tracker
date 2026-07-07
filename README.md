# Pan Tracker

A tiny observatory for **Pan**, Saturn's ravioli-shaped shepherd moon. Open it
any time and see exactly where Pan is on its 13.8-hour lap around Saturn —
**right now**, computed entirely offline.

Built by **sorkthropic**.

## Run it

Open `index.html` in any browser. No install, no internet, no build step.

- **drag** — orbit the camera around Saturn
- **scroll** — zoom
- **double-click** — fly out to Pan for a close-up of the ravioli (and back)

## How it knows where Pan is

Pan's orbit is almost a perfect circle lying flat in Saturn's ring plane, so
its position at any moment is a single angle. `orbit.js` holds two constants
calibrated against NASA/JPL Horizons ephemeris data (solution SAT415, fit to
Cassini spacecraft tracking):

| constant | value |
|---|---|
| longitude at epoch 2026-07-07 00:00 TDB | 284.9029784° |
| mean motion | 626.0317363°/day (13.8012 h per lap) |
| orbit radius | 133,584 km — inside the Encke Gap |

`longitude(now) = longitude(epoch) + speed × time since epoch`, with the
69.184 s UTC→TDB clock correction applied. Checked against four independent
Horizons samples (one from 6.5 years ago, 11,258 orbits away) — agreement is
better than 0.001°, and the drift is a fraction of a degree per year.

The Sun's true direction from Saturn (from Horizons) drives the lighting, so
the shadow Saturn throws across its rings is the real one for today.

## What's real, what's not

- **Real:** Pan's position and speed, the ring dimensions (C, B, A rings,
  Cassini Division, Encke Gap, Keeler Gap, F ring, all in km), Saturn's size,
  squashed shape and 10.56 h spin, Pan's 34.4 × 30.8 × 20.8 km ellipsoid shape
  with its equatorial ridge, the Sun's direction.
- **Artistic:** Pan is drawn ×60 its true size so it's visible at all (34 km
  next to a 120,536 km planet is less than a pixel) — the corner label says so.
  Cloud and ring textures are procedurally painted in Cassini-photo colors,
  not photographs.

## Tests

```
node tests/app.test.js
```

Verifies the orbit math against real NASA/JPL Horizons position vectors,
including one from 2020 — 11,258 orbits before the calibration epoch.

## Files

- `orbit.js` — the astronomy: time conversion + Pan's position (pure, testable)
- `app.js` — the Three.js scene: Saturn, rings, Pan, stars, camera, HUD
- `vendor/three.min.js` — local copy of Three.js r147 (keeps the app offline)
- `tests/app.test.js` — orbit math vs NASA data
