// orbit.js — real moon positions, computed offline. No internet needed.
//
// How it works, in plain language:
//   Pan, Daphnis and Atlas ride almost perfectly circular orbits lying almost
//   exactly in Saturn's ring plane. That means each moon's position at any
//   moment is described by ONE number: how far around the circle it is (its
//   "longitude"). We know where each moon was at a reference moment (its
//   "epoch") and exactly how fast it moves, so:
//
//       longitude(now) = longitude(epoch) + speed * (now - epoch)
//
//   All constants below were calibrated against NASA/JPL Horizons ephemeris
//   data (fit to Cassini spacecraft tracking), using long baselines so the
//   rates are exact to a tiny fraction of a degree per year:
//   - Pan:     epoch 2026-07-07, rate from a 6.5-year baseline (<0.001° error)
//   - Atlas:   epoch 2026-07-07, rate from a 6.5-year baseline (<0.001° error)
//   - Daphnis: NASA's ephemeris ends with the Cassini mission (Jan 2018), so
//     its epoch is 2018-01-16 with the rate from an 8-year baseline. Positions
//     "now" are an extrapolation — expect a possible few degrees of drift.

const MOONS = {
  pan: {
    title: "pan · saturn xviii",
    epochJdTdb: 2461228.5,               // 2026-07-07 00:00 TDB
    lonAtEpochDeg: 284.9029784479126,
    meanMotionDegPerDay: 626.0317363036654,   // one lap = 13.801 h
    orbitRadiusKm: 133583.958,           // inside the Encke Gap
    radiiKm: { long: 17.2, mid: 15.4, polar: 10.4 },
    ridgeKm: 3.5,                        // the ravioli seam
  },
  daphnis: {
    title: "daphnis · saturn xxxv",
    epochJdTdb: 2458134.5,               // 2018-01-16 00:00 TDB (see note above)
    lonAtEpochDeg: 131.47221649647443,
    meanMotionDegPerDay: 605.9784674168349,   // one lap = 14.258 h
    orbitRadiusKm: 136505.475,           // inside the Keeler Gap
    radiiKm: { long: 4.6, mid: 4.5, polar: 2.8 },
    ridgeKm: 0.9,
  },
  atlas: {
    title: "atlas · saturn xv",
    epochJdTdb: 2461228.5,               // 2026-07-07 00:00 TDB
    lonAtEpochDeg: 306.90021100636443,
    meanMotionDegPerDay: 599.3775895885545,   // one lap = 14.415 h
    orbitRadiusKm: 137545.371,           // just past the A ring's outer edge
    radiiKm: { long: 20.5, mid: 17.8, polar: 9.4 },
    ridgeKm: 6.5,                        // Atlas is the smoothest flying saucer
  },
};

for (const m of Object.values(MOONS)) {
  m.periodDays = 360 / m.meanMotionDegPerDay;
}

// Direction from Saturn to the Sun at Pan's epoch (unit vector, same frame),
// from Horizons. Used only for realistic lighting. It drifts very slowly:
// Saturn takes 29.46 years to orbit the Sun, so we rotate this vector by
// 360/10759.22 degrees per day around Saturn's pole. (The Sun's small
// out-of-plane tilt, currently -6.4 degrees, is treated as constant —
// it changes by only ~1 degree per year.)
const SUN = {
  epochJdTdb: 2461228.5,
  dirAtEpoch: { x: 0.5358420615207926, y: 0.8369861865114306, z: -0.11102886423898967 },
  degPerDay: 360 / 10759.22,
};

const DEG = Math.PI / 180;

// --- Time helpers -----------------------------------------------------------

// Julian Day number (UTC) from a JavaScript Date.
// JS dates count milliseconds from 1970-01-01 00:00 UTC, which is JD 2440587.5.
function jdUtcFromDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Astronomers use TDB ("dynamical time"), which runs 69.184 seconds ahead of
// UTC right now (37 leap seconds + a fixed 32.184 s offset). Pan moves about
// 0.5 degrees in that time, so it is worth correcting for.
function jdTdbFromDate(date) {
  return jdUtcFromDate(date) + 69.184 / 86400;
}

// --- Moon positions ---------------------------------------------------------

// A moon's longitude (0..360 degrees) at a given TDB Julian Day, measured in
// Saturn's equatorial plane, counterclockwise seen from Saturn's north pole
// (IAU_SATURN "body equator and node of date" frame).
function moonLongitudeDeg(moon, jdTdb) {
  const lon =
    moon.lonAtEpochDeg + moon.meanMotionDegPerDay * (jdTdb - moon.epochJdTdb);
  return ((lon % 360) + 360) % 360; // wrap into 0..360
}

// A moon's x/y/z position in km, in Saturn's equatorial frame.
// x/y lie in the ring plane, z points to Saturn's north pole (always ~0).
function moonPositionKm(moon, jdTdb) {
  const lon = moonLongitudeDeg(moon, jdTdb) * DEG;
  return {
    x: moon.orbitRadiusKm * Math.cos(lon),
    y: moon.orbitRadiusKm * Math.sin(lon),
    z: 0,
  };
}

// Pan-flavoured shorthands (the app's headline moon, and what the tests use).
function panLongitudeDeg(jdTdb) { return moonLongitudeDeg(MOONS.pan, jdTdb); }
function panPositionKm(jdTdb) { return moonPositionKm(MOONS.pan, jdTdb); }

// Unit vector pointing from Saturn toward the Sun at a given TDB Julian Day.
function sunDirection(jdTdb) {
  const a = SUN.degPerDay * (jdTdb - SUN.epochJdTdb) * DEG;
  const { x, y, z } = SUN.dirAtEpoch;
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
    z: z,
  };
}

// --- Exports (browser global + Node for tests) ------------------------------

const Orbit = {
  MOONS,
  PAN: MOONS.pan,
  SUN,
  jdUtcFromDate,
  jdTdbFromDate,
  moonLongitudeDeg,
  moonPositionKm,
  panLongitudeDeg,
  panPositionKm,
  sunDirection,
};

if (typeof module !== "undefined" && module.exports) module.exports = Orbit;
if (typeof globalThis !== "undefined") globalThis.Orbit = Orbit;
