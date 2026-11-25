import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

export const SHIPWRECK_POSITION = Object.freeze({ x: -44, z: -78 });

type Point3 = readonly [number, number, number];
type HullEdge = 'bottom' | 'bilge' | 'top';

const HULL_STATIONS = [
  { x: -8.5, bottom: 0.45, bilge: 1.25, top: 1.85, bottomY: 0.3, bilgeY: 0.68, topY: 1.65 },
  { x: -7, bottom: 0.55, bilge: 2.2, top: 2.85, bottomY: 0.25, bilgeY: 0.72, topY: 2.15 },
  { x: -4, bottom: 0.6, bilge: 2.55, top: 3.12, bottomY: 0.25, bilgeY: 0.78, topY: 2.2 },
  { x: 0, bottom: 0.65, bilge: 2.65, top: 3.2, bottomY: 0.24, bilgeY: 0.82, topY: 2.15 },
  { x: 4, bottom: 0.6, bilge: 2.55, top: 3.1, bottomY: 0.25, bilgeY: 0.78, topY: 2.1 },
  { x: 7, bottom: 0.5, bilge: 2.15, top: 2.7, bottomY: 0.3, bilgeY: 0.72, topY: 1.95 },
  { x: 8.5, bottom: 0.35, bilge: 1.45, top: 2.1, bottomY: 0.35, bilgeY: 0.65, topY: 1.55 },
] as const;

