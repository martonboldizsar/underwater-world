import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { createRockGeometry, createRockTexture } from './RockSurface.js';
import { Terrain } from './Terrain.js';

export interface CaveSite {
  name: string;
  x: number;
  z: number;
  heading: number;
  entranceHalfWidth: number;
  entranceHeight: number;
  tunnelLength: number;
  chamberHalfWidth: number;
  chamberHeight: number;
  chamberLength: number;
  closedBack: boolean;
}

interface CaveParticles {
  points: THREE.Points;
  phase: number;
}

export const CAVE_LOCATIONS = [
  {
    name: 'western reef cave',
    x: -68,
    z: 28,
  },
  {
    name: 'eastern deep cave',
    x: 70,
    z: 72,
  },
] as const;

export const CAVE_SITES: readonly CaveSite[] = [
  {
    ...CAVE_LOCATIONS[0],
    heading: Math.PI / 5,
    entranceHalfWidth: 5.2,
    entranceHeight: 6.1,
    tunnelLength: 18,
    chamberHalfWidth: 7.1,
    chamberHeight: 7.5,
    chamberLength: 12,
    closedBack: true,
  },
  {
    ...CAVE_LOCATIONS[1],
    heading: -Math.PI / 4,
    entranceHalfWidth: 6,
    entranceHeight: 7.1,
    tunnelLength: 22,
    chamberHalfWidth: 8.3,
    chamberHeight: 8.8,
    chamberLength: 16,
    closedBack: false,
  },
];

