import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Atmosphere } from './environment/Atmosphere.js';
import { disposeFineGrainBumpTexture } from './environment/AnimalSurface.js';
import { Bubbles } from './environment/Bubbles.js';
import { Caustics } from './environment/Caustics.js';
import { CAVE_SITES, Caves } from './environment/Caves.js';
import { Clownfish } from './environment/Clownfish.js';
import { Coral } from './environment/Coral.js';
import { Crab } from './environment/Crab.js';
import { FishSchool } from './environment/FishSchool.js';
import { Geology } from './environment/Geology.js';
import { Jellyfish } from './environment/Jellyfish.js';
import { LightShafts } from './environment/LightShafts.js';
import { MarinePopulation } from './environment/MarinePopulation.js';
import { MantaRay } from './environment/MantaRay.js';
import { MorayEel } from './environment/MorayEel.js';
import { Ocean } from './environment/Ocean.js';
import { Octopus } from './environment/Octopus.js';
import { Plankton } from './environment/Plankton.js';
import { PurpleWorms } from './environment/PurpleWorms.js';
import { ReefShark } from './environment/ReefShark.js';
import { SeabedDisturbance } from './environment/SeabedDisturbance.js';
import { SeaStar } from './environment/SeaStar.js';
import { SeaTurtle } from './environment/SeaTurtle.js';
import { Seahorse } from './environment/Seahorse.js';
import { Sky } from './environment/Sky.js';
import { Terrain } from './environment/Terrain.js';
import { Shipwreck } from './environment/Shipwreck.js';
import { Sponges } from './environment/Sponges.js';
import { Seagrass } from './environment/Seagrass.js';
import { CollisionWorld } from './player/CollisionWorld.js';
import { DiverControls } from './player/DiverControls.js';
import { BreathingSystem } from './player/BreathingSystem.js';
import type { DiveState } from './player/DiveState.js';
import { WristComputer } from './player/WristComputer.js';
import { DiveHud } from './ui/DiveHud.js';
import { ExplorationMap } from './ui/ExplorationMap.js';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#experience');
if (!canvas) {
  throw new Error('Required canvas element "#experience" was not found.');
}
const startPrompt = document.querySelector<HTMLButtonElement>('#start-prompt');
if (!startPrompt) {
  throw new Error('Required start prompt "#start-prompt" was not found.');
}
let hasStarted = false;

