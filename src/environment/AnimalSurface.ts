import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { createSeededRandom } from '../utils/random.js';

let fineGrainBumpTexture: THREE.CanvasTexture | undefined;

export interface OrganicLobe {
  center: readonly [number, number, number];
  radius: number;
}

export function createRoundedFinGeometry(
  vertices: readonly number[],
  thickness: number,
): THREE.BufferGeometry {
  if (
    vertices.length !== 9 ||
    !vertices.every(Number.isFinite) ||
    !Number.isFinite(thickness) ||
    thickness <= 0
  ) {
    throw new Error('Rounded fin geometry requires three valid vertices.');
  }

  const points = [0, 1, 2].map(
    (index) =>
      new THREE.Vector3(
        vertices[index * 3] ?? 0,
        vertices[index * 3 + 1] ?? 0,
        vertices[index * 3 + 2] ?? 0,
      ),
  );
  const origin = points[0];
  const next = points[1];
  const last = points[2];
  if (!origin || !next || !last) {
    throw new Error('Rounded fin vertices are incomplete.');
  }

  const axisU = next.clone().sub(origin);
  const normal = axisU.clone().cross(last.clone().sub(origin));
  if (axisU.lengthSq() <= 1e-10 || normal.lengthSq() <= 1e-10) {
    throw new Error('Rounded fin vertices must form a non-degenerate triangle.');
  }
  axisU.normalize();
  normal.normalize();
  const axisV = normal.clone().cross(axisU).normalize();
  const outline = points.map((point) => {
    const relative = point.clone().sub(origin);
    return new THREE.Vector2(relative.dot(axisU), relative.dot(axisV));
  });
  const shape = new THREE.Shape();
  const first = outline[0];
  if (!first) {
    throw new Error('Rounded fin outline is incomplete.');
  }
  const firstEntry = first.clone().lerp(outline[2] ?? first, 0.14);
  shape.moveTo(firstEntry.x, firstEntry.y);
  for (let index = 0; index < outline.length; index++) {
    const corner = outline[index];
    const previous = outline[(index + outline.length - 1) % outline.length];
    const following = outline[(index + 1) % outline.length];
    if (!corner || !previous || !following) {
      throw new Error('Rounded fin outline is incomplete.');
    }

    const entry = corner.clone().lerp(previous, 0.14);
    const exit = corner.clone().lerp(following, 0.14);
    shape.lineTo(entry.x, entry.y);
    shape.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: thickness * 0.25,
    bevelThickness: thickness * 0.35,
    curveSegments: 10,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(axisU, axisV, normal)
      .setPosition(origin),
  );
  const vertexCount = geometry.getAttribute('position').count;
  geometry.setIndex(
    new THREE.BufferAttribute(
      Uint32Array.from({ length: vertexCount }, (_, index) => index),
      1,
    ),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createOrganicGeometry(
  lobes: readonly OrganicLobe[],
  targetSize: THREE.Vector3,
  resolution = 32,
): THREE.BufferGeometry {
  if (lobes.length === 0) {
    throw new Error('Organic animal geometry requires at least one lobe.');
  }
  if (!Number.isInteger(resolution) || resolution < 16) {
    throw new Error('Organic animal geometry resolution must be at least 16.');
  }
  if (
    ![targetSize.x, targetSize.y, targetSize.z].every(
      (extent) => Number.isFinite(extent) && extent > 0,
    )
  ) {
    throw new Error('Organic animal geometry requires positive dimensions.');
  }

  const material = new THREE.MeshBasicMaterial();
  const effect = new MarchingCubes(resolution, material, true, false, 20000);
  effect.isolation = 80;
  const geometry = new THREE.BufferGeometry();

  try {
    const subtract = 20;
    for (const lobe of lobes) {
      if (
        !Number.isFinite(lobe.radius) ||
        lobe.radius <= 0 ||
        lobe.center.some(
          (coordinate) =>
            !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1,
        )
      ) {
        throw new Error('Organic animal lobe data is outside its valid range.');
      }

      effect.addBall(
        lobe.center[0],
        lobe.center[1],
        lobe.center[2],
        lobe.radius ** 2 * (effect.isolation + subtract),
        subtract,
      );
    }
    effect.update();

    const vertexCount = effect.count;
    if (vertexCount === 0 || vertexCount / 3 > 20000) {
      throw new Error('Unable to generate organic animal geometry.');
    }

    for (const name of ['position', 'normal', 'uv'] as const) {
      const source = effect.geometry.getAttribute(name);
      if (!(source instanceof THREE.BufferAttribute)) {
        throw new Error(`Generated organic geometry is missing ${name} data.`);
      }

      const values = new Float32Array(vertexCount * source.itemSize);
      for (let index = 0; index < values.length; index++) {
        values[index] = source.array[index] ?? 0;
      }
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values, source.itemSize),
      );
    }
    geometry.setIndex(
      new THREE.BufferAttribute(
        Uint32Array.from({ length: vertexCount }, (_, index) => index),
        1,
      ),
    );

    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) {
      throw new Error('Unable to calculate organic animal geometry bounds.');
    }

    const size = bounds.getSize(new THREE.Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      throw new Error('Organic animal geometry has invalid dimensions.');
    }

    geometry.center();
    geometry.scale(
      targetSize.x / size.x,
      targetSize.y / size.y,
      targetSize.z / size.z,
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    effect.geometry.dispose();
    material.dispose();
  }
}

