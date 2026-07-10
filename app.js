// app.js — the 3D scene. All the astronomy lives in orbit.js; this file only
// draws what orbit.js computes.
//
// Scene units: 1 unit = 1000 km. Saturn's radius is 60.268 units, Pan's orbit
// is 133.584 units. Everything is at true scale EXCEPT Pan itself, which is
// only 34 km long — invisible next to a planet. We draw Pan enlarged by
// PAN_VISUAL_SCALE (its position stays exact) and say so in the corner label.
//
// Axes: three.js "y" is Saturn's north pole. orbit.js works in Saturn's
// equatorial frame (x/y in the ring plane, z = north), so we convert with
// toWorld(): (x, y, z) -> (x, z, -y).

/* global THREE, Orbit */

const KM = 0.001;                 // km -> scene units
const PAN_VISUAL_SCALE = 1;       // TRUE scale: Pan really is a 34 km speck
                                  // beside a 120,536 km planet — click the
                                  // moon names to fly in and find them
const SATURN_EQ_RADIUS = 60268 * KM;
const SATURN_FLATTENING = 54364 / 60268;   // Saturn is visibly squashed
const SATURN_DAY_HOURS = 10.56;

function toWorld(v) {
  return new THREE.Vector3(v.x * KM, v.z * KM, -v.y * KM);
}