const scene = new THREE.Scene();
const sky = new Sky();
scene.add(sky.group);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  300,
);
camera.position.set(0, -5, 10);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const controls = new PointerLockControls(camera, renderer.domElement);
startPrompt.addEventListener('click', () => controls.lock());
const flashlight = new THREE.SpotLight(
  '#fff5e6',
  200,
  40,
  Math.PI / 6,
  0.5,
  2,
);
flashlight.position.set(0.2, -0.2, 0);
flashlight.target.position.set(0, 0, -10);
flashlight.visible = false;
camera.add(flashlight, flashlight.target);
scene.add(camera);
window.addEventListener('keydown', (event) => {
  if (
    event.code === 'KeyF' &&
    !event.repeat &&
    !(event.target instanceof HTMLInputElement)
  ) {
    flashlight.visible = !flashlight.visible;
  }
});
const ocean = new Ocean();
scene.add(ocean.mesh);
const renderTargetSize = new THREE.Vector2();
const resizeOceanRenderTarget = () => {
  renderer.getDrawingBufferSize(renderTargetSize);
  ocean.setRenderTargetSize(renderTargetSize.x, renderTargetSize.y);
};
resizeOceanRenderTarget();
const worldSeed = 1;
const marineSeed = Math.floor(Math.random() * 0xffff_ffff);
const caustics = new Caustics();
const terrain = new Terrain(300, 200, worldSeed, caustics);
await terrain.loadTextures();
scene.add(terrain.mesh);
const plankton = new Plankton(camera, flashlight, worldSeed + 16);
scene.add(plankton.points);
const seabedDisturbance = new SeabedDisturbance(terrain, worldSeed + 17);
scene.add(seabedDisturbance.group);
const geology = new Geology(terrain, worldSeed + 1, caustics);
scene.add(geology.group);
const shipwreck = new Shipwreck(terrain, worldSeed + 18);
scene.add(shipwreck.group);
const caves = new Caves(terrain, worldSeed + 19);
scene.add(caves.group);
const coral = new Coral(terrain, worldSeed + 2, caustics);
scene.add(coral.group);
const seagrass = new Seagrass(terrain, caustics, worldSeed + 3);
scene.add(seagrass.group);
const sponges = new Sponges(
  terrain,
  geology.spongeHosts,
  coral.plantedSites,
  worldSeed + 20,
);
scene.add(sponges.group);
const purpleWorms = new PurpleWorms(
  terrain,
  CAVE_SITES,
  worldSeed + 21,
);
scene.add(purpleWorms.group);
const fishSchool = new FishSchool(terrain, worldSeed + 4);
scene.add(fishSchool.group);
const clownfish = new Clownfish(
  terrain,
  new THREE.Vector2(10, -18),
  worldSeed + 5,
);
scene.add(clownfish.group);
const mantaRay = new MantaRay(
  terrain,
  new THREE.Vector2(5, -22),
  worldSeed + 7,
);
scene.add(mantaRay.group);
const seaTurtle = new SeaTurtle(
  terrain,
  new THREE.Vector2(-10, -24),
  worldSeed + 8,
);
scene.add(seaTurtle.group);
const reefShark = new ReefShark(
  terrain,
  new THREE.Vector2(2, -13),
  worldSeed + 9,
);
scene.add(reefShark.group);
const jellyfish = new Jellyfish(
  terrain,
  new THREE.Vector2(-6, -15),
  worldSeed + 10,
);
scene.add(jellyfish.group);
const octopus = new Octopus(
  terrain,
  new THREE.Vector2(-8, -18),
  worldSeed + 11,
);
scene.add(octopus.group);
const seahorse = new Seahorse(
  terrain,
  new THREE.Vector2(-15, -22),
  worldSeed + 12,
);
scene.add(seahorse.group);
const seaStar = new SeaStar(
  terrain,
  new THREE.Vector2(7, -14),
);
scene.add(seaStar.group);
const morayEel = new MorayEel(
  terrain,
  new THREE.Vector2(7, -26),
  worldSeed + 14,
);
scene.add(morayEel.group);
const crab = new Crab(
  terrain,
  new THREE.Vector2(12, -13),
  worldSeed + 15,
);
scene.add(crab.group);
const marinePopulation = new MarinePopulation(terrain, marineSeed + 1);
scene.add(marinePopulation.group);
const bubbles = new Bubbles(worldSeed + 6);
scene.add(bubbles.group);
const lightShafts = new LightShafts(sky.sunPosition);
scene.add(lightShafts.group);
const collisionWorld = new CollisionWorld(scene, [terrain.mesh, ocean.mesh]);
scene.add(collisionWorld.debugGroup);
fishSchool.setCollisionWorld(collisionWorld);
clownfish.setCollisionWorld(collisionWorld);
mantaRay.setCollisionWorld(collisionWorld);
seaTurtle.setCollisionWorld(collisionWorld);
reefShark.setCollisionWorld(collisionWorld);
jellyfish.setCollisionWorld(collisionWorld);
octopus.setCollisionWorld(collisionWorld);
seahorse.setCollisionWorld(collisionWorld);
morayEel.setCollisionWorld(collisionWorld);
crab.setCollisionWorld(collisionWorld);
marinePopulation.setCollisionWorld(collisionWorld);
const diver = new DiverControls(camera, terrain, collisionWorld);
const breathing = new BreathingSystem();
const wristComputer = new WristComputer(camera);
const explorationMap = new ExplorationMap(terrain);
window.addEventListener(
  'beforeunload',
  () => {
    wristComputer.dispose();
    explorationMap.dispose();
    shipwreck.dispose();
    caves.dispose();
    sponges.dispose();
    purpleWorms.dispose();
    marinePopulation.dispose();
    collisionWorld.dispose();
    disposeFineGrainBumpTexture();
  },
  { once: true },
);
const diveHud = new DiveHud();
const headingVector = new THREE.Vector3();
let diveTimeSeconds = 0;
let maximumDepthMeters = diver.depthMeters;
let hudUpdateAccumulator = 0;
let headingDegrees = 0;
const diveState: DiveState = {
  depthMeters: diver.depthMeters,
  maximumDepthMeters,
  positionX: diver.positionX,
  positionZ: diver.positionZ,
  diveTimeSeconds,
  waterTemperatureCelsius: 18,
  ambientPressurePa: diver.ambientPressurePa,
  tankPressurePa: breathing.tankPressurePa,
  verticalSpeedMetersPerSecond: diver.verticalSpeedMetersPerSecond,
  horizontalSpeedMetersPerSecond: diver.horizontalSpeedMetersPerSecond,
  headingDegrees,
  bcdGasSurfaceVolumeM3: diver.bcdGasSurfaceVolumeM3,
  buoyancyForceNewtons: diver.buoyancyForceNewtons,
  flashlightEnabled: flashlight.visible,
};
const updateDiveHud = () => {
  camera.getWorldDirection(headingVector);
  if (headingVector.x ** 2 + headingVector.z ** 2 > 1e-8) {
    headingDegrees = THREE.MathUtils.euclideanModulo(
      Math.atan2(headingVector.x, -headingVector.z) * 180 / Math.PI,
      360,
    );
  }

  diveState.depthMeters = diver.depthMeters;
  diveState.maximumDepthMeters = maximumDepthMeters;
  diveState.positionX = diver.positionX;
  diveState.positionZ = diver.positionZ;
  diveState.diveTimeSeconds = diveTimeSeconds;
  diveState.ambientPressurePa = diver.ambientPressurePa;
  diveState.tankPressurePa = breathing.tankPressurePa;
  diveState.verticalSpeedMetersPerSecond = diver.verticalSpeedMetersPerSecond;
  diveState.horizontalSpeedMetersPerSecond =
    diver.horizontalSpeedMetersPerSecond;
  diveState.headingDegrees = headingDegrees;
  diveState.bcdGasSurfaceVolumeM3 = diver.bcdGasSurfaceVolumeM3;
  diveState.buoyancyForceNewtons = diver.buoyancyForceNewtons;
  diveState.flashlightEnabled = flashlight.visible;
  diveHud.update(diveState);
  explorationMap.update(diveState);
};
updateDiveHud();
controls.addEventListener('unlock', diver.clearKeys);
controls.addEventListener('lock', () => {
  hasStarted = true;
  startPrompt.hidden = true;
});
controls.addEventListener('unlock', () => {
  startPrompt.textContent = hasStarted ? 'Click to resume' : 'Click to start';
  startPrompt.hidden = false;
});

