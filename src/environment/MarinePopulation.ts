import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Crab } from './Crab.js';
import { ClownfishSchool } from './ClownfishSchool.js';
import { FishSchool } from './FishSchool.js';
import { Jellyfish } from './Jellyfish.js';
import { MantaRay } from './MantaRay.js';
import { MorayEel } from './MorayEel.js';
import { Octopus } from './Octopus.js';
import { ReefShark } from './ReefShark.js';
import { SeaStar } from './SeaStar.js';
import { SeaTurtle } from './SeaTurtle.js';
import { Seahorse } from './Seahorse.js';
import { SHIPWRECK_POSITION } from './Shipwreck.js';
import { SHALLOW_PLATEAU_CENTERS, Terrain } from './Terrain.js';

interface AnimatedAnimal {
  readonly group: THREE.Group;
  update(dt: number, elapsedTime: number): void;
  dispose(): void;
}

const fishPalettes: readonly (readonly THREE.ColorRepresentation[])[] = [
  ['#f4cb69', '#e9a85a', '#f4eee0'],
  ['#4f9ca8', '#e6d280', '#dce8df'],
  ['#e27b58', '#7ba6a2', '#f0d7a1'],
];

const reservedCenters = [
  new THREE.Vector2(-9, -10),
  new THREE.Vector2(10, -18),
  new THREE.Vector2(5, -22),
  new THREE.Vector2(-10, -24),
  new THREE.Vector2(2, -13),
  new THREE.Vector2(-6, -15),
  new THREE.Vector2(-8, -18),
  new THREE.Vector2(-15, -22),
  new THREE.Vector2(7, -14),
  new THREE.Vector2(7, -26),
  new THREE.Vector2(12, -13),
  new THREE.Vector2(SHIPWRECK_POSITION.x, SHIPWRECK_POSITION.z),
];

export class MarinePopulation {
  readonly group = new THREE.Group();

  private readonly random: () => number;
  private readonly schools: FishSchool[] = [];
  private readonly clownfishSchools: ClownfishSchool[] = [];
  private readonly animals: AnimatedAnimal[] = [];
  private readonly occupiedCenters: THREE.Vector2[];
  private readonly terrain: Terrain;
  private nextTile = 0;
  private nextSeed: number;

  constructor(terrain: Terrain, seed = 1) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.nextSeed = seed + 100;
    this.occupiedCenters = reservedCenters.map((center) => center.clone());
    this.group.name = 'distributed-marine-population';