// --- Small seeded-noise helpers (so the textures look organic, not random-static)

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D value noise in [0,1]: random values on a grid, cosine-blended.
function makeNoise1D(seed, gridSize) {
  const rand = mulberry32(seed);
  const grid = Array.from({ length: gridSize + 1 }, () => rand());
  return function (t) {
    const x = Math.min(Math.max(t, 0), 1) * gridSize;
    const i = Math.floor(x);
    const f = x - i;
    const s = 0.5 - 0.5 * Math.cos(Math.PI * f);
    return grid[i] * (1 - s) + grid[Math.min(i + 1, gridSize)] * s;
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// --- Renderer / scene / camera ----------------------------------------------

// logarithmicDepthBuffer: the camera must work from 300,000 km out to 30 km
// above a moon — a huge depth range that a plain z-buffer can't hold.
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Far plane reaches past the REAL Earth-Saturn distance (~1.4 million units);
// the logarithmic depth buffer keeps close-ups precise anyway.
const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 0.002, 4e6);

// Floating origin: everything physical lives in this group. Rendering maths
// breaks down a million units from the origin, so we quietly re-anchor the
// world to whichever planet the camera is closest to — shifting the group
// and the camera by the same amount, which is visually a no-op.
const world = new THREE.Group();
scene.add(world);

// --- Sunlight (real direction from orbit.js) --------------------------------

const sunLight = new THREE.DirectionalLight(0xfff3e0, 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -160;
sunLight.shadow.camera.right = 160;
sunLight.shadow.camera.top = 160;
sunLight.shadow.camera.bottom = -160;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 2000;
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.6;
scene.add(sunLight);
scene.add(sunLight.target);

// A whisper of fill light so the night side is not pure void, plus warm
// "Saturn-shine": the planet and rings reflect sunlight onto the moons'
// inward faces, just like earthshine on our own Moon.
scene.add(new THREE.AmbientLight(0x28313e, 0.18));
world.add(new THREE.PointLight(0xc9b990, 0.4, 0, 0));   // glows from Saturn's center

// --- Saturn ------------------------------------------------------------------

// Procedural cloud bands painted onto a canvas: soft latitude stripes in
// Cassini-photo colors, wobbled with noise, plus a few pale storm ovals.
function makeSaturnTexture() {
  const w = 3072, h = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Latitude color stops, north pole (v=0) to south pole (v=1).
  const stops = [
    { v: 0.00, c: [116, 118, 110] },  // muted north polar cap
    { v: 0.08, c: [150, 138, 108] },
    { v: 0.18, c: [190, 168, 122] },
    { v: 0.28, c: [214, 190, 138] },
    { v: 0.38, c: [232, 210, 156] },
    { v: 0.46, c: [242, 224, 172] },  // bright equatorial zone
    { v: 0.54, c: [238, 218, 164] },
    { v: 0.64, c: [216, 190, 136] },
    { v: 0.74, c: [196, 168, 116] },
    { v: 0.86, c: [162, 138, 96]  },
    { v: 1.00, c: [120, 104, 82]  },  // south polar cap
  ];
  function bandColor(v) {
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1].v) i++;
    const a = stops[i], b = stops[i + 1];
    const t = smoothstep(a.v, b.v, v);
    return [0, 1, 2].map(k => a.c[k] + (b.c[k] - a.c[k]) * t);
  }

  const wobble = makeNoise1D(11, 192);    // fine banding wobble
  const wobble2 = makeNoise1D(23, 48);    // broad brightness drift
  const wobble3 = makeNoise1D(29, 420);   // very fine thread-like banding
  const streak = makeNoise1D(37, 256);    // horizontal streakiness
  const streak2 = makeNoise1D(41, 640);   // finer turbulence along the bands

  // Domain warping: turbulent 2D noise nudges the latitude before every
  // band lookup, so band edges wave, curl and shear into each other like
  // real zonal flows instead of running as ruler-straight stripes.
  const swirl = makeNoise2DWrap(61, 12, 6);      // large slow meanders
  const swirl2 = makeNoise2DWrap(62, 90, 45);    // small eddies at band edges

  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const vw = Math.min(1, Math.max(0,
        v + 0.008 * (swirl(u, v) - 0.5) + 0.0025 * (swirl2(u, v) - 0.5)));
      // Band brightness varies with (warped) latitude -> stripe structure.
      const bands =
        0.92 +
        0.10 * (wobble(vw) - 0.5) * 2 +
        0.06 * (wobble2(vw) - 0.5) * 2 +
        0.03 * (wobble3(vw) - 0.5) * 2 +
        0.035 * Math.sin(vw * 145 + wobble(vw) * 9) +
        0.018 * Math.sin(vw * 470 + wobble3(vw) * 14);
      const base = bandColor(vw);
      // Gentle along-band streaks + finer turbulence, a few % amplitude.
      const s =
        1 +
        0.022 * (streak(((u) + wobble(vw)) % 1) - 0.5) * 2 +
        0.012 * (streak2(((u * 3) % 1 + wobble2(vw)) % 1) - 0.5) * 2;
      // The famous north-polar hexagon: a jet stream whose latitude
      // wobbles with cos(6·longitude); slightly darker inside.
      const hexV = 0.052 + 0.007 * Math.cos(6 * 2 * Math.PI * u);
      let hex = 1;
      if (v < hexV) hex = 0.90;                                   // inside: darker
      const dEdge = Math.abs(v - hexV);
      if (dEdge < 0.0035) hex *= 0.82;                            // the jet itself
      // Dark cyclone eyes sitting on both poles, like in Cassini's views.
      if (v < 0.012) hex *= Math.min(1, 0.72 + 24 * v);
      if (v > 0.988) hex *= Math.min(1, 0.72 + 24 * (1 - v));
      // A breath of per-pixel grain so the clouds read as haze, not gradient.
      const grain =
        1 + 0.016 * ((((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1) - 0.5);
      const k = (y * w + x) * 4;
      img.data[k]     = Math.min(255, base[0] * bands * s * hex * grain);
      img.data[k + 1] = Math.min(255, base[1] * bands * s * hex * grain);
      img.data[k + 2] = Math.min(255, base[2] * bands * s * 0.985 * (hex < 1 ? hex * 1.04 : 1) * grain);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // The Great White Spot — Saturn's own recurring mega-storm (Jupiter has
  // the red spot; Saturn answers with this, last seen erupting 2010-11):
  // a bright boiling head with a turbulent wake trailing east around the
  // northern mid-latitudes.
  // The storm rides at ~33°S — Cassini's "Storm Alley", the latitude where
  // Saturn's lightning storms actually cluster (and the hemisphere the app's
  // camera sees best).
  const srand = mulberry32(3);
  const stormV = 0.67, headU = 0.30;
  function oval(su, sv, rx, ry, rgb, a) {
    const gg = ctx.createRadialGradient(su * w, sv * h, 0, su * w, sv * h, rx);
    gg.addColorStop(0, `rgba(${rgb},${a})`);
    gg.addColorStop(0.65, `rgba(${rgb},${a * 0.45})`);
    gg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gg;
    ctx.save();
    ctx.translate(su * w, sv * h); ctx.scale(1, ry / rx); ctx.translate(-su * w, -sv * h);
    ctx.beginPath(); ctx.arc(su * w, sv * h, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // Dark red-brown collar around the head, so the storm pops off the bands...
  oval(headU, stormV, 400 * (w / 3072), 150 * (w / 3072), "104,56,40", 0.55);
  // ...then the boiling bright head itself, in three layers.
  oval(headU, stormV, 280 * (w / 3072), 105 * (w / 3072), "255,252,244", 0.9);
  oval(headU - 0.02, stormV - 0.008, 150 * (w / 3072), 62 * (w / 3072), "255,255,252", 0.95);
  oval(headU + 0.03, stormV + 0.01, 120 * (w / 3072), 48 * (w / 3072), "248,240,225", 0.7);
  // The turbulent wake: alternating bright clumps and red-brown eddies
  // curling east for half the planet, scattering as they age.
  for (let i = 0; i < 64; i++) {
    const t = i / 64;
    const su = (headU + 0.08 + t * 0.5 + 0.016 * (srand() - 0.5)) % 1;
    const sv = stormV + 0.028 * (srand() - 0.5) * (0.35 + t);
    const rx = (85 * (1 - t) + 20) * (w / 3072) * (0.7 + 0.6 * srand());
    const ry = rx * (0.30 + 0.12 * srand());
    if (srand() < 0.6) oval(su, sv, rx, ry, "252,248,238", 0.4 * (1 - t) + 0.06);
    else oval(su, sv, rx * 0.9, ry * 0.8, "112,62,44", 0.30 * (1 - t) + 0.05);
  }
  // A few lone red-brown ovals in the northern temperate band for balance.
  for (let i = 0; i < 5; i++) {
    oval(srand(), 0.24 + srand() * 0.12, (14 + srand() * 22) * (w / 3072),
         (5 + srand() * 8) * (w / 3072), "116,66,46", 0.16 + srand() * 0.10);
  }

  // Pale storm ovals in the temperate bands — more of them, varied sizes.
  const rand = mulberry32(7);
  for (let i = 0; i < 22; i++) {
    const sx = rand() * w;
    const sy = h * (rand() < 0.5 ? 0.18 + rand() * 0.18 : 0.62 + rand() * 0.2);
    const rx = 5 + rand() * 34, ry = rx * (0.22 + rand() * 0.22);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx);
    g.addColorStop(0, "rgba(250, 244, 224, 0.35)");
    g.addColorStop(1, "rgba(250, 244, 224, 0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(sx, sy); ctx.scale(1, ry / rx); ctx.translate(-sx, -sy);
    ctx.beginPath(); ctx.arc(sx, sy, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const saturn = new THREE.Mesh(
  new THREE.SphereGeometry(SATURN_EQ_RADIUS, 224, 160),
  new THREE.MeshStandardMaterial({
    map: makeSaturnTexture(),
    roughness: 0.95,
    metalness: 0,
  })
);
saturn.scale.y = SATURN_FLATTENING;   // the famous squashed profile
saturn.castShadow = true;
saturn.receiveShadow = true;
world.add(saturn);

// A whisper of atmospheric haze just past the limb, so the disk melts into
// space softly instead of ending at a hard computer-graphics edge.
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(SATURN_EQ_RADIUS * 1.014, 96, 64),
  new THREE.MeshBasicMaterial({
    color: 0xe8d9ae,
    transparent: true,
    opacity: 0.14,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
atmosphere.scale.y = SATURN_FLATTENING;
world.add(atmosphere);

// Saturn's clouds, in real photography: a cylindrical map derived from
// actual Cassini spacecraft imagery (Solar System Scope, CC BY 4.0) — the
// soft gold bands of the real planet. The painted procedural clouds above
// stay as the instant fallback — and for file:// opens, where browsers
// refuse to hand local image pixels to WebGL.
const cloudPhoto = new Image();
cloudPhoto.onload = () => {
  const c = document.createElement("canvas");
  c.width = cloudPhoto.width; c.height = cloudPhoto.height;
  const cx = c.getContext("2d");
  cx.drawImage(cloudPhoto, 0, 0);
  try { cx.getImageData(0, 0, 1, 1); } catch (e) {
    console.log("cloud photo tainted; keeping painted clouds");
    return;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  saturn.material.map = tex;
  saturn.material.needsUpdate = true;
  console.log("cloud photo applied");
};
// One quiet retry if the first fetch is interrupted.
let cloudPhotoRetried = false;
cloudPhoto.onerror = () => {
  console.log("cloud photo failed to load" + (cloudPhotoRetried ? "" : "; retrying"));
  if (!cloudPhotoRetried) {
    cloudPhotoRetried = true;
    setTimeout(() => { cloudPhoto.src = "assets/saturn-8k.jpg?retry"; }, 2500);
  }
};
cloudPhoto.src = "assets/saturn-8k.jpg";

// --- The rings ----------------------------------------------------------------
// Real radial structure, in km from Saturn's center:
//   C ring 74,658–91,975 (dusty, translucent)
//   B ring 91,975–117,507 (dense, bright)      Cassini Division 117,507–122,340
//   A ring 122,340–136,780
//     with the ENCKE GAP at 133,410–133,745 — the 325 km lane Pan itself
//     keeps clear — and the thin Keeler Gap at 136,430–136,480.
//   F ring: a lonely thread at ~140,220.

const RING_INNER_KM = 74000, RING_OUTER_KM = 141000;

function ringProfile(rKm) {
  // Returns [alpha, r, g, b] for a radius, before noise banding.
  const edge = (a, b) => smoothstep(a, a + 60, rKm) * (1 - smoothstep(b - 60, b, rKm));
  let alpha = 0;
  let color = [216, 196, 156];

  // C ring — dusty and dark
  const c = edge(74658, 91975);
  if (c > 0) { alpha = Math.max(alpha, c * 0.22); color = [150, 130, 106]; }
  // Maxwell Gap inside the C ring
  alpha *= 1 - edge(87342, 87610);

  // B ring — the bright dense one
  const b = edge(91975, 117507);
  if (b > 0) { alpha = Math.max(alpha, b * 0.96); color = [226, 205, 162]; }

  // Cassini Division — nearly (not totally) empty
  const cd = edge(117507, 122340);
  if (cd > 0) { alpha = Math.max(alpha, cd * 0.07); color = [170, 155, 130]; }

  // A ring — a touch dimmer and cooler than B
  const a = edge(122340, 136780);
  if (a > 0) { alpha = Math.max(alpha, a * 0.62); color = [210, 192, 156]; }

  // Encke Gap (Pan's home) and Keeler Gap: truly empty lanes
  alpha *= 1 - edge(133410, 133745);
  alpha *= 1 - smoothstep(136415, 136430, rKm) * (1 - smoothstep(136480, 136495, rKm));

  // F ring — a narrow bright thread
  const f = Math.exp(-Math.pow((rKm - 140220) / 90, 2));
  if (f > 0.02) { alpha = Math.max(alpha, f * 0.5); color = [232, 224, 205]; }

  return [alpha, color[0], color[1], color[2]];
}

function makeRingTexture() {
  const w = 8192, h = 4;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);

  // Four octaves of radial noise = the fine ringlet banding in photos,
  // down to razor-thin threads.
  const n1 = makeNoise1D(101, 3200);
  const n2 = makeNoise1D(102, 900);
  const n3 = makeNoise1D(103, 260);
  const n4 = makeNoise1D(104, 60);

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    const rKm = RING_INNER_KM + t * (RING_OUTER_KM - RING_INNER_KM);
    let [alpha, r, g, b] = ringProfile(rKm);
    const band =
      0.68 + 0.40 * (0.42 * n1(t) + 0.28 * n2(t) + 0.18 * n3(t) + 0.12 * n4(t));
    alpha = Math.min(1, alpha * band);
    const lum = 0.92 + 0.10 * (n2((t + 0.37) % 1) - 0.5) + 0.06 * (n1((t + 0.11) % 1) - 0.5);
    for (let y = 0; y < h; y++) {
      const k = (y * w + x) * 4;
      img.data[k]     = Math.min(255, r * lum);
      img.data[k + 1] = Math.min(255, g * lum);
      img.data[k + 2] = Math.min(255, b * lum);
      img.data[k + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeRings() {
  const inner = RING_INNER_KM * KM, outer = RING_OUTER_KM * KM;
  const geo = new THREE.RingGeometry(inner, outer, 512, 8);
  // Remap UVs so u runs radially inner->outer; then a 1D strip texture
  // paints perfect circles.
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshStandardMaterial({
    map: makeRingTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
    alphaTest: 0.03,     // lets shadows pass through the gaps
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;   // lay flat in the equator plane
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
world.add(makeRings());

// --- Pan, the ravioli ----------------------------------------------------------
// Built from a sphere whose every vertex is pushed to the surface of Pan's
// real 34.4 x 30.8 x 20.8 km ellipsoid, then raised along the equator to form
// the smooth accretion ridge (the "ravioli seam") seen in Cassini images,
// with a sprinkle of noise so it reads as rock, not math.

// Smooth 2D value noise that wraps around in u (so there is no seam where
// longitude 360° meets 0°).
function makeNoise2DWrap(seed, gw, gh) {
  const rand = mulberry32(seed);
  const grid = [];
  for (let j = 0; j <= gh; j++) {
    const row = Array.from({ length: gw }, () => rand());
    grid.push(row);
  }
  const blend = (f) => 0.5 - 0.5 * Math.cos(Math.PI * f);
  return function (u, v) {
    const x = ((u % 1) + 1) % 1 * gw;
    const y = Math.min(Math.max(v, 0), 1) * gh;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = blend(x - i), fy = blend(y - j);
    const j1 = Math.min(j + 1, gh);
    const a = grid[j][i % gw], b = grid[j][(i + 1) % gw];
    const c = grid[j1][i % gw], e = grid[j1][(i + 1) % gw];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
  };
}

// A close-up surface for the moons: domain-warped dust mottling, a dense
// crater record with bright ejecta, and striations along the equatorial
// ridge — painted at high resolution so nothing looks pixelated. The same
// canvas doubles as a bump map, so all of this catches real light.
function makeMoonTexture(seed) {
  const w = 3072, h = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g1 = makeNoise2DWrap(seed, 20, 10);       // broad tonal patches
  const g2 = makeNoise2DWrap(seed + 1, 90, 45);   // medium mottling
  const g3 = makeNoise2DWrap(seed + 2, 340, 170); // fine dusty grain
  const warp = makeNoise2DWrap(seed + 3, 30, 15); // flow distortion

  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Warped coordinates make the mottling drift and smear like real
      // dust deposits instead of sitting in a neat noise grid.
      const uw = (u + 0.03 * (warp(u, v) - 0.5) + 1) % 1;
      const vv = Math.min(1, Math.max(0, v + 0.03 * (warp(uw, 1 - v) - 0.5)));
      const t =
        0.42 * g1(uw, vv) + 0.33 * g2(uw, vv) + 0.25 * g3((uw * 2) % 1, vv);
      const grain = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
      const base = 206 + 54 * (t - 0.5) * 2 + 8 * (grain - 0.5);
      const k = (y * w + x) * 4;
      img.data[k]     = Math.min(255, base);
      img.data[k + 1] = Math.min(255, base * 0.99);
      img.data[k + 2] = Math.min(255, base * 0.965);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rand = mulberry32(seed + 9);

  // A dense crater record — dust-softened dimples in many sizes, the larger
  // ones with a bright ejecta ring, a few overlapping like real terrain.
  for (let i = 0; i < 170; i++) {
    const cx = rand() * w, cy = h * (0.08 + rand() * 0.84);
    const cr = 2.5 + Math.pow(rand(), 2.2) * 44;
    const depth = 0.10 + rand() * 0.12;
    let g = ctx.createRadialGradient(cx, cy, cr * 0.15, cx, cy, cr);
    g.addColorStop(0, `rgba(66,60,54,${depth})`);
    g.addColorStop(0.7, `rgba(66,60,54,${depth * 0.35})`);
    g.addColorStop(1, "rgba(66,60,54,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
    if (cr > 12) {
      g = ctx.createRadialGradient(cx, cy, cr * 0.8, cx, cy, cr * 1.25);
      g.addColorStop(0, "rgba(255,250,240,0)");
      g.addColorStop(0.5, `rgba(255,250,240,${0.06 + rand() * 0.08})`);
      g.addColorStop(1, "rgba(255,250,240,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, cr * 1.25, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Striations along the equatorial ridge: faint grooves where ring dust
  // rained onto the seam, like in the sharpest Cassini frames of Pan.
  ctx.lineCap = "round";
  for (let i = 0; i < 30; i++) {
    const y0 = h * (0.5 + (rand() - 0.5) * 0.13);
    const x0 = rand() * w;
    const len = w * (0.02 + rand() * 0.07);
    const slope = (rand() - 0.5) * 6;
    ctx.strokeStyle = rand() < 0.5
      ? `rgba(60,55,50,${0.06 + rand() * 0.07})`
      : `rgba(250,245,235,${0.05 + rand() * 0.06})`;
    ctx.lineWidth = 1.5 + rand() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + len, y0 + slope);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeMoonGeometry(def, seed) {
  const R = def.radiiKm;
  const geo = new THREE.SphereGeometry(1, 224, 168);   // dense = smooth silhouette
  const pos = geo.attributes.position;
  const ridgeNoise = makeNoise2DWrap(seed, 24, 1);      // unevenness of the ridge
  const hills = makeNoise2DWrap(seed + 1, 10, 6);       // broad, soft terrain
  const detail = makeNoise2DWrap(seed + 2, 36, 18);     // finer texture
  const detail2 = makeNoise2DWrap(seed + 3, 100, 50);   // finest surface shimmer
  const colors = new Float32Array(pos.count * 3);
  const lumpScale = R.long / 17.2;   // smaller moons get shallower terrain

  for (let i = 0; i < pos.count; i++) {
    const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const lat = Math.asin(d.y);                   // 0 at the equator
    const lon = Math.atan2(d.z, d.x);
    const u = (lon / Math.PI + 1) / 2;            // 0..1 around the equator
    const v = lat / Math.PI + 0.5;                // 0..1 pole to pole

    // Distance to the ellipsoid surface along this direction.
    const rEllipsoid = 1 / Math.sqrt(
      (d.x / R.long) ** 2 + (d.y / R.polar) ** 2 + (d.z / R.mid) ** 2);

    // The equatorial ridge: the smooth welt of swept-up ring dust hugging
    // latitude 0 (Pan's ravioli seam, Atlas's flying-saucer brim),
    // slightly uneven around the circumference like the real ones.
    const ridgeShape = Math.exp(-((lat / 0.19) ** 2));
    const ridge = def.ridgeKm * (0.85 + 0.3 * (ridgeNoise(u, 0.5) - 0.5)) * ridgeShape;

    // Low, soft terrain everywhere (a few hundred meters), fading at the
    // poles so the mesh seam stays sealed. These moons are smooth — they
    // are coated in fine ring dust — so no sharp features.
    const lump =
      (0.55 * (hills(u, v) - 0.5) + 0.25 * (detail(u, v) - 0.5) +
       0.10 * (detail2(u, v) - 0.5)) *
      Math.cos(lat) * lumpScale;

    const r = rEllipsoid + ridge + lump;
    pos.setXYZ(i, d.x * r, d.y * r, d.z * r);     // km, scaled to units below

    // The ridge is visibly brighter than the body in Cassini photos
    // (cleaner ice dust); tint the vertices accordingly.
    // (the mottling fades at the poles, like the terrain, to avoid streaks)
    const tone =
      0.86 + 0.13 * ridgeShape + 0.05 * (detail(u, v) - 0.5) * Math.cos(lat);
    colors[i * 3] = tone;
    colors[i * 3 + 1] = tone * 0.995;
    colors[i * 3 + 2] = tone * 0.975;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeMoonMesh(def, seed) {
  const surface = makeMoonTexture(seed + 7);
  const mesh = new THREE.Mesh(
    makeMoonGeometry(def, seed),
    new THREE.MeshStandardMaterial({
      map: surface,
      // The same texture as a bump map: craters and grooves catch the
      // sunlight in real relief when you fly in close. The strength scales
      // with the moon's rendered size (in units, a true-scale moon is tiny).
      bumpMap: surface,
      bumpScale: 0.0002 * PAN_VISUAL_SCALE,
      color: 0xf4efe6,
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
    })
  );
  mesh.scale.setScalar(KM * PAN_VISUAL_SCALE);
  mesh.castShadow = true;
  // No receiveShadow: these moons sit exactly in the ring plane, so the
  // paper-thin ring shadow grazes them and covers them in shadow-map acne.
  mesh.receiveShadow = false;
  world.add(mesh);
  return mesh;
}

// Two ravioli: Pan and Atlas, each at its true position. (Daphnis' orbit
// data is still in orbit.js, but NASA's ephemeris for it ended with the
// Cassini mission, so we keep the scene to the two moons we know exactly.)
const moons = {
  pan: makeMoonMesh(Orbit.MOONS.pan, 51),
  atlas: makeMoonMesh(Orbit.MOONS.atlas, 111),
};
const pan = moons.pan;   // the headline moon
const MOON_BASE_COLOR = new THREE.Color(0xf4efe6);

// A whisper-quiet floating name beside each moon, so you know who is who.
function makeMoonLabel(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.font = "300 44px 'SF Mono', Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(text, 256, 76);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    depthTest: false,   // the name stays readable even behind the rings
  }));
  return sprite;
}
const labels = {};
for (const key of Object.keys(moons)) {
  labels[key] = makeMoonLabel(key);
  labels[key].userData.moon = key;
  moons[key].userData.moon = key;
  world.add(labels[key]);
}

// A soft halo so you can find the little one from far away.
// It quietly fades out as you get close.
function makeHalo() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, "rgba(255,255,255,0)");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  g.addColorStop(0.62, "rgba(255,255,255,0.55)");
  g.addColorStop(0.70, "rgba(255,255,255,0)");
  g.addColorStop(1.00, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const mat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Sprite(mat);
}
const halo = makeHalo();
world.add(halo);

// --- Easter egg: sorkthropic's koala, out for a jog around Pan -------------------
// (the ASCII koala from the profile README, painted onto a tiny billboard;
// it only appears once you fly in close to Pan)
function makeKoalaSprite() {
  const lines = [
    '     .-"-.       .-"-.',
    "    /     \\.---./     \\",
    "   ;                   ;",
    "   :     o       o     :",
    "    \\ ~     (_)     ~ /",
    "     ;    '.___.'    ;",
    "      \\             /",
    "       '-..____..-'",
  ];
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.font = "13px Menlo, monospace";
  // Dark pass then light pass = readable on both the day and night side.
  ctx.fillStyle = "rgba(20, 24, 28, 0.9)";
  lines.forEach((ln, i) => ctx.fillText(ln, 31, 23 + i * 13));
  ctx.fillStyle = "#e8edf2";
  lines.forEach((ln, i) => ctx.fillText(ln, 30, 22 + i * 13));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
  }));
  // Sized in km because it rides inside Pan's mesh (which is scaled to units).
  sprite.scale.set(3.5, 1.75, 1);
  return sprite;
}
const koala = makeKoalaSprite();
koala.visible = false;
pan.add(koala);
let koalaLap = 0;   // how far around Pan's equator the koala has jogged

function updateKoala(dt, nowMs, camDistToPan) {
  koala.visible = camDistToPan < 0.5;  // a secret for close visitors only
  if (!koala.visible) return;
  koalaLap += dt * 0.3;                // one lap of Pan every ~20 s
  const R = Orbit.PAN.radiiKm;
  const rEq = 1 / Math.hypot(Math.cos(koalaLap) / R.long, Math.sin(koalaLap) / R.mid);
  const hop = 0.3 * Math.abs(Math.sin(nowMs * 0.006));       // happy little hops
  const r = rEq + Orbit.PAN.ridgeKm + 1.0 + hop;
  koala.position.set(Math.cos(koalaLap) * r, 0, Math.sin(koalaLap) * r);
}

// Whisper-faint circle marking the orbit itself.
function makeOrbitLine() {
  const pts = [];
  const r = Orbit.PAN.orbitRadiusKm * KM;
  for (let i = 0; i <= 512; i++) {
    const a = (i / 512) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.07 })
  );
}
world.add(makeOrbitLine());

// --- Stars ----------------------------------------------------------------------

function makeStars() {
  const rand = mulberry32(2026);
  const group = new THREE.Group();

  function cloud(count, sizePx, milkyWay) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // The Milky Way band lies along a randomly tilted great circle.
    const bandAxis = new THREE.Vector3(0.41, 0.82, 0.4).normalize();
    for (let i = 0; i < count; i++) {
      let dir;
      do {
        dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      } while (dir.lengthSq() > 1 || dir.lengthSq() < 1e-4);
      dir.normalize();
      if (milkyWay) {
        // Pull the star toward the band plane.
        const off = bandAxis.clone().multiplyScalar(dir.dot(bandAxis) * 0.86);
        dir.sub(off).normalize();
      }
      positions.set([dir.x * 9000, dir.y * 9000, dir.z * 9000], i * 3);
      const mag = Math.pow(rand(), milkyWay ? 3.2 : 2.2);      // most stars faint
      const warm = rand();
      colors.set([
        (0.55 + 0.45 * warm) * mag + (milkyWay ? 0.02 : 0),
        (0.6 + 0.32 * warm) * mag + (milkyWay ? 0.02 : 0),
        (0.7 + 0.3 * (1 - warm)) * mag + (milkyWay ? 0.03 : 0),
      ], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: sizePx,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,   // faint stars brighten, never darken
    });
    group.add(new THREE.Points(geo, mat));
  }

  cloud(2600, 1.4, false);   // the sky
  cloud(140, 2.6, false);    // a handful of bright ones
  cloud(2200, 1.1, true);    // the Milky Way dust of faint stars
  return group;
}
const stars = makeStars();
scene.add(stars);   // the sky stays centred on the camera, wherever it roams

// --- Earth: home, 9.4 au away --------------------------------------------------
// Earth sits in its REAL direction as seen from Saturn (computed from both
// planets' heliocentric orbits — it always hangs within ~6 degrees of the
// Sun from out here), at its REAL distance: about 1.4 billion km today.
// The floating origin (see below) keeps the renderer's floating point
// healthy across that gulf.

const EARTH_RADIUS_UNITS = 6371 * KM;      // true scale: 6,371 km
const EARTH_SCENE_DIST =
  Orbit.earthSaturnDistanceAu(Orbit.jdTdbFromDate(new Date())) * 149597870.7 * KM;

function earthDirectionWorld(jdTdb) {
  const e = Orbit.helioPositionAu(Orbit.PLANETS.earth, jdTdb);
  const s = Orbit.helioPositionAu(Orbit.PLANETS.saturn, jdTdb);
  // Angle Sun -> Saturn -> Earth around the ecliptic pole...
  const aSun = Math.atan2(-s.y, -s.x);
  const aEarth = Math.atan2(e.y - s.y, e.x - s.x);
  let dAz = aEarth - aSun;
  if (dAz > Math.PI) dAz -= 2 * Math.PI;
  if (dAz < -Math.PI) dAz += 2 * Math.PI;
  // ...applied as an offset to the (exact) Sun direction in the ring frame.
  const sun = Orbit.sunDirection(jdTdb);
  const c = Math.cos(dAz), n = Math.sin(dAz);
  return toWorld({ x: sun.x * c - sun.y * n, y: sun.x * n + sun.y * c, z: sun.z })
    .normalize();
}

const earthGroup = new THREE.Group();
earthGroup.position.copy(
  earthDirectionWorld(Orbit.jdTdbFromDate(new Date())).multiplyScalar(EARTH_SCENE_DIST));
world.add(earthGroup);

// A quiet blue placeholder; the real 8K photographic day-map fades in on load.
function makeEarthFallbackTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 32;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, "#b8c8d8"); g.addColorStop(0.2, "#2c5d8f");
  g.addColorStop(0.5, "#1d4e86"); g.addColorStop(0.8, "#2c5d8f");
  g.addColorStop(1, "#c8d4e0");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS_UNITS, 128, 96),
  new THREE.MeshStandardMaterial({
    map: makeEarthFallbackTexture(),
    roughness: 0.85,
    metalness: 0,
  })
);
earth.userData.moon = "earth";
earthGroup.add(earth);

// The pale blue breath of atmosphere past the limb.
const earthAtmo = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS_UNITS * 1.025, 64, 48),
  new THREE.MeshBasicMaterial({
    color: 0x88b8f0,
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
earthGroup.add(earthAtmo);

// The real NASA Blue Marble day map, 8K so the continents stay crisp.
const earthPhoto = new Image();
earthPhoto.onload = () => {
  const c = document.createElement("canvas");
  c.width = earthPhoto.width; c.height = earthPhoto.height;
  const cx = c.getContext("2d");
  cx.drawImage(earthPhoto, 0, 0);
  try { cx.getImageData(0, 0, 1, 1); } catch (e) { return; }  // tainted: keep fallback
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  earth.material.map = tex;
  earth.material.needsUpdate = true;
};
earthPhoto.src = "assets/earth-8k.jpg";

// Tegel, Berlin: 52.5588 N, 13.2884 E — a pin and a whisper of a name,
// riding on the rotating globe.
function latLonToLocal(latDeg, lonDeg, r) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(-lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(-lon));
}
function makeDotSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true, depthWrite: false,
  }));
}
const tegelDot = makeDotSprite();
tegelDot.position.copy(latLonToLocal(52.5588, 13.2884, EARTH_RADIUS_UNITS * 1.004));
tegelDot.scale.setScalar(0.22);
earth.add(tegelDot);
const tegelLabel = makeMoonLabel("tegel · berlin");
tegelLabel.position.copy(latLonToLocal(52.5588, 13.2884, EARTH_RADIUS_UNITS * 1.09));
// Unlike the moon beacons, a place on a globe should hide when it rotates
// to the far side — so the pin and its name respect depth.
tegelLabel.material.depthTest = true;
earth.add(tegelLabel);

// Big-realm labels: "earth" seen from Saturn, "saturn" seen from Earth.
labels.earth = makeMoonLabel("earth");
labels.earth.userData.moon = "earth";
world.add(labels.earth);
labels.saturn = makeMoonLabel("saturn");
labels.saturn.userData.moon = "saturn";
world.add(labels.saturn);

// From Earth, Saturn is truly a bright star-like point — its disk spans
// ~18 arcseconds, far below one pixel. This small glow is its honest
// naked-eye appearance in Earth's sky, sitting exactly where Saturn is.
const saturnBeacon = makeDotSprite();
saturnBeacon.material.opacity = 0;
saturnBeacon.userData.moon = "saturn";
world.add(saturnBeacon);

// --- Floating origin --------------------------------------------------------------
// Shift the whole world — and the camera with it, so nothing visibly moves —
// to keep whichever planet is nearby at the origin, where floats are precise.
// The far planet wobbles by a few hundred km, which at 9.4 au is far below
// a pixel.
let anchoredToEarth = false;
function setAnchor(toEarth) {
  if (toEarth === anchoredToEarth) return;
  const newPos = toEarth
    ? earthGroup.position.clone().negate()
    : new THREE.Vector3(0, 0, 0);
  const delta = newPos.clone().sub(world.position);
  world.position.copy(newPos);
  camera.position.add(delta);
  view.target.add(delta);
  flight.start.add(delta);
  anchoredToEarth = toEarth;
}

// --- Camera controls: drag to orbit, scroll to zoom, double-click to hop moons ---

// Each stop on the double-click tour: what to look at, how close to swoop in,
// and how close the scroll wheel may go.
// True-scale close-ups: the camera parks ~120-140 km from a ~35 km moon.
const TOUR = {
  saturn: { radius: 330, minR: 75 },
  pan: { radius: 0.12, minR: 0.035 },
  atlas: { radius: 0.14, minR: 0.04 },
  earth: { radius: 25, minR: 7.6 },
};
const TOUR_ORDER = ["saturn", "pan", "atlas", "earth"];

// Where the camera should look for a given stop, at a given moment —
// in scene coordinates (i.e. including the floating-origin shift).
function modeTarget(mode, jdTdb) {
  if (mode === "saturn") return world.position.clone();
  if (mode === "earth") return earthGroup.position.clone().add(world.position);
  return toWorld(Orbit.moonPositionKm(Orbit.MOONS[mode], jdTdb)).add(world.position);
}

// Crossing between the Saturn realm and Earth is a real journey — see the
// flight block near the main loop.
function goTo(key) {
  view.lastInteraction = performance.now();
  const crossingRealms = (key === "earth") !== (view.mode === "earth");
  if (crossingRealms) { startFlight(key); return; }
  view.mode = key;
  view.desiredRadius = TOUR[key].radius;
}

// Open with ?view=pan (or atlas) to start there (bookmarkable).
// &r=<units> overrides the starting camera distance (handy for debugging).
const startParams = new URLSearchParams(location.search);
const startView = startParams.get("view");
const startMode = TOUR[startView] ? startView : "saturn";
const startRadius = parseFloat(startParams.get("r")) || TOUR[startMode].radius;
const view = {
  mode: startMode,
  theta: -0.55,                         // horizontal angle — starts sun-side,
                                        // so Saturn opens nearly fully lit
  phi: 1.83,                           // vertical angle (slightly below the
                                        // rings — that's the sunlit side now)
  radius: startRadius,
  desiredRadius: startRadius,
  target: new THREE.Vector3(0, 0, 0),   // what the camera looks at
  lastPointer: null,
  lastInteraction: performance.now(),
};
// Starting directly at a moon (or Earth)? Skip the glide and begin there.
if (view.mode !== "saturn") {
  view.target.copy(modeTarget(view.mode, Orbit.jdTdbFromDate(new Date())));
}

renderer.domElement.addEventListener("pointerdown", (e) => {
  view.lastPointer = { x: e.clientX, y: e.clientY };
  view.lastInteraction = performance.now();
});
window.addEventListener("pointermove", (e) => {
  if (!view.lastPointer) return;
  const dx = e.clientX - view.lastPointer.x;
  const dy = e.clientY - view.lastPointer.y;
  view.lastPointer = { x: e.clientX, y: e.clientY };
  view.theta -= dx * 0.009;
  view.phi = Math.min(Math.PI - 0.05, Math.max(0.05, view.phi - dy * 0.009));
  view.lastInteraction = performance.now();
});
window.addEventListener("pointerup", () => { view.lastPointer = null; });
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (flight.active) return;
  view.desiredRadius = Math.min(3000,
    Math.max(TOUR[view.mode].minR, view.desiredRadius * Math.exp(e.deltaY * 0.0022)));
  view.lastInteraction = performance.now();
}, { passive: false });
renderer.domElement.addEventListener("dblclick", () => {
  if (flight.active) return;
  goTo(TOUR_ORDER[(TOUR_ORDER.indexOf(view.mode) + 1) % TOUR_ORDER.length]);
});

// Click a moon's name (or the moon itself) to fly straight to it.
const raycaster = new THREE.Raycaster();
let pressAt = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  pressAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("click", (e) => {
  if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 6) return; // that was a drag
  if (flight.active) { hurryFlight(); return; }    // mid-journey click = step on it
  raycaster.setFromCamera(new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1), camera);
  const hit = raycaster.intersectObjects(
    [labels.pan, labels.atlas, labels.earth, labels.saturn, moons.pan, moons.atlas, earth],
    false)[0];
  if (!hit) return;
  goTo(hit.object.userData.moon);
});

// --- The journey home: Saturn <-> Earth at 80x the speed of light ----------------
// The real distance is what it is (about 78 light-minutes today), so at 80c
// the crossing honestly takes about a minute. The corner line reports live
// superluminal speed and the light-minutes still ahead; a click hurries the
// engine tenfold.
const flight = {
  active: false, dest: null,
  start: new THREE.Vector3(),
  t0: 0, durS: 0, lightMin: 0,
};
function startFlight(destKey) {
  flight.active = true;
  flight.dest = destKey;
  flight.start.copy(camera.position);
  flight.lightMin = Orbit.lightMinutesToEarth(Orbit.jdTdbFromDate(new Date()));
  flight.durS = flight.lightMin * 60 / 80;            // 80c
  flight.t0 = performance.now();
}
function hurryFlight() {
  const p = Math.min(1, (performance.now() - flight.t0) / 1000 / flight.durS);
  flight.durS /= 10;                                   // ~800c
  flight.t0 = performance.now() - p * flight.durS * 1000;
}

// --- Time warp: ← → to fly through time, space to snap back to now ---------------
// The scene normally runs on the real clock. Warping multiplies time so you
// can watch the moons actually race around their lanes (Pan's real lap takes
// 13.8 hours — patience is a virtue, warp is a feature).

const WARP_LEVELS = [-86400, -21600, -3600, -600, -60, 1, 60, 600, 3600, 21600, 86400];
const warp = { idx: WARP_LEVELS.indexOf(1), simMs: Date.now() };
const isLive = () => WARP_LEVELS[warp.idx] === 1;

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") warp.idx = Math.min(WARP_LEVELS.length - 1, warp.idx + 1);
  else if (e.key === "ArrowLeft") warp.idx = Math.max(0, warp.idx - 1);
  else if (e.key === " " || e.key === "0") warp.idx = WARP_LEVELS.indexOf(1);
  else if (e.key === "m") toggleMusic();
  else return;
  if (isLive()) warp.simMs = Date.now();   // snapping back = exactly now
  e.preventDefault();
});

