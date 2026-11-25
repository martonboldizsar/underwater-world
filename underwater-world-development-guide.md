# Underwater World
## A practical Three.js development handbook

Build an immersive, first-person scuba diving simulation with TypeScript, Three.js and WebGL. Develop it incrementally: each phase ends with a working, testable application. The primary goal is learning graphics programming while creating an enjoyable underwater environment.

> Scope: desktop-first, single-player, tropical reef, static web application. The physics and equipment are educational approximations, not real-world dive planning or training tools. Code examples are starter implementations, not a fully tested repository.

## Contents

1. [Project vision and roadmap](#1-project-vision-and-roadmap)
2. [Project initialization](#2-project-initialization)
3. [Core rendering engine](#3-core-rendering-engine)
4. [First-person swimming](#4-first-person-swimming)
5. [Procedural terrain](#5-procedural-terrain)
6. [Underwater atmosphere](#6-underwater-atmosphere)
7. [Ocean surface and lighting](#7-ocean-surface-and-lighting)
8. [Coral and vegetation](#8-coral-and-vegetation)
9. [Marine life](#9-marine-life)
10. [Particles and breathing](#10-particles-and-breathing)
11. [Diving physics](#11-diving-physics)
12. [Dive computer and UI](#12-dive-computer-and-ui)
13. [Exploration and collisions](#13-exploration-and-collisions)
14. [Audio](#14-audio)
15. [Advanced rendering](#15-advanced-rendering)
16. [Optimization testing and deployment](#16-optimization-testing-and-deployment)
17. [Implementation checklist](#17-implementation-checklist)
18. [Learning resources and effort](#18-learning-resources-and-effort)

## 1. Project vision and roadmap

The player swims through a virtual ocean, explores reefs and wrecks, observes marine life and monitors fictional scuba equipment. The environment responds to depth, movement and lighting.

| System | Target features |
|---|---|
| Environment | Ocean surface, seabed, rocks, reefs, caves, wrecks |
| Movement | First-person swimming, inertia, currents, buoyancy |
| Optics | Absorption, scattering, fog, caustics, sunlight shafts, flashlight |
| Life | Fish schools, seahorses, large and small jellyfish, turtles, vegetation |
| Equipment | BCD, virtual tank pressure, compass, wrist computer |
| Particles | Bubbles, plankton, sediment |
| Audio | Breathing, bubbles, spatial ambience |
| Performance | Instancing, LOD, quality presets, chunk loading |

Build in the order of the chapters. First establish a playable prototype; then make it look underwater; then add life, equipment and exploration. Do not implement every advanced system before testing the fundamental experience.

## 2. Project initialization

### 2.1 Stack

| Technology | Purpose |
|---|---|
| Vite | Development server and bundling |
| TypeScript | Typed application code |
| Three.js | Rendering and mathematics |
| lil-gui | Live parameter tuning |
| stats.js | Frame-rate monitoring |
| simplex-noise | Procedural terrain |
| GLSL | Custom GPU shaders |
| Blender / GLTFLoader | Asset creation and loading |
| Web Audio API | Audio |
| Rapier (optional) | Advanced collisions |

Start with vanilla Three.js instead of Svelte/Threlte to learn the underlying rendering API. Add Svelte later if the UI becomes complex. No backend is needed.

### 2.2 Create the project

Use a Node.js LTS release supported by your Vite version.

```bash
npm create vite@latest underwater-world -- --template vanilla-ts
cd underwater-world
npm install
npm install three lil-gui stats.js simplex-noise
npm install -D @types/three @types/stats.js
npm run dev
```

Remove the Vite demonstration content. Initialize Git if necessary:

```bash
git init
git add .
git commit -m "Initialize underwater simulation"
```

### 2.3 Target directory structure

Create files as their systems are introduced, not all at once.

```text
underwater-world/
├── public/
│   ├── models/
│   ├── textures/
│   └── audio/
├── src/
│   ├── core/
│   │   ├── Experience.ts
│   │   ├── Renderer.ts
│   │   ├── Resources.ts
│   │   └── Time.ts
│   ├── environment/
│   │   ├── Ocean.ts
│   │   ├── Terrain.ts
│   │   ├── Lighting.ts
│   │   ├── Atmosphere.ts
│   │   ├── Caustics.ts
│   │   ├── Coral.ts
│   │   └── Vegetation.ts
│   ├── player/
│   │   ├── Diver.ts
│   │   ├── DiverControls.ts
│   │   ├── Buoyancy.ts
│   │   ├── DiveComputer.ts
│   │   └── Flashlight.ts
│   ├── life/
│   │   ├── Fish.ts
│   │   ├── FishSchool.ts
│   │   ├── Boids.ts
│   │   └── Jellyfish.ts
│   ├── particles/
│   │   ├── Bubbles.ts
│   │   └── Plankton.ts
│   ├── shaders/
│   ├── audio/
│   ├── ui/
│   ├── utils/
│   ├── config.ts
│   ├── main.ts
│   └── style.css
├── index.html
├── package.json
└── tsconfig.json
```

### 2.4 Architecture

`main.ts` starts `Experience`, which owns the scene, camera, renderer, resource manager, simulation systems, input, audio and UI. Keep physics separate from rendering, use one animation loop, and use SI units (one world unit = one metre). Avoid global mutable variables. Give systems explicit configuration and cleanup methods.

```ts
export interface SimulationSystem {
  update(deltaTime: number, elapsedTime: number): void;
  dispose(): void;
}
```

**Acceptance:** Clean Vite application runs locally; dependencies and Git are ready.

## 3. Core rendering engine

### 3.1 Coordinate convention

Three.js uses Y-up coordinates. Water surface is y = 0; underwater coordinates are negative. Depth = max(0, -y). X and Z span the horizontal plane.

| Parameter | Initial value |
|---|---:|
| World width / length | 300 m each |
| Average seabed | y = -40 m |
| Spawn | (0, -5, 10) |
| Vertical FOV | 75 degrees |
| Near / far clip | 0.05 / 300 m |
| Rendering target | 60 FPS |
| Physics step | 1/60 s |

A scene contains objects, lights and meshes. A mesh combines geometry and material. A camera defines the viewpoint; the renderer projects it onto the canvas.

### 3.2 Minimal working application

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Underwater World</title>
</head>
<body>
  <canvas id="experience"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`src/style.css`:

```css
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #031923; }
#experience { display: block; width: 100%; height: 100%; }
```

`src/main.ts`:

```ts
import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#experience')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#16738c');
const fog = new THREE.FogExp2('#16738c', 0.035);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, -5, 10);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const ambient = new THREE.HemisphereLight('#b8eaff', '#364e43', 1.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.position.set(20, 30, 10);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300),
  new THREE.MeshStandardMaterial({ color: '#b5aa82', roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -40;
scene.add(floor);
const testCube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: '#ff8844' }));
testCube.position.set(0, -5, 0);
scene.add(testCube);
const stats = new Stats();
document.body.appendChild(stats.dom);
const gui = new GUI();
gui.add(fog, 'density', 0, 0.15, 0.001);
gui.add(sun, 'intensity', 0, 5, 0.1);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let previousTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  stats.begin();
  testCube.rotation.y += dt * 0.5;
  renderer.render(scene, camera);
  stats.end();
});
```

Experiment with geometry, material, fog, light intensity and exposure. Refactor only once it works. The eventual loop reads input, advances physics, updates diver/camera, environment, life, particles, audio and UI, then renders. Use fixed physics steps and variable render steps later.

**Acceptance:** Rotating orange cube, responsive canvas, live GUI and performance monitor.

## 4. First-person swimming

| Input | Action |
|---|---|
| Mouse | Look around |
| W / S | Forward / backward along view direction |
| A / D | Strafe |
| Space / Ctrl | Ascend / descend |
| Shift | Faster swimming |
| Q / E | Deflate / inflate virtual BCD (later) |
| F | Flashlight (later) |
| B | Dive computer (later) |
| Esc | Pause / unlock pointer |

### 4.1 Mouse control

```ts
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
const controls = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => controls.lock());
```

Use camera direction rather than walking-specific movement helpers. Looking down and swimming forward should descend.

### 4.2 DiverControls.ts

```ts
import * as THREE from 'three';

export class DiverControls {
  private keys = new Set<string>();
  private velocity = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private response = 2;
  private speed = 1.2;
  constructor(private camera: THREE.PerspectiveCamera) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
  }
  private onKeyDown = (event: KeyboardEvent) => { this.keys.add(event.code); };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  clearKeys = () => { this.keys.clear(); };
  update(dt: number, active: boolean) {
    if (!active) { this.clearKeys(); this.velocity.set(0, 0, 0); return; }
    this.direction.set(0, 0, 0);
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.up).normalize();
    if (this.keys.has('KeyW')) this.direction.add(this.forward);
    if (this.keys.has('KeyS')) this.direction.sub(this.forward);
    if (this.keys.has('KeyD')) this.direction.add(this.right);
    if (this.keys.has('KeyA')) this.direction.sub(this.right);
    if (this.keys.has('Space')) this.direction.y += 1;
    if (this.keys.has('ControlLeft')) this.direction.y -= 1;
    const speed = this.keys.has('ShiftLeft') ? this.speed * 1.8 : this.speed;
    this.direction.normalize().multiplyScalar(speed);
    const alpha = 1 - Math.exp(-this.response * dt);
    this.velocity.lerp(this.direction, alpha);
    this.camera.position.addScaledVector(this.velocity, dt);
    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, -149, 149);
    p.z = THREE.MathUtils.clamp(p.z, -149, 149);
    const y = THREE.MathUtils.clamp(p.y, -38, -0.3);
    if (y !== p.y) this.velocity.y = 0;
    p.y = y;
  }
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
  }
}
```

Instantiate `const diver = new DiverControls(camera)` and call `diver.update(dt, controls.isLocked)` before rendering. Clear input on unlock. Prevent default browser shortcuts for game keys while playing where possible.

### 4.3 Inertia

$$\alpha=1-e^{-k\Delta t}$$
$$\mathbf v_{new}=\mathbf v_{old}+\alpha(\mathbf v_{target}-\mathbf v_{old})$$

The response coefficient k controls drifting. Test 0.5–6 s⁻¹. With k = 2, the velocity reaches about 86% of target after one second. Add subtle optional camera bob, gentle tilt and current only after basic controls feel good. Keep visual camera offsets separate from the physical diver position.

**Acceptance:** Smooth six-direction swimming, mouse look, pause and world boundaries.

## 5. Procedural terrain

### 5.1 Heightmap

Combine noise octaves to create hills, valleys and details:

$$h(x,z)=h_0+\sum_i A_i n(f_i x,f_i z)$$

`src/environment/Terrain.ts`:

```ts
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
export class Terrain {
  readonly mesh: THREE.Mesh;
  private noise = createNoise2D();
  constructor(size = 300, segments = 200) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.getHeight(p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(geometry,
      new THREE.MeshStandardMaterial({ color: '#b5a580', roughness: 0.95 }));
    this.mesh.receiveShadow = true;
  }
  getHeight(x: number, z: number): number {
    return -40 + this.noise(x * 0.015, z * 0.015) * 7
      + this.noise(x * 0.06, z * 0.06) * 2
      + this.noise(x * 0.2, z * 0.2) * 0.35;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

Replace the flat plane with `terrain.mesh`. Use a seeded random function with `createNoise2D` for reproducibility. Shape a shallower starting reef (e.g. 8–15 m deep) rather than making all coral inhabit the initial 40 m seabed.

### 5.2 PBR textures

Download a licensed sand texture set: albedo, normal, roughness, optional AO and height. Use sRGB only for colour textures; normal and roughness maps are data.

```ts
const loader = new THREE.TextureLoader();
const sandColor = loader.load('/textures/sand/albedo.jpg');
const sandNormal = loader.load('/textures/sand/normal.jpg');
sandColor.colorSpace = THREE.SRGBColorSpace;
for (const texture of [sandColor, sandNormal]) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(75, 75);
}
const material = terrain.mesh.material as THREE.MeshStandardMaterial;
material.map = sandColor;
material.normalMap = sandNormal;
material.needsUpdate = true;
```

Dispose textures when their owner is destroyed. Use a shared resource cache for reusable textures.

### 5.3 Collisions and geology

Replace the temporary lower Y clamp with `terrain.getHeight(x,z) + 0.8`; cancel downward velocity on contact. For exact collision, interpolate the rendered triangle surface or raycast. Scatter 200 small rocks, 40 medium rocks, 10 boulders, three prominent reef formations and a sandy valley. Vary sizes and rotations and use instancing for shared geometry/materials.

**Acceptance:** Textured uneven seabed, deterministic world generation, no ground penetration.

## 6. Underwater atmosphere

### 6.1 Distance fog

`scene.fog = new THREE.FogExp2('#126c88', 0.045)`.

$$f(d)=1-e^{-(\rho d)^2}$$

| Water type | Artistic fog density |
|---|---:|
| Very clear tropical | 0.015 |
| Clear ocean | 0.035 |
| Moderate | 0.060 |
| Turbid coastal | 0.100 |
| Very poor visibility | 0.180 |

Keep background and fog colours consistent. These settings are artistic, not calibrated visibility measurements.

### 6.2 Depth-dependent lighting

Interpolate initial colour and light intensity presets from camera depth.

| Depth | Colour | Relative intensity |
|---:|---|---:|
| 0 m | #48b8cb | 100% |
| 10 m | #1689a8 | 70% |
| 20 m | #125b80 | 45% |
| 40 m | #082d50 | 20% |
| 80 m | #041426 | 5% |

### 6.3 Beer–Lambert absorption

$$I(\lambda,d)=I_0(\lambda)e^{-k(\lambda)d}$$

Use illustrative RGB coefficients (0.12, 0.045, 0.018) m⁻¹. Red attenuates more rapidly than blue.

| Depth | Red remaining | Green remaining | Blue remaining |
|---:|---:|---:|---:|
| 5 m | 54.9% | 79.9% | 91.4% |
| 10 m | 30.1% | 63.8% | 83.5% |
| 20 m | 9.1% | 40.7% | 69.8% |
| 40 m | 0.8% | 16.5% | 48.7% |
| 80 m | 0.007% | 2.7% | 23.7% |

A simplified scattering model is:

$$\mathbf T=e^{-\mathbf k d}$$
$$\mathbf C_{observed}=\mathbf C_{object}\mathbf T+\mathbf C_{water}(1-\mathbf T)$$

Separate sunlight's path from surface to object from the object's viewing path to the diver. Apply attenuation in linear colour space. Do not globally remove red from flashlight illumination: a close torch should restore local colour. For the advanced version, use a depth-aware rendering pass instead of doubling up with built-in fog.

**Acceptance:** Deeper water becomes darker and bluer; distant objects fade naturally.

## 7. Ocean surface and lighting

### 7.1 Animated surface

Create a 300 × 300 m subdivided plane, rotate its geometry into XZ, and place it at y = 0. Use a double-sided material initially to see it from below. Wave model:

$$h(x,z,t)=\sum_i A_i\sin(k_{xi}x+k_{zi}z-\omega_i t+\phi_i)$$

`water.vert.glsl`:

```glsl
uniform float uTime;
varying vec3 vWorldPosition;
void main() {
  vec3 p = position;
  p.y += sin(p.x * 0.7 + uTime * 1.2) * 0.12;
  p.y += sin(p.z * 0.9 + uTime * 0.8) * 0.08;
  p.y += sin(p.x * 0.2 + p.z * 0.4 - uTime * 0.6) * 0.15;
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
```

`water.frag.glsl` (minimal placeholder, to improve later):

```glsl
varying vec3 vWorldPosition;
void main() {
  gl_FragColor = vec4(0.12, 0.55, 0.68, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
```

Import shader files with `?raw` using Vite. Create a `ShaderMaterial` with `uniforms: { uTime: { value: 0 } }`, vertexShader, fragmentShader and `side: THREE.DoubleSide`. Update `uTime.value` each frame. The placeholder shader only demonstrates geometry animation; add lighting and optical effects separately.

### 7.2 Reflection and refraction

Add wave normals, Fresnel reflection, environment sampling and refraction. Render different views from above/below water. Snell's window is a striking feature: the critical angle is approximately

$$\theta_c=\arcsin(1/1.333)\approx48.6^\circ$$

The above-water hemisphere appears in a roughly 97-degree circular window when viewed from below a flat surface. Outside it, total internal reflection occurs.

### 7.3 Caustics

Start with seamless monochrome textures projected in world-space XZ. Sample twice at different moving offsets; combine and multiply into the sunlight contribution. Fade with depth; apply to rocks and coral too. Later use procedural GLSL or a more physically based light-focusing approach. Do not rely on a floating transparent plane above the seabed.

### 7.4 Light shafts

Start with 8–15 soft transparent light-shaft meshes: varying direction, width, animated intensity, soft edges, depth testing on and depth writing off. Reduce intensity with depth. Later implement depth-aware volumetric ray marching to prevent light leaking through terrain.

**Acceptance:** Animated surface visible from below, moving caustics, convincing soft sunlight beams.

## 8. Coral and vegetation

### 8.1 Asset library

Create reusable assets for branching coral, brain coral, sea fans, tube sponges, seagrass and kelp. The current world builds procedural tube-sponge clusters with open pores and varied colours instead of loading an external sponge model. Keep sponges attached to shallow rocks or near coral, and limit them to 20 m depth. Use [Poly Haven](https://polyhaven.com/), [ambientCG](https://ambientcg.com/), [Sketchfab](https://sketchfab.com/) and [Blender](https://www.blender.org/) for future assets. Verify each asset's licence and record attribution in an asset manifest.

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/coral.glb');
const coral = gltf.scene;
coral.position.set(5, terrain.getHeight(5, 10), 10);
coral.scale.setScalar(0.8);
scene.add(coral);
```

Cache loaded assets. Clone models when necessary; use shared geometries/materials and instancing for repeated static assets. Use `AnimationMixer` for imported animations.

### 8.2 Procedural coral

1. Generate a trunk as a tapered cylinder.
2. Select two or three branch directions using vectors and quaternions.
3. Reduce branch length and radius at each recursion level.
4. Add seeded variations to directions and lengths.
5. Stop at a maximum depth (start with 3–4 levels).
6. Merge compatible branch geometries or instance cylinders.
7. Produce several seeded variants and assign materials.

### 8.3 Vegetation animation

Bend vegetation with a vertex shader, preserving the roots:

$$x'=x+A(y)\sin(\omega t+\phi)$$

Example snippet inside a vertex transformation (provide `uTime`, `uPhase`, `uHeight` uniforms):

```glsl
float bend = sin(uTime * 1.2 + position.y * 0.8 + uPhase);
float strength = pow(clamp(position.y / uHeight, 0.0, 1.0), 2.0);
transformed.x += bend * strength * 0.3;
```

Use distinct per-instance phases and align bending with the simulated current. Ensure plant geometry has enough vertical subdivisions. Update normals for more accurate lighting when needed.

### 8.4 Habitat placement

Use depth, slope, noise-based habitat density, available sunlight and spacing to determine placement. Generate dense coral gardens, rocky reefs, sandy clearings and seagrass meadows rather than uniform random scattering. Snap instances to terrain and reject steep or unsuitable sites. Place shallow sponges on exposed rock surfaces and the seabed, with additional clusters near corals; do not place them deeper than 20 m.

**Acceptance:** Natural clusters of coral and vegetation, gently animated plants, reusable and properly licensed assets.

## 9. Marine life

### 9.1 Single fish

Start with an ellipsoid body and triangle tail, then replace the prototype with detailed assets. Define a forward axis consistently (e.g. +Z) so orientation matches the model.

```ts
interface FishState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  maxSpeed: number;
  maxForce: number;
  animationPhase: number;
}
```

Implement constant swimming, velocity-based orientation, tail animation, random target changes, smooth steering, terrain and boundary avoidance, and finally diver avoidance. Use quaternions for smooth orientation; handle near-zero velocity without normalizing it into an undefined direction.

### 9.2 Boids schooling algorithm

Three local rules produce emergent schooling behaviour:

- **Separation:** steer away from nearby fish to avoid collisions.
- **Alignment:** steer toward neighbours' average velocity.
- **Cohesion:** steer toward neighbours' average position.

Add obstacle avoidance and diver avoidance:

$$\mathbf a=w_s\mathbf F_s+w_a\mathbf F_a+w_c\mathbf F_c+w_o\mathbf F_o+w_d\mathbf F_d$$

$$\mathbf v_{t+\Delta t}=\mathbf v_t+\mathbf a\Delta t$$
$$\mathbf p_{t+\Delta t}=\mathbf p_t+\mathbf v_{t+\Delta t}\Delta t$$

Implementation steps:

1. Start with 30 fish; define neighbourhood radius, separation radius and maximum steering acceleration.
2. Snapshot all fish states at the beginning of a physics step so updates are not order-dependent.
3. For each fish, collect neighbours within its radius.
4. Sum inverse-distance-weighted repulsion for separation; guard against zero distance.
5. Compute average neighbour velocity for alignment and average position for cohesion.
6. Convert each desired motion into a steering vector; combine with configurable weights.
7. Add avoidance forces near seabed, rocks, surface and diver.
8. Clamp acceleration and speed, integrate velocity and position.
9. Update rendered instance orientations and transforms after all physics states are updated.
10. Expose separation, alignment and cohesion weights in lil-gui. Set individual weights to zero to understand their effects.

Initial experimental weights: separation 1.7, alignment 1.0, cohesion 1.0. Actual useful weights depend on force normalization and units.

### 9.3 Scaling up

Naive neighbour search is O(N²). Use a 3D spatial hash grid for larger populations. If cell size equals neighbourhood radius, search the current cell and its 26 neighbours. Benchmark before optimizing. Use one `InstancedMesh` per species and spatial region, update instance matrices, and animate tails with per-instance shader phases. Mark instance buffers as needing updates. Use `DynamicDrawUsage` for frequently updated buffers.

### 9.4 Other species

| Species | Behaviour |
|---|---|
| Tropical fish | Schooling and reef exploration |
| Clownfish | Territorial swimming around coral |
| Sea turtle | Slow path-following |
| Jellyfish | Pulsating vertical movement |
| Manta ray | Gliding with animated fins |
| Octopus | Hiding and crawling |
| Shark | Wide patrol paths |
| Tube sponge | Stationary, clustered on shallow rock and coral habitat |
| Purple sea worm | Crawling along the seabed and cave arches at 15–35 m |

The current scene includes 18 segmented purple worms: 14 crawl over suitable seabed and two crawl along the inner arch of each cave. Cave worms choose new points across a depth-safe section of the arch and tunnel, with occasional pauses, rather than reversing along one fixed line. The western cave floor is slightly deeper than 35 m, so its cave worms stay near the shallow entrance arch. Crabs track seabed height and align their bodies to the local terrain normal. Add each species individually; avoid complex predator-prey simulation initially.

Animal models and coral use a shared, subtle procedural fine-grain bump texture to add surface detail without changing their existing colors or markings. Custom animal geometry receives planar UVs when it lacks them; plankton remains untextured, and sponges retain their pore detail.

To avoid a mechanical assembly look, connected forms use smooth-union meshes, flexible eels use a continuously deforming tube, and fins use rounded, beveled surfaces. Keep naturally distinct features such as shells, eyes and tentacles separate but softly joined.

**Acceptance:** Autonomous schools respond to obstacles and the diver; several species have distinct behaviours.

## 10. Particles and breathing

### 10.1 Bubbles

```ts
interface Bubble {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  age: number;
  lifetime: number;
  active: boolean;
}
```

Emit bubbles from the virtual regulator near the camera. Transform their initial position into world space so released particles do not follow the player. Give them upward velocity, current drift, oscillation, finite lifetimes and surface removal.

Use a simple Boyle's law approximation for expansion:

$$P_1V_1=P_2V_2$$
$$r_2=r_1(P_1/P_2)^{1/3}$$

Store the original pressure and radius so expansion does not accumulate incorrectly. Ignore dissolution and bubble deformation for the first implementation.

Use one breathing cycle of roughly 4–6 seconds as an initial animation parameter; emit bubbles only during virtual exhalation. Pool around 500 bubbles and reuse inactive slots. Use instanced meshes or point sprites; choose transparency carefully.

### 10.2 Plankton and suspended sediment

Start with 3,000 particles using `THREE.Points` and `BufferGeometry`. Vary size, opacity, drift and animation phase. Recycle particles outside the local simulation volume, fade them smoothly at the boundary, and make nearby particles respond to flashlight illumination. Avoid allocating vectors every frame.

### 10.3 Seabed disturbance

When the diver approaches the bottom and swims, spawn local sediment clouds. Increase local turbidity, then disperse the cloud gradually. Treat this as a localized effect rather than changing global fog abruptly.

**Acceptance:** Breathing emits world-space bubbles; suspended matter drifts naturally; bottom disturbance is visible and fades.

## 11. Diving physics

Replace velocity interpolation with force-based movement while preserving input and mouse controls. Separate the physical diver state from camera offsets. This is a fictional educational model, not validated scuba equipment simulation.

### 11.1 Forces

$$\mathbf F_{total}=\mathbf F_g+\mathbf F_b+\mathbf F_d+\mathbf F_{thrust}$$
$$\mathbf F_g=-mg\hat y$$
$$\mathbf F_b=\rho gV\hat y$$
$$\mathbf v_{rel}=\mathbf v_{diver}-\mathbf v_{current}$$
$$\mathbf F_d=-\frac12\rho C_d A |\mathbf v_{rel}|\mathbf v_{rel}$$

Thrust is generated by the player's swim input. Define mass, displaced volume, drag coefficient, effective cross-sectional area and thrust in a configuration object. Currents are world-space vectors. Calculate acceleration from total force divided by mass.

### 11.2 Hydrostatic pressure

$$P=P_0+\rho gh$$

Use absolute pressure in Pascals internally.

```ts
function getAmbientPressure(depth: number) {
  return 101325 + 1025 * 9.81 * Math.max(0, depth);
}
```

Constants: surface pressure 101,325 Pa, seawater density 1,025 kg/m³, freshwater density approximately 1,000 kg/m³, gravity 9.81 m/s².

### 11.3 BCD simulation

Model gas quantity rather than assuming a constant BCD volume. At a fixed temperature:

$$V_{BCD}=\frac{nRT}{P_{ambient}}$$

Alternatively store surface-equivalent gas volume:

$$V_{BCD}=V_{surface}\frac{P_0}{P_{ambient}}$$

Q/E change the virtual gas quantity; clamp it and account for maximum bladder volume. Gas compresses during descent and expands during ascent. Implement an artificial game movement limit and surface collision. These controls and limits are for gameplay, not real-life ascent or buoyancy advice.

Treat the bladder limit as its actual volume at ambient pressure, and scale the surface-equivalent gas limit with ambient pressure. With the 90 kg diver and 85 L fixed displacement used here, neutral buoyancy needs about 2.8 L of actual BCD gas: about 14 L surface-equivalent at 40 m, still within an 8 L bladder.

Example model: total mass 90 kg, fixed displaced volume 85 L, surface-equivalent BCD gas 8 L, depth 15 m. At that depth pressure is approximately 2.52 bar absolute and gas volume is about 3.21 L. Total displaced volume is approximately 88.21 L. Use `Fnet = rho * g * totalVolumeInCubicMetres - mass * g` for vertical force before drag and thrust.

### 11.4 Virtual air consumption

Use an illustrative respiratory minute volume (RMV) model:

$$\dot V_{surface}=RMV\frac{P_{ambient}}{P_0}$$
$$\frac{dP_{tank}}{dt}=-\frac{P_0\dot V_{surface}}{V_{cylinder}}$$

Use compatible time and volume units (e.g. m³/s and m³). Connect breathing animation, bubble emission, virtual gas consumption and activity level through one breathing system. If BCD inflation draws from the cylinder, account for that gas separately. Clamp remaining gas and offer reset or end-of-dive gameplay options. Do not present virtual gas endurance as real-world guidance.

### 11.5 Fixed-step integration

```ts
const fixedDt = 1 / 60;
let accumulator = 0;
function update(frameDt: number) {
  accumulator += Math.min(frameDt, 0.1);
  while (accumulator >= fixedDt) {
    physics.update(fixedDt);
    accumulator -= fixedDt;
  }
  renderer.render(scene, camera);
}
```

Use semi-implicit Euler integration:

```ts
velocity.addScaledVector(acceleration, fixedDt);
position.addScaledVector(velocity, fixedDt);
```

Add render interpolation between physics states if necessary. Reset the accumulator on pause/resume. Enforce a maximum number of steps per frame to avoid a spiral of death. Test neutral buoyancy and terminal velocities before connecting equipment controls.

**Acceptance:** Pressure varies with depth, currents and drag influence motion, BCD gas alters buoyancy, and the simulated cylinder pressure decreases during breathing.

## 12. Dive computer and UI

### 12.1 HUD

Start with HTML/CSS overlaid on the canvas. Display current depth and tank pressure in opposite top corners, compass heading at top centre, dive time and buoyancy status along the bottom. Use restrained translucent panels and readable typography. Update data at 5–10 Hz rather than rewriting DOM elements every frame.

```ts
interface DiveState {
  depth: number;
  maximumDepth: number;
  diveTime: number;
  waterTemperature: number;
  ambientPressure: number;
  tankPressure: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  heading: number;
  bcdGasAmount: number;
  buoyancyForce: number;
  flashlightEnabled: boolean;
}
```

The simulation owns the state; the UI only reads it. Establish a compass convention (e.g. -Z is north and +X is east), normalize heading to 0–359 degrees, and convert internal pressure units to displayed bar. Label the equipment as virtual.

### 12.2 Wrist-mounted computer

1. Create/import a wrist computer model.
2. Attach it to a camera-relative arm rig.
3. Draw display content on an offscreen HTML canvas.
4. Convert the canvas into a `THREE.CanvasTexture`.
5. Assign it to a screen mesh, set appropriate colour space.
6. Redraw when displayed values change and set `texture.needsUpdate = true`.
7. Animate the wrist into view on B; animate it out on the next press.
8. Dispose of the texture and model resources when no longer needed.

Include a pause menu, volume controls, mouse sensitivity, camera-bob toggle, graphics presets and reset. Omit real decompression calculations and unvalidated safety guidance.

**Acceptance:** Readable live HUD, settings, and animated wrist display with consistent simulation data.

## 13. Exploration and collisions

### 13.1 World layout

Use a 300 × 300 m map with a shallow starting reef, three raised shallow plateaus, a coral garden, sandy plateau, shipwreck, cave and deep valley. Give each area distinctive silhouettes, colours, habitat and landmarks. Add a compass and optional exploration map. Design the terrain to make routes interesting without requiring long journeys through empty water. Keep terrain generation on a fixed seed, but use a separate startup seed to distribute varied schools and animals across the map. Fish schools and swimming animals should roam between waypoints across the map, including a school around the shipwreck; clownfish form local schools around shallow rock formations and seagrass. Swimming species are limited to 30 m depth, while crabs and stationary sea stars stay on the seabed. Keep coral and seagrass in shallow, well-lit habitat, below roughly 25–30 m only where light permits. Sponges occupy exposed shallow rocks and coral areas no deeper than 20 m; purple worms crawl on the seabed and cave surfaces from 15–35 m.

### 13.2 Shipwreck

The project uses a procedural wreck built from reusable Three.js geometry rather than an imported model. It is positioned on the seabed and currently has a tapered hull, weathered rust and wood surfaces, deck and cabin details, rigging, an anchor, a propeller, marine growth, scattered debris, and a roaming fish school. Collision against its static triangle surfaces is implemented. Next, add accessible interior rooms and place collectibles or discovery points inside. Keep detailed render meshes separate from simplified colliders where performance requires it.

### 13.3 Caves

Heightmaps cannot create overhangs or tunnels, so the project adds two independent procedural caves with arched entrances, tunnels, widened chambers, darker interior materials and suspended particles. The flashlight is stronger for exploring them, and cave walls use static triangle collisions.

### 13.4 Collisions

| Object | Collider |
|---|---|
| Seabed | Heightmap / interpolated triangle surface |
| Surface | Height constraint |
| Small rocks | Bounding spheres |
| Large rocks | Simplified mesh or compound primitive |
| Shipwreck / cave | Static triangle mesh or compound collider |
| Diver | Sphere or capsule |

The current custom collision world uses a 0.45 m diver sphere, terrain and surface constraints, bounding spheres for instanced rocks/coral/animals, and triangle surfaces for static meshes such as the shipwreck and cave walls. Moving animals use updated bounding spheres. Seagrass and visual particle groups are non-solid. Movement is swept in short substeps, and contact removes only velocity directed into the obstacle so the diver can slide along it. Toggle `collision debug` in the controls GUI to display triangle edges and bounding spheres.

Start with custom collisions. Add Rapier or a mesh BVH when complexity warrants it.

**Acceptance:** Multiple recognizable exploration locations; the diver cannot pass through solid geometry, but can swim through seagrass.

## 14. Audio

Create ambient water sound, periodic breathing, bubble sounds and equipment sounds. Synchronize these with the same breathing state used for particles and gas consumption.

```ts
const listener = new THREE.AudioListener();
camera.add(listener);
const ambience = new THREE.Audio(listener);
const loader = new THREE.AudioLoader();
const buffer = await loader.loadAsync('/audio/underwater-ambience.ogg');
ambience.setBuffer(buffer);
ambience.setLoop(true);
ambience.setVolume(0.3);
// Start playback from a user interaction after resuming the audio context.
```

Browsers restrict autoplay. Unlock audio from the start button. Use `THREE.PositionalAudio` for localized sources. Experiment with low-pass filtering for stylized underwater acoustics; real propagation is more complex. Pause/resume audio with the simulation and expose volume controls. Check licences and avoid abrupt loop transitions.

**Acceptance:** Breathing and bubble sounds are synchronized; positional ambience works and sound settings are adjustable.

## 15. Advanced rendering

### 15.1 Flashlight

```ts
const flashlight = new THREE.SpotLight('#fff5e6', 200, 40, Math.PI / 6, 0.5, 2);
flashlight.position.set(0.2, -0.2, 0);
flashlight.target.position.set(0, 0, -10);
camera.add(flashlight, flashlight.target);
scene.add(camera);
flashlight.visible = false;
```

Toggle on F. Tune intensity, beam angle, range and falloff. Light nearby objects in natural colours before applying water attenuation along the view path. Add a visible scattering beam and soft edges, selective shadows, optional virtual battery charge. This can be implemented early for cave testing even if advanced optics come later.

### 15.2 Post-processing pipeline

Use `EffectComposer` and a pipeline such as:

```text
Scene colour + depth
  -> Underwater absorption / scattering pass
  -> Volumetric sunlight and torch scattering
  -> Optional subtle distortion / bloom
  -> OutputPass (tone mapping + colour conversion)
```

Use a depth texture on the scene render target and reconstruct view-space or world-space positions using inverse projection/view matrices. Compute the distance travelled in water rather than treating non-linear depth-buffer values as metres. Handle background pixels and transparency separately. Remove or adjust the original fog to avoid double attenuation. Ensure colour conversion occurs once, at output. Resize render targets when the viewport changes.

### 15.3 Subtle distortion

```glsl
vec2 distortedUV = vUv;
distortedUV.x += sin(vUv.y * 20.0 + uTime) * 0.0015;
distortedUV.y += cos(vUv.x * 15.0 + uTime) * 0.001;
vec4 color = texture2D(tDiffuse, distortedUV);
```

Use sparingly and provide an off switch. Optional polish: dynamic day/night cycles, surface weather, bioluminescence, photography mode, diving mask overlay, particle illumination, ambient occlusion and soft shadows.

**Acceptance:** Cinematic underwater appearance with a functional torch, consistent optics and comfortable motion.

## 16. Optimization testing and deployment

### 16.1 Performance budget

At 60 FPS the frame budget is about 16.67 ms. Illustrative targets (CPU and GPU work can overlap; these are not benchmarks): GPU rendering 8 ms; fish 2 ms; physics 1.5 ms; particles 1.5 ms; UI 1 ms; headroom 2.67 ms.

```ts
console.log(renderer.info.render.calls);
console.log(renderer.info.render.triangles);
console.log(renderer.info.memory.geometries);
console.log(renderer.info.memory.textures);
```

Measure browser performance and use GPU tools such as [Spector.js](https://spector.babylonjs.com/). Avoid per-frame allocations, unnecessary state changes and excessive transparent overdraw. Reuse vectors, pool objects, batch instances, compress assets where beneficial, and limit shadow-casting lights. Dispose resources and unregister listeners when systems are destroyed.

### 16.2 Level of detail

| Distance | Detail |
|---|---|
| 0–15 m | Full models and animation |
| 15–40 m | Reduced meshes |
| 40–80 m | Simplified geometry |
| Beyond effective visibility | Not rendered |

Use hysteresis or fades to minimize visible popping. Update fish logic and animation less frequently at distance. Adjust thresholds for object size and actual visibility.

### 16.3 Quality presets

| Setting | Low | Medium | High |
|---|---:|---:|---:|
| Fish | 100 | 300 | 800 |
| Particles | 1,000 | 3,000 | 10,000 |
| Pixel ratio cap | 1 | 1.5 | 2 |
| Terrain subdivisions | 100 | 200 | 300 |
| Shadows | Off | Limited | On |
| Caustics | Texture | Shader | Shader |
| Volumetrics | Off | Basic | Advanced |

Treat these as experimental starting settings, not guaranteed hardware limits.

### 16.4 Chunking

Only introduce chunking when the initial world becomes too large. Divide it into 50 × 50 m chunks. Derive seeds from chunk coordinates and sample terrain using global coordinates to keep edges continuous. Load nearby chunks, preload the next ring, unload distant chunks and dispose unshared GPU resources. Keep a resource reference count for shared assets. Avoid blocking the render loop during generation.

### 16.5 Tests

| Test | Expected result |
|---|---|
| 30/60/120 FPS | Comparable movement over equal simulated time |
| Terrain collision | No falling through seabed |
| Pressure | Linear increase with depth |
| Neutral buoyancy | Approximately zero vertical net force before drag |
| Boids | No NaN states; no persistent invalid positions |
| World seed | Same seed creates identical environment |
| Resource disposal | No indefinite GPU resource growth |
| Pause/resume | No large time step; no stuck input |
| Resize | Correct camera aspect and render target dimensions |
| Audio | Starts after interaction |
| Quality presets | Settings actually affect workload |
| Production build | All assets and shader imports resolve |

Use automated unit tests for mathematical systems (e.g. Vitest) and manual visual tests for shaders, interaction and device performance.

### 16.6 Deploy

```bash
npm run build
npm run preview
```

Publish `dist/` using Vercel, Netlify or GitHub Pages. Set Vite base paths correctly for subpath hosting and check asset URLs. No backend or database is needed unless accounts, multiplayer or remote saves are added.

**Acceptance:** Stable performance on target hardware, functioning production build, publicly accessible static application.

## 17. Implementation checklist

### Milestone 1 — Foundations

- [ ] Initialize Vite and TypeScript.
- [ ] Install Three.js and development dependencies.
- [ ] Initialize Git.
- [ ] Create responsive canvas and renderer.
- [ ] Create scene, camera, lights and test object.
- [ ] Implement animation loop and delta time.
- [ ] Add GUI and performance statistics.
- [ ] Refactor into modular systems.

### Milestone 2 — First playable prototype

- [ ] Implement pointer-lock mouse controls.
- [ ] Implement keyboard swimming controls.
- [ ] Add acceleration and inertia.
- [ ] Implement world boundaries and pause.
- [ ] Generate procedural seabed.
- [ ] Apply sand PBR textures.
- [x] Implement terrain collision.
- [ ] Distribute rocks and geology.

### Milestone 3 — Visually convincing ocean

- [ ] Add exponential fog.
- [ ] Implement depth-dependent ambient lighting.
- [ ] Implement RGB light attenuation.
- [ ] Create animated water surface.
- [ ] Add Fresnel and underwater surface effects.
- [ ] Implement animated caustics.
- [ ] Implement sunlight shafts.
- [ ] Create atmosphere presets.

### Milestone 4 — Living underwater world

- [ ] Import coral GLTF models.
- [ ] Generate procedural branching coral.
- [x] Create animated seagrass.
- [ ] Generate clustered reef habitats.
- [ ] Implement individual fish movement.
- [ ] Implement Boids separation.
- [ ] Implement Boids alignment.
- [ ] Implement Boids cohesion.
- [ ] Add obstacle and diver avoidance.
- [x] Add instanced rendering for fish.
- [x] Introduce additional marine species.
- [x] Add shallow tube sponges and crawling purple worms.
- [x] Add subtle fine-grain surface detail to animals and coral, excluding plankton.
- [ ] Create bubble particle pool.
- [ ] Synchronize bubbles with breathing.
- [ ] Add plankton and sediment.

### Milestone 5 — Scuba simulation

- [ ] Implement fixed-timestep physics.
- [ ] Implement gravity and buoyancy.
- [ ] Implement hydrodynamic drag.
- [ ] Implement ambient pressure.
- [ ] Implement virtual BCD controls.
- [ ] Implement ocean currents.
- [ ] Implement virtual tank air consumption.
- [ ] Create central dive state.
- [ ] Create HUD and compass.
- [ ] Create wrist-mounted dive computer.
- [ ] Implement pause menu and settings.

### Milestone 6 — Exploration and immersion

- [x] Build and detail a procedural shipwreck.
- [x] Add shipwreck collisions.
- [x] Create two underwater caves.
- [ ] Create points of interest.
- [ ] Implement underwater ambient audio.
- [ ] Synchronize breathing and bubble sounds.
- [ ] Implement spatial audio.
- [x] Implement diving flashlight.
- [ ] Add post-processing pipeline.
- [ ] Add optional photography mode.

### Milestone 7 — Production release

- [ ] Profile CPU and GPU frame times.
- [ ] Optimize fish neighbour search.
- [ ] Implement levels of detail.
- [ ] Introduce graphics presets.
- [ ] Implement resource loading and disposal.
- [ ] Test physics and collisions.
- [ ] Test devices and resolutions.
- [ ] Create production build.
- [ ] Publish application.

## 18. Learning resources and effort

### Three.js concepts to study

| Concept | Project application |
|---|---|
| Scene graph | Application architecture |
| Vector3 | Swimming, forces, fish movement |
| Matrix4 | Transforms and instancing |
| Quaternions | Fish orientation and camera rotation |
| BufferGeometry | Procedural terrain and coral |
| MeshStandardMaterial | PBR sand, rocks and objects |
| TextureLoader | Texture maps |
| GLTFLoader | Complex models |
| ShaderMaterial | Water and custom effects |
| Vertex shaders | Waves, vegetation, fish animation |
| Fragment shaders | Water colour, caustics, absorption |
| Uniforms | Time and environmental parameters |
| InstancedMesh | Fish, plants, rocks |
| Points | Suspended particles |
| Raycaster | Collisions and selection |
| AnimationMixer | Animated imported animals |
| CanvasTexture | Wrist computer |
| SpotLight | Flashlight |
| EffectComposer | Post-processing |
| WebGLRenderTarget | Offscreen rendering and depth effects |
| AudioListener | First-person audio |
| LOD and culling | Rendering optimization |

### References

- [Three.js documentation](https://threejs.org/docs/)
- [Three.js examples](https://threejs.org/examples/)
- [Three.js Journey](https://threejs-journey.com/)
- [The Book of Shaders](https://thebookofshaders.com/)
- [Shadertoy](https://www.shadertoy.com/)
- [The Nature of Code](https://natureofcode.com/)
- [Original Boids project](https://www.red3d.com/cwr/boids/)
- [LearnOpenGL](https://learnopengl.com/)
- [Vite guide](https://vite.dev/guide/)

### Rough development effort

| Work | Active development hours |
|---|---:|
| Setup and rendering | 2–4 |
| Swimming | 3–5 |
| Terrain | 4–8 |
| Atmosphere | 4–8 |
| Surface, caustics, light shafts | 8–20 |
| Coral and vegetation | 6–12 |
| Marine life | 8–16 |
| Particles | 4–8 |
| Diving physics | 6–12 |
| UI and dive computer | 4–8 |
| Exploration | 6–15 |
| Audio | 3–6 |
| Advanced effects | 8–20 |
| Optimization and deployment | 5–10 |
| **Total** | **71–152** |

These are rough planning estimates, not commitments. Shader development, asset creation and visual tuning can take considerably longer.

### First three development sessions

1. Initialize the project, render a test scene, implement first-person controls, smooth swimming and fog.
2. Replace the flat seabed with procedural terrain, add sand textures, rocks and ground collisions.
3. Focus on water colour, surface waves, caustics and sunlight. Iterate until swimming through an otherwise empty ocean feels enjoyable.

**Prioritize the feeling of being underwater before implementing the complexity of being a scuba diver.**
