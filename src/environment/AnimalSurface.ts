import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { createSeededRandom } from '../utils/random.js';

let fineGrainBumpTexture: THREE.CanvasTexture | undefined;

export interface OrganicLobe {
  center: readonly [number, number, number];
  radius: number;
}

export function setSolidVertexColor(
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
): void {
  const positions = geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) {
    throw new Error('Vertex-colored animal geometry requires positions.');
  }

  const colors = new Float32Array(positions.count * 3);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    color.toArray(colors, vertex * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

export function createSmoothTubeGeometry(
  ringCount: number,
  radialSegments: number,
): THREE.BufferGeometry {
  if (
    !Number.isInteger(ringCount) ||
    ringCount < 2 ||
    !Number.isInteger(radialSegments) ||
    radialSegments < 3
  ) {
    throw new Error('Smooth tube geometry requires at least two rings and three radial segments.');
  }

  const positions = new Float32Array(ringCount * (radialSegments + 1) * 3);
  const uvs = new Float32Array(ringCount * (radialSegments + 1) * 2);
  const indices: number[] = [];
  for (let ring = 0; ring < ringCount; ring++) {
    for (let radial = 0; radial <= radialSegments; radial++) {
      const vertex = ring * (radialSegments + 1) + radial;
      uvs[vertex * 2] = radial / radialSegments;
      uvs[vertex * 2 + 1] = ring / (ringCount - 1);
      if (ring < ringCount - 1 && radial < radialSegments) {
        const nextRing = vertex + radialSegments + 1;
        indices.push(
          vertex,
          vertex + 1,
          nextRing,
          vertex + 1,
          nextRing + 1,
          nextRing,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.radialSegments = radialSegments;
  return geometry;
}

export function updateSmoothTubeGeometry(
  geometry: THREE.BufferGeometry,
  centers: readonly THREE.Vector3[],
  radii: readonly number[],
): void {
  const positions = geometry.getAttribute('position');
  const radialSegments = geometry.userData.radialSegments;
  if (
    !(positions instanceof THREE.BufferAttribute) ||
    !Number.isInteger(radialSegments) ||
    centers.length < 2 ||
    radii.length !== centers.length ||
    positions.count !== centers.length * (radialSegments + 1)
  ) {
    throw new Error('Smooth tube geometry does not match its centerline data.');
  }

  const tangent = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const axisU = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  const unitX = new THREE.Vector3(1, 0, 0);
  const unitY = new THREE.Vector3(0, 1, 0);
  const centerCount = centers.length;
  for (let ring = 0; ring < centerCount; ring++) {
    const center = centers[ring];
    const radius = radii[ring];
    const previous = centers[Math.max(0, ring - 1)];
    const next = centers[Math.min(centerCount - 1, ring + 1)];
    if (
      !center ||
      !previous ||
      !next ||
      radius === undefined ||
      !Number.isFinite(radius) ||
      radius <= 0
    ) {
      throw new Error('Smooth tube centerline contains invalid ring data.');
    }

    tangent.subVectors(next, previous);
    if (tangent.lengthSq() < 1e-10) {
      tangent.copy(unitY);
    } else {
      tangent.normalize();
    }
    reference.copy(Math.abs(tangent.y) > 0.9 ? unitX : unitY);
    axisU.crossVectors(tangent, reference).normalize();
    axisV.crossVectors(tangent, axisU).normalize();

    for (let radial = 0; radial <= radialSegments; radial++) {
      const angle = (radial / radialSegments) * Math.PI * 2;
      const offsetU = Math.cos(angle) * radius;
      const offsetV = Math.sin(angle) * radius;
      const vertex = ring * (radialSegments + 1) + radial;
      positions.setXYZ(
        vertex,
        center.x + axisU.x * offsetU + axisV.x * offsetV,
        center.y + axisU.y * offsetU + axisV.y * offsetV,
        center.z + axisU.z * offsetU + axisV.z * offsetV,
      );
    }
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  if (!(normals instanceof THREE.BufferAttribute)) {
    throw new Error('Smooth tube geometry is missing generated normals.');
  }
  const rowSize = radialSegments + 1;
  for (let ring = 0; ring < centerCount; ring++) {
    const first = ring * rowSize;
    const last = first + radialSegments;
    normals.setXYZ(
      last,
      normals.getX(first),
      normals.getY(first),
      normals.getZ(first),
    );
  }
  normals.needsUpdate = true;
  geometry.computeBoundingSphere();
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
  const firstEntry = first.clone().lerp(outline[2] ?? first, 0.24);
  shape.moveTo(firstEntry.x, firstEntry.y);
  for (let index = 0; index < outline.length; index++) {
    const corner = outline[index];
    const previous = outline[(index + outline.length - 1) % outline.length];
    const following = outline[(index + 1) % outline.length];
    if (!corner || !previous || !following) {
      throw new Error('Rounded fin outline is incomplete.');
    }

    const entry = corner.clone().lerp(previous, 0.24);
    const exit = corner.clone().lerp(following, 0.24);
    shape.lineTo(entry.x, entry.y);
    shape.quadraticCurveTo(corner.x, corner.y, exit.x, exit.y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: thickness * 0.45,
    bevelThickness: thickness * 0.45,
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
  resolution = 40,
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
    const volumePadding = 0.08;
    const volumeScale = 1 - volumePadding * 2;
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
        volumePadding + lobe.center[0] * volumeScale,
        volumePadding + lobe.center[1] * volumeScale,
        volumePadding + lobe.center[2] * volumeScale,
        (lobe.radius * volumeScale) ** 2 * (effect.isolation + subtract),
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
