import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain } from './AnimalSurface.js';
import type { CaveSite } from './Caves.js';
import { Terrain } from './Terrain.js';

interface SeabedPath {
  type: 'seabed';
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
}

interface CavePath {
  type: 'cave';
  site: CaveSite;
  minLocalX: number;
  maxLocalX: number;
  startDistance: number;
  endDistance: number;
  surfaceOffset: number;
}

interface CaveWander {
  position: THREE.Vector2;
  start: THREE.Vector2;
  target: THREE.Vector2;
  direction: THREE.Vector2;
  moveStartTime: number;
  moveDuration: number;
  pauseUntil: number;
}

interface Worm {
  path: SeabedPath | CavePath;
  caveWander?: CaveWander;
  phase: number;
  speed: number;
  segmentSpacing: number;
  bodyScale: number;
  color: THREE.Color;
  points: THREE.Vector3[];
  normals: THREE.Vector3[];
}

const segmentsPerWorm = 9;
const seabedWormCount = 14;
const wormColors = ['#a94fc2', '#8d3cae', '#c05bcf', '#7a35a2'].map(
  (color) => new THREE.Color(color),
);

function createWormGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, 20, 14);
}

export class PurpleWorms {
  readonly group = new THREE.Group();

  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly worms: Worm[] = [];
  private readonly geometry = createWormGeometry();
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.68,
    metalness: 0,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly localNormal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly worldPosition = new THREE.Vector3();

  constructor(
    terrain: Terrain,
    caveSites: readonly CaveSite[],
    seed = 37,
  ) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.group.name = 'purple-worms';
    applyFineGrain(this.material, 0.012);

