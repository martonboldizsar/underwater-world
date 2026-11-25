import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';

const particleCount = 3000;
const halfWidth = 14;
const halfHeight = 10;
const halfDepth = 14;

const vertexShader = `
attribute float aSize;
attribute float aOpacity;
attribute float aPhase;

uniform float uTime;
uniform vec3 uVolumeMin;
uniform vec3 uVolumeMax;
uniform vec3 uFlashlightPosition;
uniform vec3 uFlashlightDirection;
uniform float uFlashlightEnabled;
uniform float uFlashlightRange;
uniform float uFlashlightCosInner;
uniform float uFlashlightCosOuter;

varying float vOpacity;
varying float vFlashlight;

#include <fog_pars_vertex>

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec3 volumePosition =
    (worldPosition.xyz - uVolumeMin) / (uVolumeMax - uVolumeMin);
  vec3 edgePosition = min(volumePosition, 1.0 - volumePosition);
  float nearestEdge = min(edgePosition.x, min(edgePosition.y, edgePosition.z));
  float edgeFade = smoothstep(0.0, 0.12, nearestEdge);
  float twinkle = 0.82 + 0.18 * sin(uTime * 1.4 + aPhase);

  vec3 toParticle = worldPosition.xyz - uFlashlightPosition;
  float lightDistance = length(toParticle);
  float coneAlignment = dot(
    normalize(toParticle),
    normalize(uFlashlightDirection)
  );
  float coneFade = smoothstep(
    uFlashlightCosOuter,
    uFlashlightCosInner,
    coneAlignment
  );
  float distanceFade = 1.0 - smoothstep(
    uFlashlightRange * 0.6,
    uFlashlightRange,
    lightDistance
  );
  vFlashlight = coneFade * distanceFade * uFlashlightEnabled;
  vOpacity = aOpacity * edgeFade * twinkle;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * (400.0 / -mvPosition.z), 1.0, 7.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = `
varying float vOpacity;
varying float vFlashlight;

#include <fog_pars_fragment>

