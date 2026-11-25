import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

interface SpongePlacement {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  scale: number;
  color: THREE.Color;
}

const spongeColors = ['#d58b54', '#bd7650', '#c4a26b', '#a96f58'].map(
  (color) => new THREE.Color(color),
);

function createSpongeTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create the sponge pore texture.');
  }

  const random = createSeededRandom(seed);
  context.fillStyle = '#e6d6c3';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let pore = 0; pore < 1900; pore++) {
    const radius = 0.25 + random() * 1.05;
    context.beginPath();
    context.arc(
      random() * canvas.width,
      random() * canvas.height,
      radius,
      0,
      Math.PI * 2,
    );
    context.fillStyle =
      random() > 0.46
        ? 'rgba(92, 56, 38, 0.42)'
        : 'rgba(255, 242, 222, 0.55)';
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1.5);
  texture.anisotropy = 4;
  return texture;
}

function createTubeClusterGeometry(seed: number): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 24;

  const addVertex = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    const shade = 0.78 + random() * 0.22;
    colors.push(shade, shade * (0.96 + random() * 0.08), shade * 0.9);
    uvs.push(u, v);
  };

  const tubeCount = 5 + Math.floor(random() * 4);
  for (let tube = 0; tube < tubeCount; tube++) {
    const offsetX = (random() - 0.5) * 0.42;
    const offsetZ = (random() - 0.5) * 0.42;
    const height = 0.72 + random() * 0.82;
    const baseRadius = 0.13 + random() * 0.075;
    const topRadius = baseRadius * (0.66 + random() * 0.2);
    const leanX = (random() - 0.5) * 0.16;
    const leanZ = (random() - 0.5) * 0.16;
    const outerStart = positions.length / 3;
    const ringCount = 6;

    for (let ring = 0; ring < ringCount; ring++) {
      const t = ring / (ringCount - 1);
      const radius = THREE.MathUtils.lerp(baseRadius, topRadius, t);
      for (let segment = 0; segment <= segments; segment++) {
        const angle = (segment / segments) * Math.PI * 2;
        const ripple = 1 + Math.sin(angle * 3 + tube) * 0.045;
        addVertex(
          offsetX + leanX * t + Math.cos(angle) * radius * ripple,
          0.025 + height * t,
          offsetZ + leanZ * t + Math.sin(angle) * radius * ripple,
          segment / segments,
          t,
        );
      }
    }

    const rowSize = segments + 1;
    for (let ring = 0; ring < ringCount - 1; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = outerStart + ring * rowSize + segment;
        const b = a + rowSize;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c, c, b, d);
      }
    }

    const innerStart = positions.length / 3;
    const innerRings = [
      { t: 0.98, radius: topRadius * 0.62 },
      { t: 0.73, radius: topRadius * 0.58 },
      { t: 0.48, radius: baseRadius * 0.28 },
    ];
    for (const [ring, { t, radius }] of innerRings.entries()) {
      for (let segment = 0; segment <= segments; segment++) {
        const angle = (segment / segments) * Math.PI * 2;
        addVertex(
          offsetX + leanX * t + Math.cos(angle) * radius,
          0.025 + height * t,
          offsetZ + leanZ * t + Math.sin(angle) * radius,
          segment / segments,
          t,
        );
      }
      if (ring > 0) {
        const previousStart = innerStart + (ring - 1) * rowSize;
        const currentStart = innerStart + ring * rowSize;
        for (let segment = 0; segment < segments; segment++) {
          const a = previousStart + segment;
          const b = currentStart + segment;
          const c = a + 1;
          const d = b + 1;
          indices.push(a, b, c, c, b, d);
        }
      }
    }

    const outerTop = outerStart + (ringCount - 1) * rowSize;
    const innerTop = innerStart;
    for (let segment = 0; segment < segments; segment++) {
      const outerA = outerTop + segment;
      const innerA = innerTop + segment;
      indices.push(
        outerA,
        innerA,
        outerA + 1,
        outerA + 1,
        innerA,
        innerA + 1,
      );
    }

    const centerIndex = positions.length / 3;
    addVertex(offsetX + leanX * 0.4, 0.025 + height * 0.4, offsetZ + leanZ * 0.4, 0.5, 0.4);
    const innerBottom = innerStart + 2 * rowSize;
    for (let segment = 0; segment < segments; segment++) {
      indices.push(innerBottom + segment, centerIndex, innerBottom + segment + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Sponges {
  readonly group = new THREE.Group();

  private readonly random: () => number;
  private readonly texture: THREE.CanvasTexture;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly placements: SpongePlacement[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly localNormal = new THREE.Vector3();
  private readonly worldNormal = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    terrain: Terrain,
    spongeHosts: readonly THREE.Matrix4[],
    coralSites: readonly THREE.Vector2[],
    seed = 31,
  ) {
    this.random = createSeededRandom(seed);
    this.texture = createSpongeTexture(seed + 47);
    this.group.name = 'sea-sponges';

    this.addRockSponges(spongeHosts);
    this.addCoralSponges(terrain, coralSites);
    this.addSeafloorSponges(terrain);
    this.createMeshes();

    if (this.placements.length < 15) {
      throw new Error(
        `Only ${this.placements.length} shallow sponge sites were found; at least 15 are required.`,
      );
    }
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.texture.dispose();
    this.group.clear();
  }

  private addRockSponges(spongeHosts: readonly THREE.Matrix4[]) {
    for (const matrix of spongeHosts) {
      if (this.random() > 0.52) {
        continue;
      }

      const phi = 0.18 + this.random() * 1.32;
      const theta = this.random() * Math.PI * 2;
      this.localNormal.set(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      this.worldPosition
        .copy(this.localNormal)
        .multiplyScalar(0.98)
        .applyMatrix4(matrix);
      const depth = -this.worldPosition.y;
      if (depth < 3 || depth > 20) {
        continue;
      }

      this.normalMatrix.getNormalMatrix(matrix);
      this.worldNormal
        .copy(this.localNormal)
        .applyMatrix3(this.normalMatrix)
        .normalize();
      this.addPlacement(
        this.worldPosition,
        this.worldNormal,
        0.55 + this.random() * 0.35,
        0.85,
      );
    }
  }

  private addCoralSponges(
    terrain: Terrain,
    coralSites: readonly THREE.Vector2[],
  ) {
    let added = 0;
    for (const site of coralSites) {
      if (added >= 24 || this.random() > 0.46) {
        continue;
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = this.random() * Math.PI * 2;
        const radius = 0.7 + this.random() * 2.2;
        const x = site.x + Math.cos(angle) * radius;
        const z = site.y + Math.sin(angle) * radius;
        const depth = terrain.getHeight(x, z);
        if (depth > -4 || depth < -20) {
          continue;
        }

        const normal = this.getTerrainNormal(terrain, x, z);
        if (normal.y < 0.82) {
          continue;
        }
        const position = new THREE.Vector3(x, depth + 0.025, z);
        if (
          this.addPlacement(
            position,
            normal,
            0.55 + this.random() * 0.4,
            1.1,
          )
        ) {
          added++;
          break;
        }
      }
    }
  }

  private addSeafloorSponges(terrain: Terrain) {
    let added = 0;
    for (let attempt = 0; attempt < 1800 && added < 24; attempt++) {
      const x = this.random() * 280 - 140;
      const z = this.random() * 280 - 140;
      const height = terrain.getHeight(x, z);
      if (height > -5 || height < -20) {
        continue;
      }

      const normal = this.getTerrainNormal(terrain, x, z);
      if (normal.y < 0.86) {
        continue;
      }
      const position = new THREE.Vector3(x, height + 0.025, z);
      if (
        this.addPlacement(
          position,
          normal,
          0.5 + this.random() * 0.42,
          1.4,
        )
      ) {
        added++;
      }
    }
  }

  private addPlacement(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    scale: number,
    minimumSpacing: number,
  ): boolean {
    if (-position.y > 20 || -position.y < 3) {
      return false;
    }

    const minimumSpacingSquared = minimumSpacing * minimumSpacing;
    if (
      this.placements.some(
        (existing) =>
          existing.position.distanceToSquared(position) <
          minimumSpacingSquared,
      )
    ) {
      return false;
    }

    const colorIndex = Math.floor(this.random() * spongeColors.length);
    const color = spongeColors[colorIndex];
    if (!color) {
      throw new Error('Sponge color palette is empty.');
    }
    this.placements.push({
      position: position.clone(),
      normal: normal.clone().normalize(),
      scale,
      color,
    });
    return true;
  }

  private getTerrainNormal(
    terrain: Terrain,
    x: number,
    z: number,
  ): THREE.Vector3 {
    const slopeX =
      (terrain.getHeight(x + 0.5, z) - terrain.getHeight(x - 0.5, z));
    const slopeZ =
      (terrain.getHeight(x, z + 0.5) - terrain.getHeight(x, z - 0.5));
    return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
  }

  private createMeshes() {
    for (let variant = 0; variant < 3; variant++) {
      const geometry = createTubeClusterGeometry(61 + variant * 23);
      this.geometries.push(geometry);
      const material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: this.texture,
        bumpMap: this.texture,
        bumpScale: 0.035,
        roughness: 0.92,
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      this.materials.push(material);

      const variantPlacements = this.placements.filter(
        (_, index) => index % 3 === variant,
      );
      const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        variantPlacements.length,
      );
      mesh.name = `tube sponges variant ${variant + 1}`;

      for (const [index, placement] of variantPlacements.entries()) {
        const alignment = new THREE.Quaternion().setFromUnitVectors(
          this.up,
          placement.normal,
        );
        const yaw = new THREE.Quaternion().setFromAxisAngle(
          this.up,
          this.random() * Math.PI * 2,
        );
        this.dummy.position.copy(placement.position);
        this.dummy.position.addScaledVector(placement.normal, 0.025);
        this.dummy.quaternion.copy(alignment).multiply(yaw);
        this.dummy.scale.setScalar(placement.scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
        mesh.setColorAt(index, placement.color);
      }

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
  }
}
