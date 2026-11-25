import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { applyFineGrain, ensurePlanarUv } from './AnimalSurface.js';
import { Clownfish } from './Clownfish.js';
import { Terrain } from './Terrain.js';

interface ClownfishMotion {
  phase: number;
  radius: number;
  speed: number;
  direction: number;
  scale: number;
}

function createInstancedGeometry(template: Clownfish): THREE.BufferGeometry {
  template.group.updateMatrixWorld(true);
  const rootInverse = template.group.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];

  template.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (!(object.material instanceof THREE.MeshStandardMaterial)) {
      throw new Error('Clownfish parts must use standard materials.');
    }

    const geometry = object.geometry.clone();
    const localMatrix = new THREE.Matrix4().multiplyMatrices(
      rootInverse,
      object.matrixWorld,
    );
    geometry.applyMatrix4(localMatrix);

    const positions = geometry.attributes.position;
    const sourceColors = geometry.getAttribute('color');
    ensurePlanarUv(geometry);
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      colors[i * 3] =
        object.material.color.r * (sourceColors?.getX(i) ?? 1);
      colors[i * 3 + 1] =
        object.material.color.g * (sourceColors?.getY(i) ?? 1);
      colors[i * 3 + 2] =
        object.material.color.b * (sourceColors?.getZ(i) ?? 1);
    }
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    parts.push(geometry);
  });

  const geometry = mergeGeometries(parts);
  for (const part of parts) {
    part.dispose();
  }
  if (!geometry) {
    throw new Error('Unable to merge instanced clownfish geometry.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class ClownfishSchool {
  readonly group = new THREE.Group();

  private readonly center: THREE.Vector2;
  private readonly terrain: Terrain;
  private readonly motions: ClownfishMotion[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.62,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly direction = new THREE.Vector3();

  constructor(
    terrain: Terrain,
    center: THREE.Vector2,
    seed: number,
    fishCount = 8,
  ) {
    if (!Number.isInteger(fishCount) || fishCount < 1) {
      throw new Error('A clownfish school must contain at least one fish.');
    }

    this.center = center.clone();
    this.terrain = terrain;
    this.group.name = 'shallow-reef-clownfish-school';
    applyFineGrain(this.material, 0.014);
    const random = createSeededRandom(seed + 1);
    this.motions = Array.from({ length: fishCount }, () => ({
      phase: random() * Math.PI * 2,
      radius: 3 + random() * 5,
      speed: 0.12 + random() * 0.08,
      direction: random() < 0.5 ? -1 : 1,
      scale: 0.28 + random() * 0.08,
    }));

    const template = new Clownfish(terrain, center, seed);
    try {
      this.geometry = createInstancedGeometry(template);
    } finally {
      template.dispose();
    }

    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      fishCount,
    );
    this.mesh.name = 'instanced clownfish';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
    this.update(0, 0);
  }

  update(_dt: number, elapsedTime: number) {
    for (let i = 0; i < this.motions.length; i++) {
      const motion = this.motions[i];
      if (!motion) {
        throw new Error('Clownfish school motion is missing.');
      }

      const angle = elapsedTime * motion.speed + motion.phase;
      const x = this.center.x + Math.cos(angle) * motion.radius;
      const z = this.center.y + Math.sin(angle) * motion.radius;
      this.dummy.position.set(
        x,
        this.terrain.getHeight(x, z) + 2.8 + Math.sin(angle * 2) * 0.12,
        z,
      );
      this.direction.set(
        -Math.sin(angle) * motion.direction,
        0,
        Math.cos(angle) * motion.direction,
      );
      this.dummy.quaternion.setFromUnitVectors(
        this.localForward,
        this.direction,
      );
      this.dummy.scale.setScalar(motion.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
  }

  dispose() {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
