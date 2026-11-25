import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createOrganicGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

interface ArmJoint {
  pivot: THREE.Group;
  arm: number;
  segment: number;
}

export class Octopus {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly model = new THREE.Group();
  private readonly mantle = new THREE.Group();
  private readonly armJoints: ArmJoint[] = [];
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

    for (const joint of this.armJoints) {
      const wave =
        elapsedTime * 0.85 +
        this.phase +
        joint.arm * 0.71 -
        joint.segment * 0.45;
      const segmentRatio = joint.segment / 4;
      const curl =
        0.12 + segmentRatio * 0.45 + Math.sin(wave) * 0.08;
      const curlDirection = (joint.arm / 8) * Math.PI * 2;
      joint.pivot.rotation.x = Math.cos(curlDirection) * curl;
      joint.pivot.rotation.z = Math.sin(curlDirection) * curl;
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
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: '#d18a63',
      roughness: 0.72,
    });
    const mantleMaterial = new THREE.MeshStandardMaterial({
      color: '#bf7553',
      roughness: 0.68,
    });
    const armMaterial = new THREE.MeshStandardMaterial({
      color: '#d9946d',
      roughness: 0.74,
    });
    const suckerMaterial = new THREE.MeshStandardMaterial({
      color: '#ead3b0',
      roughness: 0.67,
    });
    const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
      color: '#f0e2c8',
      roughness: 0.52,
    });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: '#172326',
      roughness: 0.35,
    });
    applyFineGrain(skinMaterial, 0.016);
    applyFineGrain(mantleMaterial, 0.016);
    applyFineGrain(armMaterial, 0.014);
    applyFineGrain(suckerMaterial, 0.01);
    this.materials.push(
      skinMaterial,
      mantleMaterial,
      armMaterial,
      suckerMaterial,
      eyeWhiteMaterial,
      pupilMaterial,
    );

    const mantleGeometry = this.trackGeometry(
      createOrganicGeometry(
        [
          { center: [0.5, 0.5, 0.3], radius: 0.28 },
          { center: [0.5, 0.5, 0.48], radius: 0.34 },
          { center: [0.5, 0.5, 0.66], radius: 0.27 },
          { center: [0.5, 0.5, 0.76], radius: 0.2 },
        ],
        new THREE.Vector3(2, 2, 2),
      ),
    );
    const mantleMesh = new THREE.Mesh(mantleGeometry, mantleMaterial);
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

    const armLength = 0.46;
    const armGeometry = this.trackGeometry(
      new THREE.CapsuleGeometry(0.095, armLength, 5, 16),
    );
    const suckerGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 14, 10),
    );

    for (let arm = 0; arm < 8; arm++) {
      this.addArm(
        arm,
        armLength,
        armGeometry,
        suckerGeometry,
        armMaterial,
        suckerMaterial,
      );
    }
  }

  private addArm(
    arm: number,
    segmentLength: number,
    armGeometry: THREE.BufferGeometry,
    suckerGeometry: THREE.BufferGeometry,
    armMaterial: THREE.Material,
    suckerMaterial: THREE.Material,
  ) {
    const angle = (arm / 8) * Math.PI * 2;
    const outwardDirection = new THREE.Vector3(
      Math.cos(angle) * 0.48,
      -0.88,
      Math.sin(angle) * 0.48,
    ).normalize();
    const root = new THREE.Group();
    root.position.set(
      Math.cos(angle) * 0.3,
      -0.28,
      0.12 + Math.sin(angle) * 0.3,
    );
    root.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      outwardDirection,
    );
    this.model.add(root);

    let parent = root;
    for (let segment = 0; segment < 5; segment++) {
      if (segment > 0) {
        const joint = new THREE.Group();
        joint.position.y = -segmentLength;
        parent.add(joint);
        parent = joint;
      }

      const part = new THREE.Mesh(armGeometry, armMaterial);
      part.position.y = -segmentLength / 2;
      parent.add(part);

      if (segment < 4) {
        const sucker = new THREE.Mesh(suckerGeometry, suckerMaterial);
        sucker.position.set(0, -segmentLength * 0.56, 0.1);
        sucker.scale.set(0.07, 0.055, 0.026);
        parent.add(sucker);
      }

      this.armJoints.push({ pivot: parent, arm, segment });
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
