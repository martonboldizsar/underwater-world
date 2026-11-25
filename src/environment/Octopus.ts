import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createSmoothTubeGeometry,
  ensurePlanarUv,
  updateSmoothTubeGeometry,
} from './AnimalSurface.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

interface OrganicArm {
  geometry: THREE.BufferGeometry;
  centers: THREE.Vector3[];
  radii: number[];
  arm: number;
}

export class Octopus {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly model = new THREE.Group();
  private readonly mantle = new THREE.Group();
  private readonly arms: OrganicArm[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly baseMantleScale = new THREE.Vector3(0.7, 0.6, 0.78);

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(-7, -19),
    seed = 97,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      0.9,
      3,
    );
    this.group.name = 'octopus';
    this.group.scale.setScalar(0.45);
    this.group.add(this.model);
    this.model.scale.setScalar(1.2);
    this.model.add(this.mantle);
    this.createModel();
    this.updateArms(0);
    this.updatePosition(0, 0);
    this.setHeading();
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.targetOrientation);
  }

  update(dt: number, elapsedTime: number) {
    this.updatePosition(dt, elapsedTime);
    this.setHeading();
    this.group.quaternion.slerp(
      this.targetOrientation,
      1 - Math.exp(-2 * dt),
    );
    this.group.position.copy(this.position);

    const pulse = Math.sin(elapsedTime * 1.1 + this.phase);
    this.mantle.scale.set(
      this.baseMantleScale.x * (1 + pulse * 0.025),
      this.baseMantleScale.y * (1 - pulse * 0.04),
      this.baseMantleScale.z * (1 + pulse * 0.025),
    );
    this.model.rotation.z =
      Math.sin(elapsedTime * 0.38 + this.phase) * 0.06;

    this.updateArms(elapsedTime);
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    this.roamer.setCollisionWorld(collisionWorld, this.group, 1.8);
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
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: '#cf805f',
      roughness: 0.76,
    });
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
      color: '#f0e2c8',
      roughness: 0.52,
    });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: '#172326',
      roughness: 0.35,
    });
    applyFineGrain(skinMaterial, 0.009);
    this.materials.push(
      skinMaterial,
      eyeWhiteMaterial,
      pupilMaterial,
    );

    const mantleGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 48, 32),
    );
    const mantlePositions = mantleGeometry.getAttribute('position');
    for (let vertex = 0; vertex < mantlePositions.count; vertex++) {
      const z = mantlePositions.getZ(vertex);
      const rearTaper = 1 - 0.14 * Math.max(0, -z);
      mantlePositions.setXYZ(
        vertex,
        mantlePositions.getX(vertex) * rearTaper,
        mantlePositions.getY(vertex) * rearTaper,
        z,
      );
    }
    mantlePositions.needsUpdate = true;
    mantleGeometry.computeVertexNormals();
    mantleGeometry.computeBoundingSphere();
    const mantleMesh = new THREE.Mesh(mantleGeometry, skinMaterial);
    mantleMesh.scale.copy(this.baseMantleScale);
    mantleMesh.position.set(0, 0.08, -0.05);
    this.mantle.add(mantleMesh);

    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.12, 16, 12),
    );
    const pupilGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.065, 14, 10),
    );
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
      eye.position.set(side * 0.42, 0.1, 0.72);
      this.model.add(eye);

      const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
      pupil.position.set(side * 0.49, 0.1, 0.76);
      this.model.add(pupil);
    }

    for (let arm = 0; arm < 8; arm++) {
      this.addArm(arm, skinMaterial);
    }
  }

  private addArm(arm: number, material: THREE.Material) {
    const centers = Array.from(
      { length: 28 },
      () => new THREE.Vector3(),
    );
    const radii = Array.from({ length: centers.length }, (_, ring) => {
      const alongArm = ring / (centers.length - 1);
      return 0.15 * Math.pow(1 - alongArm, 0.72) + 0.012;
    });
    const geometry = this.trackGeometry(
      createSmoothTubeGeometry(centers.length, 14),
    );
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, -1.2, 0),
      2.8,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `octopus-arm-${arm + 1}`;
    this.model.add(mesh);
    this.arms.push({ geometry, centers, radii, arm });
  }

  private updateArms(elapsedTime: number) {
    for (const arm of this.arms) {
      const angle = (arm.arm / 8) * Math.PI * 2;
      const radialX = Math.cos(angle);
      const radialZ = Math.sin(angle);
      const wave = elapsedTime * 0.85 + this.phase + arm.arm * 0.71;
      for (let ring = 0; ring < arm.centers.length; ring++) {
        const alongArm = ring / (arm.centers.length - 1);
        const sway = Math.sin(wave - alongArm * 4.5) * 0.16 * alongArm;
        const spread = 0.2 + alongArm * 0.62 + sway;
        const center = arm.centers[ring];
        if (!center) {
          throw new Error('Octopus arm centerline is incomplete.');
        }

        center.set(
          radialX * spread,
          -0.36 - alongArm * 2.15 + Math.cos(wave - alongArm * 3) * 0.08 * alongArm,
          0.12 + radialZ * spread,
        );
      }

      updateSmoothTubeGeometry(arm.geometry, arm.centers, arm.radii);
    }
  }

  private updatePosition(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime, 0.25);
    this.position.copy(this.roamer.position);
  }

  private setHeading() {
    this.direction.copy(this.roamer.direction);
    this.targetOrientation.setFromUnitVectors(
      this.localForward,
      this.direction,
    );
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
