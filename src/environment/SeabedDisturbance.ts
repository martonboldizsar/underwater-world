import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import { Terrain } from './Terrain.js';

const poolSize = 960;
const burstSize = 48;
const emissionInterval = 0.28;
const hazeCloudCount = 5;
const hazeEmissionInterval = 0.9;

interface HazeCloud {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  size: number;
}

function createHazeTexture(): THREE.DataTexture {
  const textureSize = 64;
  const pixels = new Uint8Array(textureSize * textureSize * 4);
  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const dx = (x / (textureSize - 1)) * 2 - 1;
      const dy = (y / (textureSize - 1)) * 2 - 1;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const alpha = 1 - THREE.MathUtils.smoothstep(radius, 0.08, 1);
      const offset = (y * textureSize + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(
    pixels,
    textureSize,
    textureSize,
    THREE.RGBAFormat,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = `
attribute float aSize;
attribute float aOpacity;
attribute float aFade;

varying float vOpacity;

#include <fog_pars_vertex>

void main() {
  vOpacity = aOpacity * aFade;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * (400.0 / -mvPosition.z), 1.0, 64.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = `
varying float vOpacity;

#include <fog_pars_fragment>

void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  float softDisc = 1.0 - smoothstep(0.08, 0.5, radius);
  float centerGlow = 1.0 - smoothstep(0.0, 0.5, radius);
  vec3 sedimentColor = vec3(0.52, 0.45, 0.34);
  gl_FragColor = vec4(
    sedimentColor * (0.78 + centerGlow * 0.22),
    vOpacity * softDisc
  );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class SeabedDisturbance {
  readonly group = new THREE.Group();
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly hazeTexture = createHazeTexture();
  private readonly hazeClouds: HazeCloud[] = [];
  private readonly positions = new Float32Array(poolSize * 3);
  private readonly velocities = new Float32Array(poolSize * 3);
  private readonly ages = new Float32Array(poolSize);
  private readonly lifetimes = new Float32Array(poolSize);
  private readonly sizes = new Float32Array(poolSize);
  private readonly baseSizes = new Float32Array(poolSize);
  private readonly opacities = new Float32Array(poolSize);
  private readonly fades = new Float32Array(poolSize);
  private readonly phases = new Float32Array(poolSize);
  private readonly active = new Uint8Array(poolSize);
  private readonly horizontalForward = new THREE.Vector3();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.ShaderMaterial({
    uniforms: {
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
      fogDensity: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  private emissionTimer = 0;
  private hazeEmissionTimer = 0;
  private nextSlot = 0;
  private nextHazeCloud = 0;

  constructor(terrain: Terrain, seed = 181) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.group.name = 'seabed disturbance';
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.sizes, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      'aOpacity',
      new THREE.BufferAttribute(this.opacities, 1),
    );
    this.geometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(this.fades, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      'aPhase',
      new THREE.BufferAttribute(this.phases, 1),
    );
    this.geometry.computeBoundingSphere();

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'localized seabed sediment';
    this.points.frustumCulled = false;
    this.group.add(this.points);

    for (let i = 0; i < hazeCloudCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.hazeTexture,
        color: '#b7a57f',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `sediment haze ${i + 1}`;
      sprite.visible = false;
      this.group.add(sprite);
      this.hazeClouds.push({
        sprite,
        material,
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
        size: 0,
      });
    }
  }

  update(
    dt: number,
    elapsedTime: number,
    camera: THREE.Camera,
    swimSpeed: number,
  ) {
    const diverPosition = camera.position;
    const seabedHeight = this.terrain.getHeight(
      diverPosition.x,
      diverPosition.z,
    );
    const clearance = diverPosition.y - seabedHeight;
    const stirringSediment = clearance < 5.5 && swimSpeed > 0.1;

    if (stirringSediment) {
      camera.getWorldDirection(this.horizontalForward);
      this.horizontalForward.y = 0;
      if (this.horizontalForward.lengthSq() > 1e-6) {
        this.horizontalForward.normalize();
      } else {
        this.horizontalForward.set(0, 0, -1);
      }

      this.emissionTimer -= dt;
      if (this.emissionTimer <= 0) {
        const emissionX = diverPosition.x + this.horizontalForward.x * 1.4;
        const emissionZ = diverPosition.z + this.horizontalForward.z * 1.4;
        this.emitBurst(
          emissionX,
          emissionZ,
          this.terrain.getHeight(emissionX, emissionZ),
        );
        this.emissionTimer = emissionInterval;
      }

      this.hazeEmissionTimer -= dt;
      if (this.hazeEmissionTimer <= 0) {
        const emissionX = diverPosition.x + this.horizontalForward.x * 1.4;
        const emissionZ = diverPosition.z + this.horizontalForward.z * 1.4;
        this.emitHaze(
          emissionX,
          emissionZ,
          this.terrain.getHeight(emissionX, emissionZ),
        );
        this.hazeEmissionTimer = hazeEmissionInterval;
      }
    } else {
      this.emissionTimer = 0;
      this.hazeEmissionTimer = 0;
    }

    this.updateHazeClouds(dt);
    for (let particle = 0; particle < poolSize; particle++) {
      if (!this.active[particle]) {
        continue;
      }

      const offset = particle * 3;
      const age = this.ages[particle];
      const lifetime = this.lifetimes[particle];
      const phase = this.phases[particle];
      const velocityX = this.velocities[offset];
      const velocityY = this.velocities[offset + 1];
      const velocityZ = this.velocities[offset + 2];
      let x = this.positions[offset];
      let y = this.positions[offset + 1];
      let z = this.positions[offset + 2];
      if (
        age === undefined ||
        lifetime === undefined ||
        phase === undefined ||
        velocityX === undefined ||
        velocityY === undefined ||
        velocityZ === undefined ||
        x === undefined ||
        y === undefined ||
        z === undefined
      ) {
        throw new Error('Sediment particle state is incomplete.');
      }

      const nextAge = age + dt;
      if (nextAge >= lifetime) {
        this.active[particle] = 0;
        this.fades[particle] = 0;
        continue;
      }

      this.ages[particle] = nextAge;
      x +=
        (velocityX + Math.sin(elapsedTime * 0.6 + phase) * 0.07) * dt;
      y += (velocityY + 0.035) * dt;
      z +=
        (velocityZ + Math.cos(elapsedTime * 0.52 + phase) * 0.065) * dt;
      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;

      const fadeInRatio = Math.min(nextAge / 0.35, 1);
      const fadeIn = fadeInRatio * fadeInRatio * (3 - 2 * fadeInRatio);
      const fadeOutStart = lifetime * 0.62;
      const fadeOutRatio = THREE.MathUtils.clamp(
        (nextAge - fadeOutStart) / (lifetime - fadeOutStart),
        0,
        1,
      );
      const fadeOut =
        1 - fadeOutRatio * fadeOutRatio * (3 - 2 * fadeOutRatio);
      this.fades[particle] = fadeIn * fadeOut;

      const baseSize = this.baseSizes[particle];
      if (baseSize === undefined) {
        throw new Error('Sediment particle size is incomplete.');
      }
      this.sizes[particle] = baseSize * (1 + nextAge * 0.12);
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('aSize').needsUpdate = true;
    this.geometry.getAttribute('aFade').needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.hazeTexture.dispose();
    for (const cloud of this.hazeClouds) {
      cloud.material.dispose();
    }
    this.group.clear();
  }

  private emitHaze(positionX: number, positionZ: number, seabedHeight: number) {
    const cloud = this.hazeClouds[this.nextHazeCloud];
    if (!cloud) {
      throw new Error('Sediment haze pool is incomplete.');
    }
    this.nextHazeCloud = (this.nextHazeCloud + 1) % hazeCloudCount;
    cloud.age = 0;
    cloud.lifetime = 5.2;
    cloud.size = 2.2 + this.random() * 0.7;
    cloud.velocity.set(
      (this.random() - 0.5) * 0.16,
      0.035 + this.random() * 0.045,
      (this.random() - 0.5) * 0.16,
    );
    cloud.sprite.position.set(
      positionX + (this.random() - 0.5) * 0.4,
      seabedHeight + 0.85,
      positionZ + (this.random() - 0.5) * 0.4,
    );
    cloud.sprite.scale.set(cloud.size, cloud.size * 0.68, 1);
    cloud.material.opacity = 0;
    cloud.sprite.visible = true;
  }

  private updateHazeClouds(dt: number) {
    for (const cloud of this.hazeClouds) {
      if (!cloud.sprite.visible) {
        continue;
      }

      cloud.age += dt;
      if (cloud.age >= cloud.lifetime) {
        cloud.sprite.visible = false;
        cloud.material.opacity = 0;
        continue;
      }

      cloud.sprite.position.addScaledVector(cloud.velocity, dt);
      const lifeRatio = cloud.age / cloud.lifetime;
      const fadeIn = THREE.MathUtils.smoothstep(cloud.age, 0, 0.35);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(lifeRatio, 0.5, 1);
      const growth = 1 + lifeRatio * 0.8;
      cloud.sprite.scale.set(
        cloud.size * growth,
        cloud.size * 0.68 * growth,
        1,
      );
      cloud.material.opacity = 0.42 * fadeIn * fadeOut;
    }
  }

  private emitBurst(positionX: number, positionZ: number, seabedHeight: number) {
    for (let i = 0; i < burstSize; i++) {
      const particle = this.nextSlot;
      this.nextSlot = (this.nextSlot + 1) % poolSize;
      const offset = particle * 3;
      const phase = this.random() * Math.PI * 2;
      const isHaze = this.random() < 0.28;
      const size = isHaze
        ? 0.6 + this.random() * 0.6
        : 0.06 + this.random() * 0.12;

      this.positions[offset] =
        positionX + (this.random() - 0.5) * 1.1;
      this.positions[offset + 1] =
        seabedHeight +         0.35 + this.random() * 0.45;
      this.positions[offset + 2] =
        positionZ + (this.random() - 0.5) * 1.1;
      this.velocities[offset] = (this.random() - 0.5) * 0.55;
      this.velocities[offset + 1] = 0.18 + this.random() * 0.25;
      this.velocities[offset + 2] = (this.random() - 0.5) * 0.55;
      this.ages[particle] = 0;
      this.lifetimes[particle] = 4.5 + this.random() * 1.8;
      this.baseSizes[particle] = size;
      this.sizes[particle] = size;
      this.opacities[particle] = isHaze
        ? 0.1 + this.random() * 0.08
        : 0.28 + this.random() * 0.3;
      this.fades[particle] = 0;
      this.phases[particle] = phase;
      this.active[particle] = 1;
    }
  }
}
