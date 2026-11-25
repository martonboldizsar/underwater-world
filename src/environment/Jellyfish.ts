import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

interface TentacleJoint {
  pivot: THREE.Group;
  tentacle: number;
  segment: number;
}

export class Jellyfish {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly bell = new THREE.Group();
  private readonly tentacleJoints: TentacleJoint[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();
  private readonly baseBellScale = new THREE.Vector3(0.86, 0.66, 0.86);

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(-6, -15),
    seed = 83,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      0.65,
      10,
    );
    this.group.name = 'jellyfish';
    this.group.scale.setScalar(0.35);
    this.group.add(this.bell);
    this.createModel();
  }

  update(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime, 0.45);
    this.position.copy(this.roamer.position);
    this.group.position.copy(this.position);

    this.direction.copy(this.roamer.direction);
    this.targetOrientation.setFromUnitVectors(
      this.localForward,
      this.direction,
    );
    this.group.quaternion.slerp(
      this.targetOrientation,
      1 - Math.exp(-1.4 * dt),
    );

    const pulse = Math.sin(elapsedTime * 1.7 + this.phase);
    this.bell.scale.set(
      this.baseBellScale.x * (1 - pulse * 0.08),
      this.baseBellScale.y * (1 + pulse * 0.14),
      this.baseBellScale.z * (1 - pulse * 0.08),
    );
    this.bell.rotation.z = Math.sin(elapsedTime * 0.45 + this.phase) * 0.08;

    for (const joint of this.tentacleJoints) {
      const wave =
        elapsedTime * 0.9 +
        this.phase +
        joint.tentacle * 0.72 -
        joint.segment * 0.42;
      const bend = 0.035 + joint.segment * 0.025;
      joint.pivot.rotation.x = Math.sin(wave) * bend;
      joint.pivot.rotation.z = Math.cos(wave) * bend;
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
    const bellMaterial = new THREE.MeshPhysicalMaterial({
      color: '#d9d5f1',
      roughness: 0.2,
      clearcoat: 0.55,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: '#d7e3ed',
      roughness: 0.35,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: '#d2abc7',
      roughness: 0.48,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const tentacleMaterial = new THREE.MeshStandardMaterial({
      color: '#c4c9e6',
      roughness: 0.46,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    applyFineGrain(bellMaterial, 0.004);
    applyFineGrain(rimMaterial, 0.005);
    applyFineGrain(coreMaterial, 0.006);
    applyFineGrain(tentacleMaterial, 0.004);
    this.materials.push(
      bellMaterial,
      rimMaterial,
      coreMaterial,
      tentacleMaterial,
    );

    const bellGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    const bellMesh = new THREE.Mesh(bellGeometry, bellMaterial);
    bellMesh.scale.copy(this.baseBellScale);
    this.bell.add(bellMesh);

    const rimGeometry = this.trackGeometry(
      new THREE.TorusGeometry(0.82, 0.045, 12, 48),
    );
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI / 2;
    this.bell.add(rim);

    const coreGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    );
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.position.y = -0.12;
    core.scale.set(0.3, 0.24, 0.3);
    this.bell.add(core);

    const tentacleLength = 0.48;
    const tentacleGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(0.014, 0.006, tentacleLength, 10),
    );
    const outerTentacles = 8;
    for (let tentacle = 0; tentacle < outerTentacles; tentacle++) {
      const angle = (tentacle / outerTentacles) * Math.PI * 2;
      this.addTentacle(
        Math.cos(angle) * 0.48,
        Math.sin(angle) * 0.48,
        5,
        tentacleLength,
        tentacleGeometry,
        tentacleMaterial,
        tentacle,
      );
    }

    const oralArmCount = 4;
    const oralArmLength = tentacleLength * 0.38;
    const oralArmGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(0.014, 0.006, oralArmLength, 10),
    );
    for (let arm = 0; arm < oralArmCount; arm++) {
      const angle = (arm / oralArmCount) * Math.PI * 2 + Math.PI / 4;
      this.addTentacle(
        Math.cos(angle) * 0.16,
        Math.sin(angle) * 0.16,
        3,
        oralArmLength,
        oralArmGeometry,
        coreMaterial,
        outerTentacles + arm,
      );
    }
  }

  private addTentacle(
    x: number,
    z: number,
    segmentCount: number,
    segmentLength: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    tentacleIndex: number,
  ) {
    let parent = new THREE.Group();
    parent.position.set(x, -0.04, z);
    this.bell.add(parent);

    for (let segment = 0; segment < segmentCount; segment++) {
      if (segment > 0) {
        const joint = new THREE.Group();
        joint.position.y = -segmentLength;
        parent.add(joint);
        parent = joint;
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = -segmentLength / 2;
      parent.add(mesh);
      this.tentacleJoints.push({
        pivot: parent,
        tentacle: tentacleIndex,
        segment,
      });
    }
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
