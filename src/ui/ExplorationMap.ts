import { CAVE_LOCATIONS } from '../environment/Caves.js';
import type { Terrain } from '../environment/Terrain.js';
import type { DiveState } from '../player/DiveState.js';
import { SHIPWRECK_POSITION } from '../environment/Shipwreck.js';

const MAP_SIZE_METERS = 300;
const MAP_CANVAS_SIZE = 360;
const MAP_PADDING = 24;
const MAP_DRAW_SIZE = MAP_CANVAS_SIZE - MAP_PADDING * 2;
const TERRAIN_SAMPLE_SIZE = 64;

const REGIONS = [
  {
    x: 0,
    z: 10,
    radiusX: 24,
    radiusZ: 24,
    color: 'rgb(67 225 203 / 24%)',
    markerColor: '#62e6d3',
  },
  {
    x: -30,
    z: 15,
    radiusX: 13,
    radiusZ: 13,
    color: 'rgb(242 154 126 / 32%)',
    markerColor: '#f2a58c',
  },
  {
    x: 30,
    z: 14,
    radiusX: 13,
    radiusZ: 13,
    color: 'rgb(242 154 126 / 32%)',
    markerColor: '#f2a58c',
  },
  {
    x: 0,
    z: -35,
    radiusX: 13,
    radiusZ: 13,
    color: 'rgb(242 154 126 / 32%)',
    markerColor: '#f2a58c',
  },
  {
    x: 38,
    z: 62,
    radiusX: 10,
    radiusZ: 48,
    color: 'rgb(119 167 237 / 22%)',
    markerColor: '#8bb7ff',
  },
  {
    x: SHIPWRECK_POSITION.x,
    z: SHIPWRECK_POSITION.z,
    radiusX: 4,
    radiusZ: 4,
    color: 'rgb(218 150 89 / 30%)',
    markerColor: '#d99c57',
  },
  ...CAVE_LOCATIONS.map(({ x, z }) => ({
    x,
    z,
    radiusX: 6,
    radiusZ: 6,
    color: 'rgb(211 197 159 / 22%)',
    markerColor: '#d3c59f',
  })),
];

function getElement<T extends HTMLElement>(
  id: string,
  elementType: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) {
    throw new Error(`Required exploration map element "#${id}" was not found or has the wrong type.`);
  }
  return element;
}

function getTerrainColor(height: number): [number, number, number] {
  if (height > -18) return [76, 139, 113];
  if (height > -27) return [76, 120, 99];
  if (height > -36) return [68, 105, 89];
  if (height > -45) return [54, 83, 78];
  return [36, 61, 70];
}

export class ExplorationMap {
  private readonly panel = getElement('exploration-map', HTMLElement);
  private readonly canvas = getElement(
    'exploration-map-canvas',
    HTMLCanvasElement,
  );
  private readonly context: CanvasRenderingContext2D;
  private readonly terrainCanvas = document.createElement('canvas');
  private readonly terrainContext: CanvasRenderingContext2D;
  private visible = false;
  private lastDrawKey = '';

  constructor(terrain: Terrain) {
    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create the exploration map canvas context.');
    }
    this.context = context;

    this.terrainCanvas.width = TERRAIN_SAMPLE_SIZE;
    this.terrainCanvas.height = TERRAIN_SAMPLE_SIZE;
    const terrainContext = this.terrainCanvas.getContext('2d');
    if (!terrainContext) {
      throw new Error('Could not create the terrain map canvas context.');
    }
    this.terrainContext = terrainContext;
    this.drawTerrain(terrain);

