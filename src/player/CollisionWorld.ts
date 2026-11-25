import * as THREE from 'three';

export const DIVER_COLLISION_RADIUS = 0.45;
const MAX_COLLISION_STEP = DIVER_COLLISION_RADIUS * 0.5;
const MAX_RESOLUTION_PASSES = 4;

const ignoredGroups = new Set([
  'seagrass-meadows',
  'sky-objects',
  'sunlight-shafts',
  'diver-bubbles',
  'seabed disturbance',
]);

const movingGroups = new Set([
  'reef-fish',
  'reef-fish-school',
  'territorial-clownfish',
  'shallow-reef-clownfish-school',
  'manta-ray',
  'sea-turtle',
  'reef-shark',
  'jellyfish',
  'octopus',
  'seahorse',
  'sea-star',
  'moray-eel',
  'crab',
  'distributed-marine-population',
  'purple-worms',
]);

interface SphereCollider {
  mesh: THREE.Mesh;
  localSphere: THREE.Sphere;
  worldSphere: THREE.Sphere;
  dynamic: boolean;
  instanceIndex?: number;
}

interface TriangleCollider {
  bounds: THREE.Sphere;
  vertices: Float32Array;
}

export class CollisionWorld {
  readonly debugGroup = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly excludedObjects: ReadonlySet<THREE.Object3D>;
  private readonly sphereColliders: SphereCollider[] = [];
  private readonly triangleColliders: TriangleCollider[] = [];
  private readonly triangle = new THREE.Triangle();
  private readonly pointA = new THREE.Vector3();
  private readonly pointB = new THREE.Vector3();
  private readonly pointC = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly sphereOffset = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly colliderMatrix = new THREE.Matrix4();
  private readonly debugDummy = new THREE.Object3D();
  private readonly diverDebugPosition = new THREE.Vector3();
  private readonly debugSphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly debugSphereMaterial = new THREE.MeshBasicMaterial({
    color: '#ff795e',
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  private readonly debugSpheres: THREE.InstancedMesh;
  private readonly debugDiver: THREE.Mesh;
  private debugVisibleValue = false;

  constructor(
    scene: THREE.Scene,
    excludedObjects: readonly THREE.Object3D[],
  ) {
    this.scene = scene;
    this.excludedObjects = new Set(excludedObjects);
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || this.shouldIgnore(object)) {
        return;
      }

      const geometry = object.geometry;
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }
      if (!geometry.boundingSphere) {
        return;
      }

      if (object instanceof THREE.InstancedMesh) {
        for (
          let instanceIndex = 0;
          instanceIndex < object.count;
          instanceIndex++
        ) {
          this.addSphereCollider(object, instanceIndex);
        }
      } else if (this.isMoving(object)) {
        this.addSphereCollider(object);
      } else {
        const collider = this.createTriangleCollider(object);
        if (collider) {
          this.triangleColliders.push(collider);
        }
      }
    });

    this.debugGroup.name = 'collision-debug';
    const debugLinePositions = this.triangleColliders.flatMap((collider) =>
      this.createDebugLines(collider.vertices),
    );
    const debugLineGeometry = new THREE.BufferGeometry();
    debugLineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(debugLinePositions, 3),
    );
    debugLineGeometry.computeBoundingSphere();
    const debugLines = new THREE.LineSegments(
      debugLineGeometry,
      new THREE.LineBasicMaterial({
        color: '#ff5b43',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.debugGroup.add(debugLines);

    this.debugSpheres = new THREE.InstancedMesh(
      this.debugSphereGeometry,
      this.debugSphereMaterial,
      this.sphereColliders.length,
    );
    this.debugSpheres.count = this.sphereColliders.length;
    this.debugGroup.add(this.debugSpheres);
    this.debugDiver = new THREE.Mesh(
      this.debugSphereGeometry,
      this.debugSphereMaterial,
    );
    this.debugDiver.scale.setScalar(DIVER_COLLISION_RADIUS);
    this.debugGroup.add(this.debugDiver);
    this.debugGroup.visible = false;
  }

  get debugVisible(): boolean {
    return this.debugVisibleValue;
  }

  set debugVisible(visible: boolean) {
    this.debugVisibleValue = visible;
    this.debugGroup.visible = visible;
    if (visible) {
      this.updateDebug();
    }
  }

  moveSphere(
    position: THREE.Vector3,
    displacement: THREE.Vector3,
    velocity: THREE.Vector3,
  ) {
    this.diverDebugPosition.copy(position);
    this.scene.updateMatrixWorld(true);
    this.refreshDynamicSpheres();

    const distance = displacement.length();
    const steps = Math.max(1, Math.ceil(distance / MAX_COLLISION_STEP));
    this.step.copy(displacement).divideScalar(steps);

    for (let i = 0; i < steps; i++) {
      position.add(this.step);
      this.resolveOverlaps(position, velocity);
    }

    if (this.debugVisibleValue) {
      this.updateDebugSpheres(position);
    }
  }

  updateDebug(diverPosition?: THREE.Vector3) {
    if (!this.debugVisibleValue) {
      return;
    }

    if (diverPosition) {
      this.diverDebugPosition.copy(diverPosition);
    }
    this.scene.updateMatrixWorld(true);
    this.refreshDynamicSpheres();
    this.updateDebugSpheres(this.diverDebugPosition);
  }

  dispose() {
    const lines = this.debugGroup.children.find(
      (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
    );
    this.debugGroup.clear();
    this.debugSpheres.dispose();
    this.debugSphereGeometry.dispose();
    this.debugSphereMaterial.dispose();
    if (lines) {
      lines.geometry.dispose();
      const material = lines.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.dispose();
        }
      } else {
        material.dispose();
      }
    }
  }

  private shouldIgnore(mesh: THREE.Mesh): boolean {
    if (this.excludedObjects.has(mesh)) {
      return true;
    }

    for (
      let ancestor: THREE.Object3D | null = mesh;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (ignoredGroups.has(ancestor.name)) {
        return true;
      }
    }

    return false;
  }

  private isMoving(mesh: THREE.Mesh): boolean {
    for (
      let ancestor: THREE.Object3D | null = mesh;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (movingGroups.has(ancestor.name)) {
        return true;
      }
    }

    return false;
  }

  private addSphereCollider(mesh: THREE.Mesh, instanceIndex?: number) {
    const localSphere = mesh.geometry.boundingSphere;
    if (!localSphere) {
      throw new Error('Collision mesh is missing its bounding sphere.');
    }

    const worldSphere = localSphere.clone();
    if (instanceIndex !== undefined) {
      if (!(mesh instanceof THREE.InstancedMesh)) {
        throw new Error('An instance collider requires an instanced mesh.');
      }
      mesh.getMatrixAt(instanceIndex, this.instanceMatrix);
      this.colliderMatrix.multiplyMatrices(
        mesh.matrixWorld,
        this.instanceMatrix,
      );
    } else {
      this.colliderMatrix.copy(mesh.matrixWorld);
    }
    worldSphere.applyMatrix4(this.colliderMatrix);

    this.sphereColliders.push({
      mesh,
      localSphere: localSphere.clone(),
      worldSphere,
      dynamic: this.isMoving(mesh),
      ...(instanceIndex !== undefined ? { instanceIndex } : {}),
    });
  }

  private createTriangleCollider(
    mesh: THREE.Mesh,
  ): TriangleCollider | undefined {
    const position = mesh.geometry.getAttribute('position');
    if (!position) {
      return undefined;
    }

    const index = mesh.geometry.index;
    const elementCount = index?.count ?? position.count;
    const start = mesh.geometry.drawRange.start;
    const count = Math.max(
      0,
      Math.min(mesh.geometry.drawRange.count, elementCount - start),
    );
    const triangleCount = Math.floor(count / 3);
    if (triangleCount === 0) {
      return undefined;
    }

    const vertices = new Float32Array(triangleCount * 9);
    const point = (element: number, target: THREE.Vector3) => {
      const vertexIndex = index ? index.getX(element) : element;
      target
        .fromBufferAttribute(position, vertexIndex)
        .applyMatrix4(mesh.matrixWorld);
    };

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const element = start + triangleIndex * 3;
      const offset = triangleIndex * 9;
      point(element, this.pointA);
      point(element + 1, this.pointB);
      point(element + 2, this.pointC);
      vertices[offset] = this.pointA.x;
      vertices[offset + 1] = this.pointA.y;
      vertices[offset + 2] = this.pointA.z;
      vertices[offset + 3] = this.pointB.x;
      vertices[offset + 4] = this.pointB.y;
      vertices[offset + 5] = this.pointB.z;
      vertices[offset + 6] = this.pointC.x;
      vertices[offset + 7] = this.pointC.y;
      vertices[offset + 8] = this.pointC.z;
    }

    const bounds = mesh.geometry.boundingSphere?.clone();
    if (!bounds) {
      return undefined;
    }
    bounds.applyMatrix4(mesh.matrixWorld);
    return { bounds, vertices };
  }

  private createDebugLines(vertices: Float32Array): number[] {
    const lines: number[] = [];
    for (let offset = 0; offset < vertices.length; offset += 9) {
      const ax = vertices[offset];
      const ay = vertices[offset + 1];
      const az = vertices[offset + 2];
      const bx = vertices[offset + 3];
      const by = vertices[offset + 4];
      const bz = vertices[offset + 5];
      const cx = vertices[offset + 6];
      const cy = vertices[offset + 7];
      const cz = vertices[offset + 8];
      if (
        ax === undefined ||
        ay === undefined ||
        az === undefined ||
        bx === undefined ||
        by === undefined ||
        bz === undefined ||
        cx === undefined ||
        cy === undefined ||
        cz === undefined
      ) {
        throw new Error('Collision triangle is incomplete.');
      }
      lines.push(
        ax,
        ay,
        az,
        bx,
        by,
        bz,
        bx,
        by,
        bz,
        cx,
        cy,
        cz,
        cx,
        cy,
        cz,
        ax,
        ay,
        az,
      );
    }
    return lines;
  }

  private refreshDynamicSpheres() {
    for (const collider of this.sphereColliders) {
      if (!collider.dynamic) {
        continue;
      }

      if (collider.instanceIndex !== undefined) {
        if (!(collider.mesh instanceof THREE.InstancedMesh)) {
          throw new Error('An instance collider requires an instanced mesh.');
        }
        collider.mesh.getMatrixAt(collider.instanceIndex, this.instanceMatrix);
        this.colliderMatrix.multiplyMatrices(
          collider.mesh.matrixWorld,
          this.instanceMatrix,
        );
      } else {
        this.colliderMatrix.copy(collider.mesh.matrixWorld);
      }
      collider.worldSphere
        .copy(collider.localSphere)
        .applyMatrix4(this.colliderMatrix);
    }
  }

  private resolveOverlaps(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ) {
    for (let pass = 0; pass < MAX_RESOLUTION_PASSES; pass++) {
      let collided = false;

      for (const collider of this.sphereColliders) {
        if (
          this.resolveSphere(
            position,
            velocity,
            collider.worldSphere,
            DIVER_COLLISION_RADIUS,
          )
        ) {
          collided = true;
        }
      }

      for (const collider of this.triangleColliders) {
        if (
          collider.bounds.distanceToPoint(position) > DIVER_COLLISION_RADIUS
        ) {
          continue;
        }

        for (let offset = 0; offset < collider.vertices.length; offset += 9) {
          const ax = collider.vertices[offset];
          const ay = collider.vertices[offset + 1];
          const az = collider.vertices[offset + 2];
          const bx = collider.vertices[offset + 3];
          const by = collider.vertices[offset + 4];
          const bz = collider.vertices[offset + 5];
          const cx = collider.vertices[offset + 6];
          const cy = collider.vertices[offset + 7];
          const cz = collider.vertices[offset + 8];
          if (
            ax === undefined ||
            ay === undefined ||
            az === undefined ||
            bx === undefined ||
            by === undefined ||
            bz === undefined ||
            cx === undefined ||
            cy === undefined ||
            cz === undefined
          ) {
            throw new Error('Collision triangle is incomplete.');
          }
          this.pointA.set(ax, ay, az);
          this.pointB.set(bx, by, bz);
          this.pointC.set(cx, cy, cz);
          this.triangle.set(this.pointA, this.pointB, this.pointC);
          this.triangle.closestPointToPoint(position, this.closestPoint);
          const distanceSquared = position.distanceToSquared(this.closestPoint);
          if (
            distanceSquared >=
            DIVER_COLLISION_RADIUS * DIVER_COLLISION_RADIUS
          ) {
            continue;
          }

          if (distanceSquared > 1e-10) {
            this.normal.subVectors(position, this.closestPoint)
              .multiplyScalar(1 / Math.sqrt(distanceSquared));
          } else {
            this.triangle.getNormal(this.normal);
            if (this.normal.dot(velocity) > 0) {
              this.normal.negate();
            }
          }

          position.addScaledVector(
            this.normal,
            DIVER_COLLISION_RADIUS - Math.sqrt(distanceSquared),
          );
          this.removeInwardVelocity(velocity);
          collided = true;
        }
      }

      if (!collided) {
        break;
      }
    }
  }

  private resolveSphere(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    collider: THREE.Sphere,
    diverRadius: number,
  ): boolean {
    const minimumDistance = diverRadius + collider.radius;
    this.sphereOffset.subVectors(position, collider.center);
    const distanceSquared = this.sphereOffset.lengthSq();
    if (distanceSquared >= minimumDistance * minimumDistance) {
      return false;
    }

    if (distanceSquared > 1e-10) {
      this.normal.copy(this.sphereOffset)
        .multiplyScalar(1 / Math.sqrt(distanceSquared));
    } else if (velocity.lengthSq() > 1e-10) {
      this.normal.copy(velocity).normalize().negate();
    } else {
      this.normal.set(0, 1, 0);
    }

    position.addScaledVector(
      this.normal,
      minimumDistance - Math.sqrt(distanceSquared),
    );
    this.removeInwardVelocity(velocity);
    return true;
  }

  private removeInwardVelocity(velocity: THREE.Vector3) {
    const inwardSpeed = velocity.dot(this.normal);
    if (inwardSpeed < 0) {
      velocity.addScaledVector(this.normal, -inwardSpeed);
    }
  }

  private updateDebugSpheres(diverPosition: THREE.Vector3) {
    for (let i = 0; i < this.sphereColliders.length; i++) {
      const collider = this.sphereColliders[i];
      if (!collider) {
        throw new Error('Collision sphere is missing.');
      }

      this.debugDummy.position.copy(collider.worldSphere.center);
      this.debugDummy.scale.setScalar(collider.worldSphere.radius);
      this.debugDummy.updateMatrix();
      this.debugSpheres.setMatrixAt(i, this.debugDummy.matrix);
    }
    this.debugSpheres.instanceMatrix.needsUpdate = true;
    this.debugDiver.position.copy(diverPosition);
  }
}
