import * as THREE from 'three';

interface DepthPreset {
  depth: number;
  color: THREE.Color;
  intensity: number;
}

const depthPresets: DepthPreset[] = [
  { depth: 0, color: new THREE.Color('#48b8cb'), intensity: 1 },
  { depth: 10, color: new THREE.Color('#1689a8'), intensity: 0.7 },
  { depth: 20, color: new THREE.Color('#125b80'), intensity: 0.45 },
  { depth: 40, color: new THREE.Color('#082d50'), intensity: 0.2 },
  { depth: 80, color: new THREE.Color('#041426'), intensity: 0.05 },
];

export class Atmosphere {
  readonly fog = new THREE.FogExp2('#126c88', 0.045);
  sunIntensity: number;

  private readonly scene: THREE.Scene;
  private readonly ambient: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly ambientIntensity: number;
  private readonly waterColor = new THREE.Color();
  private readonly transmittedSunlight = new THREE.Color();
  private readonly absorption = new THREE.Vector3(0.12, 0.045, 0.018);

  constructor(
    scene: THREE.Scene,
    ambient: THREE.HemisphereLight,
    sun: THREE.DirectionalLight,
  ) {
    this.scene = scene;
    this.ambient = ambient;
    this.sun = sun;
    this.sunIntensity = sun.intensity;
    this.ambientIntensity = ambient.intensity;

    scene.fog = this.fog;
    scene.background = this.waterColor;
  }

  update(depth: number) {
    const clampedDepth = Math.max(0, depth);
    const relativeIntensity = this.updateWaterColor(clampedDepth);

    this.transmittedSunlight.setRGB(
      Math.exp(-this.absorption.x * clampedDepth),
      Math.exp(-this.absorption.y * clampedDepth),
      Math.exp(-this.absorption.z * clampedDepth),
    );

    this.scene.background = this.waterColor;
    this.fog.color.copy(this.waterColor);
    this.sun.color.copy(this.transmittedSunlight);
    this.sun.intensity = this.sunIntensity * relativeIntensity;
    this.ambient.intensity = this.ambientIntensity * relativeIntensity;
  }

  private updateWaterColor(depth: number): number {
    for (let i = 1; i < depthPresets.length; i++) {
      const lower = depthPresets[i - 1];
      const upper = depthPresets[i];
      if (lower && upper && depth <= upper.depth) {
        const progress = (depth - lower.depth) / (upper.depth - lower.depth);
        this.waterColor.lerpColors(lower.color, upper.color, progress);
        return THREE.MathUtils.lerp(lower.intensity, upper.intensity, progress);
      }
    }

    const deepest = depthPresets[depthPresets.length - 1];
    if (!deepest) {
      throw new Error('At least one depth preset is required.');
    }

    this.waterColor.copy(deepest.color);
    return deepest.intensity;
  }
}
