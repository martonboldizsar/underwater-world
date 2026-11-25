export interface DiveState {
  depthMeters: number;
  maximumDepthMeters: number;
  positionX: number;
  positionZ: number;
  diveTimeSeconds: number;
  waterTemperatureCelsius: number;
  ambientPressurePa: number;
  tankPressurePa: number;
  verticalSpeedMetersPerSecond: number;
  horizontalSpeedMetersPerSecond: number;
  headingDegrees: number;
  bcdGasSurfaceVolumeM3: number;
  buoyancyForceNewtons: number;
  flashlightEnabled: boolean;
}
