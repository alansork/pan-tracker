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