    this.createFishSchools();
    this.createClownfishSchools();
    this.createRoamingAnimals();
    this.createBenthicAnimals();
  }

  update(dt: number, elapsedTime: number, diverPosition: THREE.Vector3) {
    for (const school of this.schools) {
      school.update(dt, elapsedTime, diverPosition);
    }
    for (const school of this.clownfishSchools) {
      school.update(dt, elapsedTime);
    }
    for (const animal of this.animals) {
      animal.update(dt, elapsedTime);
    }
  }

  dispose() {
    for (const school of this.schools) {
      school.dispose();
    }
    for (const school of this.clownfishSchools) {
      school.dispose();
    }
    for (const animal of this.animals) {
      animal.dispose();
    }
    this.group.clear();
  }

  private createFishSchools() {
    const schoolSizes = [24, 20, 26, 22, 24, 20];
    for (let school = 0; school < schoolSizes.length; school++) {
      const size = schoolSizes[school];
      const palette = fishPalettes[school % fishPalettes.length];
      if (size === undefined || palette === undefined) {
        throw new Error('Marine population fish school data is incomplete.');
      }

      const center =
        school === 0
          ? new THREE.Vector2(
              SHIPWRECK_POSITION.x,
              SHIPWRECK_POSITION.z,
            )
          : this.createCenter(22);
      const fishSchool = new FishSchool(
        this.terrain,
        this.nextSeed++,
        center,
        size,
        palette,
      );
      this.schools.push(fishSchool);
      this.group.add(fishSchool.group);
    }
  }

  private createRoamingAnimals() {
    for (let i = 0; i < 2; i++) {
      this.addAnimal(
        new MantaRay(this.terrain, this.createCenter(24), this.nextSeed++),
        this.randomBetween(0.82, 1.08),
      );
      this.addAnimal(
        new SeaTurtle(this.terrain, this.createCenter(22), this.nextSeed++),
        this.randomBetween(0.9, 1.12),
      );
      this.addAnimal(
        new ReefShark(this.terrain, this.createCenter(24), this.nextSeed++),
        this.randomBetween(0.92, 1.08),
      );
    }

    for (let i = 0; i < 7; i++) {
      this.addAnimal(
        new Jellyfish(this.terrain, this.createCenter(16), this.nextSeed++),
        this.randomBetween(0.62, 1.48),
      );
    }
    for (let i = 0; i < 12; i++) {
      this.addAnimal(
        new Jellyfish(this.terrain, this.createCenter(16), this.nextSeed++),
        this.randomBetween(0.35, 0.65),
      );
    }
    for (let i = 0; i < 4; i++) {
      this.addAnimal(
        new Octopus(this.terrain, this.createCenter(18), this.nextSeed++),
        this.randomBetween(0.78, 1.28),
      );
    }
    for (let i = 0; i < 8; i++) {
      this.addAnimal(
        new Seahorse(this.terrain, this.createCenter(15), this.nextSeed++),
        this.randomBetween(0.82, 1.18),
      );
    }
    for (let i = 0; i < 4; i++) {
      this.addAnimal(
        new MorayEel(this.terrain, this.createCenter(15), this.nextSeed++),
        this.randomBetween(0.85, 1.15),
      );
    }
  }

  private createClownfishSchools() {
    for (const center of SHALLOW_PLATEAU_CENTERS) {
      const school = new ClownfishSchool(
        this.terrain,
        new THREE.Vector2(center.x, center.z),
        this.nextSeed++,
      );
      this.clownfishSchools.push(school);
      this.group.add(school.group);
    }
  }

  private createBenthicAnimals() {
    for (let i = 0; i < 26; i++) {
      this.addAnimal(
        new SeaStar(this.terrain, this.createCenter(10)),
        this.randomBetween(0.68, 1.5),
      );
    }
    for (let i = 0; i < 10; i++) {
      this.addAnimal(
        new Crab(this.terrain, this.createCenter(10), this.nextSeed++),
        this.randomBetween(0.72, 1.38),
      );
    }
  }

  private addAnimal<T extends AnimatedAnimal>(animal: T, size = 1) {
    animal.group.scale.multiplyScalar(size);
    this.animals.push(animal);
    this.group.add(animal.group);
  }

  private createCenter(minimumSeparation: number): THREE.Vector2 {
    const tile = this.nextTile++ % 9;
    const column = tile % 3;
    const row = Math.floor(tile / 3);
    const minX = -140 + column * 90;
    const minZ = -140 + row * 90;

    for (let attempt = 0; attempt < 1200; attempt++) {
      const center = new THREE.Vector2(
        minX + 10 + this.random() * 70,
        minZ + 10 + this.random() * 70,
      );
      const seabedHeight = this.terrain.getHeight(center.x, center.y);
      if (seabedHeight < -52 || seabedHeight > -5) {
        continue;
      }
      if (
        this.occupiedCenters.some(
          (existing) =>
            existing.distanceToSquared(center) <
            minimumSeparation * minimumSeparation,
        )
      ) {
        continue;
      }

      this.occupiedCenters.push(center);
      return center;
    }

    throw new Error(
      `Unable to find a marine habitat in map tile ${tile}.`,
    );
  }

  private randomBetween(minimum: number, maximum: number): number {
    return minimum + this.random() * (maximum - minimum);
  }
}
