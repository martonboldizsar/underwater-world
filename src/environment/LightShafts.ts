import * as THREE from 'three';
import { createSeededRandom } from '../utils/random.js';

const vertexShader = `
varying vec2 vUv;
varying float vWorldY;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldY = worldPosition.y;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = `
uniform float uTime;
uniform float uCameraDepth;
uniform float uIntensity;
uniform float uPhase;

varying vec2 vUv;
varying float vWorldY;

void main() {
  float across = min(vUv.x, 1.0 - vUv.x);
  float softEdge = smoothstep(0.0, 0.24, across);
  float along = 1.0 - vUv.y;
  float lengthFade = smoothstep(0.0, 0.12, along) *
    (1.0 - smoothstep(0.72, 1.0, along));
  float pulse = 0.82 + 0.18 * sin(uTime * 0.7 + uPhase + vUv.y * 8.0);
  float worldFade = exp(-max(0.0, -vWorldY) * 0.025);
  float diverFade = exp(-uCameraDepth * 0.015);
  float alpha = softEdge * lengthFade * pulse * worldFade *
    diverFade * uIntensity * 0.22;

  gl_FragColor = vec4(vec3(0.48, 0.78, 1.0), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createShaftGeometry(
  topWidth: number,
  bottomWidth: number,
  length: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -topWidth / 2, 0, 0,
        topWidth / 2, 0, 0,
        -bottomWidth / 2, -length, 0,
        bottomWidth / 2, -length, 0,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2),
  );
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  geometry.computeBoundingSphere();
  return geometry;
}

export class LightShafts {
  readonly group = new THREE.Group();
  private readonly timeUniform = { value: 0 };
  private readonly cameraDepthUniform = { value: 0 };
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(sunPosition: THREE.Vector3, count = 10) {
    const random = createSeededRandom(83);
    const down = new THREE.Vector3(0, -1, 0);
    this.group.name = 'sunlight-shafts';

    for (let i = 0; i < count; i++) {
      const x = random() * 110 - 55;
      const z = random() * 100 - 70;
      const surfacePoint = new THREE.Vector3(x, 0, z);
      const direction = surfacePoint.clone().sub(sunPosition).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(down, direction);
      const geometry = createShaftGeometry(
        1 + random() * 1.8,
        14 + random() * 12,
        80 + random() * 35,
      );
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.timeUniform,
          uCameraDepth: this.cameraDepthUniform,
          uIntensity: { value: 0.16 + random() * 0.13 },
          uPhase: { value: random() * Math.PI * 2 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const shaft = new THREE.Group();
      shaft.position.copy(surfacePoint);
      shaft.quaternion.copy(rotation);

      const firstPlane = new THREE.Mesh(geometry, material);
      const secondPlane = new THREE.Mesh(geometry, material);
      secondPlane.rotation.y = Math.PI / 2;
      shaft.add(firstPlane, secondPlane);
      this.group.add(shaft);
      this.geometries.push(geometry);
      this.materials.push(material);
    }
  }

  update(elapsedTime: number, cameraDepth: number) {
    this.timeUniform.value = elapsedTime;
    this.cameraDepthUniform.value = cameraDepth;
  }

  dispose() {
    for (const material of this.materials) {
      material.dispose();
    }
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.group.clear();
  }
}
