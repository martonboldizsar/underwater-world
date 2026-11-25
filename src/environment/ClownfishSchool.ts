import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import { Clownfish } from './Clownfish.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { Terrain } from './Terrain.js';

interface ClownfishMotion {
  phase: number;
  radius: number;
  speed: number;
  scale: number;
  orbitDirection: 1 | -1;
  collisionRerouteCooldown: number;
  avoidanceOffset: THREE.Vector3;
  avoidanceTarget: THREE.Vector3;
  avoidanceHold: number;
}

function createInstancedGeometry(template: Clownfish): THREE.BufferGeometry {
  template.group.updateMatrixWorld(true);
  const rootInverse = template.group.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];

  template.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (!(object.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error('Clownfish parts must use standard materials.');
    }

    const geometry = object.geometry.clone();
    const localMatrix = new THREE.Matrix4().multiplyMatrices(
      rootInverse,
      object.matrixWorld,
    );
    geometry.applyMatrix4(localMatrix);

    const positions = geometry.attributes.position;
    const sourceColors = geometry.getAttribute('color');
    ensurePlanarUv(geometry);
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      colors[i * 3] =
        object.material.color.r * (sourceColors?.getX(i) ?? 1);
      colors[i * 3 + 1] =
        object.material.color.g * (sourceColors?.getY(i) ?? 1);
      colors[i * 3 + 2] =
        object.material.color.b * (sourceColors?.getZ(i) ?? 1);
    }
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    parts.push(geometry);
  });

  const geometry = mergeGeometries(parts);
  for (const part of parts) {
    part.dispose();
  }
  if (!geometry) {
    throw new Error('Unable to merge instanced clownfish geometry.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class ClownfishSchool {
  readonly group = new THREE.Group();

  private readonly center: THREE.Vector2;
  private readonly centerHeight: number;
  private readonly terrain: Terrain;
  private readonly motions: ClownfishMotion[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.62,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly direction = new THREE.Vector3();
  private readonly orientations: THREE.Quaternion[];
  private readonly positions: THREE.Vector3[];
  private readonly desiredPosition = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly collisionCorrection = new THREE.Vector3();
  private collisionWorld: CollisionWorld | undefined;

  constructor(
    terrain: Terrain,
    center: THREE.Vector2,
    seed: number,
    fishCount = 8,
  ) {
    if (!Number.isInteger(fishCount) || fishCount < 1) {
      throw new Error('A clownfish school must contain at least one fish.');
    }

    this.center = center.clone();
    this.centerHeight = terrain.getHeight(center.x, center.y);
    this.terrain = terrain;
    this.group.name = 'shallow-reef-clownfish-school';
    applyFineGrain(this.material, 0.014);
    const random = createSeededRandom(seed + 1);
    this.motions = Array.from({ length: fishCount }, () => ({
      phase: random() * Math.PI * 2,
      radius: 11 + random() * 3,
      speed: 0.12 + random() * 0.08,
      scale: 0.28 + random() * 0.08,
      orbitDirection: random() < 0.5 ? 1 : -1,
      collisionRerouteCooldown: 0,
      avoidanceOffset: new THREE.Vector3(),
      avoidanceTarget: new THREE.Vector3(),
      avoidanceHold: 0,
    }));
    this.positions = Array.from(
      { length: fishCount },
      () => new THREE.Vector3(),
    );
    this.orientations = Array.from(
      { length: fishCount },
      () => new THREE.Quaternion(),
    );

    const template = new Clownfish(terrain, center, seed);
    try {
      this.geometry = createInstancedGeometry(template);
    } finally {
      template.dispose();
    }

    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      fishCount,
    );
    this.mesh.name = 'instanced clownfish';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
    this.update(0, 0);
  }

  update(dt: number, elapsedTime: number) {
    for (let i = 0; i < this.motions.length; i++) {
      const motion = this.motions[i];
      const position = this.positions[i];
      if (!motion || !position) {
        throw new Error('Clownfish school motion is missing.');
      }

      motion.collisionRerouteCooldown = Math.max(
        0,
        motion.collisionRerouteCooldown - dt,
      );
      motion.avoidanceHold = Math.max(0, motion.avoidanceHold - dt);
      if (motion.avoidanceHold === 0) {
        motion.avoidanceTarget.set(0, 0, 0);
      }
      motion.avoidanceOffset.lerp(
        motion.avoidanceTarget,
        1 - Math.exp(-1.2 * dt),
      );
      const angle =
        elapsedTime * motion.speed * motion.orbitDirection + motion.phase;
      const x =
        this.center.x +
        Math.cos(angle) * motion.radius +
        motion.avoidanceOffset.x;
      const z =
        this.center.y +
        Math.sin(angle) * motion.radius +
        motion.avoidanceOffset.z;
      const terrainHeight = this.terrain.getHeight(x, z);
      this.desiredPosition.set(
        x,
        Math.max(terrainHeight + 3.2, this.centerHeight + 6.5) +
          Math.sin(elapsedTime * 0.55 + motion.phase) * 0.45 +
          motion.avoidanceOffset.y,
        z,
      );
      this.direction.set(
        -Math.sin(angle) * motion.orbitDirection,
        0,
        Math.cos(angle) * motion.orbitDirection,
      );
      if (this.collisionWorld && dt > 0) {
        this.displacement.subVectors(this.desiredPosition, position);
        this.velocity.copy(this.displacement).divideScalar(dt);
        this.desiredPosition.copy(position);
        this.collisionWorld.moveSphere(
          this.desiredPosition,
          this.displacement,
          this.velocity,
          {
            radius: this.getCollisionRadius(motion.scale),
            ignoreMesh: this.mesh,
            ignoreInstanceIndex: i,
            refresh: false,
            debug: false,
          },
        );
        this.direction.subVectors(this.desiredPosition, position).setY(0);
        this.collisionCorrection
          .subVectors(this.desiredPosition, position)
          .sub(this.displacement);
        const deflected =
          this.collisionCorrection.lengthSq() > 0.01 ** 2;
        const rerouted =
          deflected && motion.collisionRerouteCooldown === 0;
        if (rerouted) {
          const horizontalCorrection = Math.hypot(
            this.collisionCorrection.x,
            this.collisionCorrection.z,
          );
          if (horizontalCorrection > Math.abs(this.collisionCorrection.y)) {
            motion.orbitDirection =
              motion.orbitDirection === 1 ? -1 : 1;
          }
          const offsetX =
            this.desiredPosition.x -
            this.center.x -
            motion.avoidanceOffset.x;
          const offsetZ =
            this.desiredPosition.z -
            this.center.y -
            motion.avoidanceOffset.z;
          const correctedRadius = Math.hypot(offsetX, offsetZ);
          if (correctedRadius > 1e-6) {
            motion.radius = correctedRadius;
          }
          const correctedAngle = Math.atan2(offsetZ, offsetX);
          motion.phase =
            correctedAngle -
            elapsedTime * motion.speed * motion.orbitDirection;
          motion.collisionRerouteCooldown = 1.25;
          motion.avoidanceTarget.addScaledVector(
            this.collisionCorrection.normalize(),
            1.75,
          );
          this.clampAvoidanceTarget(motion.avoidanceTarget);
          motion.avoidanceHold = 8;
          this.direction.set(
            -Math.sin(correctedAngle) * motion.orbitDirection,
            0,
            Math.cos(correctedAngle) * motion.orbitDirection,
          );
        } else if (deflected) {
          this.direction.set(
            -Math.sin(angle) * motion.orbitDirection,
            0,
            Math.cos(angle) * motion.orbitDirection,
          );
        }
        if (this.direction.lengthSq() > 1e-8) {
          this.direction.normalize();
        } else {
          this.direction.set(
            -Math.sin(angle) * motion.orbitDirection,
            0,
            Math.cos(angle) * motion.orbitDirection,
          );
        }
      }
      position.copy(this.desiredPosition);
      this.dummy.position.copy(position);
      this.dummy.quaternion.setFromUnitVectors(
        this.localForward,
        this.direction,
      );
      const orientation = this.orientations[i];
      if (!orientation) {
        throw new Error('Clownfish school orientation is missing.');
      }
      if (dt > 0) {
        orientation.slerp(
          this.dummy.quaternion,
          1 - Math.exp(-3.5 * dt),
        );
      } else {
        orientation.copy(this.dummy.quaternion);
      }
      this.dummy.quaternion.copy(orientation);
      this.dummy.scale.setScalar(motion.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    this.collisionWorld = collisionWorld;
  }

  private getCollisionRadius(scale: number): number {
    const localRadius = this.geometry.boundingSphere?.radius;
    if (localRadius === undefined || localRadius <= 0) {
      throw new Error('Clownfish school geometry has no valid collision radius.');
    }
    return localRadius * scale;
  }

  private clampAvoidanceTarget(target: THREE.Vector3) {
    const horizontalLength = Math.hypot(target.x, target.z);
    if (horizontalLength > 4) {
      const scale = 4 / horizontalLength;
      target.x *= scale;
      target.z *= scale;
    }
    target.y = THREE.MathUtils.clamp(target.y, -1, 2.5);
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
