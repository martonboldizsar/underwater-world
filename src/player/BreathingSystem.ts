const BREATHING = {
  surfacePressurePa: 101_325,
  initialTankPressurePa: 200 * 100_000,
  cylinderVolumeM3: 12 / 1000,
  restingRmvM3PerSecond: 15 / 1000 / 60,
  maxActivityMultiplier: 1.5,
  breathCycleSeconds: 5,
  exhaleDurationSeconds: 1.35,
};

export class BreathingSystem {
  private currentTankPressurePa = BREATHING.initialTankPressurePa;
  private breathPhase = 0;
  private exhaling = false;

  get tankPressurePa(): number {
    return this.currentTankPressurePa;
  }

  update(
    dt: number,
    ambientPressurePa: number,
    activityLevel: number,
    active: boolean,
  ): boolean {
    if (!active || this.currentTankPressurePa <= ambientPressurePa) {
      this.exhaling = false;
      return false;
    }

    const activity = Math.max(0, Math.min(1, activityLevel));
    const rmvMultiplier =
      1 + activity * (BREATHING.maxActivityMultiplier - 1);
    const surfaceGasRate =
      BREATHING.restingRmvM3PerSecond
      * rmvMultiplier
      * ambientPressurePa
      / BREATHING.surfacePressurePa;
    const pressureDrop =
      BREATHING.surfacePressurePa
      * surfaceGasRate
      * dt
      / BREATHING.cylinderVolumeM3;
    this.currentTankPressurePa = Math.max(
      ambientPressurePa,
      this.currentTankPressurePa - pressureDrop,
    );

    this.breathPhase = (
      this.breathPhase
      + dt * rmvMultiplier / BREATHING.breathCycleSeconds
    ) % 1;
    this.exhaling =
      this.currentTankPressurePa > ambientPressurePa
      && this.breathPhase
        < BREATHING.exhaleDurationSeconds / BREATHING.breathCycleSeconds;
    return this.exhaling;
  }

  consumeBcdGas(surfaceVolumeRequestM3: number, ambientPressurePa: number): number {
    if (
      surfaceVolumeRequestM3 <= 0
      || this.currentTankPressurePa <= ambientPressurePa
    ) {
      return 0;
    }

    const availableSurfaceVolume =
      (this.currentTankPressurePa - ambientPressurePa)
      * BREATHING.cylinderVolumeM3
      / BREATHING.surfacePressurePa;
    const suppliedSurfaceVolume = Math.min(
      surfaceVolumeRequestM3,
      availableSurfaceVolume,
    );
    const pressureDrop =
      BREATHING.surfacePressurePa
      * suppliedSurfaceVolume
      / BREATHING.cylinderVolumeM3;
    this.currentTankPressurePa = Math.max(
      ambientPressurePa,
      this.currentTankPressurePa - pressureDrop,
    );
    return suppliedSurfaceVolume;
  }

  reset(): void {
    this.currentTankPressurePa = BREATHING.initialTankPressurePa;
    this.breathPhase = 0;
    this.exhaling = false;
  }
}
