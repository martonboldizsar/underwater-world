import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

interface Leg {
  pivot: THREE.Group;
  phase: number;
  side: number;
}

export class Crab {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly legs: Leg[] = [];
  private readonly claws: THREE.Group[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly surfaceNormal = new THREE.Vector3();
  private readonly projectedForward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly orientationBasis = new THREE.Matrix4();
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly terrain: Terrain;

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(14, -20),
    seed = 151,
  ) {
    this.terrain = terrain;
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      0.3,
      0.025,
      60,
    );
    this.group.name = 'crab';
    this.group.scale.setScalar(0.2);
    this.createModel();
    this.position.copy(this.roamer.position);
    this.setHeading();
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.targetOrientation);
  }

  update(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime);
    this.position.copy(this.roamer.position);
    this.setHeading();
    this.group.quaternion.slerp(
      this.targetOrientation,
      1 - Math.exp(-1.8 * dt),
    );
    this.group.position.copy(this.position);

    for (const leg of this.legs) {
      const step = Math.sin(elapsedTime * 5 + this.phase + leg.phase);
      leg.pivot.rotation.y = step * 0.16 * leg.side;
      leg.pivot.rotation.z = Math.cos(
        elapsedTime * 5 + this.phase + leg.phase,
      ) * 0.1;
    }

    for (const [index, claw] of this.claws.entries()) {
      claw.rotation.y = Math.sin(elapsedTime * 2.4 + this.phase + index) * 0.08;
      claw.rotation.z =
        Math.sin(elapsedTime * 3 + this.phase + index) * 0.035;
    }
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    this.roamer.setCollisionWorld(collisionWorld, this.group, 1.1);
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
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: '#c85c3d',
      roughness: 0.72,
    });
    const undersideMaterial = new THREE.MeshStandardMaterial({
      color: '#a94b36',
      roughness: 0.78,
    });
    const legMaterial = new THREE.MeshStandardMaterial({
      color: '#c96b48',
      roughness: 0.76,
    });
    const clawMaterial = new THREE.MeshStandardMaterial({
      color: '#df8050',
      roughness: 0.7,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#f0d7a1',
      roughness: 0.48,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#231f1b',
      roughness: 0.42,
    });
    applyFineGrain(shellMaterial, 0.022);
    applyFineGrain(undersideMaterial, 0.014);
    applyFineGrain(legMaterial, 0.015);
    applyFineGrain(clawMaterial, 0.018);
    this.materials.push(
      shellMaterial,
      undersideMaterial,
      legMaterial,
      clawMaterial,
      eyeMaterial,
      darkMaterial,
    );

    const undersideGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 32, 20),
    );
    const underside = new THREE.Mesh(undersideGeometry, undersideMaterial);
    underside.position.y = 0.2;
    underside.scale.set(0.82, 0.2, 0.69);
    this.group.add(underside);

    const shellGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.position.y = 0.36;
    shell.scale.set(0.82, 0.34, 0.69);
    this.group.add(shell);

    const rimGeometry = this.trackGeometry(
      new THREE.TorusGeometry(0.8, 0.025, 12, 48),
    );
    rimGeometry.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeometry, clawMaterial);
    rim.position.y = 0.36;
    rim.scale.set(1, 1, 0.86);
    this.group.add(rim);

    const legGeometry = this.trackGeometry(
      new THREE.CapsuleGeometry(0.085, 1, 5, 14),
    );
    const legUp = new THREE.Vector3(0, 1, 0);
    const legDirection = new THREE.Vector3();
    const addLegSegment = (
      parent: THREE.Group,
      start: THREE.Vector3,
      end: THREE.Vector3,
    ) => {
      const mesh = new THREE.Mesh(legGeometry, legMaterial);
      legDirection.subVectors(end, start);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      mesh.scale.set(1, legDirection.length(), 1);
      mesh.quaternion.setFromUnitVectors(legUp, legDirection.normalize());
      parent.add(mesh);
    };

    for (const side of [-1, 1]) {
      for (let legIndex = 0; legIndex < 4; legIndex++) {
        const z = 0.25 - legIndex * 0.2;
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.57, 0.22, z);
        this.group.add(pivot);
        const knee = new THREE.Vector3(side * 0.34, -0.1, -0.025);
        const foot = new THREE.Vector3(side * 0.72, -0.19, -0.06);
        addLegSegment(pivot, new THREE.Vector3(), knee);
        addLegSegment(pivot, knee, foot);
        this.legs.push({
          pivot,
          phase: legIndex * Math.PI * 0.7,
          side,
        });
      }
    }

    const clawArmGeometry = this.trackGeometry(
      new THREE.CapsuleGeometry(0.1, 1, 5, 14),
    );
    const clawGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 20, 14),
    );
    const pincerGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(0.065, 0.018, 0.32, 12),
    );
    const clawUp = new THREE.Vector3(0, 1, 0);
    const clawDirection = new THREE.Vector3();
    for (const side of [-1, 1]) {
      const claw = new THREE.Group();
      claw.position.set(side * 0.53, 0.2, 0.49);
      this.group.add(claw);
      this.claws.push(claw);

      const armEnd = new THREE.Vector3(side * 0.3, -0.06, 0.2);
      const arm = new THREE.Mesh(clawArmGeometry, legMaterial);
      clawDirection.copy(armEnd);
      arm.position.copy(armEnd).multiplyScalar(0.5);
      arm.scale.set(1, clawDirection.length(), 1);
      arm.quaternion.setFromUnitVectors(clawUp, clawDirection.normalize());
      claw.add(arm);

      const palm = new THREE.Mesh(clawGeometry, clawMaterial);
      palm.position.set(side * 0.32, -0.07, 0.23);
      palm.scale.set(0.2, 0.17, 0.22);
      claw.add(palm);

      for (const fingerSide of [-1, 1]) {
        const finger = new THREE.Mesh(pincerGeometry, clawMaterial);
        finger.position.set(
          side * (0.32 + fingerSide * 0.12),
          -0.13,
          0.44,
        );
        finger.rotation.x = -0.6;
        finger.rotation.z = side * fingerSide * 0.48;
        claw.add(finger);
      }
    }

    const stalkGeometry = this.trackGeometry(
      new THREE.CapsuleGeometry(0.04, 0.18, 5, 12),
    );
    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.085, 16, 12),
    );
    const pupilGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.035, 12, 8),
    );
    for (const side of [-1, 1]) {
      const stalk = new THREE.Mesh(stalkGeometry, legMaterial);
      stalk.position.set(side * 0.29, 0.59, 0.48);
      this.group.add(stalk);

      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.29, 0.72, 0.5);
      this.group.add(eye);

      const pupil = new THREE.Mesh(pupilGeometry, darkMaterial);
      pupil.position.set(side * 0.29, 0.73, 0.57);
      this.group.add(pupil);
    }
  }

  private setHeading() {
    this.direction.copy(this.roamer.direction);
    const slopeX =
      this.terrain.getHeight(this.position.x + 0.5, this.position.z) -
      this.terrain.getHeight(this.position.x - 0.5, this.position.z);
    const slopeZ =
      this.terrain.getHeight(this.position.x, this.position.z + 0.5) -
      this.terrain.getHeight(this.position.x, this.position.z - 0.5);
    this.surfaceNormal.set(-slopeX, 1, -slopeZ).normalize();

    this.projectedForward
      .copy(this.direction)
      .addScaledVector(
        this.surfaceNormal,
        -this.direction.dot(this.surfaceNormal),
      );
    if (this.projectedForward.lengthSq() < 1e-8) {
      this.projectedForward
        .copy(this.localForward)
        .addScaledVector(
          this.surfaceNormal,
          -this.localForward.dot(this.surfaceNormal),
        );
    }
    this.projectedForward.normalize();
    this.right.crossVectors(this.surfaceNormal, this.projectedForward).normalize();
    this.orientationBasis.makeBasis(
      this.right,
      this.surfaceNormal,
      this.projectedForward,
    );
    this.targetOrientation.setFromRotationMatrix(this.orientationBasis);
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
