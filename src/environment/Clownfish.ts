import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createRoundedFinGeometry,
  createOrganicGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { Terrain } from './Terrain.js';

export class Clownfish {
  readonly group = new THREE.Group();
  private readonly phase: number;
  private readonly terrain: Terrain;
  private readonly territoryCenter: THREE.Vector2;
  private readonly territoryHeight: number;
  private orbitRadius: number;
  private angle = 0;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly tailPivot = new THREE.Group();
  private readonly pectoralFins: THREE.Mesh[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly displacement = new THREE.Vector3();
  private readonly collisionVelocity = new THREE.Vector3();
  private readonly collisionCorrection = new THREE.Vector3();
  private readonly avoidanceOffset = new THREE.Vector3();
  private readonly avoidanceTarget = new THREE.Vector3();
  private orbitDirection: 1 | -1;
  private collisionRerouteCooldown = 0;
  private avoidanceHold = 0;
  private collisionWorld: CollisionWorld | undefined;
  private collisionRadius = 0;

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(8, -28),
    seed = 29,
  ) {
    const random = createSeededRandom(seed);
    this.phase = random() * Math.PI * 2;
    this.orbitRadius = 3.5 + random() * 1.5;
    this.orbitDirection = random() < 0.5 ? 1 : -1;
    this.terrain = terrain;
    this.territoryCenter = territoryCenter.clone();
    this.territoryHeight = terrain.getHeight(
      territoryCenter.x,
      territoryCenter.y,
    );
    this.group.name = 'territorial-clownfish';
    this.group.scale.setScalar(0.32);
    this.createModel();
    this.updatePosition(0);
    this.group.position.copy(this.position);
    this.setHeading();
    this.group.quaternion.copy(this.targetOrientation);
  }

  update(dt: number, elapsedTime: number) {
    this.collisionRerouteCooldown = Math.max(
      0,
      this.collisionRerouteCooldown - dt,
    );
    this.avoidanceHold = Math.max(0, this.avoidanceHold - dt);
    if (this.avoidanceHold === 0) {
      this.avoidanceTarget.set(0, 0, 0);
    }
    this.avoidanceOffset.lerp(
      this.avoidanceTarget,
      1 - Math.exp(-1.2 * dt),
    );
    this.angle += dt * 0.24 * this.orbitDirection;
    this.updatePosition(elapsedTime);
    this.setHeading();
    if (this.collisionWorld && dt > 0) {
      this.displacement.subVectors(this.position, this.group.position);
      this.collisionVelocity.copy(this.displacement).divideScalar(dt);
      this.position.copy(this.group.position);
      this.collisionWorld.moveSphere(
        this.position,
        this.displacement,
        this.collisionVelocity,
        {
          radius: this.collisionRadius,
          ignoreRoot: this.group,
          refresh: false,
          debug: false,
        },
      );
      this.direction.subVectors(this.position, this.group.position).setY(0);
      this.collisionCorrection
        .subVectors(this.position, this.group.position)
        .sub(this.displacement);
      const deflected =
        this.collisionCorrection.lengthSq() > 0.01 ** 2;
      const rerouted =
        deflected && this.collisionRerouteCooldown === 0;
      if (rerouted) {
        const horizontalCorrection = Math.hypot(
          this.collisionCorrection.x,
          this.collisionCorrection.z,
        );
        if (horizontalCorrection > Math.abs(this.collisionCorrection.y)) {
          this.orbitDirection = this.orbitDirection === 1 ? -1 : 1;
        }
        const offsetX =
          this.position.x -
          this.territoryCenter.x -
          this.avoidanceOffset.x;
        const offsetZ =
          (this.position.z -
            this.territoryCenter.y -
            this.avoidanceOffset.z) /
          0.72;
        const correctedRadius = Math.hypot(offsetX, offsetZ);
        if (correctedRadius > 1e-6) {
          this.orbitRadius = correctedRadius;
        }
        this.angle = Math.atan2(offsetZ, offsetX) - this.phase;
        this.collisionRerouteCooldown = 1.25;
        this.avoidanceTarget.addScaledVector(
          this.collisionCorrection.normalize(),
          1.75,
        );
        this.clampAvoidanceTarget();
        this.avoidanceHold = 8;
        this.setHeading();
      }
      if (!deflected && this.direction.lengthSq() > 1e-8) {
        this.targetOrientation.setFromUnitVectors(
          this.localForward,
          this.direction.normalize(),
        );
      }
    }
    this.group.quaternion.slerp(
      this.targetOrientation,
      1 - Math.exp(-3.5 * dt),
    );
    this.group.position.copy(this.position);

    this.tailPivot.rotation.y =
      Math.sin(elapsedTime * 9 + this.phase) * 0.42;
    for (let i = 0; i < this.pectoralFins.length; i++) {
      const fin = this.pectoralFins[i];
      if (fin) {
        fin.rotation.z = Math.sin(elapsedTime * 6 + this.phase + i * Math.PI) * 0.08;
      }
    }
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    const worldScale = this.group.getWorldScale(new THREE.Vector3());
    this.collisionWorld = collisionWorld;
    this.collisionRadius =
      0.65 * Math.max(worldScale.x, worldScale.y, worldScale.z);
  }