export function getFineGrainBumpTexture(): THREE.CanvasTexture {
  if (fineGrainBumpTexture) {
    return fineGrainBumpTexture;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create the animal fine-grain texture.');
  }

  const random = createSeededRandom(9137);
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const periodicGrain =
        Math.sin((x / size) * Math.PI * 22) * 5 +
        Math.sin((y / size) * Math.PI * 18) * 4;
      const value = THREE.MathUtils.clamp(
        Math.round(128 + periodicGrain + (random() - 0.5) * 46),
        0,
        255,
      );
      const offset = (y * size + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  fineGrainBumpTexture = new THREE.CanvasTexture(canvas);
  fineGrainBumpTexture.colorSpace = THREE.NoColorSpace;
  fineGrainBumpTexture.wrapS = THREE.RepeatWrapping;
  fineGrainBumpTexture.wrapT = THREE.RepeatWrapping;
  fineGrainBumpTexture.anisotropy = 4;
  return fineGrainBumpTexture;
}

export function applyFineGrain(
  material: THREE.MeshStandardMaterial,
  bumpScale: number,
): void {
  material.bumpMap = getFineGrainBumpTexture();
  material.bumpScale = bumpScale;
  material.needsUpdate = true;
}

export function ensurePlanarUv(geometry: THREE.BufferGeometry): void {
  if (geometry.attributes.uv) {
    return;
  }

  const position = geometry.attributes.position;
  if (!position) {
    throw new Error('Animal geometry is missing its position attribute.');
  }

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    throw new Error('Unable to calculate animal geometry bounds.');
  }

  const size = bounds.getSize(new THREE.Vector3());
  const axes = [
    { axis: 0, extent: size.x, minimum: bounds.min.x },
    { axis: 1, extent: size.y, minimum: bounds.min.y },
    { axis: 2, extent: size.z, minimum: bounds.min.z },
  ].sort((a, b) => b.extent - a.extent);
  const uAxis = axes[0];
  const vAxis = axes[1];
  if (!uAxis || !vAxis) {
    throw new Error('Unable to select texture axes for animal geometry.');
  }

  const readCoordinate = (index: number, axis: number): number => {
    if (axis === 0) {
      return position.getX(index);
    }
    if (axis === 1) {
      return position.getY(index);
    }
    return position.getZ(index);
  };
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index++) {
    uvs[index * 2] =
      (readCoordinate(index, uAxis.axis) - uAxis.minimum) /
      Math.max(uAxis.extent, 1e-6);
    uvs[index * 2 + 1] =
      (readCoordinate(index, vAxis.axis) - vAxis.minimum) /
      Math.max(vAxis.extent, 1e-6);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

export function disposeFineGrainBumpTexture(): void {
  fineGrainBumpTexture?.dispose();
  fineGrainBumpTexture = undefined;
}