    this.panel.hidden = true;
    this.panel.setAttribute('aria-hidden', 'true');
    window.addEventListener('keydown', this.onKeyDown);
  }

  update(state: Readonly<DiveState>) {
    if (!this.visible) {
      return;
    }

    const drawKey = [
      state.positionX.toFixed(1),
      state.positionZ.toFixed(1),
      state.headingDegrees.toFixed(0),
    ].join('|');
    if (drawKey === this.lastDrawKey) {
      return;
    }
    this.lastDrawKey = drawKey;

    const context = this.context;
    context.clearRect(0, 0, MAP_CANVAS_SIZE, MAP_CANVAS_SIZE);
    context.fillStyle = '#071e28';
    context.fillRect(0, 0, MAP_CANVAS_SIZE, MAP_CANVAS_SIZE);
    context.drawImage(
      this.terrainCanvas,
      MAP_PADDING,
      MAP_PADDING,
      MAP_DRAW_SIZE,
      MAP_DRAW_SIZE,
    );

    context.save();
    context.beginPath();
    context.rect(
      MAP_PADDING,
      MAP_PADDING,
      MAP_DRAW_SIZE,
      MAP_DRAW_SIZE,
    );
    context.clip();
    this.drawGrid();
    this.drawRegions();
    this.drawDiver(state.positionX, state.positionZ, state.headingDegrees);
    context.restore();

    context.strokeStyle = 'rgb(204 238 244 / 72%)';
    context.lineWidth = 2;
    context.strokeRect(
      MAP_PADDING,
      MAP_PADDING,
      MAP_DRAW_SIZE,
      MAP_DRAW_SIZE,
    );
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private toggle = () => {
    this.visible = !this.visible;
    this.panel.hidden = !this.visible;
    this.panel.setAttribute('aria-hidden', String(!this.visible));
    this.lastDrawKey = '';
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      event.code !== 'KeyM'
      || event.repeat
      || event.isComposing
      || event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    event.preventDefault();
    this.toggle();
  };

  private drawTerrain(terrain: Terrain) {
    const image = this.terrainContext.createImageData(
      TERRAIN_SAMPLE_SIZE,
      TERRAIN_SAMPLE_SIZE,
    );
    for (let y = 0; y < TERRAIN_SAMPLE_SIZE; y++) {
      for (let x = 0; x < TERRAIN_SAMPLE_SIZE; x++) {
        const worldX = (x / (TERRAIN_SAMPLE_SIZE - 1) - 0.5) * MAP_SIZE_METERS;
        const worldZ = (y / (TERRAIN_SAMPLE_SIZE - 1) - 0.5) * MAP_SIZE_METERS;
        const [red, green, blue] = getTerrainColor(
          terrain.getHeight(worldX, worldZ),
        );
        const offset = (y * TERRAIN_SAMPLE_SIZE + x) * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 255;
      }
    }
    this.terrainContext.putImageData(image, 0, 0);
  }

  private drawGrid() {
    const context = this.context;
    context.strokeStyle = 'rgb(224 242 245 / 22%)';
    context.lineWidth = 1;
    for (let offset = 1; offset < 6; offset++) {
      const position = MAP_PADDING + (MAP_DRAW_SIZE * offset) / 6;
      context.beginPath();
      context.moveTo(position, MAP_PADDING);
      context.lineTo(position, MAP_PADDING + MAP_DRAW_SIZE);
      context.moveTo(MAP_PADDING, position);
      context.lineTo(MAP_PADDING + MAP_DRAW_SIZE, position);
      context.stroke();
    }
  }

  private drawRegions() {
    const context = this.context;
    for (const region of REGIONS) {
      const { x, y } = this.worldToMap(region.x, region.z);
      const radiusX = (region.radiusX / MAP_SIZE_METERS) * MAP_DRAW_SIZE;
      const radiusZ = (region.radiusZ / MAP_SIZE_METERS) * MAP_DRAW_SIZE;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusZ, 0, 0, Math.PI * 2);
      context.fillStyle = region.color;
      context.fill();
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fillStyle = region.markerColor;
      context.fill();
    }
  }

  private drawDiver(x: number, z: number, headingDegrees: number) {
    const context = this.context;
    const position = this.worldToMap(x, z);
    context.save();
    context.translate(position.x, position.y);
    context.rotate(headingDegrees * Math.PI / 180);
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(6, 7);
    context.lineTo(0, 4);
    context.lineTo(-6, 7);
    context.closePath();
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#07313a';
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    context.restore();
  }

  private worldToMap(x: number, z: number): { x: number; y: number } {
    return {
      x: MAP_PADDING + ((x + MAP_SIZE_METERS / 2) / MAP_SIZE_METERS) * MAP_DRAW_SIZE,
      y: MAP_PADDING + ((z + MAP_SIZE_METERS / 2) / MAP_SIZE_METERS) * MAP_DRAW_SIZE,
    };
  }
}
