import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import Stats from 'stats.js';
import GUI from 'lil-gui';
import { Atmosphere } from './environment/Atmosphere.js';
import { Bubbles } from './environment/Bubbles.js';
import { Caustics } from './environment/Caustics.js';
import { Clownfish } from './environment/Clownfish.js';
import { Coral } from './environment/Coral.js';
import { FishSchool } from './environment/FishSchool.js';
import { Geology } from './environment/Geology.js';
import { LightShafts } from './environment/LightShafts.js';
import { Ocean } from './environment/Ocean.js';
import { Sky } from './environment/Sky.js';
import { Seagrass } from './environment/Seagrass.js';
import { Terrain } from './environment/Terrain.js';
import { DiverControls } from './player/DiverControls.js';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#experience');
if (!canvas) {
  throw new Error('Required canvas element "#experience" was not found.');
}

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
renderer.domElement.addEventListener('click', () => controls.lock());
const ocean = new Ocean();
scene.add(ocean.mesh);
const renderTargetSize = new THREE.Vector2();
const resizeOceanRenderTarget = () => {
  renderer.getDrawingBufferSize(renderTargetSize);
  ocean.setRenderTargetSize(renderTargetSize.x, renderTargetSize.y);
};
resizeOceanRenderTarget();
const worldSeed = 1;
const caustics = new Caustics();
const terrain = new Terrain(300, 200, worldSeed, caustics);
await terrain.loadTextures();
scene.add(terrain.mesh);
const geology = new Geology(terrain, worldSeed + 1, caustics);
scene.add(geology.group);
const coral = new Coral(terrain, worldSeed + 2, caustics);
scene.add(coral.group);
const seagrass = new Seagrass(terrain, caustics, worldSeed + 3);
scene.add(seagrass.group);
const fishSchool = new FishSchool(terrain, worldSeed + 4);
scene.add(fishSchool.group);
const clownfish = new Clownfish(
  terrain,
  new THREE.Vector2(10, -18),
  worldSeed + 5,
);
scene.add(clownfish.group);
const bubbles = new Bubbles(worldSeed + 6);
scene.add(bubbles.group);
const lightShafts = new LightShafts(sky.sunPosition);
scene.add(lightShafts.group);
const diver = new DiverControls(camera, terrain);
controls.addEventListener('unlock', diver.clearKeys);

const ambient = new THREE.HemisphereLight('#b8eaff', '#364e43', 1.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight('#ffffff', 3);
sun.position.copy(sky.sunPosition);
scene.add(sun);

const atmosphere = new Atmosphere(scene, ambient, sun);

const testCube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: '#ff8844' }),
);
testCube.position.set(0, -5, 0);
scene.add(testCube);

const stats = new Stats();
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(atmosphere.fog, 'density', 0, 0.15, 0.001);
gui.add(atmosphere, 'sunIntensity', 0, 5, 0.1);
gui.add(fishSchool, 'separationWeight', 0, 3, 0.1);
gui.add(fishSchool, 'alignmentWeight', 0, 3, 0.1);
gui.add(fishSchool, 'cohesionWeight', 0, 3, 0.1);

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
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  elapsedTime += dt;

  stats.begin();
  diver.update(dt, controls.isLocked);
  bubbles.update(dt, elapsedTime, camera);
  fishSchool.update(dt, elapsedTime, camera.position);
  clownfish.update(dt, elapsedTime);
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
  testCube.rotation.y += dt * 0.5;
  renderer.render(scene, camera);
  stats.end();
});
