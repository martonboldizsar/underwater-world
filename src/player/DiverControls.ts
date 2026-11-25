import * as THREE from 'three';
import { Terrain } from '../environment/Terrain.js';
import {
  CollisionWorld,
  DIVER_COLLISION_RADIUS,
} from './CollisionWorld.js';

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
  'KeyF',
  'KeyQ',
  'KeyE',
]);

const PHYSICS = {
  surfacePressure: 101_325,
  seawaterDensity: 1025,
  gravity: 9.81,
  mass: 90,
  displacedVolume: 0.085,
  initialBcdGasSurfaceVolume: 0.0042,
  maxBcdBladderVolume: 0.008,
  bcdGasAdjustmentRate: 0.003,
  maxDepthMeters: 40,
  dragCoefficient: 1,
  crossSectionArea: 0.7,
  thrust: 730,
  fastThrustMultiplier: 1.8,
  current: new THREE.Vector3(0.08, 0, 0),
};

export function getAmbientPressurePa(depthMeters: number): number {
  return PHYSICS.surfacePressure
    + PHYSICS.seawaterDensity * PHYSICS.gravity * Math.max(0, depthMeters);
}

export class DiverControls {
  private readonly keys = new Set<string>();
  private readonly velocity = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly relativeVelocity = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly initialPosition = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly initialCameraQuaternion = new THREE.Quaternion();
  private bcdGasSurfaceVolume = PHYSICS.initialBcdGasSurfaceVolume;
  private activity = 0;
  private active = false;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly terrain: Terrain;
  private readonly collisionWorld: CollisionWorld;

  constructor(
    camera: THREE.PerspectiveCamera,
    terrain: Terrain,
    collisionWorld: CollisionWorld,
  ) {
    this.camera = camera;
    this.terrain = terrain;
    this.collisionWorld = collisionWorld;
    this.position.copy(camera.position);
    this.initialPosition.copy(camera.position);
    this.previousPosition.copy(camera.position);
    this.initialCameraQuaternion.copy(camera.quaternion);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
  }

  get currentSpeed(): number {
    return this.velocity.length();
  }

  get depthMeters(): number {
    return Math.max(0, -this.position.y);
  }

  get positionX(): number {
    return this.position.x;
  }

  get positionZ(): number {
    return this.position.z;
  }

  get ambientPressurePa(): number {
    return getAmbientPressurePa(this.depthMeters);
  }

  get verticalSpeedMetersPerSecond(): number {
    return this.velocity.y;
  }

  get horizontalSpeedMetersPerSecond(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get bcdGasSurfaceVolumeM3(): number {
    return this.bcdGasSurfaceVolume;
  }

  get buoyancyForceNewtons(): number {
    return PHYSICS.seawaterDensity
      * PHYSICS.gravity
      * (PHYSICS.displacedVolume + this.bcdGasVolumeM3)
      - PHYSICS.mass * PHYSICS.gravity;
  }

  get bcdGasVolumeM3(): number {
    return Math.min(
      PHYSICS.maxBcdBladderVolume,
      this.bcdGasSurfaceVolume * PHYSICS.surfacePressure / this.ambientPressurePa,
    );
  }

  private get maxBcdGasSurfaceVolumeM3(): number {
    return PHYSICS.maxBcdBladderVolume
      * this.ambientPressurePa
      / PHYSICS.surfacePressure;
  }

  get activityLevel(): number {
    return this.activity;
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

  resetDive() {
    this.clearKeys();
    this.velocity.set(0, 0, 0);
    this.position.copy(this.initialPosition);
    this.previousPosition.copy(this.initialPosition);
    this.camera.position.copy(this.initialPosition);
    this.camera.quaternion.copy(this.initialCameraQuaternion);
    this.bcdGasSurfaceVolume = PHYSICS.initialBcdGasSurfaceVolume;
    this.activity = 0;
  }

  applyBcdGas(surfaceVolumeM3: number) {
    if (surfaceVolumeM3 <= 0) {
      return;
    }
    this.bcdGasSurfaceVolume = Math.min(
      this.maxBcdGasSurfaceVolumeM3,
      this.bcdGasSurfaceVolume + surfaceVolumeM3,
    );
  }

  render(alpha: number) {
    this.camera.position.lerpVectors(
      this.previousPosition,
      this.position,
      THREE.MathUtils.clamp(alpha, 0, 1),
    );
  }

  update(dt: number, active: boolean): number {
    this.active = active;
    if (!active) {
      this.clearKeys();
      this.velocity.set(0, 0, 0);
      this.previousPosition.copy(this.position);
      this.activity = 0;
      return 0;
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
    this.activity = this.direction.lengthSq() > 0 ? (isFast ? 1 : 0.65) : 0;
    const inflating = this.keys.has('KeyE');
    const deflating = this.keys.has('KeyQ');
    let bcdGasRequest = 0;
    if (inflating !== deflating) {
      const adjustment = PHYSICS.bcdGasAdjustmentRate * dt;
      if (inflating) {
        bcdGasRequest = Math.min(
          adjustment,
          this.maxBcdGasSurfaceVolumeM3 - this.bcdGasSurfaceVolume,
        );
      } else {
        this.bcdGasSurfaceVolume = Math.max(
          0,
          this.bcdGasSurfaceVolume - adjustment,
        );
      }
    }

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      const thrust = PHYSICS.thrust * (isFast ? PHYSICS.fastThrustMultiplier : 1);
      this.force.copy(this.direction).multiplyScalar(thrust);
    } else {
      this.force.set(0, 0, 0);
    }

    this.relativeVelocity.copy(this.velocity).sub(PHYSICS.current);
    const drag = -0.5
      * PHYSICS.seawaterDensity
      * PHYSICS.dragCoefficient
      * PHYSICS.crossSectionArea
      * this.relativeVelocity.length();
    this.force.addScaledVector(this.relativeVelocity, drag);
    this.force.y += PHYSICS.seawaterDensity
      * PHYSICS.gravity
      * (PHYSICS.displacedVolume + this.bcdGasVolumeM3)
      - PHYSICS.mass * PHYSICS.gravity;

    this.previousPosition.copy(this.position);
    this.velocity.addScaledVector(this.force, dt / PHYSICS.mass);
    this.movement.copy(this.velocity).multiplyScalar(dt);
    this.collisionWorld.moveSphere(
      this.position,
      this.movement,
      this.velocity,
    );

    const position = this.position;
    position.x = THREE.MathUtils.clamp(position.x, -149, 149);
    position.z = THREE.MathUtils.clamp(position.z, -149, 149);
    const groundLevel = this.terrain.getHeight(position.x, position.z) + 0.8;
    const lowerLimit = Math.max(groundLevel, -PHYSICS.maxDepthMeters);
    const y = THREE.MathUtils.clamp(
      position.y,
      lowerLimit,
      -DIVER_COLLISION_RADIUS,
    );
    if (y !== position.y) {
      this.velocity.y = 0;
    }
    position.y = y;
    // Vent gas automatically if ascent expands the bladder beyond its capacity.
    this.bcdGasSurfaceVolume = Math.min(
      this.bcdGasSurfaceVolume,
      this.maxBcdGasSurfaceVolumeM3,
    );
    if (position.x === -149 || position.x === 149) this.velocity.x = 0;
    if (position.z === -149 || position.z === 149) this.velocity.z = 0;
    return bcdGasRequest;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
  }
}
