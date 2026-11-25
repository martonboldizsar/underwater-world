import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

export interface FishState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  maxSpeed: number;
  maxForce: number;
  animationPhase: number;
}

export interface FishOptions {
  position?: THREE.Vector3;
  velocity?: THREE.Vector3;
  autonomous?: boolean;
  renderModel?: boolean;
}

function createTriangleGeometry(vertices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Fish {
  readonly group = new THREE.Group();
  readonly state: FishState;
  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly autonomous: boolean;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly tailPivot = new THREE.Group();
  private readonly pectoralFins: THREE.Mesh[] = [];
  private readonly target = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly awayFromDiver = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private targetTimer = 0;

  constructor(terrain: Terrain, seed = 12, options: FishOptions = {}) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.autonomous = options.autonomous ?? true;
    this.group.name = 'reef-fish';
    this.state = {
      position:
        options.position?.clone() ??
        new THREE.Vector3(-9, terrain.getHeight(-9, -10) + 4.5, -10),
      velocity: options.velocity?.clone() ?? new THREE.Vector3(-0.15, 0.04, -1.05),
      acceleration: new THREE.Vector3(),
      maxSpeed: 1.4,
      maxForce: 0.8,
      animationPhase: this.random() * Math.PI * 2,
    };

    if (options.renderModel ?? true) {
      this.createModel();
    }
    this.group.position.copy(this.state.position);
    this.heading.copy(this.state.velocity).normalize();
    this.group.quaternion.setFromUnitVectors(
      this.localForward,
      this.heading,
    );
    if (this.autonomous) {
      this.chooseTarget();
    }
  }

  update(dt: number, elapsedTime: number, diverPosition: THREE.Vector3) {
    if (!this.autonomous) {
      throw new Error('Flock-controlled fish need an external acceleration.');
    }

    this.targetTimer -= dt;
    if (this.targetTimer <= 0 || this.state.position.distanceTo(this.target) < 1.5) {
      this.chooseTarget();
    }

    this.desiredVelocity.subVectors(this.target, this.state.position);
    const targetDistance = this.desiredVelocity.length();
    if (targetDistance > 1e-6) {
      const arrivalSpeed = Math.min(1, targetDistance / 3);
      this.desiredVelocity
        .multiplyScalar((this.state.maxSpeed * arrivalSpeed) / targetDistance)
        .sub(this.state.velocity);
    } else {
      this.desiredVelocity.copy(this.state.velocity).negate();
    }

    this.state.acceleration.copy(this.desiredVelocity);
    this.state.acceleration.clampLength(0, this.state.maxForce);
    this.integrate(dt, elapsedTime, diverPosition);
  }

  updateWithAcceleration(
    dt: number,
    elapsedTime: number,
    diverPosition: THREE.Vector3,
    acceleration: THREE.Vector3,
  ) {
    this.state.acceleration.copy(acceleration);
    this.integrate(dt, elapsedTime, diverPosition);
  }

  private integrate(
    dt: number,
    elapsedTime: number,
    diverPosition: THREE.Vector3,
  ) {
    this.applyBoundaryAvoidance();
    this.applyTerrainAvoidance();
    this.applyDiverAvoidance(diverPosition);
    this.state.acceleration.clampLength(0, this.state.maxForce * 2);

    this.state.velocity.addScaledVector(this.state.acceleration, dt);
    this.state.velocity.clampLength(0, this.state.maxSpeed);
    this.state.position.addScaledVector(this.state.velocity, dt);
    this.constrainToWorld();

    if (this.state.velocity.lengthSq() > 1e-6) {
      this.heading.copy(this.state.velocity).normalize();
      this.targetOrientation.setFromUnitVectors(
        this.localForward,
        this.heading,
      );
      this.group.quaternion.slerp(
        this.targetOrientation,
        1 - Math.exp(-4 * dt),
      );
    }
    this.group.position.copy(this.state.position);

    const speedRatio = this.state.velocity.length() / this.state.maxSpeed;
    const tailSwing = Math.sin(elapsedTime * 9 + this.state.animationPhase);
    this.tailPivot.rotation.y = tailSwing * (0.2 + speedRatio * 0.32);
    for (let i = 0; i < this.pectoralFins.length; i++) {
      const fin = this.pectoralFins[i];
      if (fin) {
        fin.rotation.z = Math.sin(
          elapsedTime * 6 + this.state.animationPhase + i * Math.PI,
        ) * 0.08;
      }
    }
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
    const bodyGeometry = new THREE.SphereGeometry(1, 20, 14);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#e88f43',
      roughness: 0.56,
    });
    this.geometries.push(bodyGeometry);
    this.materials.push(bodyMaterial);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.set(0.38, 0.29, 0.72);
    this.group.add(body);

    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#e5c25a',
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    this.materials.push(finMaterial);

    const tailGeometry = this.trackGeometry(
      createTriangleGeometry([0, 0.23, 0, 0, -0.23, 0, 0, 0, -0.5]),
    );
    this.tailPivot.name = 'tail-pivot';
    this.tailPivot.position.z = -0.58;
    const tailFin = new THREE.Mesh(tailGeometry, finMaterial);
    tailFin.name = 'tail-fin';
    this.tailPivot.add(tailFin);
    this.group.add(this.tailPivot);

    const dorsalGeometry = this.trackGeometry(
      createTriangleGeometry([
        0, 0.22, -0.1,
        0, 0.48, -0.27,
        0, 0.22, -0.43,
      ]),
    );
    this.group.add(new THREE.Mesh(dorsalGeometry, finMaterial));

    const analGeometry = this.trackGeometry(
      createTriangleGeometry([
        0, -0.2, -0.15,
        0, -0.4, -0.35,
        0, -0.18, -0.48,
      ]),
    );
    this.group.add(new THREE.Mesh(analGeometry, finMaterial));

    const leftPectoral = this.trackGeometry(
      createTriangleGeometry([
        -0.28, 0.02, 0.12,
        -0.58, -0.06, -0.18,
        -0.3, -0.15, -0.26,
      ]),
    );
    const rightPectoral = this.trackGeometry(
      createTriangleGeometry([
        0.28, 0.02, 0.12,
        0.58, -0.06, -0.18,
        0.3, -0.15, -0.26,
      ]),
    );
    for (const geometry of [leftPectoral, rightPectoral]) {
      const fin = new THREE.Mesh(geometry, finMaterial);
      this.pectoralFins.push(fin);
      this.group.add(fin);
    }

    const eyeGeometry = new THREE.SphereGeometry(0.07, 10, 8);
    const pupilGeometry = new THREE.SphereGeometry(0.035, 8, 6);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#f7e9c9' });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: '#12262d',
      roughness: 0.35,
    });
    this.geometries.push(eyeGeometry, pupilGeometry);
    this.materials.push(eyeMaterial, pupilMaterial);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.29, 0.08, 0.43);
      this.group.add(eye);

      const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
      pupil.position.set(side * 0.345, 0.085, 0.45);
      this.group.add(pupil);
    }
  }

  private chooseTarget() {
    const position = this.state.position;
    const x = THREE.MathUtils.clamp(
      position.x + (this.random() - 0.5) * 18,
      -130,
      130,
    );
    const z = THREE.MathUtils.clamp(
      position.z + (this.random() - 0.5) * 18,
      -130,
      130,
    );
    const groundLevel = this.terrain.getHeight(x, z) + 2;
    const y = THREE.MathUtils.clamp(
      position.y + (this.random() - 0.5) * 5,
      groundLevel,
      -1.5,
    );
    this.target.set(x, y, z);
    this.targetTimer = 3.5 + this.random() * 3;
  }

  private applyBoundaryAvoidance() {
    const margin = 20;
    const limit = 149 - margin;
    const { x, z } = this.state.position;
    const acceleration = this.state.acceleration;

    if (x < -limit) {
      acceleration.x += ((-limit - x) / margin) * this.state.maxForce;
    } else if (x > limit) {
      acceleration.x -= ((x - limit) / margin) * this.state.maxForce;
    }
    if (z < -limit) {
      acceleration.z += ((-limit - z) / margin) * this.state.maxForce;
    } else if (z > limit) {
      acceleration.z -= ((z - limit) / margin) * this.state.maxForce;
    }
  }

  private applyTerrainAvoidance() {
    const groundLevel =
      this.terrain.getHeight(this.state.position.x, this.state.position.z) + 1.4;
    const clearance = groundLevel - this.state.position.y;
    if (clearance > 0) {
      this.state.acceleration.y += Math.min(
        clearance * 1.5,
        this.state.maxForce * 2,
      );
    }
    if (this.state.position.y > -1.5) {
      this.state.acceleration.y -=
        (this.state.position.y + 1.5) * this.state.maxForce;
    }
  }

  private applyDiverAvoidance(diverPosition: THREE.Vector3) {
    this.awayFromDiver.subVectors(this.state.position, diverPosition);
    const distanceSquared = this.awayFromDiver.lengthSq();
    const avoidanceRadius = 8;
    if (distanceSquared >= avoidanceRadius * avoidanceRadius) {
      return;
    }

    if (distanceSquared < 1e-6) {
      this.awayFromDiver.set(1, 0, 0);
    } else {
      this.awayFromDiver.normalize();
    }
    const distance = Math.sqrt(distanceSquared);
    this.state.acceleration.addScaledVector(
      this.awayFromDiver,
      ((avoidanceRadius - distance) / avoidanceRadius) *
        this.state.maxForce *
        1.8,
    );
  }

  private constrainToWorld() {
    const position = this.state.position;
    const velocity = this.state.velocity;
    const x = THREE.MathUtils.clamp(position.x, -149, 149);
    const z = THREE.MathUtils.clamp(position.z, -149, 149);
    if (x !== position.x) velocity.x = 0;
    if (z !== position.z) velocity.z = 0;
    position.x = x;
    position.z = z;

    const groundLevel = this.terrain.getHeight(position.x, position.z) + 1.2;
    const y = THREE.MathUtils.clamp(position.y, groundLevel, -1.2);
    if (y !== position.y) {
      velocity.y = 0;
    }
    position.y = y;
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.push(geometry);
    return geometry;
  }
}
