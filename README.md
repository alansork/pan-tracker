# Pan Tracker

A tiny observatory for **Pan**, Saturn's ravioli-shaped shepherd moon — plus
its equally ravioli-shaped neighbour **Atlas**. Open it any time and see
exactly where they are on their laps around Saturn — **right now**, computed
entirely offline. Each moon carries a floating name label so you always know
who is who. With a soundtrack.

Built by **sorkthropic**.

## Run it

Open `index.html` in any browser. No install, no internet, no build step.

- **drag** — orbit the camera (fast and loose)
- **scroll** — zoom
- **double-click** — tour: Saturn → Pan → Atlas → back
- **← / →** — time warp (up to a day per second, forwards or backwards);
  **space** snaps back to right now
- **m** (or click the ♪) — toggle the soundtrack ("ZF Archa 97")
- URL options: `?view=pan` / `atlas` to start there; `?silent` for no audio
- there may or may not be someone jogging around Pan if you fly in close

## How it knows where the moons are

These orbits are almost perfect circles lying flat in Saturn's ring plane, so
each moon's position at any moment is a single angle. `orbit.js` holds
per-moon constants calibrated against NASA/JPL Horizons ephemeris data (fit
to Cassini spacecraft tracking):

| moon | epoch (TDB) | longitude | mean motion | orbit radius |
|---|---|---|---|---|
| Pan | 2026-07-07 | 284.90298° | 626.03174°/day (13.80 h) | 133,584 km — Encke Gap |
| Atlas | 2026-07-07 | 306.90021° | 599.37759°/day (14.41 h) | 137,545 km — past the A ring |

`longitude(now) = longitude(epoch) + speed × time since epoch`, with the
69.184 s UTC→TDB clock correction applied. Both moons are checked against
independent Horizons samples 6.5 years apart — agreement better than 0.001°.
(`orbit.js` also carries constants for Daphnis, the Keeler Gap moon, but it
isn't drawn: NASA's ephemeris for it ended with the Cassini mission in 2018,
so its position today can't be stated exactly.)

The Sun's true direction from Saturn (from Horizons) drives the lighting, so
the shadow Saturn throws across its rings is the real one for today.

## What's real, what's not

- **Real:** each moon's position and speed, the ring dimensions (C, B, A
  rings, Cassini Division, Encke Gap, Keeler Gap, F ring, all in km),
  Saturn's size, squashed shape, 10.56 h spin and north-polar hexagon, the
  moons' measured ellipsoid shapes with their equatorial ridges, the Sun's
  direction (which drives the lighting and ring shadows), warm Saturn-shine
  on the moons' night sides.
- **Artistic:** the moons are drawn ×60 their true size so they're visible at
  all (34 km next to a 120,536 km planet is less than a pixel) — the corner
  label says so. Cloud and ring textures are procedurally painted in
  Cassini-photo colors, not photographs. The koala is not to scale. Koalas
  cannot jog.

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
