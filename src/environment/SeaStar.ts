import * as THREE from 'three';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import { Terrain } from './Terrain.js';

export class SeaStar {
  readonly group = new THREE.Group();

  private readonly terrain: Terrain;
  private readonly territoryCenter: THREE.Vector2;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly normal = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(12, -32),
  ) {
    this.terrain = terrain;
    this.territoryCenter = territoryCenter.clone();
    this.group.name = 'sea-star';
    this.group.scale.setScalar(0.3);
    this.createModel();
    this.updatePosition();
  }

  update(_dt: number, _elapsedTime: number) {}

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
      color: '#d8875b',
      roughness: 0.78,
      side: THREE.DoubleSide,
    });
    const centerMaterial = new THREE.MeshStandardMaterial({
      color: '#b9654c',
      roughness: 0.75,
    });
    const bumpMaterial = new THREE.MeshStandardMaterial({
      color: '#e5a06c',
      roughness: 0.8,
    });
    applyFineGrain(bodyMaterial, 0.02);
    applyFineGrain(centerMaterial, 0.016);
    applyFineGrain(bumpMaterial, 0.018);
    this.materials.push(bodyMaterial, centerMaterial, bumpMaterial);

    const shape = new THREE.Shape();
    const armCount = 5;
    const outline: THREE.Vector2[] = [];
    for (let point = 0; point < armCount * 2; point++) {
      const radius = point % 2 === 0 ? 1.15 : 0.58;
      const angle = (point / (armCount * 2)) * Math.PI * 2 - Math.PI / 2;
      outline.push(
        new THREE.Vector2(
          Math.cos(angle) * radius,
          -Math.sin(angle) * radius,
        ),
      );
    }
    const first = outline[0];
    const previousFirst = outline[outline.length - 1];
    if (!first || !previousFirst) {
      throw new Error('Sea-star outline is incomplete.');
    }
    const firstEntry = first.clone().lerp(previousFirst, 0.12);
    shape.moveTo(firstEntry.x, firstEntry.y);
    for (let point = 0; point < outline.length; point++) {
      const corner = outline[point];
      const previous = outline[(point + outline.length - 1) % outline.length];
      const next = outline[(point + 1) % outline.length];
      if (!corner || !previous || !next) {
        throw new Error('Sea-star outline is incomplete.');
      }

      const entry = corner.clone().lerp(previous, 0.12);
      const exit = corner.clone().lerp(next, 0.12);
      shape.lineTo(entry.x, entry.y);
      shape.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y);
    }
    shape.closePath();

    const starGeometry = this.trackGeometry(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.14,
        bevelEnabled: true,
        bevelSegments: 4,
        bevelSize: 0.08,
        bevelThickness: 0.04,
        steps: 1,
      }),
    );
    starGeometry.rotateX(-Math.PI / 2);
    starGeometry.translate(0, 0.02, 0);
    starGeometry.computeVertexNormals();
    starGeometry.computeBoundingSphere();
    this.group.add(new THREE.Mesh(starGeometry, bodyMaterial));

    const centerGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    );
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.position.y = 0.16;
    center.scale.set(0.37, 0.08, 0.37);
    this.group.add(center);

    const bumpGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 14, 10),
    );
    for (let arm = 0; arm < armCount; arm++) {
      const angle = (arm / armCount) * Math.PI * 2 - Math.PI / 2;
      const bump = new THREE.Mesh(bumpGeometry, bumpMaterial);
      bump.position.set(
        Math.cos(angle) * 0.72,
        0.16,
        Math.sin(angle) * 0.72,
      );
      bump.scale.set(0.09, 0.055, 0.09);
      this.group.add(bump);
    }
  }

  private updatePosition() {
    const x = this.territoryCenter.x;
    const z = this.territoryCenter.y;
    const sampleOffset = 0.15;
    const leftHeight = this.terrain.getHeight(x - sampleOffset, z);
    const rightHeight = this.terrain.getHeight(x + sampleOffset, z);
    const backHeight = this.terrain.getHeight(x, z - sampleOffset);
    const frontHeight = this.terrain.getHeight(x, z + sampleOffset);
    this.normal
      .set(
        leftHeight - rightHeight,
        sampleOffset * 2,
        backHeight - frontHeight,
      )
      .normalize();
    this.group.position.set(x, this.terrain.getHeight(x, z) + 0.03, z);
    this.group.quaternion.setFromUnitVectors(this.up, this.normal);
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