const ambient = new THREE.HemisphereLight('#b8eaff', '#364e43', 1.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.position.copy(sky.sunPosition);
scene.add(sun);

const atmosphere = new Atmosphere(scene, ambient, sun);

const stats = new Stats();
document.body.appendChild(stats.dom);
stats.dom.style.top = '80px';

const gui = new GUI();
gui.domElement.style.top = '80px';
const fixedDt = 1 / 60;
const maxPhysicsSteps = 5;
let accumulator = 0;
let isExhaling = false;
let wasDiveActive = controls.isLocked;
gui.add(flashlight, 'visible').name('flashlight (F)').listen();
gui.add(collisionWorld, 'debugVisible').name('collision debug');
gui.add(atmosphere.fog, 'density', 0, 0.15, 0.001);
gui.add(atmosphere, 'sunIntensity', 0, 5, 0.1);
gui.add(fishSchool, 'separationWeight', 0, 3, 0.1);
gui.add(fishSchool, 'alignmentWeight', 0, 3, 0.1);
gui.add(fishSchool, 'cohesionWeight', 0, 3, 0.1);
const diveActions = {
  resetDive: () => {
    diver.resetDive();
    breathing.reset();
    bubbles.reset();
    wristComputer.close();
    accumulator = 0;
    isExhaling = false;
    diveTimeSeconds = 0;
    maximumDepthMeters = diver.depthMeters;
    hudUpdateAccumulator = 0;
    updateDiveHud();
  },
};
gui.add(diveActions, 'resetDive').name('reset virtual dive');
gui.close();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeOceanRenderTarget();
});

