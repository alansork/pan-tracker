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
const PAN_VISUAL_SCALE = 60;      // Pan drawn 60x its true size (see above)
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 0.05, 20000);

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
scene.add(new THREE.PointLight(0xc9b990, 0.4, 0, 0));   // glows from Saturn's center

// --- Saturn ------------------------------------------------------------------

// Procedural cloud bands painted onto a canvas: soft latitude stripes in
// Cassini-photo colors, wobbled with noise, plus a few pale storm ovals.
function makeSaturnTexture() {
  const w = 2048, h = 1024;
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

  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    // Band brightness varies with latitude noise -> visible stripe structure.
    const bands =
      0.92 +
      0.10 * (wobble(v) - 0.5) * 2 +
      0.06 * (wobble2(v) - 0.5) * 2 +
      0.03 * (wobble3(v) - 0.5) * 2 +
      0.035 * Math.sin(v * 145 + wobble(v) * 9) +
      0.018 * Math.sin(v * 470 + wobble3(v) * 14);
    const base = bandColor(v);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Gentle along-band streaks + finer turbulence, a few % amplitude.
      const s =
        1 +
        0.022 * (streak(((u) + wobble(v)) % 1) - 0.5) * 2 +
        0.012 * (streak2(((u * 3) % 1 + wobble2(v)) % 1) - 0.5) * 2;
      // The famous north-polar hexagon: a jet stream whose latitude
      // wobbles with cos(6·longitude); slightly darker inside.
      const hexV = 0.052 + 0.007 * Math.cos(6 * 2 * Math.PI * u);
      let hex = 1;
      if (v < hexV) hex = 0.90;                                   // inside: darker
      const dEdge = Math.abs(v - hexV);
      if (dEdge < 0.0035) hex *= 0.82;                            // the jet itself
      const k = (y * w + x) * 4;
      img.data[k]     = Math.min(255, base[0] * bands * s * hex);
      img.data[k + 1] = Math.min(255, base[1] * bands * s * hex);
      img.data[k + 2] = Math.min(255, base[2] * bands * s * 0.985 * (hex < 1 ? hex * 1.04 : 1));
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

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
  new THREE.SphereGeometry(SATURN_EQ_RADIUS, 128, 96),
  new THREE.MeshStandardMaterial({
    map: makeSaturnTexture(),
    roughness: 0.95,
    metalness: 0,
  })
);
saturn.scale.y = SATURN_FLATTENING;   // the famous squashed profile
saturn.castShadow = true;
saturn.receiveShadow = true;
scene.add(saturn);

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
scene.add(makeRings());

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

