import * as THREE from 'three';
import { Terrain } from '../environment/Terrain.js';

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
]);

export class DiverControls {
  private readonly keys = new Set<string>();
  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private response = 2;
  private speed = 1.2;
  private active = false;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly terrain: Terrain;

  constructor(camera: THREE.PerspectiveCamera, terrain: Terrain) {
    this.camera = camera;
    this.terrain = terrain;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.active && GAME_KEYS.has(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (this.active && GAME_KEYS.has(event.code)) {
      event.preventDefault();
    }
    this.keys.delete(event.code);
  };

  clearKeys = () => {
    this.keys.clear();
  };

  update(dt: number, active: boolean) {
    this.active = active;
    if (!active) {
      this.clearKeys();
      this.velocity.set(0, 0, 0);
      return;
    }

    this.direction.set(0, 0, 0);
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.up);
    if (this.right.lengthSq() < 1e-8) {
      this.right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    } else {
      this.right.normalize();
    }

    if (this.keys.has('KeyW')) this.direction.add(this.forward);
    if (this.keys.has('KeyS')) this.direction.sub(this.forward);
    if (this.keys.has('KeyD')) this.direction.add(this.right);
    if (this.keys.has('KeyA')) this.direction.sub(this.right);
    if (this.keys.has('Space')) this.direction.y += 1;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) {
      this.direction.y -= 1;
    }

    const isFast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const targetSpeed = isFast ? this.speed * 1.8 : this.speed;
    this.direction.normalize().multiplyScalar(targetSpeed);

    const alpha = 1 - Math.exp(-this.response * dt);
    this.velocity.lerp(this.direction, alpha);
    this.camera.position.addScaledVector(this.velocity, dt);

    const position = this.camera.position;
    position.x = THREE.MathUtils.clamp(position.x, -149, 149);
    position.z = THREE.MathUtils.clamp(position.z, -149, 149);
    const groundLevel = this.terrain.getHeight(position.x, position.z) + 0.8;
    const y = THREE.MathUtils.clamp(position.y, groundLevel, -0.3);
    if (y !== position.y) {
      this.velocity.y = 0;
    }
    position.y = y;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
  }
}