// --- Soundtrack -------------------------------------------------------------------

// Open with ?silent to start with no soundtrack at all.
const SILENT = new URLSearchParams(location.search).has("silent");
const music = SILENT ? null : new Audio("assets/02-zf-archa-97.mp3");
if (music) { music.loop = true; music.volume = 0.55; }
let musicWanted = !SILENT;
const musicEl = document.getElementById("music");

function updateMusicEl() {
  musicEl.style.opacity = musicWanted ? 0.6 : 0.18;
}
function tryPlayMusic() {
  if (music && musicWanted) music.play().catch(() => {}); // browsers may want a click first
}
function toggleMusic() {
  if (!music) return;
  musicWanted = !musicWanted;
  if (musicWanted) tryPlayMusic(); else music.pause();
  updateMusicEl();
}
musicEl.addEventListener("click", (e) => { e.stopPropagation(); toggleMusic(); });
window.addEventListener("pointerdown", tryPlayMusic);
window.addEventListener("keydown", tryPlayMusic);
tryPlayMusic();   // start immediately if the browser allows autoplay
updateMusicEl();

// The landing veil (index.html only): the scene and music are already live
// behind it; the enter button just lifts the veil — and, being a click,
// guarantees the soundtrack starts even in strict browsers.
const landing = document.getElementById("landing");
if (landing) {
  document.getElementById("enterBtn").addEventListener("click", () => {
    tryPlayMusic();
    landing.classList.add("lifted");
    view.lastInteraction = performance.now();
  });
}