export class Shipwreck {
  readonly group = new THREE.Group();

  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly instancedMeshes: THREE.InstancedMesh[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly boxGeometry: THREE.BufferGeometry;
  private readonly beamGeometry: THREE.BufferGeometry;
  private readonly ringGeometry: THREE.BufferGeometry;
  private readonly rivetGeometry: THREE.BufferGeometry;
  private readonly barnacleGeometry: THREE.BufferGeometry;
  private readonly algaeGeometry: THREE.BufferGeometry;
  private readonly barrelGeometry: THREE.BufferGeometry;
  private readonly rustTexture: THREE.CanvasTexture;
  private readonly woodTexture: THREE.CanvasTexture;
  private readonly hullMaterial: THREE.MeshStandardMaterial;
  private readonly rustMaterials: THREE.MeshStandardMaterial[];
  private readonly woodMaterials: THREE.MeshStandardMaterial[];
  private readonly growthMaterials: THREE.MeshStandardMaterial[];
  private readonly glassMaterial: THREE.MeshStandardMaterial;
  private readonly rivetMaterial: THREE.MeshStandardMaterial;
  private readonly seabedHeight: number;

  constructor(terrain: Terrain, seed = 41) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.group.name = 'procedural-shipwreck';
    this.seabedHeight = terrain.getHeight(
      SHIPWRECK_POSITION.x,
      SHIPWRECK_POSITION.z,
    );
    this.group.position.set(
      SHIPWRECK_POSITION.x,
      this.seabedHeight,
      SHIPWRECK_POSITION.z,
    );

    this.boxGeometry = this.trackGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.beamGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(1, 1, 1, 8),
    );
    this.ringGeometry = this.trackGeometry(
      new THREE.TorusGeometry(1, 0.2, 8, 20),
    );
    this.rivetGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.5, 8, 6),
    );
    this.barnacleGeometry = this.trackGeometry(
      new THREE.IcosahedronGeometry(1, 0),
    );
    this.algaeGeometry = this.trackGeometry(new THREE.ConeGeometry(1, 1, 5));
    this.barrelGeometry = this.trackGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 1.1, 8),
    );
    this.rustTexture = this.createSurfaceTexture('rust', seed + 101);
    this.woodTexture = this.createSurfaceTexture('wood', seed + 202);

    this.hullMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: '#414c47',
        metalness: 0.38,
        roughness: 0.88,
        map: this.rustTexture,
      }),
    );
    this.rustMaterials = [
      '#754735',
      '#89533a',
      '#a06443',
      '#62483a',
    ].map((color) => this.createMaterial(color, 0.12, 0.94, this.rustTexture));
    this.woodMaterials = [
      '#54483a',
      '#70573e',
      '#806143',
      '#493f36',
    ].map((color) => this.createMaterial(color, 0, 0.96, this.woodTexture));
    this.growthMaterials = [
      '#526147',
      '#68714a',
      '#536858',
    ].map((color) => this.createMaterial(color, 0, 0.95));
    this.glassMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: '#17383a',
        metalness: 0.15,
        roughness: 0.52,
      }),
    );
    this.rivetMaterial = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: '#303a37',
        metalness: 0.7,
        roughness: 0.78,
      }),
    );

    this.buildHull();
    this.addDebris();
    this.addMarineGrowth();
  }

  dispose() {
    for (const mesh of this.instancedMeshes) {
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

  private buildHull() {
    this.buildHullShell();
    this.buildRivets();
    this.addBox(0, 0.24, 0, 15, 0.38, 1.1, this.hullMaterial);

    for (let x = -7; x <= 7; x += 2) {
      const seabed = this.getLocalSeabedHeight(x, 0);
      const bilgeWidth = this.getHullWidthAt(x, 'bilge');
      const topWidth = this.getHullWidthAt(x, 'top');
      for (const side of [-1, 1]) {
        this.addBeam(
          [x, seabed + 0.12, 0],
          [x, 0.45, side * bilgeWidth],
          0.085,
          this.rustMaterials[1]!,
        );
        this.addBeam(
          [x, 0.45, side * bilgeWidth],
          [x, 1.25, side * topWidth],
          0.09,
          this.woodMaterials[1]!,
        );
        this.addBeam(
          [x, 1.25, side * topWidth],
          [x, 2.25, side * topWidth],
          0.1,
          this.rustMaterials[0]!,
        );
      }

      if (x % 4 === 1) {
        this.addBeam(
          [x, 2.14, -topWidth],
          [x, 2.14, topWidth],
          0.075,
          this.woodMaterials[0]!,
        );
      }
    }

    const plankRuns: Array<[number, number]> = [
      [-7, -5.5],
      [-5.2, -3.6],
      [-3.2, -1.7],
      [1.7, 3.2],
      [3.6, 5.2],
      [5.5, 7],
    ];
    for (const side of [-1, 1]) {
      for (const y of [0.65, 1.28, 1.82]) {
        for (const [start, end] of plankRuns) {
          if (this.random() < 0.14) {
            continue;
          }
          const startWidth = this.getHullWidthAt(start, 'top') + 0.08;
          const endWidth = this.getHullWidthAt(end, 'top') + 0.08;
          const yOffset = (this.random() - 0.5) * 0.08;
          const material = this.randomMaterial(
            this.random() < 0.58
              ? this.rustMaterials
              : this.woodMaterials,
          );
          this.addPlate(
            [start, y - 0.09 + yOffset, side * startWidth],
            [end, y - 0.09 - yOffset, side * endWidth],
            [end, y + 0.09 - yOffset, side * endWidth],
            [start, y + 0.09 + yOffset, side * startWidth],
            material,
          );
        }
      }
    }

    for (let x = -7.5; x <= 7.5; x += 1.25) {
      if (x > -1.5 && x < 1.5) {
        continue;
      }
      this.addBox(
        x,
        0.73,
        (this.random() - 0.5) * 0.2,
        1.1,
        0.16,
        5.15,
        this.randomMaterial(this.woodMaterials),
        (this.random() - 0.5) * 0.08,
        (this.random() - 0.5) * 0.04,
        (this.random() - 0.5) * 0.08,
      );
    }

    this.buildCabin();
    this.buildDeckDetails();
    this.buildBowAndStern();
    this.buildMast();
    this.buildPropeller();
    this.buildAnchorAndChain();
  }

  private buildHullShell() {
    for (const side of [-1, 1]) {
      for (let i = 0; i < HULL_STATIONS.length - 1; i++) {
        const start = HULL_STATIONS[i];
        const end = HULL_STATIONS[i + 1];
        if (!start || !end) {
          continue;
        }

        const rows = [
          [
            [start.x, start.bottomY, side * start.bottom],
            [end.x, end.bottomY, side * end.bottom],
            [end.x, end.bilgeY, side * end.bilge],
            [start.x, start.bilgeY, side * start.bilge],
          ],
          [
            [start.x, start.bilgeY, side * start.bilge],
            [end.x, end.bilgeY, side * end.bilge],
            [end.x, end.topY, side * end.top],
            [start.x, start.topY, side * start.top],
          ],
        ] as const;

        for (let row = 0; row < rows.length; row++) {
          if (this.random() < (row === 0 ? 0.08 : 0.18)) {
            continue;
          }
          const points = rows[row];
          if (!points) {
            continue;
          }
          this.addPlate(
            points[0],
            points[1],
            points[2],
            points[3],
            this.randomMaterial(this.rustMaterials),
          );
        }
      }
    }
  }

  private buildBowAndStern() {
    this.addBeam(
      [-8.2, 0.34, 0],
      [-10, 1.82, 0],
      0.16,
      this.rustMaterials[2]!,
    );
    for (const side of [-1, 1]) {
      this.addBeam(
        [-8.2, 0.35, side * 1.35],
        [-10, 1.82, 0],
        0.11,
        this.woodMaterials[1]!,
      );
      this.addBeam(
        [-10, 1.82, 0],
        [-9.2, 2.15, side * 0.42],
        0.085,
        this.rustMaterials[1]!,
      );
      this.addBeam(
        [7.6, 0.3, side * 1.4],
        [8.6, 1.25, side * 1.8],
        0.1,
        this.woodMaterials[0]!,
      );
    }
    this.addBeam(
      [8.2, 0.32, 0],
      [8.6, 1.22, 0],
      0.13,
      this.rustMaterials[2]!,
    );
  }

  private buildCabin() {
    const wallMaterial = this.rustMaterials[2]!;
    const wallY = 2.95;
    const wallHeight = 1.45;

    for (const side of [-1, 1]) {
      this.addBox(3.55, wallY, side * 1.45, 0.95, wallHeight, 0.18, wallMaterial);
      this.addBox(7.05, wallY, side * 1.45, 1.85, wallHeight, 0.18, wallMaterial);
      this.addBox(5.25, wallY + 0.05, side * 1.56, 1.1, 0.58, 0.035, this.glassMaterial);
      this.addRing(
        5.25,
        wallY + 0.05,
        side * 1.6,
        0.34,
        wallMaterial,
        0,
        side < 0 ? Math.PI : 0,
      );
    }

    this.addBox(4, wallY, -0.98, 0.18, wallHeight, 0.95, wallMaterial);
    this.addBox(4, wallY, 0.98, 0.18, wallHeight, 0.95, wallMaterial);
    this.addBox(7.95, wallY, 0, 0.18, wallHeight, 2.9, wallMaterial);
    this.addBox(5.95, 3.72, 0, 3.9, 0.16, 0.18, this.rustMaterials[1]!);
    this.addBeam(
      [4.1, 3.72, -1.35],
      [7.6, 4.25, 0.8],
      0.13,
      this.woodMaterials[2]!,
    );
    this.addBox(6.7, 3.77, -0.45, 1.8, 0.14, 1.6, this.rustMaterials[0]!);
    this.buildSteeringWheel();
  }

  private buildDeckDetails() {
    for (const side of [-1, 1]) {
      const postXs = [-7, -5, -3, 3, 5, 7.4];
      for (const x of postXs) {
        const railZ = side * (this.getHullWidthAt(x, 'top') + 0.12);
        this.addBeam(
          [x, 2.05, railZ],
          [x, 2.78, railZ],
          0.055,
          this.rustMaterials[1]!,
        );
      }

      for (const [start, end] of [[-7, -5], [-5, -3], [3, 5], [5, 7.4]]) {
        if (this.random() < 0.32) {
          continue;
        }
        const startZ = side * (this.getHullWidthAt(start, 'top') + 0.12);
        const endZ = side * (this.getHullWidthAt(end, 'top') + 0.12);
        this.addBeam(
          [start, 2.74, startZ],
          [end, 2.74, endZ],
          0.055,
          this.woodMaterials[1]!,
        );
      }
    }

    for (const x of [-1.55, 1.55]) {
      this.addBeam([x, 0.84, -1.2], [x, 0.84, 1.2], 0.055, this.rustMaterials[2]!);
    }
    for (const z of [-1.2, 1.2]) {
      this.addBeam([-1.55, 0.84, z], [1.55, 0.84, z], 0.055, this.rustMaterials[2]!);
    }

    this.addBeam([-1.38, 0.76, -0.88], [-0.74, 0.18, -0.88], 0.045, this.rustMaterials[0]!);
    this.addBeam([-1.38, 0.76, 0.88], [-0.74, 0.18, 0.88], 0.045, this.rustMaterials[0]!);
    for (let step = 0; step < 5; step++) {
      const amount = step / 4;
      const x = -1.3 + amount * 0.55;
      const y = 0.69 - amount * 0.43;
      this.addBeam([x, y, -0.88], [x, y, 0.88], 0.035, this.woodMaterials[2]!);
    }

    this.addCargoCrate(-4.3, 1.13, -0.9, 1.15);
    this.addCargoCrate(-5.4, 0.98, 0.7, 0.85);
    this.buildWinch();
  }

  private buildRivets() {
    const rivets = new THREE.InstancedMesh(
      this.rivetGeometry,
      this.rivetMaterial,
      42,
    );
    let index = 0;
    for (const side of [-1, 1]) {
      for (let x = -4.5; x <= 4.5; x += 1.5) {
        for (const y of [0.86, 1.48, 2.08]) {
          this.dummy.position.set(
            x,
            y,
            side * (this.getHullWidthAt(x, 'top') + 0.07),
          );
          this.dummy.scale.setScalar(0.11);
          this.dummy.updateMatrix();
          rivets.setMatrixAt(index++, this.dummy.matrix);
        }
      }
    }
    rivets.instanceMatrix.needsUpdate = true;
    rivets.computeBoundingBox();
    rivets.computeBoundingSphere();
    rivets.castShadow = true;
    rivets.receiveShadow = true;
    this.instancedMeshes.push(rivets);
    this.group.add(rivets);
  }

  private buildWinch() {
    this.addBox(-2.2, 1.03, 2.05, 1.5, 0.35, 1.1, this.hullMaterial);
    this.addBeam(
      [-2.85, 1.15, 1.65],
      [-2.85, 1.88, 1.65],
      0.09,
      this.rustMaterials[2]!,
    );
    this.addBeam(
      [-1.55, 1.15, 1.65],
      [-1.55, 1.88, 1.65],
      0.09,
      this.rustMaterials[2]!,
    );

    const spool = new THREE.Mesh(this.barrelGeometry, this.rustMaterials[0]!);
    spool.position.set(-2.2, 1.62, 2.05);
    spool.rotation.x = Math.PI / 2;
    spool.scale.set(0.85, 1, 0.85);
    spool.castShadow = true;
    spool.receiveShadow = true;
    this.group.add(spool);

    this.addBeam(
      [-2.2, 1.62, 1.5],
      [-2.2, 1.62, 2.6],
      0.055,
      this.woodMaterials[2]!,
    );
    this.addBeam(
      [-2.2, 1.62, 2.6],
      [-6.6, 2.3, 3.2],
      0.025,
      this.woodMaterials[0]!,
    );
  }

  private buildSteeringWheel() {
    const center = new THREE.Vector3(4.5, 3.15, 0.78);
    this.addRing(
      center.x,
      center.y,
      center.z,
      0.48,
      this.woodMaterials[2]!,
      0,
      Math.PI / 2,
    );
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke * Math.PI / 3;
      const end: Point3 = [
        center.x,
        center.y + Math.cos(angle) * 0.43,
        center.z + Math.sin(angle) * 0.43,
      ];
      this.addBeam(
        [center.x, center.y, center.z],
        end,
        0.035,
        this.rustMaterials[2]!,
      );
    }
    this.addBeam(
      [4.25, center.y, center.z],
      [4.75, center.y, center.z],
      0.08,
      this.rustMaterials[1]!,
    );
  }

  private buildAnchorAndChain() {
    this.addRing(-8.65, 1.22, 0, 0.3, this.rustMaterials[2]!);
    for (let link = 0; link < 9; link++) {
      const amount = link / 8;
      const chain = new THREE.Mesh(this.ringGeometry, this.rustMaterials[1]!);
      chain.position.set(-8.9 - amount * 1.15, 1.02 - amount * 0.76, 0);
      chain.scale.setScalar(0.13);
      chain.rotation.set(link % 2 === 0 ? Math.PI / 2 : 0, 0, Math.PI / 2);
      chain.castShadow = true;
      chain.receiveShadow = true;
      this.group.add(chain);
    }

    this.addBeam([-10.05, 0.3, 0], [-9.7, -0.55, 0], 0.11, this.rustMaterials[2]!);
    for (const side of [-1, 1]) {
      this.addBeam(
        [-9.7, -0.48, 0],
        [-10.45, -0.88, side * 0.75],
        0.1,
        this.rustMaterials[0]!,
      );
    }
  }

  private addCargoCrate(x: number, y: number, z: number, size: number) {
    const half = size / 2;
    this.addBox(x, y, z, size, size * 0.82, size, this.woodMaterials[0]!);
    for (const side of [-1, 1]) {
      this.addBox(
        x + side * (half - 0.07),
        y,
        z,
        0.08,
        size * 0.86,
        size * 1.04,
        this.woodMaterials[2]!,
      );
      this.addBox(
        x,
        y,
        z + side * (half - 0.07),
        size * 1.04,
        size * 0.86,
        0.08,
        this.woodMaterials[1]!,
      );
    }
  }

  private buildMast() {
    this.addBeam(
      [-2.4, 2.15, 0],
      [-3.3, 7.1, 0.2],
      0.17,
      this.woodMaterials[1]!,
    );
    this.addBeam(
      [-3, 4.9, 0.15],
      [0.8, 4.9, 0.15],
      0.095,
      this.rustMaterials[2]!,
    );
    this.addBeam(
      [-2.2, 3.1, 0.05],
      [2.4, 1.05, -2.7],
      0.13,
      this.woodMaterials[0]!,
    );
    this.addBeam(
      [-3.3, 7.05, 0.2],
      [-7.2, 2.15, 2.8],
      0.027,
      this.woodMaterials[0]!,
    );
    this.addBeam(
      [-3.3, 7.05, 0.2],
      [-5.8, 2.15, -2.8],
      0.027,
      this.woodMaterials[0]!,
    );
  }

  private buildPropeller() {
    this.addBeam(
      [7.9, 0.36, 0],
      [9.1, 0.36, 0],
      0.12,
      this.rustMaterials[2]!,
    );
    for (let blade = 0; blade < 3; blade++) {
      const propellerBlade = this.addBox(
        9.1,
        0.36,
        0,
        0.12,
        1.35,
        0.28,
        this.rustMaterials[1]!,
      );
      propellerBlade.rotation.x = blade * Math.PI * 2 / 3;
    }
    this.addBeam(
      [9.18, 0.28, 0],
      [9.18, -0.75, 0],
      0.09,
      this.rustMaterials[2]!,
    );
    this.addBox(9.18, -0.72, 0, 0.2, 0.72, 1.35, this.hullMaterial);
  }

  private addDebris() {
    for (let i = 0; i < 22; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = 7.5 + this.random() * 4.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.72;
      const ground = this.getLocalSeabedHeight(x, z);

      if (i < 4) {
        const size = 0.7 + this.random() * 0.5;
        this.addBox(
          x,
          ground + size * 0.45,
          z,
          size,
          size * 0.9,
          size,
          this.randomMaterial(this.woodMaterials),
          (this.random() - 0.5) * 0.2,
          this.random() * Math.PI,
          (this.random() - 0.5) * 0.2,
        );
      } else if (i < 7) {
        const barrel = new THREE.Mesh(this.barrelGeometry, this.rustMaterials[1]!);
        barrel.position.set(x, ground + 0.48, z);
        barrel.rotation.set(
          (this.random() - 0.5) * 0.12,
          this.random() * Math.PI,
          Math.PI / 2,
        );
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        this.group.add(barrel);
      } else {
        const length = 0.8 + this.random() * 2.4;
        this.addBox(
          x,
          ground + 0.12,
          z,
          length,
          0.16,
          0.22,
          this.randomMaterial(this.random() < 0.45
            ? this.rustMaterials
            : this.woodMaterials),
          (this.random() - 0.5) * 0.12,
          this.random() * Math.PI,
          (this.random() - 0.5) * 0.1,
        );
      }
    }
  }

  private addMarineGrowth() {
    for (let i = 0; i < 46; i++) {
      const side = this.random() < 0.5 ? -1 : 1;
      const size = 0.08 + this.random() * 0.18;
      const x = -7.5 + this.random() * 15;
      const barnacle = new THREE.Mesh(
        this.barnacleGeometry,
        this.randomMaterial(this.growthMaterials),
      );
      barnacle.position.set(
        x,
        0.45 + this.random() * 1.7,
        side * (this.getHullWidthAt(x, 'top') + this.random() * 0.08),
      );
      barnacle.scale.set(size, size * 0.7, size * 0.75);
      barnacle.castShadow = true;
      barnacle.receiveShadow = true;
      this.group.add(barnacle);
    }

    for (let i = 0; i < 20; i++) {
      const side = this.random() < 0.5 ? -1 : 1;
      const x = -8 + this.random() * 16;
      const z = side * (this.getHullWidthAt(x, 'top') + 0.1);
      const height = 0.35 + this.random() * 0.8;
      const algae = new THREE.Mesh(
        this.algaeGeometry,
        this.randomMaterial(this.growthMaterials),
      );
      algae.position.set(
        x,
        0.35 + this.random() * 1.1,
        z,
      );
      algae.scale.set(0.12 + this.random() * 0.1, height, 0.12 + this.random() * 0.1);
      algae.rotation.z = (this.random() - 0.5) * 0.45;
      algae.castShadow = true;
      algae.receiveShadow = true;
      this.group.add(algae);
    }

    this.addBranchingGrowth(-7.2, 1.65, -3.1, 0.8);
    this.addBranchingGrowth(2.4, 0.85, 3.1, 0.65);
    this.addBranchingGrowth(7.5, 1.1, -2.5, 0.75);
  }

  private addBranchingGrowth(x: number, y: number, z: number, scale: number) {
    const material = this.randomMaterial(this.growthMaterials);
    const top: Point3 = [x, y + 0.48 * scale, z];
    this.addBeam(
      [x, y, z],
      top,
      0.075 * scale,
      material,
    );

    for (const side of [-1, 1]) {
      const branch: Point3 = [
        x + side * 0.34 * scale,
        y + 0.78 * scale,
        z + side * 0.08 * scale,
      ];
      this.addBeam(
        [x, y + 0.26 * scale, z],
        branch,
        0.05 * scale,
        material,
      );
      this.addBeam(
        branch,
        [branch[0] + side * 0.14 * scale, y + 1.02 * scale, branch[2]],
        0.028 * scale,
        material,
      );
    }
  }

  private addBox(
    x: number,
    y: number,
    z: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    material: THREE.Material,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.boxGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sizeX, sizeY, sizeZ);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private addPlate(
    first: Point3,
    second: Point3,
    third: Point3,
    fourth: Point3,
    material: THREE.Material,
  ) {
    const geometry = this.trackGeometry(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [...first, ...second, ...third, ...fourth],
        3,
      ),
    );
    const repeatX = Math.hypot(second[0] - first[0], second[2] - first[2]) / 1.5;
    const repeatY = Math.hypot(fourth[1] - first[1], fourth[2] - first[2]);
    geometry.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [0, 0, repeatX, 0, repeatX, repeatY, 0, repeatY],
        2,
      ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private addRing(
    x: number,
    y: number,
    z: number,
    scale: number,
    material: THREE.Material,
    rotationX = 0,
    rotationY = 0,
  ) {
    const ring = new THREE.Mesh(this.ringGeometry, material);
    ring.position.set(x, y, z);
    ring.scale.setScalar(scale);
    ring.rotation.set(rotationX, rotationY, 0);
    ring.castShadow = true;
    ring.receiveShadow = true;
    this.group.add(ring);
  }

  private addBeam(
    start: Point3,
    end: Point3,
    radius: number,
    material: THREE.Material,
  ) {
    const startPoint = new THREE.Vector3(...start);
    const endPoint = new THREE.Vector3(...end);
    const direction = endPoint.clone().sub(startPoint);
    const length = direction.length();
    if (length === 0) {
      throw new Error('Shipwreck beams must have non-zero length.');
    }

    const mesh = new THREE.Mesh(this.beamGeometry, material);
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    mesh.scale.set(radius, length, radius);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private getLocalSeabedHeight(x: number, z: number): number {
    return this.terrain.getHeight(
      SHIPWRECK_POSITION.x + x,
      SHIPWRECK_POSITION.z + z,
    ) - this.seabedHeight;
  }

  private getHullWidthAt(x: number, edge: HullEdge): number {
    for (let i = 0; i < HULL_STATIONS.length - 1; i++) {
      const start = HULL_STATIONS[i];
      const end = HULL_STATIONS[i + 1];
      if (!start || !end || x > end.x) {
        continue;
      }

      const amount = THREE.MathUtils.clamp(
        (x - start.x) / (end.x - start.x),
        0,
        1,
      );
      return THREE.MathUtils.lerp(start[edge], end[edge], amount);
    }

    return HULL_STATIONS[HULL_STATIONS.length - 1]![edge];
  }

  private createSurfaceTexture(
    kind: 'rust' | 'wood',
    seed: number,
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`Could not create the ${kind} texture canvas context.`);
    }

    const random = createSeededRandom(seed);
    context.fillStyle = '#e0d4c0';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (kind === 'rust') {
      const rustColors = ['#493b34', '#754b39', '#a16b4b', '#c2a17a'];
      for (let i = 0; i < 1100; i++) {
        const size = 1 + random() * 8;
        context.globalAlpha = 0.08 + random() * 0.34;
        context.fillStyle = rustColors[Math.floor(random() * rustColors.length)]!;
        context.beginPath();
        context.ellipse(
          random() * canvas.width,
          random() * canvas.height,
          size,
          size * (0.25 + random() * 0.65),
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    } else {
      context.strokeStyle = '#76583e';
      for (let i = 0; i < 90; i++) {
        const y = random() * canvas.height;
        context.globalAlpha = 0.08 + random() * 0.3;
        context.lineWidth = 0.5 + random() * 2;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(
          canvas.width * 0.3,
          y + (random() - 0.5) * 12,
          canvas.width * 0.7,
          y + (random() - 0.5) * 12,
          canvas.width,
          y + (random() - 0.5) * 12,
        );
        context.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        context.globalAlpha = 0.12;
        context.beginPath();
        context.ellipse(x, y, 4 + random() * 7, 2, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }

    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    texture.anisotropy = 4;
    this.textures.push(texture);
    return texture;
  }

  private createMaterial(
    color: THREE.ColorRepresentation,
    metalness: number,
    roughness: number,
    map?: THREE.Texture,
  ): THREE.MeshStandardMaterial {
    return this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness,
        side: THREE.DoubleSide,
        ...(map ? { map } : {}),
      }),
    );
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private randomMaterial<T>(materials: T[]): T {
    const material = materials[Math.floor(this.random() * materials.length)];
    if (!material) {
      throw new Error('Shipwreck material palette cannot be empty.');
    }
    return material;
  }
}