    this.createSeabedWorms();
    this.createCaveWorms(caveSites);

    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.worms.length * segmentsPerWorm,
    );
    this.mesh.name = 'purple-worm segments';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = this.worms.length * segmentsPerWorm;
    for (const [wormIndex, worm] of this.worms.entries()) {
      for (let segment = 0; segment < segmentsPerWorm; segment++) {
        this.mesh.setColorAt(
          wormIndex * segmentsPerWorm + segment,
          worm.color,
        );
      }
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.mesh);
    this.update(0, 0);
  }

  update(dt: number, elapsedTime: number) {
    let instanceIndex = 0;
    for (const worm of this.worms) {
      this.updateWormPoints(worm, dt, elapsedTime);
      for (let segment = 0; segment < segmentsPerWorm; segment++) {
        const position = worm.points[segment];
        const normal = worm.normals[segment];
        if (!position || !normal) {
          throw new Error('Purple worm segment data is incomplete.');
        }

        const ahead = worm.points[Math.max(0, segment - 1)];
        const behind = worm.points[
          Math.min(segmentsPerWorm - 1, segment + 1)
        ];
        if (!ahead || !behind) {
          throw new Error('Purple worm path is incomplete.');
        }
        this.tangent.subVectors(ahead, behind);
        this.tangent.addScaledVector(
          normal,
          -this.tangent.dot(normal),
        );
        if (this.tangent.lengthSq() < 1e-8) {
          this.tangent.set(0, 0, 1);
        }
        this.tangent.normalize();
        this.right.crossVectors(normal, this.tangent).normalize();
        this.basis.makeBasis(this.right, normal, this.tangent);
        this.dummy.position.copy(position);
        this.dummy.quaternion.setFromRotationMatrix(this.basis);

        const pulse =
          1 +
          Math.sin(
            elapsedTime * 2.8 + worm.phase + segment * 0.72,
          ) *
            0.07;
        const taper = 1 - (segment / segmentsPerWorm) * 0.36;
        this.dummy.scale.set(
          worm.bodyScale * taper,
          worm.bodyScale * 0.72 * pulse * taper,
          worm.segmentSpacing * 0.92,
        );
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(instanceIndex, this.dummy.matrix);
        instanceIndex++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  private createSeabedWorms() {
    const paths: SeabedPath[] = [];
    for (let attempt = 0; attempt < 10000 && paths.length < seabedWormCount; attempt++) {
      const x = this.random() * 276 - 138;
      const z = this.random() * 276 - 138;
      const radiusX = 0.8 + this.random() * 0.65;
      const radiusZ = 0.7 + this.random() * 0.6;
      if (!this.isValidSeabedLoop(x, z, radiusX, radiusZ)) {
        continue;
      }
      if (
        paths.some(
          (existing) => Math.hypot(existing.x - x, existing.z - z) < 10,
        )
      ) {
        continue;
      }
      paths.push({ type: 'seabed', x, z, radiusX, radiusZ });
    }
    if (paths.length !== seabedWormCount) {
      throw new Error(
        `Unable to find 14 seabed worm habitats; found ${paths.length}.`,
      );
    }

    for (const path of paths) {
      this.addWorm(path);
    }
  }

  private createCaveWorms(caveSites: readonly CaveSite[]) {
    if (caveSites.length < 2) {
      throw new Error('Two cave sites are required for cave-dwelling worms.');
    }

    const cavePaths: CavePath[] = [];
    for (const [index, site] of caveSites.entries()) {
      const isWesternCave = index === 0;
      const surfaceOffset = isWesternCave ? 0.6 : -0.18;

      for (let worm = 0; worm < 2; worm++) {
        const minLocalX = isWesternCave
          ? worm === 0 ? -1.6 : -0.8
          : -2.4;
        const maxLocalX = isWesternCave
          ? worm === 0 ? -0.8 : 0
          : 2;
        const path: CavePath = {
          type: 'cave',
          site,
          minLocalX,
          maxLocalX,
          startDistance: isWesternCave ? 5 : 2.5,
          endDistance: isWesternCave ? 6 : 8,
          surfaceOffset,
        };
        if (!this.isValidCaveArea(path)) {
          throw new Error(
            `The cave ceiling at "${site.name}" has no crawler path in the 15-35 m depth band.`,
          );
        }
        cavePaths.push(path);
      }
    }

    for (const path of cavePaths) {
      this.addWorm(path);
    }
  }

  private addWorm(path: SeabedPath | CavePath) {
    const isExteriorRoofWorm =
      path.type === 'cave' && path.surfaceOffset > 0;
    const colorIndex = Math.floor(this.random() * wormColors.length);
    const color = isExteriorRoofWorm
      ? new THREE.Color('#d95eed')
      : wormColors[colorIndex];
    if (!color) {
      throw new Error('Purple worm color palette is empty.');
    }
    const segmentSpacing = isExteriorRoofWorm
      ? 0.22 + this.random() * 0.025
      : 0.16 + this.random() * 0.025;
    const caveWander =
      path.type === 'cave' ? this.createCaveWander(path) : undefined;
    this.worms.push({
      path,
      ...(caveWander ? { caveWander } : {}),
      phase: this.random() * Math.PI * 2,
      speed: path.type === 'cave' ? 0.18 + this.random() * 0.11 : 0.32 + this.random() * 0.2,
      segmentSpacing,
      bodyScale: isExteriorRoofWorm
        ? 0.14 + this.random() * 0.02
        : 0.095 + this.random() * 0.025,
      color,
      points: Array.from(
        { length: segmentsPerWorm },
        () => new THREE.Vector3(),
      ),
      normals: Array.from(
        { length: segmentsPerWorm },
        () => new THREE.Vector3(0, 1, 0),
      ),
    });
  }

  private isValidSeabedLoop(
    x: number,
    z: number,
    radiusX: number,
    radiusZ: number,
  ): boolean {
    for (let sample = 0; sample < 24; sample++) {
      const angle = (sample / 24) * Math.PI * 2;
      const sampleX = x + Math.cos(angle) * radiusX;
      const sampleZ = z + Math.sin(angle) * radiusZ;
      const height = this.terrain.getHeight(sampleX, sampleZ);
      if (height > -16 || height < -34) {
        return false;
      }
      const normal = this.getTerrainNormal(sampleX, sampleZ);
      if (normal.y < 0.9) {
        return false;
      }
    }
    return true;
  }

  private isValidCaveArea(path: CavePath): boolean {
    for (let xSample = 0; xSample <= 10; xSample++) {
      const localX = THREE.MathUtils.lerp(
        path.minLocalX,
        path.maxLocalX,
        xSample / 10,
      );
      for (let depthSample = 0; depthSample <= 12; depthSample++) {
        const distance = THREE.MathUtils.lerp(
          path.startDistance,
          path.endDistance,
          depthSample / 12,
        );
        if (!this.isValidCavePosition(path, localX, distance)) {
          return false;
        }
      }
    }
    return true;
  }

  private updateWormPoints(worm: Worm, dt: number, elapsedTime: number) {
    if (worm.path.type === 'seabed') {
      const meanRadius = (worm.path.radiusX + worm.path.radiusZ) * 0.5;
      const headAngle = elapsedTime * worm.speed + worm.phase;
      for (let segment = 0; segment < segmentsPerWorm; segment++) {
        const angle =
          headAngle - (segment * worm.segmentSpacing) / meanRadius;
        const x = worm.path.x + Math.cos(angle) * worm.path.radiusX;
        const z = worm.path.z + Math.sin(angle) * worm.path.radiusZ;
        const point = worm.points[segment];
        const normal = worm.normals[segment];
        if (!point || !normal) {
          throw new Error('Purple worm segment data is incomplete.');
        }
        point.set(x, this.terrain.getHeight(x, z) + 0.075, z);
        normal.copy(this.getTerrainNormal(x, z));
      }
      return;
    }

    const path = worm.path;
    const caveWander = worm.caveWander;
    if (!caveWander) {
      throw new Error('Cave worm is missing its wandering state.');
    }
    this.advanceCaveWander(path, caveWander, elapsedTime);
    const desiredDirection = this.targetDirection(caveWander);
    caveWander.direction.lerp(
      desiredDirection,
      1 - Math.exp(-4 * dt),
    );
    if (caveWander.direction.lengthSq() < 1e-8) {
      caveWander.direction.set(0, 1);
    } else {
      caveWander.direction.normalize();
    }

    const cosine = Math.cos(path.site.heading);
    const sine = Math.sin(path.site.heading);

    for (let segment = 0; segment < segmentsPerWorm; segment++) {
      const segmentOffset = segment * worm.segmentSpacing;
      const wave =
        Math.sin(elapsedTime * 1.8 + worm.phase + segment * 0.7) * 0.035;
      const localX = THREE.MathUtils.clamp(
        caveWander.position.x -
          caveWander.direction.x * segmentOffset -
          caveWander.direction.y * wave,
        path.minLocalX,
        path.maxLocalX,
      );
      const distance = THREE.MathUtils.clamp(
        caveWander.position.y -
          caveWander.direction.y * segmentOffset +
          caveWander.direction.x * wave,
        path.startDistance,
        path.endDistance,
      );
      const point = worm.points[segment];
      const normal = worm.normals[segment];
      if (!point || !normal) {
        throw new Error('Purple worm segment data is incomplete.');
      }

      this.getCavePosition(path, localX, distance, point, this.localNormal);
      normal.set(
        cosine * this.localNormal.x,
        this.localNormal.y,
        -sine * this.localNormal.x,
      );
    }
  }

  private createCaveWander(path: CavePath): CaveWander {
    const start = new THREE.Vector2(
      THREE.MathUtils.lerp(
        path.minLocalX,
        path.maxLocalX,
        this.random(),
      ),
      THREE.MathUtils.lerp(
        path.startDistance,
        path.endDistance,
        this.random(),
      ),
    );
    return {
      position: start.clone(),
      start: start.clone(),
      target: start.clone(),
      direction: new THREE.Vector2(0, 1),
      moveStartTime: 0,
      moveDuration: 0,
      pauseUntil: 0,
    };
  }

  private advanceCaveWander(
    path: CavePath,
    wander: CaveWander,
    elapsedTime: number,
  ) {
    if (elapsedTime < wander.pauseUntil) {
      return;
    }

    if (
      wander.moveDuration <= 0 ||
      elapsedTime >= wander.moveStartTime + wander.moveDuration
    ) {
      wander.position.copy(wander.target);
      if (wander.moveDuration > 0 && this.random() < 0.28) {
        wander.pauseUntil = elapsedTime + 0.6 + this.random() * 1.8;
        wander.moveDuration = 0;
        return;
      }

      wander.start.copy(wander.position);
      wander.target.copy(this.chooseCaveTarget(path, wander.position));
      wander.moveStartTime = elapsedTime;
      wander.moveDuration = 1.8 + this.random() * 3.5;
    }

    const progress = THREE.MathUtils.clamp(
      (elapsedTime - wander.moveStartTime) / wander.moveDuration,
      0,
      1,
    );
    const easedProgress = progress * progress * (3 - 2 * progress);
    wander.position.lerpVectors(
      wander.start,
      wander.target,
      easedProgress,
    );
  }

  private chooseCaveTarget(
    path: CavePath,
    current: THREE.Vector2,
  ): THREE.Vector2 {
    for (let attempt = 0; attempt < 40; attempt++) {
      const target = new THREE.Vector2(
        THREE.MathUtils.lerp(
          path.minLocalX,
          path.maxLocalX,
          this.random(),
        ),
        THREE.MathUtils.lerp(
          path.startDistance,
          path.endDistance,
          this.random(),
        ),
      );
      if (
        target.distanceToSquared(current) > 0.16 &&
        this.isValidCavePosition(path, target.x, target.y)
      ) {
        return target;
      }
    }

    return new THREE.Vector2(
      current.x < (path.minLocalX + path.maxLocalX) * 0.5
        ? path.maxLocalX
        : path.minLocalX,
      current.y < (path.startDistance + path.endDistance) * 0.5
        ? path.endDistance
        : path.startDistance,
    );
  }

  private targetDirection(wander: CaveWander): THREE.Vector2 {
    const direction = wander.target.clone().sub(wander.start);
    if (direction.lengthSq() < 1e-8) {
      return wander.direction;
    }
    return direction.normalize();
  }

  private isValidCavePosition(
    path: CavePath,
    localX: number,
    distance: number,
  ): boolean {
    this.getCavePosition(
      path,
      localX,
      distance,
      this.worldPosition,
      this.localNormal,
    );
    const depth = -this.worldPosition.y;
    return depth >= 15 && depth <= 35;
  }

  private getCavePosition(
    path: CavePath,
    localX: number,
    distance: number,
    position: THREE.Vector3,
    normal: THREE.Vector3,
  ) {
    const cosine = Math.cos(path.site.heading);
    const sine = Math.sin(path.site.heading);
    const worldX = path.site.x + cosine * localX - sine * distance;
    const worldZ = path.site.z - sine * localX - cosine * distance;
    const localY = Math.sqrt(
      Math.max(0, 1 - (localX / path.site.entranceHalfWidth) ** 2),
    );
    position.set(
      worldX,
      this.terrain.getHeight(worldX, worldZ) +
        0.25 +
        localY * path.site.entranceHeight +
        path.surfaceOffset,
      worldZ,
    );
    normal.set(
      localX / path.site.entranceHalfWidth ** 2,
      localY / path.site.entranceHeight,
      0,
    ).normalize();
  }

  private getTerrainNormal(x: number, z: number): THREE.Vector3 {
    const slopeX =
      terrainHeightDifference(this.terrain, x + 0.5, z, x - 0.5, z);
    const slopeZ =
      terrainHeightDifference(this.terrain, x, z + 0.5, x, z - 0.5);
    return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
  }
}

function terrainHeightDifference(
  terrain: Terrain,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  return terrain.getHeight(x1, z1) - terrain.getHeight(x2, z2);
}
