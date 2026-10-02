// Applies the same deck.gl axis correction that generate-vehicle-models.mjs bakes into the procedural models
// (bus/semi/tanker) to the 4 Kenney-sourced ones (sedan/van/truck/truck-flat), which are authored +Y up / +Z
// forward like any normal glTF file and need the same +120° (1,1,1)-diagonal rotation before deck.gl's
// ScenegraphLayer (which treats +Z as up, +X as forward) will stand and orient them correctly. See
// Vehicle3DOverlay.ts and generate-vehicle-models.mjs for the full explanation.
//
// Run once after re-downloading a fresh copy of the Kenney files (they ship unrotated):
//   node scripts/fix-vehicle-model-axes.mjs
import { NodeIO } from '@gltf-transform/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AXIS_FIX = [0.5, 0.5, 0.5, 0.5];
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'vehicles');
const io = new NodeIO();

for (const name of ['sedan', 'van', 'truck', 'truck-flat']) {
  const file = path.join(dir, `${name}.glb`);
  const doc = await io.read(file);
  const scene = doc.getRoot().listScenes()[0];
  const children = scene.listChildren();

  if (children.length && children[0].getName() === 'axis-fix') {
    console.log(name, 'already fixed, skipping');
    continue;
  }

  const wrapper = doc.createNode('axis-fix').setRotation(AXIS_FIX);

  children.forEach(child => wrapper.addChild(child));
  scene.addChild(wrapper);
  await io.write(file, doc);
  console.log('fixed', name);
}
