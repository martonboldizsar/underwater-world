import * as THREE from 'three';

interface Cloud {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;
}

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create the sky canvas context.');
  }
  return { canvas, context };
}

function createSkyBackground(): THREE.CanvasTexture {
  const { canvas, context } = createCanvas(1024, 512);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#2363a3');
  gradient.addColorStop(0.34, '#5ca9d8');
  gradient.addColorStop(0.49, '#ccecf5');
  gradient.addColorStop(0.53, '#7ab3c5');
  gradient.addColorStop(1, '#155875');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createSunTexture(): THREE.CanvasTexture {
  const { canvas, context } = createCanvas(128, 128);
  const glow = context.createRadialGradient(64, 64, 3, 64, 64, 62);
  glow.addColorStop(0, 'rgba(255, 255, 245, 1)');
  glow.addColorStop(0.12, 'rgba(255, 245, 205, 0.98)');
  glow.addColorStop(0.3, 'rgba(255, 222, 155, 0.38)');
  glow.addColorStop(1, 'rgba(255, 210, 135, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCloudTexture(): THREE.CanvasTexture {
  const { canvas, context } = createCanvas(256, 128);
  const puffs = [
    { x: 54, y: 80, rx: 45, ry: 28 },
    { x: 92, y: 58, rx: 48, ry: 36 },
    { x: 132, y: 66, rx: 52, ry: 32 },
    { x: 176, y: 82, rx: 44, ry: 25 },
    { x: 112, y: 91, rx: 74, ry: 25 },
  ];

  for (const puff of puffs) {
    const gradient = context.createRadialGradient(
      puff.x,
      puff.y,
      0,
      puff.x,
      puff.y,
      puff.rx,
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.68, 'rgba(255, 255, 255, 0.72)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(puff.x, puff.y, puff.rx, puff.ry, 0, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class Sky {
  readonly group = new THREE.Group();
  readonly background = createSkyBackground();
  readonly sunPosition = new THREE.Vector3(35, 120, -100);
  private readonly sunTexture = createSunTexture();
  private readonly cloudTexture = createCloudTexture();
  private readonly sunMaterial: THREE.SpriteMaterial;
  private readonly cloudMaterials: THREE.SpriteMaterial[] = [];
  private readonly clouds: Cloud[] = [];

  constructor() {
    this.group.name = 'sky-objects';

    this.sunMaterial = new THREE.SpriteMaterial({
      map: this.sunTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const sun = new THREE.Sprite(this.sunMaterial);
    sun.position.copy(this.sunPosition);
    sun.scale.set(14, 14, 1);
    this.group.add(sun);

    const cloudLayouts = [
      { x: -75, y: 82, z: -130, width: 48, height: 23, phase: 0.2 },
      { x: -30, y: 104, z: -185, width: 58, height: 27, phase: 1.7 },
      { x: 20, y: 88, z: -120, width: 44, height: 21, phase: 3.1 },
      { x: 72, y: 78, z: -210, width: 64, height: 30, phase: 4.5 },
      { x: 100, y: 132, z: -175, width: 52, height: 25, phase: 5.4 },
    ];

    for (const layout of cloudLayouts) {
      const material = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(layout.x, layout.y, layout.z);
      sprite.scale.set(layout.width, layout.height, 1);
      this.group.add(sprite);
      this.cloudMaterials.push(material);
      this.clouds.push({
        sprite,
        origin: sprite.position.clone(),
        phase: layout.phase,
      });
    }
  }

  update(elapsedTime: number) {
    for (const cloud of this.clouds) {
      const drift = elapsedTime * 0.006 + cloud.phase;
      cloud.sprite.position.x = cloud.origin.x + Math.sin(drift) * 2;
      cloud.sprite.position.z = cloud.origin.z + Math.cos(drift) * 1.5;
    }
  }

  dispose() {
    this.background.dispose();
    this.sunTexture.dispose();
    this.cloudTexture.dispose();
    this.sunMaterial.dispose();
    for (const material of this.cloudMaterials) {
      material.dispose();
    }
    this.group.clear();
  }
}
