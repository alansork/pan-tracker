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

// --- Earth <-> Saturn: how far away is what you're looking at? ---------------
// Keplerian elements for Earth and Saturn around the Sun (JPL's approximate
// planetary elements, valid 1800-2050). Good to a small fraction of a percent
// — plenty for a light-time readout.

const PLANETS = {
  // a (au), e, I (deg), L (deg), longPeri (deg), longNode (deg) + per-century rates
  earth: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392],
    I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981],
    longPeri: [102.93768193, 0.32327364], longNode: [0, 0],
  },
  saturn: {
    a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991],
    I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201],
    longPeri: [92.59887831, -0.41897216], longNode: [113.66242448, -0.28867794],
  },
};

const SUN_RADIUS_KM = 696000;
const AU_KM = 149597870.7;
const LIGHT_MIN_PER_AU = 499.00478384 / 60;   // one au of light travel, in minutes
const SATURN_EQ_RADIUS_KM = 60268;

// Heliocentric position (au, ecliptic frame) of a planet at a TDB Julian Day.
function helioPositionAu(planet, jdTdb) {
  const T = (jdTdb - 2451545.0) / 36525;
  const el = (k) => planet[k][0] + planet[k][1] * T;
  const a = el("a"), e = el("e");
  const I = el("I") * DEG, node = el("longNode") * DEG;
  const peri = el("longPeri") * DEG - node;              // argument of perihelion
  let M = ((el("L") - el("longPeri")) % 360) * DEG;      // mean anomaly
  let E = M + e * Math.sin(M);                           // solve Kepler's equation
  for (let i = 0; i < 8; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);                      // in the orbital plane
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(peri), sw = Math.sin(peri);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);
  return {
    x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

// Distance from Earth to Saturn in au, and the light travel time in minutes:
// what you see left Saturn that many minutes ago.
function earthSaturnDistanceAu(jdTdb) {
  const e = helioPositionAu(PLANETS.earth, jdTdb);
  const s = helioPositionAu(PLANETS.saturn, jdTdb);
  return Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z);
}
function lightMinutesToEarth(jdTdb) {
  return earthSaturnDistanceAu(jdTdb) * LIGHT_MIN_PER_AU;
}

// --- Eclipses: the moons really do cross Saturn's shadow every lap -----------
// How sunlit a moon is right now: 1 = full sun, 0 = deep inside Saturn's
// umbra, in between = the soft penumbra. Exact cone geometry: the shadow
// axis points away from the Sun (including its current tilt out of the ring
// plane) and narrows by the Sun's angular size at Saturn.

function moonSunlitFraction(moon, jdTdb) {
  const p = moonPositionKm(moon, jdTdb);                 // moon, km, ring frame
  const sun = sunDirection(jdTdb);
  const ux = -sun.x, uy = -sun.y, uz = -sun.z;           // shadow axis, unit
  const s = p.x * ux + p.y * uy;                         // distance down-shadow (p.z = 0)
  if (s <= 0) return 1;                                  // sunward side: no shadow
  const dx = p.x - s * ux, dy = p.y - s * uy, dz = -s * uz;
  const d = Math.hypot(dx, dy, dz);                      // distance off the axis
  const sunDistKm = Math.hypot(...Object.values(helioPositionAu(PLANETS.saturn, jdTdb))) * AU_KM;
  const sunAngRad = SUN_RADIUS_KM / sunDistKm;           // sun's angular radius
  const rUmbra = SATURN_EQ_RADIUS_KM - s * sunAngRad - moon.radiiKm.long;
  const rPenumbra = SATURN_EQ_RADIUS_KM + s * sunAngRad + moon.radiiKm.long;
  if (d <= rUmbra) return 0;
  if (d >= rPenumbra) return 1;
  return (d - rUmbra) / (rPenumbra - rUmbra);
}

// The next shadow crossing after a given moment: returns
// { type: "enter" | "exit", jd }. Scans forward one orbit coarsely, then
// sharpens the answer to about a second by bisection.
function nextShadowEvent(moon, jdTdb) {
  const inShadow = (jd) => moonSunlitFraction(moon, jd) < 0.5;
  const state0 = inShadow(jdTdb);
  const step = 2 / 1440;                                 // 2-minute sweep
  let lo = jdTdb;
  for (let jd = jdTdb + step; jd <= jdTdb + moon.periodDays * 1.2; jd += step) {
    if (inShadow(jd) !== state0) {
      let hi = jd;
      for (let i = 0; i < 20; i++) {                     // bisect to ~0.1 s
        const mid = (lo + hi) / 2;
        if (inShadow(mid) === state0) lo = mid; else hi = mid;
      }
      return { type: state0 ? "exit" : "enter", jd: (lo + hi) / 2 };
    }
    lo = jd;
  }
  return null;   // no crossing within a lap (can't happen for these moons)
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
  helioPositionAu,
  earthSaturnDistanceAu,
  lightMinutesToEarth,
  moonSunlitFraction,
  nextShadowEvent,
  PLANETS,
};

if (typeof module !== "undefined" && module.exports) module.exports = Orbit;
if (typeof globalThis !== "undefined") globalThis.Orbit = Orbit;
