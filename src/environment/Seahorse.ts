import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createOrganicGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

interface TailJoint {
  pivot: THREE.Group;
  segment: number;
}

function createDorsalFinGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.24);
  shape.quadraticCurveTo(-0.12, -0.22, -0.2, -0.1);
  shape.quadraticCurveTo(-0.31, 0.03, -0.25, 0.1);
  shape.quadraticCurveTo(-0.2, 0.16, -0.12, 0.03);
  shape.quadraticCurveTo(-0.09, 0.21, -0.04, 0.34);
  shape.quadraticCurveTo(0.02, 0.2, 0.06, 0.08);
  shape.quadraticCurveTo(0.15, 0.19, 0.2, 0.24);
  shape.quadraticCurveTo(0.23, 0.04, 0.18, -0.08);
  shape.quadraticCurveTo(0.1, -0.2, 0, -0.24);

  const geometry = new THREE.ShapeGeometry(shape, 12);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Seahorse {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly model = new THREE.Group();
  private readonly dorsalFin = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly tailJoints: TailJoint[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(-15, -22),
    seed = 109,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      0.45,
      3.6,
    );
    this.group.name = 'seahorse';
    this.model.scale.setScalar(0.45);
    this.group.add(this.model);
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
      1 - Math.exp(-1.8 * dt),
    );
    this.group.position.copy(this.position);

    this.model.rotation.z = Math.sin(elapsedTime * 0.42 + this.phase) * 0.055;
    this.dorsalFin.rotation.y =
      Math.sin(elapsedTime * 8 + this.phase) * 0.34;
    const curl = 0.65 + Math.sin(elapsedTime * 0.75 + this.phase) * 0.16;
    for (const joint of this.tailJoints) {
      const ratio = joint.segment / (this.tailJoints.length - 1);
      joint.pivot.rotation.z = curl * (0.2 + ratio * 0.85);
      joint.pivot.rotation.x =
        Math.sin(elapsedTime * 1.1 + this.phase - joint.segment * 0.45) *
        0.035;
    }
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    this.roamer.setCollisionWorld(collisionWorld, this.group, 0.75);
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
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#cf8050',
      roughness: 0.72,
    });
    const ridgeMaterial = new THREE.MeshStandardMaterial({
      color: '#e3a15e',
      roughness: 0.76,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#bb7049',
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#172326',
      roughness: 0.38,
    });
    applyFineGrain(bodyMaterial, 0.018);
    applyFineGrain(ridgeMaterial, 0.018);
    applyFineGrain(finMaterial, 0.012);
    this.materials.push(
      bodyMaterial,
      ridgeMaterial,
      finMaterial,
      eyeMaterial,
    );

    const bodyGeometry = this.trackGeometry(
      createOrganicGeometry(
        [
          { center: [0.5, 0.12, 0.46], radius: 0.13 },
          { center: [0.5, 0.3, 0.46], radius: 0.2 },
          { center: [0.5, 0.48, 0.48], radius: 0.24 },
          { center: [0.5, 0.66, 0.5], radius: 0.18 },
          { center: [0.5, 0.78, 0.58], radius: 0.23 },
          { center: [0.5, 0.78, 0.74], radius: 0.12 },
          { center: [0.5, 0.86, 0.52], radius: 0.09 },
        ],
        new THREE.Vector3(0.6, 1.65, 0.8),
      ),
    );
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0.175, 0.12);
    this.model.add(body);

    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.065, 16, 12),
    );
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.25, 0.75, 0.16);
      this.model.add(eye);
    }

    const dorsalGeometry = this.trackGeometry(createDorsalFinGeometry());
    const dorsalMesh = new THREE.Mesh(dorsalGeometry, ridgeMaterial);
    this.dorsalFin.position.set(0, -0.02, -0.24);
    this.dorsalFin.add(dorsalMesh);
    this.model.add(this.dorsalFin);

    const pectoralGeometry = this.trackGeometry(
      createDorsalFinGeometry(),
    );
    const pectoralFin = new THREE.Mesh(pectoralGeometry, finMaterial);
    pectoralFin.position.set(0.2, 0.48, -0.08);
    pectoralFin.scale.setScalar(0.45);
    this.model.add(pectoralFin);

    const tailSegmentLength = 0.15;
    const tailSegmentCount = 11;
    const tailGeometry = this.trackGeometry(
      new THREE.CapsuleGeometry(0.065, 0.15, 5, 12),
    );
    this.tail.position.set(0, -0.48, 0);
    this.model.add(this.tail);
    let tailParent = this.tail;
    for (let segment = 0; segment < tailSegmentCount; segment++) {
      if (segment > 0) {
        const joint = new THREE.Group();
        joint.position.y = -tailSegmentLength;
        tailParent.add(joint);
        tailParent = joint;
      }

      const tailSegment = new THREE.Mesh(tailGeometry, bodyMaterial);
      tailSegment.position.y = -tailSegmentLength / 2;
      tailParent.add(tailSegment);
      this.tailJoints.push({ pivot: tailParent, segment });
    }
  }

  private updatePosition(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime, 0.2);
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