  dispose() {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.group.clear();
  }

  private createModel() {
    const bodyGeometry = this.trackGeometry(
      createOrganicGeometry(
        [
          { center: [0.5, 0.5, 0.22], radius: 0.14 },
          { center: [0.5, 0.5, 0.37], radius: 0.24 },
          { center: [0.5, 0.5, 0.52], radius: 0.31 },
          { center: [0.5, 0.5, 0.66], radius: 0.26 },
          { center: [0.5, 0.5, 0.78], radius: 0.16 },
        ],
        new THREE.Vector3(0.68, 0.54, 1.36),
      ),
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.58,
      vertexColors: true,
    });
    applyFineGrain(bodyMaterial, 0.014);
    const bodyPositions = bodyGeometry.getAttribute('position');
    const bodyColors = new Float32Array(bodyPositions.count * 3);
    const orange = new THREE.Color('#f27c32');
    const stripe = new THREE.Color('#fff1d2');
    const trim = new THREE.Color('#26333a');
    const stripeCenters = [0.28, -0.16, -0.48];
    for (let index = 0; index < bodyPositions.count; index++) {
      const z = bodyPositions.getZ(index);
      const stripeDistance = Math.min(
        ...stripeCenters.map((center) => Math.abs(z - center)),
      );
      const color =
        stripeDistance < 0.04
          ? stripe
          : stripeDistance < 0.058
            ? trim
            : orange;
      bodyColors[index * 3] = color.r;
      bodyColors[index * 3 + 1] = color.g;
      bodyColors[index * 3 + 2] = color.b;
    }
    bodyGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(bodyColors, 3),
    );
    this.materials.push(bodyMaterial);
    this.group.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#e8893c',
      roughness: 0.66,
      side: THREE.DoubleSide,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#102129',
      roughness: 0.38,
    });
    applyFineGrain(finMaterial, 0.01);
    this.materials.push(finMaterial, eyeMaterial);

    const tailGeometry = this.trackGeometry(
      createRoundedFinGeometry(
        [0, 0.22, 0, 0, -0.22, 0, 0, 0, -0.48],
        0.02,
      ),
    );
    this.tailPivot.position.z = -0.54;
    this.tailPivot.add(new THREE.Mesh(tailGeometry, finMaterial));
    this.group.add(this.tailPivot);

    const dorsalGeometry = this.trackGeometry(
      createRoundedFinGeometry([
        0, 0.2, -0.08,
        0, 0.42, -0.25,
        0, 0.2, -0.4,
      ], 0.015),
    );
    this.group.add(new THREE.Mesh(dorsalGeometry, finMaterial));

    const pectoralGeometries = [
      this.trackGeometry(
        createRoundedFinGeometry([
          -0.25, 0.02, 0.12,
          -0.54, -0.06, -0.18,
          -0.28, -0.14, -0.24,
        ], 0.015),
      ),
      this.trackGeometry(
        createRoundedFinGeometry([
          0.25, 0.02, 0.12,
          0.54, -0.06, -0.18,
          0.28, -0.14, -0.24,
        ], 0.015),
      ),
    ];
    for (const geometry of pectoralGeometries) {
      const fin = new THREE.Mesh(geometry, finMaterial);
      this.pectoralFins.push(fin);
      this.group.add(fin);
    }

    const eyeGeometry = new THREE.SphereGeometry(0.045, 14, 10);
    this.geometries.push(eyeGeometry);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.28, 0.07, 0.42);
      this.group.add(eye);
    }
  }

  private setHeading() {
    const orbitAngle = this.angle + this.phase;
    this.direction.set(
      -Math.sin(orbitAngle) * this.orbitDirection,
      0,
      Math.cos(orbitAngle) * 0.72 * this.orbitDirection,
    ).normalize();
    this.targetOrientation.setFromUnitVectors(
      this.localForward,
      this.direction,
    );
  }

  private updatePosition(elapsedTime: number) {
    const orbitAngle = this.angle + this.phase;
    const x =
      this.territoryCenter.x +
      Math.cos(orbitAngle) * this.orbitRadius +
      this.avoidanceOffset.x;
    const z =
      this.territoryCenter.y +
      Math.sin(orbitAngle) * this.orbitRadius * 0.72 +
      this.avoidanceOffset.z;
    const terrainHeight = this.terrain.getHeight(x, z);
    this.position.set(
      x,
      Math.max(terrainHeight + 3.2, this.territoryHeight + 6.5) +
        Math.sin(elapsedTime * 0.55 + this.phase) * 0.45 +
        this.avoidanceOffset.y,
      z,
    );
  }

  private clampAvoidanceTarget() {
    const horizontalLength = Math.hypot(
      this.avoidanceTarget.x,
      this.avoidanceTarget.z,
    );
    if (horizontalLength > 4) {
      const scale = 4 / horizontalLength;
      this.avoidanceTarget.x *= scale;
      this.avoidanceTarget.z *= scale;
    }
    this.avoidanceTarget.y = THREE.MathUtils.clamp(
      this.avoidanceTarget.y,
      -1,
      2.5,
    );
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
