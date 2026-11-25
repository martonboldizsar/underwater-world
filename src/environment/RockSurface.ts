import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';

export function createRockGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  const positions = geometry.attributes.position;
  const random = createSeededRandom(seed);
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const broadShape =
      Math.sin(x * 4.1 + phases[0]!) *
      Math.cos(y * 3.7 + phases[1]!) *
      Math.sin(z * 4.4 + phases[2]!);
    const smallShape =
      Math.sin(x * 9.2 + phases[3]!) *
      Math.sin(y * 8.5 + phases[4]!) *
      Math.cos(z * 9.7 + phases[5]!);
    const scale = THREE.MathUtils.clamp(
      1 + broadShape * 0.09 + smallShape * 0.035,
      0.84,
      1.16,
    );

    positions.setXYZ(i, x * scale, y * scale, z * scale);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRockTexture(seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create the rock texture canvas context.');
  }

  const random = createSeededRandom(seed);
  const grainColors = ['#41463f', '#64665b', '#a8a694', '#d2cdbb'];
  context.fillStyle = '#929387';
  context.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const color = grainColors[Math.floor(random() * grainColors.length)];
    if (!color) {
      throw new Error('Rock texture grain color is missing.');
    }

    const radius = 0.45 + random() * 1.8;
    context.globalAlpha = 0.06 + random() * 0.2;
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(
      random() * size,
      random() * size,
      radius,
      radius * (0.4 + random() * 0.8),
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  for (let i = 0; i < 100; i++) {
    const color = grainColors[Math.floor(random() * grainColors.length)];
    if (!color) {
      throw new Error('Rock texture mineral color is missing.');
    }

    context.globalAlpha = 0.035 + random() * 0.075;
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(
      random() * size,
      random() * size,
      3 + random() * 8,
      2 + random() * 5,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
