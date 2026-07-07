// orbit.js — Pan's real position, computed offline. No internet needed.
//
// How it works, in plain language:
//   Pan's orbit around Saturn is almost a perfect circle (eccentricity ~0.00001)
//   lying almost exactly in Saturn's ring plane (inclination ~0.0001 degrees).
//   That means its position at any moment is described by ONE number: how far
//   around the circle it is (its "longitude"). We know where Pan was at a
//   reference moment (the "epoch") and exactly how fast it moves, so:
//
//       longitude(now) = longitude(epoch) + speed * (now - epoch)
//
//   The two constants below were calibrated against NASA/JPL Horizons
//   ephemeris data (solution SAT415, fit to Cassini spacecraft tracking).
//   The mean motion was derived from a 6.5-year baseline (2020-01-01 to
//   2026-07-07) and reproduces JPL's positions to better than 0.001 degrees.

const PAN = {
  // Reference moment: 2026-07-07 00:00 TDB, as a Julian Day number.
  epochJdTdb: 2461228.5,

  // Where Pan was at that moment: angle in Saturn's equatorial plane,
  // measured counterclockwise (as seen from Saturn's north pole),
  // in the IAU_SATURN "body equator and node of date" frame. From Horizons.
  lonAtEpochDeg: 284.9029784479126,

  // How fast Pan moves: degrees per day. One full lap takes 13.801 hours.
  meanMotionDegPerDay: 626.0317363036654,

  // Radius of the orbit in km (inside the Encke Gap of Saturn's A ring).
  orbitRadiusKm: 133583.958,

  // Pan's real size in km (it is TINY next to Saturn): radii of the
  // "ravioli" along its three axes. From Cassini imaging.
  radiiKm: { long: 17.2, mid: 15.4, polar: 10.4 },
};

PAN.periodDays = 360 / PAN.meanMotionDegPerDay; // ≈ 0.5750507 days

// Direction from Saturn to the Sun at the epoch (unit vector, same frame),
// from Horizons. Used only for realistic lighting. It drifts very slowly:
// Saturn takes 29.46 years to orbit the Sun, so we rotate this vector by
// 360/10759.22 degrees per day around Saturn's pole. (The Sun's small
// out-of-plane tilt, currently -6.4 degrees, is treated as constant —
// it changes by only ~1 degree per year.)
const SUN = {
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

// --- Pan's position ---------------------------------------------------------

// Pan's longitude (0..360 degrees) at a given TDB Julian Day.
function panLongitudeDeg(jdTdb) {
  const lon =
    PAN.lonAtEpochDeg + PAN.meanMotionDegPerDay * (jdTdb - PAN.epochJdTdb);
  return ((lon % 360) + 360) % 360; // wrap into 0..360
}

// Pan's x/y/z position in km, in Saturn's equatorial frame.
// x/y lie in the ring plane, z points to Saturn's north pole (always ~0).
function panPositionKm(jdTdb) {
  const lon = panLongitudeDeg(jdTdb) * DEG;
  return {
    x: PAN.orbitRadiusKm * Math.cos(lon),
    y: PAN.orbitRadiusKm * Math.sin(lon),
    z: 0,
  };
}

// Unit vector pointing from Saturn toward the Sun at a given TDB Julian Day.
function sunDirection(jdTdb) {
  const a = SUN.degPerDay * (jdTdb - PAN.epochJdTdb) * DEG;
  const { x, y, z } = SUN.dirAtEpoch;
  return {
    x: x * Math.cos(a) - y * Math.sin(a),
    y: x * Math.sin(a) + y * Math.cos(a),
    z: z,
  };
}

// --- Exports (browser global + Node for tests) ------------------------------

const Orbit = {
  PAN,
  SUN,
  jdUtcFromDate,
  jdTdbFromDate,
  panLongitudeDeg,
  panPositionKm,
  sunDirection,
};

if (typeof module !== "undefined" && module.exports) module.exports = Orbit;
if (typeof globalThis !== "undefined") globalThis.Orbit = Orbit;
