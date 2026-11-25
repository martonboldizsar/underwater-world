import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';
import {
  applyFineGrain,
  createRoundedFinGeometry,
  ensurePlanarUv,
  setSolidVertexColor,
} from './AnimalSurface.js';
import type { CollisionWorld } from '../player/CollisionWorld.js';
import { WorldRoamer } from './WorldRoamer.js';
import { Terrain } from './Terrain.js';

const bodyRingCount = 81;
const bodyRadialSegments = 24;
const bodySegmentCount = 16;
const bodySegmentLength = 0.28;
const bodyStartZ = 0.72;
const bodyRadius = 0.26;

export class MorayEel {
  readonly group = new THREE.Group();

  private readonly phase: number;
  private readonly roamer: WorldRoamer;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly model = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private bodyGeometry: THREE.BufferGeometry | undefined;
  private dorsalGeometry: THREE.BufferGeometry | undefined;
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly localForward = new THREE.Vector3(0, 0, 1);
  private readonly targetOrientation = new THREE.Quaternion();

  constructor(
    terrain: Terrain,
    territoryCenter = new THREE.Vector2(7, -26),
    seed = 139,
  ) {
    this.phase = createSeededRandom(seed)() * Math.PI * 2;
    this.roamer = new WorldRoamer(
      terrain,
      territoryCenter,
      seed + 1,
      0.75,
      2.5,
    );
    this.group.name = 'moray-eel';
    this.group.add(this.model);
    this.createModel();
    this.updateBody(0);
    this.updatePosition(0, 0);
    this.setHeading();
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.targetOrientation);
  }

  update(dt: number, elapsedTime: number) {
    this.updatePosition(dt, elapsedTime);
    this.setHeading();
    this.group.quaternion.slerp(
      this.targetOrientation,
      1 - Math.exp(-1.6 * dt),
    );
    this.group.position.copy(this.position);

    this.updateBody(elapsedTime);
  }

  setCollisionWorld(collisionWorld: CollisionWorld) {
    this.roamer.setCollisionWorld(collisionWorld, this.group, 0.8);
  }

  dispose() {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.group.clear();
  }

  private createModel() {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.72,
      vertexColors: true,
    });
    const bellyMaterial = new THREE.MeshStandardMaterial({
      color: '#c4b47c',
      roughness: 0.78,
    });
    const finMaterial = new THREE.MeshStandardMaterial({
      color: '#536441',
      roughness: 0.76,
      side: THREE.DoubleSide,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: '#202c25',
      roughness: 0.4,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: '#e8d8a6',
      roughness: 0.48,
    });
    applyFineGrain(bodyMaterial, 0.016);
    applyFineGrain(bellyMaterial, 0.012);
    applyFineGrain(finMaterial, 0.012);
    this.materials.push(
      bodyMaterial,
      bellyMaterial,
      finMaterial,
      darkMaterial,
      eyeMaterial,
    );

    const headGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 30, 20),
    );
    setSolidVertexColor(headGeometry, new THREE.Color('#66764d'));
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.set(0, 0.015, 0.9);
    head.scale.set(0.28, 0.24, 0.4);
    this.model.add(head);

    const jawGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 24, 16),
    );
    const jaw = new THREE.Mesh(jawGeometry, bellyMaterial);
    jaw.position.set(0, -0.12, 1.0);
    jaw.scale.set(0.21, 0.1, 0.32);
    this.model.add(jaw);

    const detailGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 20, 12),
    );
    const eyeGeometry = this.trackGeometry(
      new THREE.SphereGeometry(0.07, 16, 12),
    );
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * 0.23, 0.1, 1.03);
      this.model.add(eye);

      const pupil = new THREE.Mesh(detailGeometry, darkMaterial);
      pupil.position.set(side * 0.275, 0.1, 1.05);
      pupil.scale.set(0.035, 0.035, 0.035);
      this.model.add(pupil);

      const gill = new THREE.Mesh(detailGeometry, darkMaterial);
      gill.position.set(side * 0.26, 0, 0.62);
      gill.scale.set(0.018, 0.1, 0.025);
      this.model.add(gill);

      this.model.add(
        this.addFin(
          [
            side * 0.2, -0.05, 0.55,
            side * 0.54, -0.2, 0.12,
            side * 0.18, -0.23, 0.04,
          ],
          finMaterial,
        ),
      );
    }

    this.bodyGeometry = this.trackGeometry(this.createBodyGeometry());
    this.model.add(new THREE.Mesh(this.bodyGeometry, bodyMaterial));
    this.dorsalGeometry = this.trackGeometry(this.createDorsalGeometry());
    this.model.add(new THREE.Mesh(this.dorsalGeometry, finMaterial));

    const tailTipGeometry = this.trackGeometry(
      new THREE.SphereGeometry(1, 20, 14),
    );
    setSolidVertexColor(tailTipGeometry, new THREE.Color('#66764d'));
    const tailTip = new THREE.Mesh(tailTipGeometry, bodyMaterial);
    tailTip.position.z = bodyStartZ - bodySegmentLength * bodySegmentCount;
    tailTip.scale.setScalar(bodyRadius * Math.pow(0.95, bodySegmentCount));
    this.model.add(tailTip);

    this.tailPivot.position.z =
      bodyStartZ - bodySegmentLength * bodySegmentCount;
    this.tailPivot.add(
      this.addFin(
        [
          0, 0.02, 0,
          0, 0.42, -0.34,
          0, -0.2, -0.3,
        ],
        finMaterial,
      ),
    );
    this.model.add(this.tailPivot);
  }

  private createBodyGeometry(): THREE.BufferGeometry {
    const positions = new Float32Array(
      bodyRingCount * (bodyRadialSegments + 1) * 3,
    );
    const uvs = new Float32Array(
      bodyRingCount * (bodyRadialSegments + 1) * 2,
    );
    const colors = new Float32Array(
      bodyRingCount * (bodyRadialSegments + 1) * 3,
    );
    const indices: number[] = [];
    const rowSize = bodyRadialSegments + 1;
    const skinColor = new THREE.Color('#66764d');
    const bellyColor = new THREE.Color('#c4b47c');
    const spotColor = new THREE.Color('#a99d6c');
    const surfaceColor = new THREE.Color();

    for (let ring = 0; ring < bodyRingCount; ring++) {
      const alongBody = ring / (bodyRingCount - 1);
      for (let radial = 0; radial <= bodyRadialSegments; radial++) {
        const index = ring * rowSize + radial;
        const angle = (radial / bodyRadialSegments) * Math.PI * 2;
        uvs[index * 2] = radial / bodyRadialSegments;
        uvs[index * 2 + 1] = alongBody;

        const bellyAmount = THREE.MathUtils.smoothstep(
          -Math.sin(angle),
          0.35,
          0.9,
        );
        surfaceColor.copy(skinColor).lerp(bellyColor, bellyAmount);
        let spotAmount = 0;
        for (
          let spotSegment = 2;
          spotSegment < bodySegmentCount - 1;
          spotSegment += 2
        ) {
          const spotAlongBody = spotSegment / bodySegmentCount;
          const alongDistance =
            Math.abs(alongBody - spotAlongBody) / 0.045;
          for (const spotAngle of [0, Math.PI]) {
            const angularDifference = Math.abs(
              Math.atan2(
                Math.sin(angle - spotAngle),
                Math.cos(angle - spotAngle),
              ),
            );
            const angularDistance = angularDifference / 0.42;
            const distance = Math.hypot(alongDistance, angularDistance);
            spotAmount = Math.max(
              spotAmount,
              1 - THREE.MathUtils.smoothstep(distance, 0.35, 1),
            );
          }
        }
        surfaceColor.lerp(spotColor, spotAmount * 0.58);
        surfaceColor.toArray(colors, index * 3);
      }
    }
    for (let ring = 0; ring < bodyRingCount - 1; ring++) {
      for (let radial = 0; radial < bodyRadialSegments; radial++) {
        const a = ring * rowSize + radial;
        const b = a + rowSize;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  private createDorsalGeometry(): THREE.BufferGeometry {
    const positions = new Float32Array(bodyRingCount * 2 * 3);
    const uvs = new Float32Array(bodyRingCount * 2 * 2);
    const indices: number[] = [];

    for (let ring = 0; ring < bodyRingCount; ring++) {
      const alongBody = ring / (bodyRingCount - 1);
      const index = ring * 2;
      uvs[index * 2] = 0;
      uvs[index * 2 + 1] = alongBody;
      uvs[(index + 1) * 2] = 1;
      uvs[(index + 1) * 2 + 1] = alongBody;
      if (ring < bodyRingCount - 1) {
        const next = index + 2;
        indices.push(index, next, index + 1, index + 1, next, next + 1);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return geometry;
  }

  private updateBody(elapsedTime: number): void {
    const bodyPosition = this.bodyGeometry?.getAttribute('position');
    const dorsalPosition = this.dorsalGeometry?.getAttribute('position');
    if (
      !(bodyPosition instanceof THREE.BufferAttribute) ||
      !(dorsalPosition instanceof THREE.BufferAttribute)
    ) {
      throw new Error('Moray body geometry is not initialized.');
    }

    const bodyLength = bodySegmentLength * bodySegmentCount;
    for (let ring = 0; ring < bodyRingCount; ring++) {
      const alongBody = ring / (bodyRingCount - 1);
      const centerX =
        Math.sin(elapsedTime * 2.1 + this.phase - alongBody * 6) *
        alongBody *
        0.14;
      const radius = bodyRadius * Math.pow(0.95, alongBody * bodySegmentCount);
      const centerZ = bodyStartZ - bodyLength * alongBody;
      for (let radial = 0; radial <= bodyRadialSegments; radial++) {
        const angle = (radial / bodyRadialSegments) * Math.PI * 2;
        bodyPosition.setXYZ(
          ring * (bodyRadialSegments + 1) + radial,
          centerX + Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          centerZ,
        );
      }

      const finHeight = Math.sin(Math.PI * alongBody) * 0.12;
      const dorsalIndex = ring * 2;
      dorsalPosition.setXYZ(
        dorsalIndex,
        centerX - 0.025,
        radius * 0.9,
        centerZ,
      );
      dorsalPosition.setXYZ(
        dorsalIndex + 1,
        centerX + 0.025,
        radius + finHeight,
        centerZ,
      );
    }

    bodyPosition.needsUpdate = true;
    dorsalPosition.needsUpdate = true;
    this.bodyGeometry?.computeVertexNormals();
    this.dorsalGeometry?.computeVertexNormals();
    if (this.bodyGeometry && !this.bodyGeometry.boundingSphere) {
      this.bodyGeometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, bodyStartZ - bodyLength / 2),
        bodyLength * 0.56,
      );
    }
    if (this.dorsalGeometry && !this.dorsalGeometry.boundingSphere) {
      this.dorsalGeometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 0, bodyStartZ - bodyLength / 2),
        bodyLength * 0.56,
      );
    }

    this.tailPivot.rotation.y =
      Math.sin(elapsedTime * 2.1 + this.phase - 6) * 0.22;
  }

  private addFin(vertices: number[], material: THREE.Material): THREE.Mesh {
    const geometry = this.trackGeometry(
      createRoundedFinGeometry(vertices, 0.018),
    );
    return new THREE.Mesh(geometry, material);
  }

  private updatePosition(dt: number, elapsedTime: number) {
    this.roamer.update(dt, elapsedTime, 0.2);
    this.position.copy(this.roamer.position);
  }

  private setHeading() {
    this.direction.copy(this.roamer.direction);
    this.targetOrientation.setFromUnitVectors(
      this.localForward,
      this.direction,
    );
  }

  private trackGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    ensurePlanarUv(geometry);
    this.geometries.push(geometry);
    return geometry;
  }
}