// --- HUD -------------------------------------------------------------------------

const hudTime = document.getElementById("hud-time");
const hudLon = document.getElementById("hud-lon");
const hudExtra = document.getElementById("hud-extra");
const hint = document.getElementById("hint");
setTimeout(() => hint.classList.add("faded"), 12000);

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function updateHud(now, jd) {
  const rate = WARP_LEVELS[warp.idx];
  const p = (n) => String(n).padStart(2, "0");
  hudTime.textContent =
    `${p(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}` +
    (isLive() ? "" : `  ·  warp ×${rate > 0 ? rate : "−" + -rate}`);
  hudLon.textContent =
    `pan ${Orbit.moonLongitudeDeg(Orbit.MOONS.pan, jd).toFixed(1)}° · ` +
    `atlas ${Orbit.moonLongitudeDeg(Orbit.MOONS.atlas, jd).toFixed(1)}° · ` +
    `true scale`;

  // Third line: mid-flight it narrates the journey; otherwise Pan's next
  // real shadow crossing + live light-time to Earth.
  if (flight.active) {
    const p = Math.min(1, (performance.now() - flight.t0) / 1000 / flight.durS);
    const speedC = flight.lightMin * 60 * 6 * p * (1 - p) / flight.durS;
    const aheadMin = (1 - p * p * (3 - 2 * p)) * flight.lightMin;
    hudExtra.textContent =
      `en route to ${flight.dest} · ${Math.max(1, Math.round(speedC))}c · ` +
      `${aheadMin.toFixed(1)} light-min ahead · click to hurry`;
    return;
  }
  const ev = panShadowEvent(jd);
  const eclipse = !ev ? "" : ev.type === "enter"
    ? `pan eclipse in ${fmtDur(ev.jd - jd)}`
    : `pan in saturn's shadow · sunrise in ${fmtDur(ev.jd - jd)}`;
  hudExtra.textContent =
    `${eclipse} · light to earth ${Orbit.lightMinutesToEarth(jd).toFixed(1)} min`;
}

