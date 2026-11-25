import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

export class WorldRoamer {
  readonly position = new THREE.Vector3();
  readonly direction = new THREE.Vector3(0, 0, 1);

  private readonly random: () => number;
  private readonly current = new THREE.Vector2();
  private readonly destination = new THREE.Vector2();
  private readonly speed: number;
  private readonly clearance: number;
  private readonly maximumDepthMeters: number;
  private readonly phase: number;
  private readonly terrain: Terrain;

  constructor(
    terrain: Terrain,
    start: THREE.Vector2,
    seed: number,
    speed: number,
    clearance: number,
    maximumDepthMeters = 30,
  ) {
    if (speed <= 0 || clearance < 0 || maximumDepthMeters <= 0) {
      throw new Error('World roaming parameters are out of range.');
    }

    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.speed = speed;
    this.clearance = clearance;
    this.maximumDepthMeters = maximumDepthMeters;
    this.phase = this.random() * Math.PI * 2;
    this.current.copy(start);
    this.position.set(
      start.x,
      Math.max(
        terrain.getHeight(start.x, start.y) + clearance,
        -maximumDepthMeters,
      ),
      start.y,
    );
    this.chooseDestination();
  }

  update(dt: number, elapsedTime: number, bobAmplitude = 0) {
    let deltaX = this.destination.x - this.current.x;
    let deltaZ = this.destination.y - this.current.y;
    let distance = Math.hypot(deltaX, deltaZ);

    if (distance < 4) {
      this.chooseDestination();
      deltaX = this.destination.x - this.current.x;
      deltaZ = this.destination.y - this.current.y;
      distance = Math.hypot(deltaX, deltaZ);
    }

    if (distance > 1e-6) {
      this.direction.set(deltaX / distance, 0, deltaZ / distance);
      const step = Math.min(this.speed * dt, distance);
      this.current.x += this.direction.x * step;
      this.current.y += this.direction.z * step;
    }

    const seabedHeight = this.terrain.getHeight(
      this.current.x,
      this.current.y,
    );
    const bob = Math.sin(elapsedTime * 0.7 + this.phase) * bobAmplitude;
    this.position.set(
      this.current.x,
      Math.max(seabedHeight + this.clearance, -this.maximumDepthMeters) + bob,
      this.current.y,
    );
  }

  private chooseDestination() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = -140 + this.random() * 280;
      const z = -140 + this.random() * 280;
      if ((this.current.x - x) ** 2 + (this.current.y - z) ** 2 < 45 ** 2) {
        continue;
      }

      this.destination.set(x, z);
      return;
    }

    this.destination.set(
      this.current.x < 0 ? 135 : -135,
      this.current.y < 0 ? 135 : -135,
    );
  }
}
