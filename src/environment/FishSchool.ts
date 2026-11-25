import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import { replaceShaderInclude } from './Caustics.js';
import { Fish, type FishState } from './Fish.js';
import { Terrain } from './Terrain.js';
import { WorldRoamer } from './WorldRoamer.js';

const defaultFishCount = 30;
const neighborhoodRadius = 9;
const separationRadius = 2.8;
const defaultFishTints = ['#fff8e9', '#fff1d8', '#e3f1e7'];

interface FishSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

function createInstancedFishGeometry(template: Fish): THREE.BufferGeometry {
  template.group.updateMatrixWorld(true);
  const rootInverse = template.group.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];

  template.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (!(object.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error('Fish parts must use standard materials.');
    }

    const geometry = object.geometry.clone();
    const localMatrix = new THREE.Matrix4().multiplyMatrices(
      rootInverse,
      object.matrixWorld,
    );
    geometry.applyMatrix4(localMatrix);

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const tailWeights = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      colors[i * 3] = object.material.color.r;
      colors[i * 3 + 1] = object.material.color.g;
      colors[i * 3 + 2] = object.material.color.b;
      if (object.name === 'tail-fin') {
        tailWeights[i] = THREE.MathUtils.clamp(
          (-0.58 - positions.getZ(i)) / 0.5,
          0,
          1,
        );
      }
    }

    ensurePlanarUv(geometry);
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    geometry.setAttribute(
      'aTailWeight',
      new THREE.Float32BufferAttribute(tailWeights, 1),
    );
    parts.push(geometry);
  });

  const geometry = mergeGeometries(parts);
  for (const part of parts) {
    part.dispose();
  }
  if (!geometry) {
    throw new Error('Unable to merge instanced fish geometry.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class FishSchool {
  readonly group = new THREE.Group();
  separationWeight = 1.7;
  alignmentWeight = 1;
  cohesionWeight = 1;

  private readonly fish: Fish[] = [];
  private readonly fishTints: THREE.Color[];
  private readonly snapshots: FishSnapshot[];
  private readonly accelerations: THREE.Vector3[];
  private readonly scales: Float32Array;
  private readonly spatialGrid = new Map<string, number[]>();
  private readonly timeUniform = { value: 0 };
  private readonly geometry: THREE.BufferGeometry;
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.62,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly separation = new THREE.Vector3();
  private readonly averageVelocity = new THREE.Vector3();
  private readonly averagePosition = new THREE.Vector3();
  private readonly difference = new THREE.Vector3();
  private readonly separationForce = new THREE.Vector3();
  private readonly alignmentForce = new THREE.Vector3();
  private readonly cohesionForce = new THREE.Vector3();
  private readonly migrationForce = new THREE.Vector3();
  private readonly desiredMigrationVelocity = new THREE.Vector3();
  private readonly migrationRoamer: WorldRoamer;

  constructor(
    terrain: Terrain,
    seed = 17,
    territoryCenter = new THREE.Vector2(-9, -10),
    fishCount = defaultFishCount,
    tintPalette: readonly THREE.ColorRepresentation[] = defaultFishTints,
  ) {
    if (!Number.isInteger(fishCount) || fishCount < 1) {
      throw new Error('A fish school must contain at least one fish.');
    }
    if (tintPalette.length === 0) {
      throw new Error('A fish school needs at least one tint color.');
    }

    this.fishTints = tintPalette.map((color) => new THREE.Color(color));
    this.migrationRoamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + fishCount + 1,
      1.1,
      4.5,
    );
    this.snapshots = Array.from(
      { length: fishCount },
      () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3() }),
    );
    this.accelerations = Array.from(
      { length: fishCount },
      () => new THREE.Vector3(),
    );
    this.scales = new Float32Array(fishCount);
    this.group.name = 'reef-fish-school';
    applyFineGrain(this.material, 0.012);
    const random = createSeededRandom(seed);
    const center = new THREE.Vector3(
      territoryCenter.x,
      terrain.getHeight(territoryCenter.x, territoryCenter.y) + 4.5,
      territoryCenter.y,
    );

    for (let i = 0; i < fishCount; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 1 + Math.sqrt(random()) * 6;
      const x = center.x + Math.cos(angle) * radius;
      const z = center.z + Math.sin(angle) * radius;
      const y = Math.max(
        -30,
        Math.min(
          -2.2,
          Math.max(
            terrain.getHeight(x, z) + 2.5,
            center.y + (random() - 0.5) * 3,
          ),
        ),
      );
      const velocity = new THREE.Vector3(
        random() - 0.5,
        (random() - 0.5) * 0.16,
        random() - 0.5,
      );
      if (velocity.lengthSq() < 1e-6) {
        velocity.set(0, 0, -1);
      }
      velocity.normalize().multiplyScalar(0.7 + random() * 0.5);

      const fish = new Fish(terrain, seed + i + 1, {
        position: new THREE.Vector3(x, y, z),
        velocity,
        autonomous: false,
        renderModel: false,
      });
      this.scales[i] = 0.34 + random() * 0.25;
      this.fish.push(fish);
    }

    const template = new Fish(terrain, seed, {
      autonomous: false,
      renderModel: true,
    });
    this.geometry = createInstancedFishGeometry(template);
    template.dispose();

    const phases = new Float32Array(fishCount);
    for (let i = 0; i < fishCount; i++) {
      const fish = this.fish[i];
      if (!fish) {
        throw new Error('Fish school is missing an instance.');
      }
      phases[i] = fish.state.animationPhase;
    }
    const phaseAttribute = new THREE.InstancedBufferAttribute(phases, 1);
    phaseAttribute.needsUpdate = true;
    this.geometry.setAttribute('aFishPhase', phaseAttribute);

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms['uFishTime'] = this.timeUniform;
      shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        '#include <common>',
        `#include <common>
attribute float aTailWeight;
attribute float aFishPhase;
uniform float uFishTime;`,
      );
      shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        '#include <begin_vertex>',
        `#include <begin_vertex>
float fishTailWave = sin(uFishTime * 9.0 + aFishPhase);
transformed.x += fishTailWave * 0.34 * aTailWeight;`,
      );
    };
    this.material.customProgramCacheKey = () => 'reef-fish-instanced-tail-v1';
    this.material.needsUpdate = true;

    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      fishCount,
    );
    this.mesh.name = 'instanced reef fish';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.updateInstanceMatrices();
    for (let i = 0; i < fishCount; i++) {
      const tint = this.fishTints[i % this.fishTints.length];
      if (!tint) {
        throw new Error('Fish tint palette is empty.');
      }
      this.mesh.setColorAt(i, tint);
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
    this.group.add(this.mesh);
  }

  update(dt: number, elapsedTime: number, diverPosition: THREE.Vector3) {
    this.timeUniform.value = elapsedTime;
    this.migrationRoamer.update(dt, elapsedTime);

    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const snapshot = this.snapshots[i];
      if (!fish || !snapshot) {
        throw new Error('Fish school state is incomplete.');
      }
      snapshot.position.copy(fish.state.position);
      snapshot.velocity.copy(fish.state.velocity);
    }
    this.rebuildSpatialGrid();

    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const acceleration = this.accelerations[i];
      if (!fish || !acceleration) {
        throw new Error('Fish school acceleration is missing.');
      }
      this.calculateAcceleration(i, fish.state, acceleration);
    }

    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const acceleration = this.accelerations[i];
      if (!fish || !acceleration) {
        throw new Error('Fish school update data is incomplete.');
      }
      fish.updateWithAcceleration(dt, elapsedTime, diverPosition, acceleration);
    }

    this.updateInstanceMatrices();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
  }

  dispose() {
    for (const fish of this.fish) {
      fish.dispose();
    }
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    for (let i = 0; i < this.snapshots.length; i++) {
      const snapshot = this.snapshots[i];
      if (!snapshot) {
        throw new Error('Fish school snapshot is missing.');
      }

      const cellX = Math.floor(snapshot.position.x / neighborhoodRadius);
      const cellY = Math.floor(snapshot.position.y / neighborhoodRadius);
      const cellZ = Math.floor(snapshot.position.z / neighborhoodRadius);
      const key = this.cellKey(cellX, cellY, cellZ);
      let occupants = this.spatialGrid.get(key);
      if (!occupants) {
        occupants = [];
        this.spatialGrid.set(key, occupants);
      }
      occupants.push(i);
    }
  }

  private calculateAcceleration(
    index: number,
    state: FishState,
    result: THREE.Vector3,
  ) {
    const current = this.snapshots[index];
    if (!current) {
      throw new Error('Fish school snapshot is missing.');
    }

    this.separation.set(0, 0, 0);
    this.averageVelocity.set(0, 0, 0);
    this.averagePosition.set(0, 0, 0);
    let neighbors = 0;
    const cellX = Math.floor(current.position.x / neighborhoodRadius);
    const cellY = Math.floor(current.position.y / neighborhoodRadius);
    const cellZ = Math.floor(current.position.z / neighborhoodRadius);

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
          const occupants = this.spatialGrid.get(
            this.cellKey(
              cellX + offsetX,
              cellY + offsetY,
              cellZ + offsetZ,
            ),
          );
          if (!occupants) {
            continue;
          }

          for (const otherIndex of occupants) {
            if (otherIndex === index) {
              continue;
            }
            const other = this.snapshots[otherIndex];
            if (!other) {
              throw new Error('Fish school neighbor snapshot is missing.');
            }

            const distanceSquared = current.position.distanceToSquared(
              other.position,
            );
            if (distanceSquared > neighborhoodRadius * neighborhoodRadius) {
              continue;
            }

            neighbors++;
            this.averageVelocity.add(other.velocity);
            this.averagePosition.add(other.position);

            if (distanceSquared < separationRadius * separationRadius) {
              if (distanceSquared < 1e-8) {
                this.difference.set(index < otherIndex ? -1 : 1, 0, 0);
                this.separation.add(this.difference);
              } else {
                this.difference.subVectors(current.position, other.position);
                this.separation.addScaledVector(
                  this.difference,
                  1 / distanceSquared,
                );
              }
            }
          }
        }
      }
    }

    result.set(0, 0, 0);
    if (neighbors > 0) {
      this.averageVelocity.divideScalar(neighbors);
      this.averagePosition.divideScalar(neighbors).sub(current.position);
      this.calculateSteering(
        this.separation,
        current.velocity,
        state.maxSpeed,
        state.maxForce,
        this.separationForce,
      );
      this.calculateSteering(
        this.averageVelocity,
        current.velocity,
        state.maxSpeed,
        state.maxForce,
        this.alignmentForce,
      );
      this.calculateSteering(
        this.averagePosition,
        current.velocity,
        state.maxSpeed,
        state.maxForce,
        this.cohesionForce,
      );

      result
        .copy(this.separationForce)
        .multiplyScalar(this.separationWeight)
        .addScaledVector(this.alignmentForce, this.alignmentWeight)
        .addScaledVector(this.cohesionForce, this.cohesionWeight)
        .clampLength(0, state.maxForce * 2);
    }

    this.desiredMigrationVelocity.subVectors(
      this.migrationRoamer.position,
      current.position,
    );
    const migrationDistance = this.desiredMigrationVelocity.length();
    if (migrationDistance < 1e-6) {
      this.migrationForce.set(0, 0, 0);
    } else {
      this.desiredMigrationVelocity
        .multiplyScalar(
          (state.maxSpeed * Math.min(1, migrationDistance / 8)) /
            migrationDistance,
        )
        .sub(current.velocity);
      this.migrationForce
        .copy(this.desiredMigrationVelocity)
        .clampLength(0, state.maxForce);
    }

    result.addScaledVector(this.migrationForce, 1.1).clampLength(
      0,
      state.maxForce * 2,
    );
  }

  private calculateSteering(
    desiredDirection: THREE.Vector3,
    velocity: THREE.Vector3,
    maxSpeed: number,
    maxForce: number,
    result: THREE.Vector3,
  ) {
    if (desiredDirection.lengthSq() < 1e-8) {
      result.set(0, 0, 0);
      return;
    }

    result
      .copy(desiredDirection)
      .normalize()
      .multiplyScalar(maxSpeed)
      .sub(velocity)
      .clampLength(0, maxForce);
  }

  private updateInstanceMatrices() {
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const scale = this.scales[i];
      if (!fish || scale === undefined) {
        throw new Error('Fish school instance transform is incomplete.');
      }
      this.dummy.position.copy(fish.state.position);
      this.dummy.quaternion.copy(fish.group.quaternion);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
  }

  private cellKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
}
