import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createRoundedFinGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

function createFinSurfaceGeometry(
  side: -1 | 1,
  underside: boolean,
): THREE.BufferGeometry {
  const spanSegments = 18;
  const chordSegments = 10;
  const span = 3.35;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= spanSegments; row++) {
    const alongSpan = row / spanSegments;
    const leadingEdge = 0.78 - alongSpan * 0.72;
    const trailingEdge = -0.84 + alongSpan * 0.72;

    for (let column = 0; column <= chordSegments; column++) {
      const alongChord = column / chordSegments;
      const z = THREE.MathUtils.lerp(
        leadingEdge,
        trailingEdge,
        alongChord,
      );
      const curve =
        Math.sin(alongChord * Math.PI) *
        Math.sin(alongSpan * Math.PI) *
        0.045;
      positions.push(
        side * alongSpan * span,
        underside ? -curve : curve,
        z,
      );
    }
  }

  for (let row = 0; row < spanSegments; row++) {
    for (let column = 0; column < chordSegments; column++) {
      const a = row * (chordSegments + 1) + column;
      const b = a + chordSegments + 1;
      const c = a + 1;
      const d = b + 1;
      if (side > 0) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class MantaRay {
  readonly group = new THREE.Group();

  private readonly random: () => number;
  private readonly roamer: WorldRoamer;
  private readonly phase: number;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly wings: { pivot: THREE.Group; side: -1 | 1 }[] = [];
  private readonly model = new THREE.Group();
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(5, -22),
    seed = 53,
  ) {
    this.random = createSeededRandom(seed);
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      2.2,
      7,
    );
    this.phase = this.random() * Math.PI * 2;
    this.group.name = 'manta-ray';
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
      1 - Math.exp(-2.5 * dt),
    );
    this.group.position.copy(this.position);

    const flap = Math.sin(elapsedTime * 1.35 + this.phase) * 0.32;
    this.model.rotation.z =
      0.58 + Math.sin(elapsedTime * 0.45 + this.phase) * 0.07;
    for (const wing of this.wings) {
      wing.pivot.rotation.z = flap * wing.side;
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
    const topMaterial = new THREE.MeshStandardMaterial({
      color: '#48646d',
      roughness: 0.64,
      side: THREE.DoubleSide,
    });
    const undersideMaterial = new THREE.MeshStandardMaterial({
      color: '#d8e0dc',
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#182b32',
      roughness: 0.5,
    });
    applyFineGrain(topMaterial, 0.018);
    applyFineGrain(undersideMaterial, 0.012);
    this.materials.push(topMaterial, undersideMaterial, darkMaterial);

    const topBodyGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    const undersideBodyGeometry = this.trackGeometry(
      new THREE.SphereGeometry(
        1,
        36,
        24,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2,
      ),
    );
    for (const [geometry, material] of [
      [topBodyGeometry, topMaterial],
      [undersideBodyGeometry, undersideMaterial],
    ] as const) {
      const body = new THREE.Mesh(geometry, material);
      body.scale.set(1.05, 0.24, 1.28);
      this.model.add(body);
    }

    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.75, 0, 0.02);
      for (const [underside, material] of [
        [false, topMaterial],
        [true, undersideMaterial],
      ] as const) {
        const geometry = this.trackGeometry(
          createFinSurfaceGeometry(side, underside),
        );
        pivot.add(new THREE.Mesh(geometry, material));
      }
      this.wings.push({ pivot, side });
      this.model.add(pivot);
    }

    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.075, 16, 12),
    );
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, darkMaterial);
      eye.position.set(side * 0.82, 0.14, 0.68);
      this.model.add(eye);

      const cephalicFin = new THREE.Mesh(
        this.trackGeometry(
          createRoundedFinGeometry([
            side * 0.34, 0.015, 0.7,
            side * 0.67, 0.015, 1.2,
            side * 0.22, 0.015, 1.46,
          ], 0.02),
        ),
        topMaterial,
      );
      this.model.add(cephalicFin);
    }

    const mouthGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    );
    const mouth = new THREE.Mesh(mouthGeometry, darkMaterial);
    mouth.position.set(0, -0.075, 1.12);
    mouth.scale.set(0.3, 0.025, 0.018);
    this.model.add(mouth);

    const tailGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(0.006, 0.045, 1.7, 12),
    );
    const tail = new THREE.Mesh(tailGeometry, topMaterial);
    tail.position.set(0, -0.015, -1.95);
    tail.rotation.x = -Math.PI / 2;
    this.model.add(tail);
  }

  private updatePosition(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime, 0.3);
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
