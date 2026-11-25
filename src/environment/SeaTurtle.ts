import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createOrganicGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

function createFlipperGeometry(
  side: -1 | 1,
  rear: boolean,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const points = rear
    ? [
        [0, 0],
        [side * 0.16, -0.2],
        [side * 0.68, -0.38],
        [side * 0.58, 0.04],
        [side * 0.18, 0.18],
      ]
    : [
        [0, 0],
        [side * 0.28, 0.38],
        [side * 1.2, 0.66],
        [side * 1.06, -0.08],
        [side * 0.26, -0.3],
      ];
  const firstPoint = points[0];
  if (!firstPoint) {
    throw new Error('Turtle flipper outline is incomplete.');
  }
  const previousPoint = points[points.length - 1];
  if (!previousPoint) {
    throw new Error('Turtle flipper outline is incomplete.');
  }
  const toVector = (point: number[]) =>
    new THREE.Vector2(point[0] ?? 0, point[1] ?? 0);
  const firstEntry = toVector(firstPoint).lerp(toVector(previousPoint), 0.18);
  shape.moveTo(firstEntry.x, firstEntry.y);
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    if (!point || !previous || !next) {
      throw new Error('Turtle flipper outline is incomplete.');
    }

    const corner = toVector(point);
    const entry = corner.clone().lerp(toVector(previous), 0.18);
    const exit = corner.clone().lerp(toVector(next), 0.18);
    shape.lineTo(entry.x, entry.y);
    shape.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.02,
    bevelThickness: 0.015,
    curveSegments: 12,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface Flipper {
  pivot: THREE.Group;
  side: -1 | 1;
  rear: boolean;
}

export class SeaTurtle {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly flippers: Flipper[] = [];
  private readonly model = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(-10, -24),
    seed = 61,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      1.35,
      7.5,
    );
    this.group.name = 'sea-turtle';
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
      1 - Math.exp(-2.2 * dt),
    );
    this.group.position.copy(this.position);

    this.model.rotation.z = Math.sin(elapsedTime * 0.35 + this.phase) * 0.1;
    this.headPivot.rotation.x =
      Math.sin(elapsedTime * 1.2 + this.phase) * 0.045;
    for (const flipper of this.flippers) {
      const speed = flipper.rear ? 1.8 : 2.3;
      const amplitude = flipper.rear ? 0.2 : 0.36;
      flipper.pivot.rotation.z =
        Math.sin(elapsedTime * speed + this.phase) *
        amplitude *
        flipper.side;
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
      color: '#788650',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const undersideMaterial = new THREE.MeshStandardMaterial({
      color: '#c4b995',
      roughness: 0.84,
      side: THREE.DoubleSide,
    });
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: '#4d5739',
      roughness: 0.74,
      side: THREE.DoubleSide,
    });
    const scuteMaterials = ['#68734b', '#747d51', '#5b6542'].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.76 }),
    );
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#17221d',
      roughness: 0.42,
    });
    applyFineGrain(skinMaterial, 0.016);
    applyFineGrain(undersideMaterial, 0.012);
    applyFineGrain(shellMaterial, 0.025);
    for (const material of scuteMaterials) {
      applyFineGrain(material, 0.022);
    }
    this.materials.push(
      skinMaterial,
      undersideMaterial,
      shellMaterial,
      ...scuteMaterials,
      eyeMaterial,
    );

    const shellScale = new THREE.Vector3(1.05, 0.42, 1.3);
    const topShellGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    );
    const bottomShellGeometry = this.trackGeometry(
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
      [topShellGeometry, shellMaterial],
      [bottomShellGeometry, undersideMaterial],
    ] as const) {
      const shell = new THREE.Mesh(geometry, material);
      shell.position.y = 0.12;
      shell.scale.copy(shellScale);
      this.model.add(shell);
    }

    const rimGeometry = this.trackGeometry(
      new THREE.TorusGeometry(1, 0.055, 12, 48),
    );
    const rim = new THREE.Mesh(rimGeometry, shellMaterial);
    rim.position.y = -0.02;
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.03, 1.28, 1);
    this.model.add(rim);

    const scuteGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    );
    const scutes = [
      [0, 0.48],
      [0, 0],
      [0, -0.48],
      [-0.58, 0.28],
      [0.58, 0.28],
      [-0.58, -0.34],
      [0.58, -0.34],
    ] as const;
    for (let i = 0; i < scutes.length; i++) {
      const scutePosition = scutes[i];
      const material = scuteMaterials[i % scuteMaterials.length];
      if (!scutePosition || !material) {
        throw new Error('Turtle shell scute data is incomplete.');
      }

      const [x, z] = scutePosition;
      const normalizedRadius =
        (x / shellScale.x) ** 2 + (z / shellScale.z) ** 2;
      const y =
        0.12 +
        shellScale.y * Math.sqrt(Math.max(0, 1 - normalizedRadius)) +
        0.025;
      const scute = new THREE.Mesh(scuteGeometry, material);
      scute.position.set(x, y, z);
      scute.scale.set(0.31, 0.035, 0.29);
      this.model.add(scute);
    }

    const bodyGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 30, 20),
    );
    const body = new THREE.Mesh(bodyGeometry, skinMaterial);
    body.position.y = -0.06;
    body.scale.set(0.58, 0.24, 1.08);
    this.model.add(body);

    const headGeometry = this.trackGeometry(
      createOrganicGeometry(
        [
          { center: [0.5, 0.5, 0.28], radius: 0.17 },
          { center: [0.5, 0.5, 0.46], radius: 0.2 },
          { center: [0.5, 0.5, 0.6], radius: 0.27 },
          { center: [0.5, 0.5, 0.78], radius: 0.17 },
        ],
        new THREE.Vector3(0.68, 0.6, 1.3),
      ),
    );
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    this.headPivot.position.set(0, 0.03, 1.2);
    this.headPivot.add(head);
    this.model.add(this.headPivot);

    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.07, 16, 12),
    );
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.28, 0.13, 0.57);
      this.headPivot.add(eye);
    }

    const tailGeometry = this.trackGeometry(
      new THREE.ConeGeometry(0.1, 0.48, 14),
    );
    const tail = new THREE.Mesh(tailGeometry, skinMaterial);
    tail.position.set(0, -0.02, -1.42);
    tail.rotation.x = -Math.PI / 2;
    this.model.add(tail);

    for (const side of [-1, 1] as const) {
      this.addFlipper(side, false, skinMaterial);
      this.addFlipper(side, true, skinMaterial);
    }
  }

  private addFlipper(
    side: -1 | 1,
    rear: boolean,
    material: THREE.Material,
  ) {
    const pivot = new THREE.Group();
    pivot.position.set(
      side * (rear ? 0.48 : 0.64),
      -0.04,
      rear ? -0.72 : 0.54,
    );
    if (rear) {
      pivot.scale.setScalar(0.62);
    }

    const geometry = this.trackGeometry(
      createFlipperGeometry(side, rear),
    );
    pivot.add(new THREE.Mesh(geometry, material));
    this.flippers.push({ pivot, side, rear });
    this.model.add(pivot);
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
