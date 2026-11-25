import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { Caustics } from './Caustics.js';
import { Terrain } from './Terrain.js';

const habitatCenters = [
  new THREE.Vector2(-30, 15),
  new THREE.Vector2(30, 14),
  new THREE.Vector2(0, -35),
];

const coralColors = ['#e28774', '#d96f83', '#d8a369', '#da8b69'].map(
  (color) => new THREE.Color(color),
);

function addBranch(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  depth: number,
  random: () => number,
  geometries: THREE.BufferGeometry[],
) {
  const segment = new THREE.CylinderGeometry(
    radius * 0.68,
    radius,
    length,
    6,
  );
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction,
  );
  const midpoint = start.clone().addScaledVector(direction, length * 0.5);
  segment.applyQuaternion(orientation);
  segment.translate(midpoint.x, midpoint.y, midpoint.z);
  geometries.push(segment);

  if (depth === 0) {
    return;
  }

  const branchPoint = start
    .clone()
    .addScaledVector(direction, length * (0.58 + random() * 0.18));
  const baseYaw = random() * Math.PI * 2;
  for (let branch = 0; branch < 2; branch++) {
    const yaw = baseYaw + branch * Math.PI + (random() - 0.5) * 0.6;
    const sideways = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const angle = 0.38 + random() * 0.4;
    const branchDirection = direction
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(sideways, Math.sin(angle))
      .normalize();

    addBranch(
      branchPoint,
      branchDirection,
      length * (0.58 + random() * 0.12),
      radius * (0.62 + random() * 0.12),
      depth - 1,
      random,
      geometries,
    );
  }
}

function createBranchingCoralGeometry(seed: number): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const segments: THREE.BufferGeometry[] = [];

  addBranch(
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    2.8 + random() * 0.8,
    0.3 + random() * 0.08,
    3,
    random,
    segments,
  );

  const geometry = mergeGeometries(segments);
  for (const segment of segments) {
    segment.dispose();
  }
  if (!geometry) {
    throw new Error('Unable to merge branching coral geometry.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Coral {
  readonly group = new THREE.Group();
  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.72,
  });
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly plantedLocations: THREE.Vector2[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(terrain: Terrain, seed = 3, caustics?: Caustics) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.group.name = 'coral-gardens';
    caustics?.applyToMaterial(this.material);

    for (let variant = 0; variant < 3; variant++) {
      const geometry = createBranchingCoralGeometry(seed + variant * 17);
      this.geometries.push(geometry);
      this.addClusteredInstances(geometry, variant);
    }
  }

  private addClusteredInstances(
    geometry: THREE.BufferGeometry,
    variant: number,
  ) {
    const instancesPerVariant = 9;
    const mesh = new THREE.InstancedMesh(
      geometry,
      this.material,
      instancesPerVariant,
    );
    mesh.name = `branching coral variant ${variant + 1}`;

    for (let i = 0; i < instancesPerVariant; i++) {
      const center = habitatCenters[(i + variant) % habitatCenters.length];
      if (!center) {
        throw new Error('Coral habitat center is missing.');
      }

      const { x, z, normal } = this.findHabitatPosition(center);
      this.plantedLocations.push(new THREE.Vector2(x, z));
      this.dummy.position.set(x, this.terrain.getHeight(x, z) + 0.04, z);
      const terrainAlignment = new THREE.Quaternion().setFromUnitVectors(
        this.up,
        normal,
      );
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        this.up,
        this.random() * Math.PI * 2,
      );
      this.dummy.quaternion.copy(terrainAlignment).multiply(yaw);
      this.dummy.scale.setScalar(0.7 + this.random() * 0.55);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(
        i,
        coralColors[Math.floor(this.random() * coralColors.length)],
      );
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  private findHabitatPosition(center: THREE.Vector2): {
    x: number;
    z: number;
    normal: THREE.Vector3;
  } {
    for (let attempt = 0; attempt < 100; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const radius = 4 + this.random() * 10;
      const x = center.x + Math.cos(angle) * radius;
      const z = center.y + Math.sin(angle) * radius;
      const tooClose = this.plantedLocations.some(
        (position) =>
          (position.x - x) ** 2 + (position.y - z) ** 2 < 12.25,
      );
      if (tooClose) {
        continue;
      }

      const depth = this.terrain.getHeight(x, z);
      const slopeX =
        (this.terrain.getHeight(x + 1, z) - this.terrain.getHeight(x - 1, z)) *
        0.5;
      const slopeZ =
        (this.terrain.getHeight(x, z + 1) - this.terrain.getHeight(x, z - 1)) *
        0.5;
      const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();

      if (depth > -26 && normal.y > 0.82) {
        return { x, z, normal };
      }
    }

    throw new Error('Unable to find a suitable shallow coral habitat.');
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.material.dispose();
    this.group.clear();
  }
}
