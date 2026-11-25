import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Caustics } from './Caustics.js';
import { createRockGeometry, createRockTexture } from './RockSurface.js';
import { SHALLOW_PLATEAU_CENTERS, Terrain } from './Terrain.js';

const formationCenters = [
  new THREE.Vector2(-17, 10),
  new THREE.Vector2(17, 10),
  new THREE.Vector2(0, -18),
  ...SHALLOW_PLATEAU_CENTERS.map(
    (center) => new THREE.Vector2(center.x, center.z),
  ),
];

const formationRockCount = 7;

export class Geology {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshStandardMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly spongeHostMatrices: THREE.Matrix4[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly colors = ['#596558', '#6c7161', '#797668', '#85816f'].map(
    (color) => new THREE.Color(color),
  );
  private readonly random: () => number;
  private readonly terrain: Terrain;

  constructor(terrain: Terrain, seed = 2, caustics?: Caustics) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.texture = createRockTexture(seed + 71);
    this.material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.96,
      map: this.texture,
      bumpMap: this.texture,
      bumpScale: 0.035,
    });
    this.group.name = 'geology';
    caustics?.applyToMaterial(this.material);

    const smallGeometry = this.trackGeometry(createRockGeometry(seed + 11));
    const mediumGeometry = this.trackGeometry(createRockGeometry(seed + 23));
    const boulderGeometry = this.trackGeometry(createRockGeometry(seed + 37));
    const reefGeometry = this.trackGeometry(createRockGeometry(seed + 53));

    this.addScatter(smallGeometry, 200, 0.25, 0.65, 'small rocks');
    this.addScatter(mediumGeometry, 40, 0.75, 1.5, 'medium rocks', true);
    this.addScatter(boulderGeometry, 10, 1.8, 3.2, 'boulders', true);
    this.addFormations(reefGeometry);
  }

  get spongeHosts(): readonly THREE.Matrix4[] {
    return this.spongeHostMatrices;
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.push(geometry);
    return geometry;
  }

  private addScatter(
    geometry: THREE.BufferGeometry,
    count: number,
    minSize: number,
    maxSize: number,
    name: string,
    spongeHost = false,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, this.material, count);
    mesh.name = name;

    for (let i = 0; i < count; i++) {
      const { x, z } = this.findRockLocation();
      const size = minSize + this.random() * (maxSize - minSize);
      this.setInstance(
        mesh,
        i,
        x,
        z,
        size * (0.8 + this.random() * 0.4),
        size * (0.55 + this.random() * 0.35),
        size * (0.8 + this.random() * 0.4),
        spongeHost,
      );
    }

    this.finishMesh(mesh);
  }

  private addFormations(geometry: THREE.BufferGeometry) {
    const mesh = new THREE.InstancedMesh(
      geometry,
      this.material,
      formationCenters.length * formationRockCount,
    );
    mesh.name = 'reef formations';

    let index = 0;
    for (const center of formationCenters) {
      for (let i = 0; i < formationRockCount; i++) {
        const angle = this.random() * Math.PI * 2;
        const radius = 1.5 + this.random() * 4;
        const size = 2 + this.random() * 1.5;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.y + Math.sin(angle) * radius;

        this.setInstance(
          mesh,
          index++,
          x,
          z,
          size * (0.85 + this.random() * 0.3),
          size * (0.65 + this.random() * 0.3),
          size * (0.85 + this.random() * 0.3),
          true,
        );
      }
    }

    this.finishMesh(mesh);
  }

  private findRockLocation(): { x: number; z: number } {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const x = this.random() * 280 - 140;
      const z = this.random() * 280 - 140;
      if (Math.hypot(x, z) < 12 || this.terrain.getValleyInfluence(x, z) > 0.25) {
        continue;
      }

      const nearFormation = formationCenters.some(
        (center) => Math.hypot(x - center.x, z - center.y) < 9,
      );
      if (!nearFormation) {
        return { x, z };
      }
    }

    throw new Error('Unable to find a suitable location for a rock instance.');
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    spongeHost = false,
  ) {
    this.dummy.position.set(
      x,
      this.terrain.getHeight(x, z) + scaleY * 0.85,
      z,
    );
    this.dummy.rotation.set(
      (this.random() - 0.5) * 0.4,
      this.random() * Math.PI * 2,
      (this.random() - 0.5) * 0.4,
    );
    this.dummy.scale.set(scaleX, scaleY, scaleZ);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    if (spongeHost) {
      this.spongeHostMatrices.push(this.dummy.matrix.clone());
    }
    mesh.setColorAt(
      index,
      this.colors[Math.floor(this.random() * this.colors.length)],
    );
  }

  private finishMesh(mesh: THREE.InstancedMesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.material.dispose();
    this.texture.dispose();
    this.group.clear();
  }
}
