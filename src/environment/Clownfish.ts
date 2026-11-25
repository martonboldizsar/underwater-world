import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

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

export class Clownfish {
  readonly group = new THREE.Group();
  private readonly terrain: Terrain;
  private readonly territoryCenter: THREE.Vector2;
  private readonly phase: number;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly tailPivot = new THREE.Group();
  private readonly pectoralFins: THREE.Mesh[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();
  private angle = 0;
  private readonly patrolRadius = 4;

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(8, -28),
    seed = 29,
  ) {
    this.terrain = terrain;
    this.territoryCenter = territoryCenter.clone();
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.group.name = 'territorial-clownfish';
    this.createModel();
    this.updatePosition(this.patrolRadius);
    this.group.position.copy(this.position);
  }

  update(dt: number, elapsedTime: number) {
    this.angle += dt * 0.24;
    const radius =
      this.patrolRadius + Math.sin(elapsedTime * 0.45 + this.phase) * 0.65;
    this.updatePosition(radius);

    this.direction.set(-Math.sin(this.angle), 0, Math.cos(this.angle));
    this.targetOrientation.setFromUnitVectors(
      this.localForward,
      this.direction,
    );
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
    bodyGeometry.scale(0.34, 0.27, 0.68);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#f27c32',
      roughness: 0.58,
    });
    this.geometries.push(bodyGeometry);
    this.materials.push(bodyMaterial);
    this.group.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: '#fff1d2',
      roughness: 0.64,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: '#26333a',
      roughness: 0.7,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#e8893c',
      roughness: 0.66,
      side: THREE.DoubleSide,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#102129',
      roughness: 0.38,
    });
    this.materials.push(stripeMaterial, trimMaterial, finMaterial, eyeMaterial);

    this.addBand(0.28, 0.24, 0.035, 1.16, 0.92, stripeMaterial);
    this.addBand(0.22, 0.24, 0.012, 1.16, 0.92, trimMaterial);
    this.addBand(0.34, 0.24, 0.012, 1.16, 0.92, trimMaterial);
    this.addBand(-0.16, 0.255, 0.036, 1.18, 0.92, stripeMaterial);
    this.addBand(-0.22, 0.255, 0.012, 1.18, 0.92, trimMaterial);
    this.addBand(-0.10, 0.255, 0.012, 1.18, 0.92, trimMaterial);
    this.addBand(-0.48, 0.19, 0.03, 1.15, 0.96, stripeMaterial);

    const tailGeometry = this.trackGeometry(
      createTriangleGeometry([0, 0.22, 0, 0, -0.22, 0, 0, 0, -0.48]),
    );
    this.tailPivot.position.z = -0.54;
    this.tailPivot.add(new THREE.Mesh(tailGeometry, finMaterial));
    this.group.add(this.tailPivot);

    const dorsalGeometry = this.trackGeometry(
      createTriangleGeometry([
        0, 0.2, -0.08,
        0, 0.42, -0.25,
        0, 0.2, -0.4,
      ]),
    );
    this.group.add(new THREE.Mesh(dorsalGeometry, finMaterial));

    const pectoralGeometries = [
      this.trackGeometry(
        createTriangleGeometry([
          -0.25, 0.02, 0.12,
          -0.54, -0.06, -0.18,
          -0.28, -0.14, -0.24,
        ]),
      ),
      this.trackGeometry(
        createTriangleGeometry([
          0.25, 0.02, 0.12,
          0.54, -0.06, -0.18,
          0.28, -0.14, -0.24,
        ]),
      ),
    ];
    for (const geometry of pectoralGeometries) {
      const fin = new THREE.Mesh(geometry, finMaterial);
      this.pectoralFins.push(fin);
      this.group.add(fin);
    }

    const eyeGeometry = new THREE.SphereGeometry(0.045, 10, 8);
    this.geometries.push(eyeGeometry);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.28, 0.07, 0.42);
      this.group.add(eye);
    }
  }

  private addBand(
    z: number,
    radius: number,
    tube: number,
    scaleX: number,
    scaleY: number,
    material: THREE.Material,
  ) {
    const geometry = this.trackGeometry(
      new THREE.TorusGeometry(radius, tube, 8, 24),
    );
    const band = new THREE.Mesh(geometry, material);
    band.position.z = z;
    band.scale.set(scaleX, scaleY, 1);
    this.group.add(band);
  }

  private updatePosition(radius: number) {
    this.position.set(
      this.territoryCenter.x + Math.cos(this.angle) * radius,
      0,
      this.territoryCenter.y + Math.sin(this.angle) * radius,
    );
    this.position.y = this.terrain.getHeight(this.position.x, this.position.z) + 3;
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.push(geometry);
    return geometry;
  }
}