// Predicting the shadow crossing costs a sweep of the orbit, so cache it and
// only recompute when it has passed (or after a big time-warp jump).
let shadowCache = { atJd: -1e9, event: null };
function panShadowEvent(jd) {
  if (!shadowCache.event || jd >= shadowCache.event.jd ||
      Math.abs(jd - shadowCache.atJd) > 0.05) {
    shadowCache = { atJd: jd, event: Orbit.nextShadowEvent(Orbit.MOONS.pan, jd) };
  }
  return shadowCache.event;
}

// "0.113 days" -> "2h 43m"
function fmtDur(days) {
  const m = Math.max(0, Math.round(days * 1440));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

// --- Main loop ---------------------------------------------------------------------

// The planet's rotational phase is arbitrary (a gas giant has no fixed
// surface meridian to be faithful to), so we choose it so that the big
// storm faces the camera when the app opens, dead center on the sunlit
// disk. From then on it rotates at the true 10.56 h rate.
function phaseToFace(stormU) {
  const jd0 = Orbit.jdTdbFromDate(new Date());
  const spin0 = ((jd0 - Orbit.PAN.epochJdTdb) * 24 / SATURN_DAY_HOURS) * Math.PI * 2;
  // Texture u maps to azimuth (PI - 2*PI*u); rotation.y subtracts from it.
  const stormWorldAngle = Math.PI - 2 * Math.PI * stormU;
  const faceAngle = -0.55;
  return stormWorldAngle - faceAngle - spin0;
}
let saturnPhase = phaseToFace(0.33);   // the painted storm's longitude

let lastFrame = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastFrame) / 1000, 0.1);
  lastFrame = nowMs;

  // The clock drives everything: the real one, or the warped one.
  if (isLive()) warp.simMs = Date.now();
  else warp.simMs += dt * 1000 * WARP_LEVELS[warp.idx];
  const now = new Date(warp.simMs);
  const jd = Orbit.jdTdbFromDate(now);

  // Floating origin: anchor the world to whichever planet is nearer, and
  // keep the sky's star sphere centred on the camera.
  setAnchor(
    camera.position.distanceTo(earthGroup.position.clone().add(world.position)) <
    camera.position.distanceTo(world.position));
  const camLocal = camera.position.clone().sub(world.position);
  stars.position.copy(camera.position);

  // Every moon at its exact position (the whole point of the app),
  // tidally locked so its long axis always points at Saturn.
  for (const [key, mesh] of Object.entries(moons)) {
    const def = Orbit.MOONS[key];
    mesh.position.copy(toWorld(Orbit.moonPositionKm(def, jd)));
    mesh.rotation.y = Orbit.moonLongitudeDeg(def, jd) * Math.PI / 180 + Math.PI;
    // Real eclipses: every 13.8 h lap the moon crosses Saturn's shadow cone
    // and truly goes dark (soft penumbra included). A sliver of light stays —
    // starlight and the sunlit rings still glow faintly.
    const lit = Orbit.moonSunlitFraction(def, jd);
    mesh.material.color.copy(MOON_BASE_COLOR).multiplyScalar(0.12 + 0.88 * lit);
    if (key === "pan") koala.material.color.setScalar(0.25 + 0.75 * lit);
    // The name floats above its moon — big and readable from any distance
    // (at true scale it's the only way to find a 34 km speck), fading away
    // once you've flown in close.
    const label = labels[key];
    const d = camLocal.distanceTo(mesh.position);
    label.position.copy(mesh.position);
    label.position.y += def.radiiKm.polar * KM * PAN_VISUAL_SCALE + d * 0.03;
    label.scale.set(d * 0.09, d * 0.0225, 1);
    label.material.opacity = 0.55 * smoothstep(0.18, 0.9, d);
  }

  // Halo hugs Pan, sized for the current distance, fading when you're close.
  const camDistToPan = camLocal.distanceTo(pan.position);
  halo.position.copy(pan.position);
  halo.scale.setScalar(Math.max(2.5, camDistToPan * 0.035));
  halo.material.opacity =
    (0.30 + 0.12 * Math.sin(nowMs * 0.002)) * smoothstep(12, 60, camDistToPan);

  updateKoala(dt, nowMs, camDistToPan);

  // Sun where it really is; Saturn spins at its real 10.56 h rate.
  const sunDir = toWorld(Orbit.sunDirection(jd)).normalize();
  sunLight.position.copy(sunDir.multiplyScalar(900));
  saturn.rotation.y =
    saturnPhase + ((jd - Orbit.PAN.epochJdTdb) * 24 / SATURN_DAY_HOURS) * Math.PI * 2;

  // Earth: real spin — the day side faces the Sun exactly as the UTC clock
  // says it should (so Berlin is sunlit when Berlin is sunlit).
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const subsolarLonDeg = (12 - utcH) * 15;
  const sunAzWorld = Math.atan2(sunDir.z, sunDir.x);
  earth.rotation.y = -subsolarLonDeg * Math.PI / 180 - sunAzWorld;

  // Realm-aware labels: moon names live near Saturn, "saturn" appears once
  // you've left for Earth, "earth" hangs where home is. Tegel's pin only
  // whispers when you're close enough to care.
  const camToSaturn = camLocal.length();
  const camToEarth = camLocal.distanceTo(earthGroup.position);
  const saturnRealm = 1 - smoothstep(2000, 4500, camToSaturn);
  for (const key of Object.keys(moons)) labels[key].material.opacity *= saturnRealm;
  halo.material.opacity *= saturnRealm;
  labels.earth.position.copy(earthGroup.position);
  labels.earth.position.y += camToEarth * 0.03;
  labels.earth.scale.set(camToEarth * 0.09, camToEarth * 0.0225, 1);
  labels.earth.material.opacity = 0.55 * smoothstep(60, 300, camToEarth);
  labels.saturn.position.set(0, camToSaturn * 0.03, 0);
  labels.saturn.scale.set(camToSaturn * 0.09, camToSaturn * 0.0225, 1);
  labels.saturn.material.opacity = 0.55 * (1 - saturnRealm);
  // Saturn's honest naked-eye self: a bright star-like point in Earth's sky
  // (the planet's real disk is far below one pixel from 9.4 au away).
  saturnBeacon.scale.setScalar(camToSaturn * 0.006);
  saturnBeacon.material.opacity = 0.95 * (1 - saturnRealm);
  const tegelNear = smoothstep(120, 40, camToEarth);   // fades IN as you approach
  tegelDot.material.opacity = tegelNear;
  tegelLabel.material.opacity = 0.7 * tegelNear;
  tegelLabel.scale.set(camToEarth * 0.09, camToEarth * 0.0225, 1);

  if (flight.active) {
    // --- Mid-journey: 80c toward the destination ------------------------------
    const p = Math.min(1, (nowMs - flight.t0) / 1000 / flight.durS);
    const eased = p * p * (3 - 2 * p);
    const destT = modeTarget(flight.dest, jd);
    const arrive = flight.start.clone().sub(destT).normalize()
      .multiplyScalar(TOUR[flight.dest].radius).add(destT);
    camera.position.lerpVectors(flight.start, arrive, eased);
    camera.lookAt(destT);
    if (p >= 1) {
      // Touchdown: hand the controls back, aimed where we arrived.
      flight.active = false;
      view.mode = flight.dest;
      view.target.copy(destT);
      view.radius = view.desiredRadius = TOUR[flight.dest].radius;
      const off = camera.position.clone().sub(destT);
      view.theta = Math.atan2(off.z, off.x);
      view.phi = Math.acos(Math.min(1, Math.max(-1, off.y / off.length())));
      view.lastInteraction = performance.now();
    }
  } else {
    // Camera: smooth glide toward where it wants to be.
    const targetGoal = modeTarget(view.mode, jd);
    const glide = 1 - Math.exp(-dt * 7);
    view.target.lerp(targetGoal, glide);
    // Once we're near a moon, lock on hard — it is a moving target (Pan
    // covers ~17 km every second) and any lag leaves it off-frame.
    if (view.mode !== "saturn" && view.target.distanceTo(targetGoal) < 0.5) {
      view.target.copy(targetGoal);
    }
    view.radius += (view.desiredRadius - view.radius) * glide;
    if (nowMs - view.lastInteraction > 10000) view.theta += dt * 0.012; // idle drift

    camera.position.set(
      view.target.x + view.radius * Math.sin(view.phi) * Math.cos(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * Math.sin(view.phi) * Math.sin(view.theta)
    );
    camera.lookAt(view.target);
  }

  updateHud(now, jd);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
