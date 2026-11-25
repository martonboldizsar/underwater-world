# Underwater World

**Where to play:** Run the game locally and open `http://localhost:5173` in a desktop browser. Or try it on `https://underwater-world.onrender.com/`.

**How to start:** Click **Click to start** to begin and enable mouse look. Use the controls below to explore; press **Esc** to release the mouse, then click to resume.

Underwater World is a browser-based 3D exploration game built with TypeScript, Vite, and Three.js.

## Features

- An underwater world with varied terrain, reefs, caves, coral, seagrass, and a shipwreck.
- Marine life including schools of fish, clownfish, manta rays, sea turtles, reef sharks, jellyfish, octopuses, seahorses, moray eels, crabs, and sea stars.
- Diver movement with momentum, buoyancy controls, collisions, and a virtual breathing system.
- A dive HUD and wrist computer showing depth, tank pressure, heading, dive time, and buoyancy.
- An exploration map with terrain and location markers.
- Ambient effects including bubbles, plankton, caustics, and light shafts.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Swim |
| Mouse | Look |
| `Space` / `Ctrl` | Ascend / descend |
| `Shift` | Swim faster |
| `F` | Toggle flashlight |
| `B` | Toggle wrist computer |
| `Q` / `E` | Deflate / inflate buoyancy device |
| `M` | Toggle exploration map |
| `Esc` | Release mouse controls |

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (by default, `http://localhost:5173`).

To create and preview a production build:

```sh
npm run build
npm run preview
```
