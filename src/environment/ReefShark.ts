import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createRoundedFinGeometry,
  ensurePlanarUv,
} from './AnimalSurface.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

export class ReefShark {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly model = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly pectoralFins: THREE.Mesh[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(2, -13),
    seed = 71,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      2.5,
      7,
    );
    this.group.name = 'reef-shark';
    this.group.add(this.model);
    this.model.scale.setScalar(1.5);
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
      1 - Math.exp(-2.8 * dt),
    );
    this.group.position.copy(this.position);

    this.tailPivot.rotation.y =
      Math.sin(elapsedTime * 2.7 + this.phase) * 0.36;
    this.model.rotation.z =
      Math.sin(elapsedTime * 0.4 + this.phase) * 0.035;
    for (let i = 0; i < this.pectoralFins.length; i++) {
      const fin = this.pectoralFins[i];
      if (fin) {
        fin.rotation.z = Math.sin(
          elapsedTime * 1.8 + this.phase + i * Math.PI,
        ) * 0.045;
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
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#667b78',
      roughness: 0.68,
      side: THREE.DoubleSide,
    });
    const bellyMaterial = new THREE.MeshStandardMaterial({
      color: '#c6c8b3',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#5d716e',
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#263d40',
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#131b1c',
      roughness: 0.36,
    });
    applyFineGrain(bodyMaterial, 0.018);
    applyFineGrain(bellyMaterial, 0.012);
    applyFineGrain(finMaterial, 0.014);
    this.materials.push(
      bodyMaterial,
      bellyMaterial,
      finMaterial,
      darkMaterial,
      eyeMaterial,
    );

    const bodyProfile = [
      [0, -1.65],
      [0.12, -1.52],
      [0.26, -1.18],
      [0.42, -0.66],
      [0.52, -0.1],
      [0.49, 0.38],
      [0.38, 0.82],
      [0.25, 1.15],
      [0.12, 1.42],
      [0, 1.58],
    ].map(([radius, length]) => {
      if (radius === undefined || length === undefined) {
        throw new Error('Shark body profile is incomplete.');
      }
      return new THREE.Vector2(radius, length);
    });
    const bodyGeometry = this.trackGeometry(
      new THREE.LatheGeometry(bodyProfile, 48),
    );
    bodyGeometry.rotateX(Math.PI / 2);
    bodyGeometry.computeVertexNormals();
    bodyGeometry.computeBoundingSphere();
    this.model.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

    const bellyGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 28, 18),
    );
    const belly = new THREE.Mesh(bellyGeometry, bellyMaterial);
    belly.position.set(0, -0.28, 0.05);
    belly.scale.set(0.4, 0.16, 1.06);
    this.model.add(belly);

    const firstDorsal = this.addFin(
      [
        0, 0.32, -0.5,
        0, 0.96, -0.08,
        0, 0.33, 0.34,
      ],
      finMaterial,
    );
    this.model.add(firstDorsal);
    this.model.add(
      this.addFin(
        [
          0, 0.25, -1.22,
          0, 0.57, -0.96,
          0, 0.26, -0.72,
        ],
        finMaterial,
      ),
    );
    this.model.add(
      this.addFin(
        [
          0, -0.25, -1.15,
          0, -0.62, -0.88,
          0, -0.22, -0.7,
        ],
        finMaterial,
      ),
    );

    this.model.add(
      this.addFin(
        [
          0, 0.76, -0.16,
          0, 0.94, -0.08,
          0, 0.76, 0.02,
        ],
        darkMaterial,
      ),
    );

    for (const side of [-1, 1]) {
      const pectoral = this.addFin(
        [
          side * 0.32, -0.12, 0.25,
          side * 1.15, -0.31, -0.42,
          side * 0.42, -0.38, -0.58,
        ],
        finMaterial,
      );
      this.pectoralFins.push(pectoral);
      this.model.add(pectoral);

      this.model.add(
        this.addFin(
          [
            side * 0.2, -0.12, -0.82,
            side * 0.62, -0.2, -1.18,
            side * 0.23, -0.25, -1.22,
          ],
          finMaterial,
        ),
      );
    }

    this.tailPivot.position.z = -1.5;
    this.tailPivot.add(
      this.addFin(
        [
          0, 0.04, 0,
          0, 0.9, -0.6,
          0, 0.2, -0.32,
        ],
        finMaterial,
      ),
    );
    this.tailPivot.add(
      this.addFin(
        [
          0, 0.02, 0,
          0, -0.53, -0.54,
          0, -0.13, -0.12,
        ],
        finMaterial,
      ),
    );
    this.model.add(this.tailPivot);

    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.065, 16, 12),
    );
    const mouthGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 20, 14),
    );
    const mouth = new THREE.Mesh(mouthGeometry, darkMaterial);
    mouth.position.set(0, -0.09, 1.51);
    mouth.scale.set(0.22, 0.025, 0.018);
    this.model.add(mouth);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.3, 0.13, 1.12);
      this.model.add(eye);

      for (let slit = 0; slit < 5; slit++) {
        const z = 0.47 - slit * 0.105;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.37, -0.08, z + 0.035),
          new THREE.Vector3(side * 0.4, 0, z),
          new THREE.Vector3(side * 0.37, 0.08, z - 0.035),
        ]);
        const gillGeometry = this.trackGeometry(
          new THREE.TubeGeometry(curve, 8, 0.009, 8, false),
        );
        const gill = new THREE.Mesh(gillGeometry, darkMaterial);
        this.model.add(gill);
      }
    }
  }

  private addFin(vertices: number[], material: THREE.Material): THREE.Mesh {
    const geometry = this.trackGeometry(
      createRoundedFinGeometry(vertices, 0.035),
    );
    return new THREE.Mesh(geometry, material);
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
