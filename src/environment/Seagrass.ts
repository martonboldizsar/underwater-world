import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { Caustics, replaceShaderInclude } from './Caustics.js';
import { Terrain } from './Terrain.js';

const meadowCenters = [
  new THREE.Vector2(-15, -22),
  new THREE.Vector2(15, -22),
  new THREE.Vector2(0, 34),
];
const plantsPerMeadow = 60;
const grassHeight = 2.2;
const minimumSpacing = 1.25;
const grassColors = ['#65935b', '#78a968', '#548b62'].map(
  (color) => new THREE.Color(color),
);

interface GrassPosition {
  x: number;
  z: number;
  normal: THREE.Vector3;
}

function createGrassGeometry(seed: number): THREE.BufferGeometry {
  const random = createSeededRandom(seed);
  const blades: THREE.BufferGeometry[] = [];

  for (let i = 0; i < 5; i++) {
    const height = grassHeight * (0.72 + random() * 0.28);
    const width = 0.12 + random() * 0.06;
    const blade = new THREE.PlaneGeometry(width, height, 1, 8);
    const positions = blade.attributes.position;

    for (let vertex = 0; vertex < positions.count; vertex++) {
      const heightRatio = (positions.getY(vertex) + height * 0.5) / height;
      positions.setX(vertex, positions.getX(vertex) * (1 - heightRatio * 0.78));
    }

    positions.needsUpdate = true;
    blade.translate(0, height * 0.5, 0);
    blade.rotateY((i / 5) * Math.PI + (random() - 0.5) * 0.3);
    blade.translate((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12);
    blade.computeVertexNormals();
    blades.push(blade);
  }

  const geometry = mergeGeometries(blades);
  for (const blade of blades) {
    blade.dispose();
  }
  if (!geometry) {
    throw new Error('Unable to merge seagrass blade geometry.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class Seagrass {
  readonly group = new THREE.Group();
  private readonly timeUniform = { value: 0 };
  private readonly terrain: Terrain;
  private readonly random: () => number;
  private readonly habitatNoise: (x: number, y: number) => number;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly plantedLocations: THREE.Vector2[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  private readonly mesh: THREE.InstancedMesh;

  constructor(terrain: Terrain, caustics: Caustics, seed = 4) {
    this.terrain = terrain;
    this.random = createSeededRandom(seed);
    this.habitatNoise = createNoise2D(createSeededRandom(seed + 1));
    this.group.name = 'seagrass-meadows';

    const locations = meadowCenters.flatMap((center) =>
      this.createMeadow(center, plantsPerMeadow),
    );
    this.geometry = createGrassGeometry(seed);
    const phases = new Float32Array(locations.length);
    for (let i = 0; i < phases.length; i++) {
      phases[i] = this.random() * Math.PI * 2;
    }
    const phaseAttribute = new THREE.InstancedBufferAttribute(phases, 1);
    phaseAttribute.needsUpdate = true;
    this.geometry.setAttribute('aSeagrassPhase', phaseAttribute);

    const extension = {
      cacheKey: 'seagrass-sway-v1',
      apply: (shader: Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0]) => {
        shader.uniforms['uSeagrassTime'] = this.timeUniform;
        shader.uniforms['uSeagrassHeight'] = { value: grassHeight };
        shader.uniforms['uSeagrassBend'] = { value: 0.24 };

        shader.vertexShader = replaceShaderInclude(
          shader.vertexShader,
          '#include <common>',
          `#include <common>
attribute float aSeagrassPhase;
uniform float uSeagrassTime;
uniform float uSeagrassHeight;
uniform float uSeagrassBend;`,
        );
        shader.vertexShader = replaceShaderInclude(
          shader.vertexShader,
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
float seagrassHeightRatio = clamp(position.y / uSeagrassHeight, 0.0, 1.0);
float seagrassStrength = seagrassHeightRatio * seagrassHeightRatio;
float seagrassWave = uSeagrassTime * 1.2 + position.y * 0.8 + aSeagrassPhase;
float seagrassStrengthDerivative = 2.0 * seagrassHeightRatio / uSeagrassHeight;
float seagrassSlope = uSeagrassBend * (
  cos(seagrassWave) * 0.8 * seagrassStrength +
  sin(seagrassWave) * seagrassStrengthDerivative
);
objectNormal.x -= seagrassSlope;`,
        );
        shader.vertexShader = replaceShaderInclude(
          shader.vertexShader,
          '#include <begin_vertex>',
          `#include <begin_vertex>
transformed.x += sin(seagrassWave) * seagrassStrength * uSeagrassBend;`,
        );
      },
    };
    caustics.applyToMaterial(this.material, extension);

    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      locations.length,
    );
    this.mesh.name = 'swaying seagrass';
    const dummy = new THREE.Object3D();

    locations.forEach(({ x, z, normal }, index) => {
      dummy.position.set(x, this.terrain.getHeight(x, z) + 0.03, z);
      dummy.quaternion.setFromUnitVectors(this.up, normal);
      dummy.scale.setScalar(0.8 + this.random() * 0.45);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index, dummy.matrix);
      this.mesh.setColorAt(
        index,
        grassColors[Math.floor(this.random() * grassColors.length)],
      );
    });

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  update(elapsedTime: number) {
    this.timeUniform.value = elapsedTime;
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  private createMeadow(
    center: THREE.Vector2,
    plantCount: number,
  ): GrassPosition[] {
    const positions: GrassPosition[] = [];

    for (let plant = 0; plant < plantCount; plant++) {
      let candidate: GrassPosition | undefined;

      for (let attempt = 0; attempt < 1000; attempt++) {
        const angle = this.random() * Math.PI * 2;
        const radius = Math.sqrt(this.random()) * 9;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.y + Math.sin(angle) * radius;
        if (this.habitatNoise(x * 0.12, z * 0.12) < -0.45) {
          continue;
        }

        const tooClose = this.plantedLocations.some(
          (position) =>
            (position.x - x) ** 2 + (position.y - z) ** 2 <
            minimumSpacing * minimumSpacing,
        );
        if (tooClose) {
          continue;
        }

        const depth = this.terrain.getHeight(x, z);
        const slopeX =
          (this.terrain.getHeight(x + 1, z) -
            this.terrain.getHeight(x - 1, z)) *
          0.5;
        const slopeZ =
          (this.terrain.getHeight(x, z + 1) -
            this.terrain.getHeight(x, z - 1)) *
          0.5;
        const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();

        if (depth > -27 && normal.y > 0.7) {
          candidate = { x, z, normal };
          break;
        }
      }

      if (!candidate) {
        throw new Error('Unable to find enough suitable sites for a seagrass meadow.');
      }

      positions.push(candidate);
      this.plantedLocations.push(
        new THREE.Vector2(candidate.x, candidate.z),
      );
    }

    return positions;
  }
}
