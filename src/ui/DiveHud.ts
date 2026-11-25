import type { DiveState } from '../player/DiveState.js';

const CARDINAL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required dive HUD element "#${id}" was not found.`);
  }
  return element;
}

export class DiveHud {
  private readonly depthValue = getElement('hud-depth-value');
  private readonly tankPressureValue = getElement('hud-tank-pressure-value');
  private readonly headingValue = getElement('hud-heading-value');
  private readonly diveTimeValue = getElement('hud-dive-time-value');
  private readonly buoyancyValue = getElement('hud-buoyancy-value');

  update(state: Readonly<DiveState>) {
    this.depthValue.textContent = state.depthMeters.toFixed(1);

    const tankPressureBar = Math.max(
      0,
      (state.tankPressurePa - state.ambientPressurePa) / 100_000,
    );
    this.tankPressureValue.textContent = `${tankPressureBar.toFixed(1)} bar`;

    const heading = ((state.headingDegrees % 360) + 360) % 360;
    const roundedHeading = Math.round(heading) % 360;
    const cardinalIndex = Math.round(heading / 45) % CARDINAL_DIRECTIONS.length;
    this.headingValue.textContent =
      `${String(roundedHeading).padStart(3, '0')}° ${CARDINAL_DIRECTIONS[cardinalIndex]}`;

    const totalSeconds = Math.floor(Math.max(0, state.diveTimeSeconds));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.diveTimeValue.textContent =
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const buoyancyStatus =
      state.buoyancyForceNewtons > 1
        ? 'positive'
        : state.buoyancyForceNewtons < -1
          ? 'negative'
          : 'neutral';
    this.buoyancyValue.dataset.status = buoyancyStatus;
    this.buoyancyValue.textContent = buoyancyStatus;
  }
}