let previousTime = performance.now();
let elapsedTime = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const frameDt = Math.min((now - previousTime) / 1000, 0.1);
  const dt = Math.min(frameDt, 0.05);
  previousTime = now;
  elapsedTime += dt;

  stats.begin();
  collisionWorld.refresh();
  const diveActive = controls.isLocked;
  if (diveActive !== wasDiveActive) {
    accumulator = 0;
    wasDiveActive = diveActive;
    if (!diveActive) {
      isExhaling = false;
    }
  }

  if (diveActive) {
    accumulator += Math.min(frameDt, 0.1);
    let physicsSteps = 0;
    while (accumulator >= fixedDt && physicsSteps < maxPhysicsSteps) {
      const bcdGasRequest = diver.update(fixedDt, true);
      const ambientPressurePa = diver.ambientPressurePa;
      isExhaling = breathing.update(
        fixedDt,
        ambientPressurePa,
        diver.activityLevel,
        true,
      );
      const bcdGasSupplied = breathing.consumeBcdGas(
        bcdGasRequest,
        ambientPressurePa,
      );
      diver.applyBcdGas(bcdGasSupplied);
      diveTimeSeconds += fixedDt;
      maximumDepthMeters = Math.max(maximumDepthMeters, diver.depthMeters);
      accumulator -= fixedDt;
      physicsSteps++;
    }
    if (physicsSteps === maxPhysicsSteps && accumulator >= fixedDt) {
      // Drop excess whole steps while keeping the interpolation remainder.
      accumulator %= fixedDt;
    }
    diver.render(accumulator / fixedDt);
  } else {
    accumulator = 0;
    isExhaling = false;
    diver.update(0, false);
    diver.render(1);
  }

  bubbles.update(dt, elapsedTime, camera, isExhaling);
  wristComputer.update(dt, diveState);
  plankton.update(dt, elapsedTime, camera, flashlight);
  seabedDisturbance.update(
    dt,
    elapsedTime,
    camera,
    diver.currentSpeed,
  );
  caves.update(elapsedTime);
  purpleWorms.update(dt, elapsedTime);
  fishSchool.update(dt, elapsedTime, camera.position);
  clownfish.update(dt, elapsedTime);
  mantaRay.update(dt, elapsedTime);
  seaTurtle.update(dt, elapsedTime);
  reefShark.update(dt, elapsedTime);
  jellyfish.update(dt, elapsedTime);
  octopus.update(dt, elapsedTime);
  seahorse.update(dt, elapsedTime);
  seaStar.update(dt, elapsedTime);
  morayEel.update(dt, elapsedTime);
  crab.update(dt, elapsedTime);
  marinePopulation.update(dt, elapsedTime, camera.position);
  const depth = Math.max(0, -camera.position.y);
  atmosphere.update(depth);
  caustics.update(elapsedTime);
  seagrass.update(elapsedTime);
  sky.update(elapsedTime);
  lightShafts.update(elapsedTime, depth);
  ocean.update(elapsedTime);
  ocean.updateRefractionTarget(renderer, scene, camera, sky.background);
  if (camera.position.y >= 0) {
    scene.background = sky.background;
  }
  collisionWorld.updateDebug(camera.position);
  hudUpdateAccumulator += dt;
  if (hudUpdateAccumulator >= 0.1) {
    hudUpdateAccumulator %= 0.1;
    updateDiveHud();
  }
  renderer.render(scene, camera);
  stats.end();
});
