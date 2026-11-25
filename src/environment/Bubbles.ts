import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';

const poolSize = 500;
const emissionInterval = 0.14;

interface Bubble {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  initialRadius: number;
  initialPressure: number;
  age: number;
  lifetime: number;
  phase: number;
  active: boolean;
}

export class Bubbles {
  readonly group = new THREE.Group();

  private readonly random: () => number;
  private readonly bubbles: Bubble[] = Array.from({ length: poolSize }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    radius: 0,
    initialRadius: 0,
    initialPressure: 1,
    age: 0,
    lifetime: 0,
    phase: 0,
    active: false,
  }));
  private readonly geometry = new THREE.SphereGeometry(1, 12, 8);
  private readonly material = new THREE.MeshPhysicalMaterial({
    color: '#eafaff',
    roughness: 0.12,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly emitterOffset = new THREE.Vector3(0.14, -0.16, -0.42);
  private readonly worldEmitterOffset = new THREE.Vector3();
  private emissionTimer = 0;
  private nextSlot = 0;

  constructor(seed = 41) {
    this.random = createSeededRandom(seed);
    this.group.name = 'diver-bubbles';
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      poolSize,
    );
    this.mesh.name = 'bubble pool';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < poolSize; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
  }

  update(
    dt: number,
    elapsedTime: number,
    camera: THREE.Camera,
    isExhaling: boolean,
  ) {
    this.emitDuringExhale(dt, camera, isExhaling);

    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (!bubble) {
        throw new Error('Bubble pool state is incomplete.');
      }
      if (!bubble.active) {
        continue;
      }

      bubble.age += dt;
      if (bubble.age >= bubble.lifetime || bubble.position.y >= 0) {
        bubble.active = false;
        this.setInactiveMatrix(i);
        continue;
      }

      bubble.velocity.y += 0.1 * dt;
      bubble.velocity.x += Math.sin(elapsedTime * 1.3 + bubble.phase) * 0.012 * dt;
      bubble.velocity.z += Math.cos(elapsedTime * 1.1 + bubble.phase) * 0.01 * dt;
      bubble.position.addScaledVector(bubble.velocity, dt);
      if (bubble.position.y >= 0) {
        bubble.active = false;
        this.setInactiveMatrix(i);
        continue;
      }

      const depth = Math.max(0, -bubble.position.y);
      const pressure = 1 + depth / 10;
      bubble.radius =
        bubble.initialRadius *
        Math.cbrt(bubble.initialPressure / pressure);
      this.setBubbleMatrix(i, bubble);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  reset() {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (!bubble) {
        throw new Error('Bubble pool state is incomplete.');
      }
      bubble.active = false;
      this.setInactiveMatrix(i);
    }
    this.emissionTimer = 0;
    this.nextSlot = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private emitDuringExhale(
    dt: number,
    camera: THREE.Camera,
    isExhaling: boolean,
  ) {
    if (!isExhaling) {
      this.emissionTimer = 0;
      return;
    }

    this.emissionTimer -= dt;
    while (this.emissionTimer <= 0) {
      this.emit(camera);
      this.emissionTimer += emissionInterval;
    }
  }

  private emit(camera: THREE.Camera) {
    const slot = this.acquireSlot();
    const bubble = this.bubbles[slot];
    if (!bubble) {
      throw new Error('Bubble pool could not provide an emission slot.');
    }

    this.worldEmitterOffset
      .copy(this.emitterOffset)
      .applyQuaternion(camera.quaternion);
    bubble.position
      .copy(camera.position)
      .add(this.worldEmitterOffset);
    bubble.velocity.set(
      (this.random() - 0.5) * 0.05,
      0.6 + this.random() * 0.15,
      (this.random() - 0.5) * 0.05,
    );
    bubble.initialRadius = 0.009 + this.random() * 0.006;
    bubble.radius = bubble.initialRadius;
    bubble.initialPressure = 1 + Math.max(0, -bubble.position.y) / 10;
    bubble.age = 0;
    bubble.lifetime = Math.min(
      20,
      Math.max(6.5, Math.max(0, -bubble.position.y) / 0.8 + 3) +
        this.random() * 1.5,
    );
    bubble.phase = this.random() * Math.PI * 2;
    bubble.active = true;
    this.setBubbleMatrix(slot, bubble);
  }

  private acquireSlot(): number {
    for (let offset = 0; offset < poolSize; offset++) {
      const slot = (this.nextSlot + offset) % poolSize;
      const bubble = this.bubbles[slot];
      if (bubble && !bubble.active) {
        this.nextSlot = (slot + 1) % poolSize;
        return slot;
      }
    }

    let oldestSlot = this.nextSlot;
    for (let i = 0; i < poolSize; i++) {
      const bubble = this.bubbles[i];
      const oldest = this.bubbles[oldestSlot];
      if (bubble && oldest && bubble.age > oldest.age) {
        oldestSlot = i;
      }
    }
    this.nextSlot = (oldestSlot + 1) % poolSize;
    return oldestSlot;
  }

  private setBubbleMatrix(index: number, bubble: Bubble) {
    this.dummy.position.copy(bubble.position);
    this.dummy.scale.setScalar(bubble.radius);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private setInactiveMatrix(index: number) {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }
}