function makeMoonGeometry(def, seed) {
  const R = def.radiiKm;
  const geo = new THREE.SphereGeometry(1, 160, 120);
  const pos = geo.attributes.position;
  const ridgeNoise = makeNoise2DWrap(seed, 24, 1);      // unevenness of the ridge
  const hills = makeNoise2DWrap(seed + 1, 10, 6);       // broad, soft terrain
  const detail = makeNoise2DWrap(seed + 2, 36, 18);     // finer texture
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
      (0.55 * (hills(u, v) - 0.5) + 0.25 * (detail(u, v) - 0.5)) *
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
  const mesh = new THREE.Mesh(
    makeMoonGeometry(def, seed),
    new THREE.MeshStandardMaterial({
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
  scene.add(mesh);
  return mesh;
}

// All three ring-region shepherd moons, each at its true position.
const moons = {
  pan: makeMoonMesh(Orbit.MOONS.pan, 51),
  daphnis: makeMoonMesh(Orbit.MOONS.daphnis, 81),
  atlas: makeMoonMesh(Orbit.MOONS.atlas, 111),
};
const pan = moons.pan;   // the headline moon

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
scene.add(halo);

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
  sprite.scale.set(10, 5, 1);
  return sprite;
}
const koala = makeKoalaSprite();
koala.visible = false;
pan.add(koala);
let koalaLap = 0;   // how far around Pan's equator the koala has jogged

function updateKoala(dt, nowMs, camDistToPan) {
  koala.visible = camDistToPan < 30;   // a secret for close visitors only
  if (!koala.visible) return;
  koalaLap += dt * 0.3;                // one lap of Pan every ~20 s
  const R = Orbit.PAN.radiiKm;
  const rEq = 1 / Math.hypot(Math.cos(koalaLap) / R.long, Math.sin(koalaLap) / R.mid);
  const hop = 0.9 * Math.abs(Math.sin(nowMs * 0.006));       // happy little hops
  const r = rEq + Orbit.PAN.ridgeKm + 2.4 + hop;
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
scene.add(makeOrbitLine());

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
scene.add(makeStars());

// --- Camera controls: drag to orbit, scroll to zoom, double-click to hop moons ---

// Each stop on the double-click tour: what to look at, how close to swoop in,
// and how close the scroll wheel may go.
const TOUR = {
  saturn: { radius: 330, minR: 75 },
  pan: { radius: 7, minR: 1.7 },
  daphnis: { radius: 2.2, minR: 0.5 },
  atlas: { radius: 8, minR: 2.0 },
};
const TOUR_ORDER = ["saturn", "pan", "daphnis", "atlas"];

// Open with ?view=pan (or daphnis / atlas) to start there (bookmarkable).
const startView = new URLSearchParams(location.search).get("view");
const startMode = TOUR[startView] ? startView : "saturn";
const view = {
  mode: startMode,
  theta: 0.9,                           // horizontal angle
  phi: 1.83,                           // vertical angle (slightly below the
                                        // rings — that's the sunlit side now)
  radius: TOUR[startMode].radius,
  desiredRadius: TOUR[startMode].radius,
  target: new THREE.Vector3(0, 0, 0),   // what the camera looks at
  lastPointer: null,
  lastInteraction: performance.now(),
};

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
  view.desiredRadius = Math.min(3000,
    Math.max(TOUR[view.mode].minR, view.desiredRadius * Math.exp(e.deltaY * 0.0022)));
  view.lastInteraction = performance.now();
}, { passive: false });
renderer.domElement.addEventListener("dblclick", () => {
  const next = TOUR_ORDER[(TOUR_ORDER.indexOf(view.mode) + 1) % TOUR_ORDER.length];
  view.mode = next;
  view.desiredRadius = TOUR[next].radius;
  view.lastInteraction = performance.now();
});

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
tryPlayMusic();
updateMusicEl();

// --- HUD -------------------------------------------------------------------------

const hudName = document.getElementById("hud-name");
const hudTime = document.getElementById("hud-time");
const hudLon = document.getElementById("hud-lon");
const hint = document.getElementById("hint");
setTimeout(() => hint.classList.add("faded"), 12000);

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
function updateHud(now, jd) {
  // Report on whichever moon you're visiting (Pan when gazing at Saturn).
  const key = view.mode === "saturn" ? "pan" : view.mode;
  const def = Orbit.MOONS[key];
  const rate = WARP_LEVELS[warp.idx];
  const p = (n) => String(n).padStart(2, "0");
  hudName.textContent = def.title;
  hudTime.textContent =
    `${p(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}` +
    (isLive() ? "" : `  ·  warp ×${rate > 0 ? rate : "−" + -rate}`);
  hudLon.textContent =
    `longitude ${Orbit.moonLongitudeDeg(def, jd).toFixed(2)}° · ` +
    `lap ${(def.periodDays * 24).toFixed(2)} h · ` +
    `shown ×${PAN_VISUAL_SCALE}, truly ${Math.round(def.radiiKm.long * 2)} km`;
}

// --- Main loop ---------------------------------------------------------------------

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

  // Every moon at its exact position (the whole point of the app),
  // tidally locked so its long axis always points at Saturn.
  for (const [key, mesh] of Object.entries(moons)) {
    const def = Orbit.MOONS[key];
    mesh.position.copy(toWorld(Orbit.moonPositionKm(def, jd)));
    mesh.rotation.y = Orbit.moonLongitudeDeg(def, jd) * Math.PI / 180 + Math.PI;
  }

  // Halo hugs Pan, sized for the current distance, fading when you're close.
  const camDistToPan = camera.position.distanceTo(pan.position);
  halo.position.copy(pan.position);
  halo.scale.setScalar(Math.max(2.5, camDistToPan * 0.035));
  halo.material.opacity =
    (0.30 + 0.12 * Math.sin(nowMs * 0.002)) * smoothstep(12, 60, camDistToPan);

  updateKoala(dt, nowMs, camDistToPan);

  // Sun where it really is; Saturn spins at its real 10.56 h rate.
  const sunDir = toWorld(Orbit.sunDirection(jd)).normalize();
  sunLight.position.copy(sunDir.multiplyScalar(900));
  saturn.rotation.y = ((jd - Orbit.PAN.epochJdTdb) * 24 / SATURN_DAY_HOURS) * Math.PI * 2;

  // Camera: smooth glide toward where it wants to be.
  const targetGoal =
    view.mode === "saturn" ? new THREE.Vector3(0, 0, 0) : moons[view.mode].position;
  const glide = 1 - Math.exp(-dt * 7);
  view.target.lerp(targetGoal, glide);
  view.radius += (view.desiredRadius - view.radius) * glide;
  if (nowMs - view.lastInteraction > 10000) view.theta += dt * 0.012; // idle drift

  camera.position.set(
    view.target.x + view.radius * Math.sin(view.phi) * Math.cos(view.theta),
    view.target.y + view.radius * Math.cos(view.phi),
    view.target.z + view.radius * Math.sin(view.phi) * Math.sin(view.theta)
  );
  camera.lookAt(view.target);

  updateHud(now, jd);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
