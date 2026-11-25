import * as THREE from 'three';
import { Refractor } from 'three/addons/objects/Refractor.js';
import fragmentShader from '../shaders/water.frag.glsl?raw';
import vertexShader from '../shaders/water.vert.glsl?raw';

export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly refractor: Refractor;
  private readonly helperGeometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly renderGroup = new THREE.Group();
  private readonly refractionMatrix = new THREE.Matrix4();
  private readonly inverseHelperMatrix = new THREE.Matrix4();
  private readonly renderTargetSize = new THREE.Vector2();
  private readonly cameraPosition = new THREE.Vector3();

  constructor(size = 300, segments = 200) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    this.helperGeometry = new THREE.PlaneGeometry(size, size);
    this.refractor = new Refractor(this.helperGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      multisample: 0,
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRefractionMap: { value: this.refractor.getRenderTarget().texture },
        uRefractionMatrix: { value: new THREE.Matrix4() },
        uCameraPosition: { value: new THREE.Vector3() },
        uUnderwater: { value: 1 },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      fog: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'ocean-surface';
  }

  update(elapsedTime: number) {
    this.material.uniforms.uTime.value = elapsedTime;
  }

  setRenderTargetSize(width: number, height: number) {
    this.renderTargetSize.set(
      Math.max(1, Math.floor(width * 0.5)),
      Math.max(1, Math.floor(height * 0.5)),
    );
    this.refractor.getRenderTarget().setSize(
      this.renderTargetSize.x,
      this.renderTargetSize.y,
    );
  }

  updateRefractionTarget(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    skyBackground: THREE.Texture,
  ) {
    camera.updateMatrixWorld(true);

    const underwater = camera.getWorldPosition(this.cameraPosition).y < 0;
    this.material.uniforms.uCameraPosition.value.copy(this.cameraPosition);
    this.material.uniforms.uUnderwater.value = underwater ? 1 : 0;

    const helperRotation = underwater ? Math.PI / 2 : -Math.PI / 2;
    this.refractor.rotation.x = helperRotation;
    this.refractor.updateMatrixWorld(true);

    const previousRenderTarget = renderer.getRenderTarget();
    const previousXrEnabled = renderer.xr.enabled;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousBackground = scene.background;
    const previousVisibility = this.mesh.visible;

    try {
      this.mesh.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;

      scene.background = underwater ? skyBackground : previousBackground;
      this.refractor.onBeforeRender(
        renderer,
        scene,
        camera,
        this.refractor.geometry,
        this.refractor.material,
        this.renderGroup,
      );

      this.refractionMatrix.copy(
        this.getTextureMatrix(this.refractor.material),
      );
      this.inverseHelperMatrix.copy(this.refractor.matrixWorld).invert();
      this.refractionMatrix.multiply(this.inverseHelperMatrix);

      this.material.uniforms.uRefractionMatrix.value.copy(this.refractionMatrix);
    } finally {
      this.mesh.visible = previousVisibility;
      scene.background = previousBackground;
      renderer.xr.enabled = previousXrEnabled;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      renderer.setRenderTarget(previousRenderTarget);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.refractor.dispose();
    this.helperGeometry.dispose();
  }

  private getTextureMatrix(material: THREE.ShaderMaterial): THREE.Matrix4 {
    const matrix = material.uniforms['textureMatrix']?.value;
    if (!(matrix instanceof THREE.Matrix4)) {
      throw new Error('Water render target is missing its texture matrix.');
    }
    return matrix;
  }
}
