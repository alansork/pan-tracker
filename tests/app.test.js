// Tests with NO libraries to install. Run from this project folder:
//   node tests/app.test.js
//
// These check our offline orbit math against real position vectors pulled
// from NASA/JPL Horizons (Saturn body-equator frame, solution SAT415).
const Orbit = require("../orbit.js");

let passed = 0, failed = 0;
function expectClose(actual, expected, tolerance, label) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { console.log(`✓ ${label}`); passed++; }
  else {
    console.log(`✗ ${label}\n    expected: ${expected} (±${tolerance})\n    got:      ${actual} (off by ${diff})`);
    failed++;
  }
}

// Angle (0..360°) of a Horizons x/y position vector.
function lonOf(x, y) {
  return ((Math.atan2(y, x) * 180 / Math.PI) % 360 + 360) % 360;
}

// Smallest difference between two angles, handling the 360°→0° wrap.
function angleDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// --- Julian Day conversion ---------------------------------------------------
// Known anchor: 2000-01-01 12:00 UTC is exactly JD 2451545.0.
expectClose(
  Orbit.jdUtcFromDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0))),
  2451545.0, 1e-9, "Julian Day of 2000-01-01 12:00 UTC");

// TDB runs 69.184 s ahead of UTC.
expectClose(
  Orbit.jdTdbFromDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0))),
  2451545.0 + 69.184 / 86400, 1e-9, "TDB offset applied");

// --- Longitude vs four independent Horizons samples --------------------------
// Horizons: 2026-07-07 00:00 TDB (JD 2461228.5) — our calibration epoch.
expectClose(
  angleDiff(Orbit.panLongitudeDeg(2461228.5), lonOf(3.435552695277192e4, -1.290905560545651e5)),
  0, 1e-9, "matches Horizons at epoch 2026-07-07 00:00 TDB");

// Horizons: 2026-07-07 01:00 TDB — one hour later (checks the rate).
expectClose(
  angleDiff(Orbit.panLongitudeDeg(2461228.541666667), lonOf(8.761752328664942e4, -1.008355783206083e5)),
  0, 0.02, "matches Horizons one hour after epoch");

// Horizons: 2026-06-07 00:00 TDB — one month earlier.
expectClose(
  angleDiff(Orbit.panLongitudeDeg(2461198.5), lonOf(-9.617289781406304e4, -9.271159585374905e4)),
  0, 0.001, "matches Horizons one month before epoch");

// Horizons: 2020-01-01 00:00 TDB — 6.5 YEARS earlier (11,258 orbits ago).
expectClose(
  angleDiff(Orbit.panLongitudeDeg(2458849.5), lonOf(1.257670185484696e4, -1.329903292250285e5)),
  0, 0.001, "matches Horizons 6.5 years before epoch");

// --- Atlas vs Horizons --------------------------------------------------------
expectClose(
  angleDiff(Orbit.moonLongitudeDeg(Orbit.MOONS.atlas, 2461228.5),
            lonOf(8.258542777493197e4, -1.099926189600768e5)),
  0, 1e-9, "atlas matches Horizons at epoch 2026-07-07");
expectClose(
  angleDiff(Orbit.moonLongitudeDeg(Orbit.MOONS.atlas, 2458849.5),
            lonOf(1.344911482869663e5, -2.953392090932829e4)),
  0, 0.001, "atlas matches Horizons 6.5 years before epoch");

// --- Daphnis vs Horizons (Cassini-era ephemeris) --------------------------------
expectClose(
  angleDiff(Orbit.moonLongitudeDeg(Orbit.MOONS.daphnis, 2458134.5),
            lonOf(-9.040167784880569e4, 1.022804053950717e5)),
  0, 1e-9, "daphnis matches Horizons at epoch 2018-01-16");
expectClose(
  angleDiff(Orbit.moonLongitudeDeg(Orbit.MOONS.daphnis, 2455197.5),
            lonOf(-1.148537806471196e5, -7.377279213622262e4)),
  0, 0.001, "daphnis matches Horizons 8 years before epoch");

// --- Light-time to Earth vs Horizons ------------------------------------------
// Horizons Earth->Saturn range: 9.380 au on 2026-07-08, 10.996 au on 2020-01-01.
expectClose(Orbit.lightMinutesToEarth(2461229.5), 78.02, 1.0,
  "light-time to Earth on 2026-07-08 (~78 min)");
expectClose(Orbit.lightMinutesToEarth(2458849.5), 91.46, 1.0,
  "light-time to Earth on 2020-01-01 (~91 min)");

// --- Eclipses -------------------------------------------------------------------
// Find the moment Pan stands exactly anti-sunward — mid-eclipse.
let jdE = 2461228.5;
for (let i = 0; i < 4; i++) {
  const sun = Orbit.sunDirection(jdE);
  const anti = lonOf(-sun.x, -sun.y);
  const delta = ((anti - Orbit.panLongitudeDeg(jdE)) % 360 + 360) % 360;
  jdE += delta / Orbit.PAN.meanMotionDegPerDay;
}
expectClose(Orbit.moonSunlitFraction(Orbit.MOONS.pan, jdE), 0, 1e-9,
  "pan is fully dark in mid-eclipse behind saturn");
expectClose(Orbit.moonSunlitFraction(Orbit.MOONS.pan, jdE + 50 / 626.03), 1, 1e-9,
  "pan is back in full sun 50 degrees later");
const exitEv = Orbit.nextShadowEvent(Orbit.MOONS.pan, jdE);
expectClose(exitEv && exitEv.type === "exit" ? 1 : 0, 1, 0,
  "next event from mid-eclipse is the exit");
expectClose(exitEv.jd - jdE, 0.041, 0.02,
  "eclipse half-duration is about an hour");

// --- Geometry sanity ----------------------------------------------------------
// Position must sit on the orbit circle, in the ring plane.
const p = Orbit.panPositionKm(2461228.5);
expectClose(Math.hypot(p.x, p.y), Orbit.PAN.orbitRadiusKm, 0.001, "orbit radius is 133,584 km");
expectClose(p.z, 0, 1e-9, "orbit stays in the ring plane");

// One full period later, Pan is back where it started.
expectClose(
  angleDiff(Orbit.panLongitudeDeg(2461228.5 + Orbit.PAN.periodDays), Orbit.panLongitudeDeg(2461228.5)),
  0, 1e-6, "returns to the same spot after one 13.8 h orbit");

// The Sun direction stays a unit vector as it drifts.
const s = Orbit.sunDirection(2462000);
expectClose(Math.hypot(s.x, s.y, s.z), 1, 1e-9, "sun direction stays a unit vector");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
