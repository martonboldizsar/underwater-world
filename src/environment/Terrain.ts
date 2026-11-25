import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { createSeededRandom } from '../utils/random.js';
import { Caustics } from './Caustics.js';

export class Terrain {
  readonly mesh: THREE.Mesh;
  private readonly noise: (x: number, y: number) => number;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly textures: THREE.Texture[] = [];

  constructor(size = 300, segments = 200, seed = 1, caustics?: Caustics) {
    this.noise = createNoise2D(createSeededRandom(seed));

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        this.getHeight(positions.getX(i), positions.getZ(i)),
      );
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.material = new THREE.MeshStandardMaterial({
      color: '#b5a580',
      roughness: 0.95,
    });
    caustics?.applyToMaterial(this.material);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
  }

  async loadTextures(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const [color, normal, roughness] = await Promise.all([
      loader.loadAsync('/textures/sand/Ground054_Color.jpg'),
      loader.loadAsync('/textures/sand/Ground054_NormalGL.jpg'),
      loader.loadAsync('/textures/sand/Ground054_Roughness.jpg'),
    ]);

    color.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [color, normal, roughness]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(75, 75);
    }

    this.material.color.set('#ffffff');
    this.material.map = color;
    this.material.normalMap = normal;
    this.material.roughnessMap = roughness;
    this.material.needsUpdate = true;
    this.textures.push(color, normal, roughness);
  }

  getHeight(x: number, z: number): number {
    const shallowReef = 1 - THREE.MathUtils.smoothstep(
      Math.hypot(x, z),
      25,
      65,
    );
    const baseHeight = THREE.MathUtils.lerp(-40, -12, shallowReef);
    const reliefScale = THREE.MathUtils.lerp(1, 0.18, shallowReef);
    const relief =
      this.noise(x * 0.015, z * 0.015) * 7 +
      this.noise(x * 0.06, z * 0.06) * 2 +
      this.noise(x * 0.2, z * 0.2) * 0.35;

    return baseHeight + relief * reliefScale - this.getValleyInfluence(x, z) * 4.5;
  }

  getValleyInfluence(x: number, z: number): number {
    const valleyStart = THREE.MathUtils.smoothstep(z, -20, 0);
    const valleyEnd = 1 - THREE.MathUtils.smoothstep(z, 95, 115);
    const centerX = 38 + 6 * Math.sin(z * 0.04);
    const normalizedX = (x - centerX) / 12;

    return Math.exp(-(normalizedX * normalizedX)) * valleyStart * valleyEnd;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    for (const texture of this.textures) {
      texture.dispose();
    }
  }
}
