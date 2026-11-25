import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';

const textureSize = 128;
const cellCount = 8;

interface CausticCell {
  x: number;
  y: number;
}

type MaterialShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

export interface MaterialShaderExtension {
  cacheKey: string;
  apply(shader: MaterialShader): void;
}

function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createCausticsTexture(seed: number): THREE.DataTexture {
  const random = createSeededRandom(seed);
  const cells: CausticCell[] = Array.from({ length: cellCount * cellCount }, () => ({
    x: random(),
    y: random(),
  }));
  const pixels = new Uint8Array(textureSize * textureSize);

  for (let y = 0; y < textureSize; y++) {
    for (let x = 0; x < textureSize; x++) {
      const sampleX = (x / textureSize) * cellCount;
      const sampleY = (y / textureSize) * cellCount;
      const cellX = Math.floor(sampleX);
      const cellY = Math.floor(sampleY);
      let nearest = Infinity;
      let secondNearest = Infinity;

      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighborX = cellX + offsetX;
          const neighborY = cellY + offsetY;
          const point = cells[
            wrapIndex(neighborY, cellCount) * cellCount +
              wrapIndex(neighborX, cellCount)
          ];
          if (!point) {
            throw new Error('Caustics texture is missing a feature point.');
          }

          const dx = neighborX + point.x - sampleX;
          const dy = neighborY + point.y - sampleY;
          const distance = Math.hypot(dx, dy);

          if (distance < nearest) {
            secondNearest = nearest;
            nearest = distance;
          } else if (distance < secondNearest) {
            secondNearest = distance;
          }
        }
      }

      const edgeDistance = secondNearest - nearest;
      const intensity = 1 - smoothstep(0.025, 0.12, edgeDistance);
      pixels[y * textureSize + x] = Math.round(intensity * 255);
    }
  }

  const texture = new THREE.DataTexture(
    pixels,
    textureSize,
    textureSize,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function replaceShaderInclude(
  source: string,
  include: string,
  replacement: string,
): string {
  if (!source.includes(include)) {
    throw new Error(`Caustics shader injection point "${include}" was not found.`);
  }
  return source.replace(include, replacement);
}

export class Caustics {
  private readonly texture = createCausticsTexture(37);
  private readonly timeUniform = { value: 0 };
  private readonly intensityUniform = { value: 0.9 };

  applyToMaterial(
    material: THREE.MeshStandardMaterial,
    extension?: MaterialShaderExtension,
  ) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uCausticsMap'] = { value: this.texture };
      shader.uniforms['uCausticsTime'] = this.timeUniform;
      shader.uniforms['uCausticsIntensity'] = this.intensityUniform;

      shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        '#include <common>',
        `#include <common>
varying vec3 vCausticsWorldPosition;`,
      );
      shader.vertexShader = replaceShaderInclude(
        shader.vertexShader,
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 causticsWorldPosition = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  causticsWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#endif
vCausticsWorldPosition = causticsWorldPosition.xyz;`,
      );

      shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        '#include <common>',
        `#include <common>
uniform sampler2D uCausticsMap;
uniform float uCausticsTime;
uniform float uCausticsIntensity;
varying vec3 vCausticsWorldPosition;`,
      );
      shader.fragmentShader = replaceShaderInclude(
        shader.fragmentShader,
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
vec2 causticsUv = vCausticsWorldPosition.xz * 0.045;
float causticsA = texture2D(
  uCausticsMap,
  causticsUv + vec2(uCausticsTime * 0.018, uCausticsTime * 0.011)
).r;
float causticsB = texture2D(
  uCausticsMap,
  causticsUv * 1.37 + vec2(-uCausticsTime * 0.013, uCausticsTime * 0.016)
).r;
float causticsDepthFade = exp(-max(0.0, -vCausticsWorldPosition.y) * 0.055);
float causticsLight = max(causticsA, causticsB) * uCausticsIntensity * causticsDepthFade;
reflectedLight.directDiffuse *= 1.0 + causticsLight;`,
      );
      extension?.apply(shader);
    };
    material.customProgramCacheKey = () =>
      `underwater-world-caustics-v1:${extension?.cacheKey ?? 'base'}`;
    material.needsUpdate = true;
  }

  update(elapsedTime: number) {
    this.timeUniform.value = elapsedTime;
  }

  dispose() {
    this.texture.dispose();
  }
}