void main() {
  float radius = length(gl_PointCoord - vec2(0.5));
  float softDisc = 1.0 - smoothstep(0.22, 0.5, radius);
  float centerGlow = 1.0 - smoothstep(0.0, 0.5, radius);
  vec3 ambientColor = vec3(0.62, 0.78, 0.79);
  vec3 torchColor = vec3(1.0, 0.88, 0.69);
  vec3 color = mix(ambientColor, torchColor, vFlashlight);
  color *= 0.72 + centerGlow * 0.28 + vFlashlight * 1.4;

  gl_FragColor = vec4(color, vOpacity * softDisc);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Plankton {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private readonly random: () => number;
  private readonly positions = new Float32Array(particleCount * 3);
  private readonly velocities = new Float32Array(particleCount * 3);
  private readonly sizes = new Float32Array(particleCount);
  private readonly opacities = new Float32Array(particleCount);
  private readonly phases = new Float32Array(particleCount);
  private readonly cameraPosition = new THREE.Vector3();
  private readonly flashlightPosition = new THREE.Vector3();
  private readonly flashlightDirection = new THREE.Vector3();
  private readonly flashlightTarget = new THREE.Vector3();
  private readonly uniforms = {
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
    fogDensity: { value: 0 },
    uTime: { value: 0 },
    uVolumeMin: { value: new THREE.Vector3() },
    uVolumeMax: { value: new THREE.Vector3() },
    uFlashlightPosition: { value: this.flashlightPosition },
    uFlashlightDirection: { value: this.flashlightDirection },
    uFlashlightEnabled: { value: 0 },
    uFlashlightRange: { value: 25 },
    uFlashlightCosInner: { value: Math.cos((Math.PI / 9) * 0.72) },
    uFlashlightCosOuter: { value: Math.cos(Math.PI / 9) },
  };
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });

  constructor(camera: THREE.Camera, flashlight: THREE.SpotLight, seed = 163) {
    this.random = createSeededRandom(seed);
    this.initializeParticles(camera);

    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute(
      'aOpacity',
      new THREE.BufferAttribute(this.opacities, 1),
    );
    this.geometry.setAttribute(
      'aPhase',
      new THREE.BufferAttribute(this.phases, 1),
    );
    this.geometry.computeBoundingSphere();

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'plankton and suspended particles';
    this.points.frustumCulled = false;
    this.update(0, 0, camera, flashlight);
  }

  update(
    dt: number,
    elapsedTime: number,
    camera: THREE.Camera,
    flashlight: THREE.SpotLight,
  ) {
    camera.updateMatrixWorld();
    this.cameraPosition.copy(camera.position);
    const minX = this.cameraPosition.x - halfWidth;
    const maxX = this.cameraPosition.x + halfWidth;
    const minY = this.cameraPosition.y - halfHeight;
    const maxY = Math.min(this.cameraPosition.y + halfHeight, -0.25);
    const minZ = this.cameraPosition.z - halfDepth;
    const maxZ = this.cameraPosition.z + halfDepth;
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;

    this.uniforms.uTime.value = elapsedTime;
    this.uniforms.uVolumeMin.value.set(minX, minY, minZ);
    this.uniforms.uVolumeMax.value.set(maxX, maxY, maxZ);
    this.uniforms.uFlashlightEnabled.value = flashlight.visible ? 1 : 0;
    flashlight.getWorldPosition(this.flashlightPosition);
    flashlight.target.getWorldPosition(this.flashlightTarget);
    this.flashlightDirection
      .subVectors(this.flashlightTarget, this.flashlightPosition)
      .normalize();

    for (let particle = 0; particle < particleCount; particle++) {
      const offset = particle * 3;
      const phase = this.phases[particle];
      if (phase === undefined) {
        throw new Error('Plankton particle state is incomplete.');
      }

      let x = this.positions[offset];
      let y = this.positions[offset + 1];
      let z = this.positions[offset + 2];
      const velocityX = this.velocities[offset];
      const velocityY = this.velocities[offset + 1];
      const velocityZ = this.velocities[offset + 2];
      if (
        x === undefined ||
        y === undefined ||
        z === undefined ||
        velocityX === undefined ||
        velocityY === undefined ||
        velocityZ === undefined
      ) {
        throw new Error('Plankton particle position or velocity is incomplete.');
      }

      x +=
        (velocityX + Math.sin(elapsedTime * 0.37 + phase) * 0.018) * dt;
      y +=
        (velocityY + Math.cos(elapsedTime * 0.29 + phase) * 0.012) * dt;
      z +=
        (velocityZ + Math.sin(elapsedTime * 0.33 + phase * 1.3) * 0.016) *
        dt;

      if (x < minX) x += width;
      else if (x > maxX) x -= width;
      if (y < minY) y += height;
      else if (y > maxY) y -= height;
      if (z < minZ) z += depth;
      else if (z > maxZ) z -= depth;

      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;
    }

    const positionAttribute = this.geometry.getAttribute('position');
    positionAttribute.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.points.clear();
  }

  private initializeParticles(camera: THREE.Camera) {
    const minY = camera.position.y - halfHeight;
    const maxY = Math.min(camera.position.y + halfHeight, -0.25);
    for (let particle = 0; particle < particleCount; particle++) {
      const offset = particle * 3;
      this.positions[offset] =
        camera.position.x + (this.random() * 2 - 1) * halfWidth;
      this.positions[offset + 1] =
        minY + this.random() * (maxY - minY);
      this.positions[offset + 2] =
        camera.position.z + (this.random() * 2 - 1) * halfDepth;
      this.velocities[offset] = (this.random() - 0.5) * 0.14;
      this.velocities[offset + 1] = (this.random() - 0.5) * 0.08;
      this.velocities[offset + 2] = (this.random() - 0.5) * 0.14;
      this.sizes[particle] = 0.045 + this.random() * 0.075;
      this.opacities[particle] = 0.16 + this.random() * 0.34;
      this.phases[particle] = this.random() * Math.PI * 2;
    }
  }
}
