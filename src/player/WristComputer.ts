import * as THREE from 'three';
import type { DiveState } from './DiveState.js';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 320;

function getBuoyancyStatus(forceNewtons: number): string {
  if (forceNewtons > 1) return 'POSITIVE';
  if (forceNewtons < -1) return 'NEGATIVE';
  return 'NEUTRAL';
}

export class WristComputer {
  private readonly rig = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly screenTexture: THREE.CanvasTexture;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hiddenPosition = new THREE.Vector3(0.28, -1.25, -0.78);
  private readonly visiblePosition = new THREE.Vector3(0.28, -0.48, -0.78);
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (
      event.code !== 'KeyB'
      || event.repeat
      || event.isComposing
      || event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    event.preventDefault();
    this.targetOpen = !this.targetOpen;
  };
  private targetOpen = false;
  private progress = 0;
  private lastDisplayKey = '';

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create the wrist computer display canvas.');
    }
    this.context = context;
    this.screenTexture = new THREE.CanvasTexture(this.canvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;

    this.rig.name = 'wrist-computer-rig';
    this.rig.position.copy(this.hiddenPosition);
    this.rig.rotation.set(-0.18, 0, -0.3);
    this.rig.scale.setScalar(0.8);

    const armGeometry = new THREE.CapsuleGeometry(0.075, 0.46, 4, 10);
    const armMaterial = new THREE.MeshStandardMaterial({
      color: '#28636a',
      roughness: 0.82,
    });
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.rotation.z = 0.52;
    this.rig.add(arm);
    this.geometries.push(armGeometry);
    this.materials.push(armMaterial);

    const caseGeometry = new THREE.BoxGeometry(0.38, 0.27, 0.055);
    const caseMaterial = new THREE.MeshStandardMaterial({
      color: '#142f37',
      metalness: 0.25,
      roughness: 0.5,
    });
    const watchCase = new THREE.Mesh(caseGeometry, caseMaterial);
    watchCase.position.set(-0.09, 0.16, 0.045);
    this.rig.add(watchCase);
    this.geometries.push(caseGeometry);
    this.materials.push(caseMaterial);

    const screenGeometry = new THREE.PlaneGeometry(0.34, 0.23);
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(-0.09, 0.16, 0.074);
    screen.renderOrder = 3;
    this.rig.add(screen);
    this.geometries.push(screenGeometry);
    this.materials.push(screenMaterial);

    this.camera.add(this.rig);
    window.addEventListener('keydown', this.onKeyDown);
  }

  close() {
    this.targetOpen = false;
  }

  update(dt: number, state: Readonly<DiveState>) {
    this.progress = THREE.MathUtils.damp(
      this.progress,
      this.targetOpen ? 1 : 0,
      8,
      dt,
    );
    const easedProgress =
      this.progress * this.progress * (3 - 2 * this.progress);
    this.rig.position.lerpVectors(
      this.hiddenPosition,
      this.visiblePosition,
      easedProgress,
    );
    this.rig.visible = this.progress > 0.001;
    this.drawIfChanged(state);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.camera.remove(this.rig);
    this.screenTexture.dispose();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.rig.clear();
  }

  private drawIfChanged(state: Readonly<DiveState>) {
    const tankPressureBar = Math.max(
      0,
      (state.tankPressurePa - state.ambientPressurePa) / 100_000,
    );
    const heading = Math.round(
      ((state.headingDegrees % 360) + 360) % 360,
    ) % 360;
    const totalSeconds = Math.floor(Math.max(0, state.diveTimeSeconds));
    const diveTime =
      `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:` +
      `${String(totalSeconds % 60).padStart(2, '0')}`;
    const buoyancy = getBuoyancyStatus(state.buoyancyForceNewtons);
    const displayKey = [
      state.depthMeters.toFixed(1),
      tankPressureBar.toFixed(1),
      heading,
      diveTime,
      buoyancy,
    ].join('|');

    if (displayKey === this.lastDisplayKey) {
      return;
    }
    this.lastDisplayKey = displayKey;

    const context = this.context;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = '#061a23';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = '#7ce5f4';
    context.font = '600 23px system-ui, sans-serif';
    context.fillText('VIRTUAL DIVE', 28, 38);
    context.fillStyle = '#24505c';
    context.fillRect(28, 53, CANVAS_WIDTH - 56, 2);

    context.fillStyle = '#a4cbd3';
    context.font = '500 16px system-ui, sans-serif';
    context.fillText('DEPTH', 30, 91);
    context.fillText('TANK PRESSURE', 288, 91);

    context.fillStyle = '#f1fbfc';
    context.font = '600 54px system-ui, sans-serif';
    context.fillText(state.depthMeters.toFixed(1), 28, 151);
    context.font = '500 20px system-ui, sans-serif';
    context.fillText('m', 162, 151);
    context.font = '600 29px system-ui, sans-serif';
    context.fillText(`${tankPressureBar.toFixed(1)} bar`, 288, 145);

    context.fillStyle = '#a4cbd3';
    context.font = '500 16px system-ui, sans-serif';
    context.fillText('HEADING', 30, 204);
    context.fillText('DIVE TIME', 288, 204);
    context.fillStyle = '#f1fbfc';
    context.font = '600 29px system-ui, sans-serif';
    context.fillText(`${String(heading).padStart(3, '0')}°`, 28, 245);
    context.fillText(diveTime, 286, 245);

    context.fillStyle = '#24505c';
    context.fillRect(28, 266, CANVAS_WIDTH - 56, 2);
    context.fillStyle =
      buoyancy === 'POSITIVE'
        ? '#a9f0cf'
        : buoyancy === 'NEGATIVE'
          ? '#ffd39a'
          : '#ccebf0';
    context.font = '600 18px system-ui, sans-serif';
    context.fillText(`BUOYANCY  ${buoyancy}`, 28, 298);
    this.screenTexture.needsUpdate = true;
  }
}