function createTunnelGeometry(
  site: CaveSite,
  terrain: Terrain,
  floorHeight: number,
  seed: number,
): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const length = site.tunnelLength + site.chamberLength;
  const lengthSegments = 56;
  const archSegments = 32;
  const columns = archSegments + 1;
  const positions = new Float32Array((lengthSegments + 1) * columns * 3);
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array((lengthSegments + 1) * columns * 2);
  const indices: number[] = [];
  const cosine = Math.cos(site.heading);
  const sine = Math.sin(site.heading);
  const floorLip = 0.25;

  for (let row = 0; row <= lengthSegments; row++) {
    const distance = (row / lengthSegments) * length;
    const chamberBlend = THREE.MathUtils.smoothstep(
      distance,
      site.tunnelLength - 2,
      site.tunnelLength + 2,
    );
    const halfWidth = THREE.MathUtils.lerp(
      site.entranceHalfWidth,
      site.chamberHalfWidth,
      chamberBlend,
    );
    const height = THREE.MathUtils.lerp(
      site.entranceHeight,
      site.chamberHeight,
      chamberBlend,
    );
    const localZ = -distance;

    for (let column = 0; column <= archSegments; column++) {
      const angle = (column / archSegments) * Math.PI;
      const roughness = 0.96 + random() * 0.08;
      const localX = Math.cos(angle) * halfWidth * roughness;
      const worldX = site.x + cosine * localX + sine * localZ;
      const worldZ = site.z - sine * localX + cosine * localZ;
      const seabedOffset =
        terrain.getHeight(worldX, worldZ) - floorHeight;
      const vertex = row * columns + column;
      const positionOffset = vertex * 3;
      const uvOffset = vertex * 2;
      const depthRatio = distance / length;
      const brightness = 0.22 - depthRatio * 0.12 + random() * 0.05;

      positions[positionOffset] = localX;
      positions[positionOffset + 1] =
        seabedOffset +
        floorLip +
        Math.sin(angle) * height * roughness +
        (random() - 0.5) * 0.22;
      positions[positionOffset + 2] = localZ;
      colors[positionOffset] = brightness * 0.75;
      colors[positionOffset + 1] = brightness * 0.88;
      colors[positionOffset + 2] = brightness * 0.82;
      uvs[uvOffset] = (column / archSegments) * 2.5;
      uvs[uvOffset + 1] = (row / lengthSegments) * 3;
    }
  }

  for (let row = 0; row < lengthSegments; row++) {
    for (let column = 0; column < archSegments; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Caves {
  readonly group = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly rockMeshes: THREE.InstancedMesh[] = [];
  private readonly particles: CaveParticles[] = [];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dummy = new THREE.Object3D();

  constructor(terrain: Terrain, seed = 19) {
    this.group.name = 'underwater-caves';
    const rockTexture = createRockTexture(seed + 71);
    this.textures.push(rockTexture);
    const rockGeometry = createRockGeometry(seed);
    this.geometries.push(rockGeometry);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.96,
      map: rockTexture,
      bumpMap: rockTexture,
      bumpScale: 0.035,
    });
    this.materials.push(rockMaterial);

    CAVE_SITES.forEach((site, index) => {
      this.createCave(terrain, site, seed + index * 31, rockGeometry, rockMaterial);
    });
  }

  update(elapsedTime: number) {
    for (const cave of this.particles) {
      cave.points.position.y = Math.sin(elapsedTime * 0.42 + cave.phase) * 0.16;
    }
  }

  dispose() {
    for (const mesh of this.rockMeshes) {
      mesh.dispose();
    }
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    for (const texture of this.textures) {
      texture.dispose();
    }
    this.group.clear();
  }

  private createCave(
    terrain: Terrain,
    site: CaveSite,
    seed: number,
    rockGeometry: THREE.BufferGeometry,
    rockMaterial: THREE.MeshStandardMaterial,
  ) {
    const random = createSeededRandom(seed);
    const cave = new THREE.Group();
    cave.name = site.name;
    const floorHeight = terrain.getHeight(site.x, site.z);
    cave.position.set(
      site.x,
      floorHeight,
      site.z,
    );
    const heading = new THREE.Quaternion().setFromAxisAngle(
      this.up,
      site.heading,
    );
    cave.quaternion.copy(heading);

    const interiorMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      side: THREE.DoubleSide,
      vertexColors: true,
      map: this.textures[0],
      bumpMap: this.textures[0],
      bumpScale: 0.025,
    });
    this.materials.push(interiorMaterial);
    const tunnelGeometry = createTunnelGeometry(
      site,
      terrain,
      floorHeight,
      seed + 7,
    );
    this.geometries.push(tunnelGeometry);
    const tunnel = new THREE.Mesh(tunnelGeometry, interiorMaterial);
    tunnel.name = 'rock cave ceiling and interior';
    tunnel.castShadow = true;
    tunnel.receiveShadow = true;
    cave.add(tunnel);

    this.addEntranceRocks(
      cave,
      terrain,
      floorHeight,
      site,
      seed,
      rockGeometry,
      rockMaterial,
    );
    if (site.closedBack) {
      this.addRockSealedEnd(
        cave,
        site,
        seed,
        rockGeometry,
        rockMaterial,
      );
    }
    this.addParticles(cave, site, random);
    this.group.add(cave);
  }

  private addEntranceRocks(
    cave: THREE.Group,
    terrain: Terrain,
    floorHeight: number,
    site: CaveSite,
    seed: number,
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
  ) {
    const random = createSeededRandom(seed + 13);
    const count = 36;
    const rocks = new THREE.InstancedMesh(geometry, material, count);
    rocks.name = 'cave entrance boulders';
    const cosine = Math.cos(site.heading);
    const sine = Math.sin(site.heading);
    const rockColors = ['#596558', '#6c7161', '#797668', '#85816f'];

    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      let z: number;
      let size: number;

      if (i < 12 || i >= 28) {
        const side = i % 2 === 0 ? -1 : 1;
        size = 1.3 + random() * 1.9;
        x =
          side *
          (site.entranceHalfWidth + 1.4 + random() * (i < 12 ? 2 : 5));
        z = (random() - 0.5) * (i < 12 ? 8 : 13);
        const worldX = site.x + cosine * x + sine * z;
        const worldZ = site.z - sine * x + cosine * z;
        y =
          terrain.getHeight(worldX, worldZ) -
          floorHeight +
          size * (0.55 + random() * 0.08);
      } else {
        const archIndex = i - 12;
        const archCount = 16;
        const angle = (archIndex / (archCount - 1)) * Math.PI;
        const radius = site.entranceHalfWidth + 1.8 + random() * 0.9;
        size = 1.7 + random() * 1.7;
        x = Math.cos(angle) * radius;
        z = (random() - 0.5) * 3;
        const worldX = site.x + cosine * x + sine * z;
        const worldZ = site.z - sine * x + cosine * z;
        y =
          terrain.getHeight(worldX, worldZ) -
          floorHeight +
          0.35 +
          Math.sin(angle) * (site.entranceHeight + 1.1);
      }

      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(
        (random() - 0.5) * 0.3,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.3,
      );
      this.dummy.scale.set(
        size * (0.8 + random() * 0.4),
        size * (0.65 + random() * 0.35),
        size * (0.8 + random() * 0.4),
      );
      this.dummy.updateMatrix();
      rocks.setMatrixAt(i, this.dummy.matrix);
      const color = rockColors[Math.floor(random() * rockColors.length)];
      if (!color) {
        throw new Error('Cave rock color is missing.');
      }
      rocks.setColorAt(i, new THREE.Color(color));
    }

    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) {
      rocks.instanceColor.needsUpdate = true;
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.computeBoundingBox();
    rocks.computeBoundingSphere();
    cave.add(rocks);
    this.rockMeshes.push(rocks);
  }

  private addRockSealedEnd(
    cave: THREE.Group,
    site: CaveSite,
    seed: number,
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
  ) {
    const random = createSeededRandom(seed + 29);
    const rocks = new THREE.InstancedMesh(geometry, material, 5);
    rocks.name = 'closed cave end';
    const endZ = -(site.tunnelLength + site.chamberLength) + 1;
    const rockPositions = [
      [
        0,
        site.chamberHeight * 0.48,
        site.chamberHalfWidth * 0.82,
        site.chamberHeight * 0.6,
      ],
      [
        -site.chamberHalfWidth * 0.56,
        site.chamberHeight * 0.24,
        site.chamberHalfWidth * 0.55,
        site.chamberHeight * 0.45,
      ],
      [
        site.chamberHalfWidth * 0.56,
        site.chamberHeight * 0.28,
        site.chamberHalfWidth * 0.55,
        site.chamberHeight * 0.5,
      ],
      [
        0,
        site.chamberHeight * 0.88,
        site.chamberHalfWidth * 0.58,
        site.chamberHeight * 0.34,
      ],
      [
        0,
        site.chamberHeight * 0.08,
        site.chamberHalfWidth * 0.55,
        site.chamberHeight * 0.2,
      ],
    ] as const;

    for (let i = 0; i < rockPositions.length; i++) {
      const position = rockPositions[i];
      if (!position) {
        throw new Error('Closed cave end rock position is missing.');
      }

      this.dummy.position.set(position[0], position[1], endZ);
      this.dummy.rotation.set(
        (random() - 0.5) * 0.3,
        random() * Math.PI * 2,
        (random() - 0.5) * 0.3,
      );
      this.dummy.scale.set(
        position[2] * (0.9 + random() * 0.2),
        position[3] * (0.9 + random() * 0.2),
        1.4 + random() * 0.6,
      );
      this.dummy.updateMatrix();
      rocks.setMatrixAt(i, this.dummy.matrix);
      rocks.setColorAt(
        i,
        new THREE.Color(random() < 0.5 ? '#313a37' : '#3c4540'),
      );
    }

    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) {
      rocks.instanceColor.needsUpdate = true;
    }
    rocks.computeBoundingBox();
    rocks.computeBoundingSphere();
    cave.add(rocks);
    this.rockMeshes.push(rocks);
  }

  private addParticles(
    cave: THREE.Group,
    site: CaveSite,
    random: () => number,
  ) {
    const count = 36;
    const positions = new Float32Array(count * 3);
    const chamberStart = site.tunnelLength;
    const chamberLength = site.chamberLength;
    for (let i = 0; i < count; i++) {
      positions[i * 3] =
        (random() - 0.5) * site.chamberHalfWidth * 1.3;
      positions[i * 3 + 1] =
        0.8 + random() * site.chamberHeight * 0.62;
      positions[i * 3 + 2] =
        -(chamberStart + random() * chamberLength);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.computeBoundingSphere();
    const material = new THREE.PointsMaterial({
      color: '#9ab8b7',
      size: 0.075,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.geometries.push(geometry);
    this.materials.push(material);

    const points = new THREE.Points(geometry, material);
    points.name = 'suspended cave particles';
    cave.add(points);
    this.particles.push({ points, phase: random() * Math.PI * 2 });
  }
}
