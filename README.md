# Pan Tracker

A tiny observatory for **Pan**, Saturn's ravioli-shaped shepherd moon — plus
its equally ravioli-shaped neighbour **Atlas**. Open it any time and see
exactly where they are on their laps around Saturn — **right now**, computed
entirely offline. Each moon carries a floating name label so you always know
who is who. With a soundtrack.

Built by **sorkthropic**.

## Run it

Open `index.html` in any browser — the animation and soundtrack are already
running behind the landing veil, and the enter button lifts it. (`tracker.html`
skips the landing entirely.) Music starts as early as the browser's autoplay
rules allow — at the latest, on your first click. No install, no internet, no
build step.

- **click a moon's name** — fly straight to it (at true scale the floating
  names are how you find a 34 km moon beside a 120,536 km planet)
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
  rings, Cassini Division, Encke Gap, Keeler Gap, F ring, all in km), the
  planet's size, squashed shape and 10.56 h spin, the moons' measured
  ellipsoid shapes with their equatorial ridges — **at true scale**,
  including the true (enormous) size difference between the planet and its
  34 km moons — the Sun's direction (which drives the lighting and ring
  shadows), and warm planet-shine on the moons' night sides. Also:
  **real eclipses** — every 13.8 h lap Pan crosses the planet's shadow cone
  and truly goes dark (exact umbra/penumbra geometry; the corner line counts
  down to the next crossing) — and a **live light-time to Earth** readout
  computed from real planetary orbits (matches NASA to ~0.1%): what you're
  looking at left Saturn that many minutes ago.
- **Photographic:** the planet's cloud map is real spacecraft imagery
  (texture by [Solar System Scope](https://www.solarsystemscope.com/textures/),
  CC BY 4.0) — chosen by sorkthropic for its Hubble-Jupiter drama, Great Red
  Spot and all, so yes: the planet wears Jupiter's actual clouds. A painted
  procedural cloud layer remains as instant fallback while the photo loads
  (and for file:// opens, where browsers keep image pixels away from WebGL).
- **Artistic:** the moons' surface texture is procedurally painted (no probe
  has mapped them fully). The koala is not to scale. Koalas cannot jog.

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
