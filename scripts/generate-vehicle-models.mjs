// Generator for the 3 procedural low-poly vehicle models (bus, semi, tanker) that Kenney's CC0 Car
// Kit (public/models/vehicles/{sedan,van,truck,truck-flat}.glb) has no equivalent for. Built from
// primitives (boxes + cylinders) in the same flat-shaded, toy-block look, with no textures — each
// part is a solid-color PBR material (metallic 0, roughness ~0.75) so it reads the same "painted
// plastic" way the Kenney kit does. See decisions.md 2026-10-02 "3D vehicle models" for why these
// 3 kinds needed a procedural model instead of a sourced CC0 one (no CC0 bus/semi/tanker pack was
// found; a CC-BY alternative was rejected to keep the asset set attribution-free).
//
// Model-space convention (matches how ConvoyAI's map code orients these): +X = right, +Y = up,
// +Z = FORWARD (the direction the vehicle drives). Origin sits on the ground under the vehicle's
// centre so it can be placed directly at a lon/lat with no vertical offset.
//
// Regenerate with: node scripts/generate-vehicle-models.mjs
import { Document, NodeIO } from '@gltf-transform/core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'vehicles');

function boxGeometry(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];

  faces.forEach(f => {
    const base = positions.length / 3;

    f.v.forEach(([x, y, z]) => {
      positions.push(cx + x * hx, cy + y * hy, cz + z * hz);
      normals.push(...f.n);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return { positions, normals, indices };
}

/** A cylinder whose axis runs along Z (forward), centred at (cx,cy,cz), radius r, length len. */
function cylinderGeometryZ(cx, cy, cz, r, len, segments = 16) {
  const positions = [];
  const normals = [];
  const indices = [];
  const hz = len / 2;
  const ring = [];

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;

    ring.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % segments];
    const base = positions.length / 3;

    positions.push(cx + x0 * r, cy + y0 * r, cz - hz);
    normals.push(x0, y0, 0);
    positions.push(cx + x1 * r, cy + y1 * r, cz - hz);
    normals.push(x1, y1, 0);
    positions.push(cx + x1 * r, cy + y1 * r, cz + hz);
    normals.push(x1, y1, 0);
    positions.push(cx + x0 * r, cy + y0 * r, cz + hz);
    normals.push(x0, y0, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  [-1, 1].forEach(dir => {
    const base = positions.length / 3;

    positions.push(cx, cy, cz + dir * hz);
    normals.push(0, 0, dir);
    ring.forEach(([x, y]) => {
      positions.push(cx + x * r, cy + y * r, cz + dir * hz);
      normals.push(0, 0, dir);
    });
    for (let i = 0; i < segments; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % segments);

      if (dir > 0) indices.push(base, a, b);
      else indices.push(base, b, a);
    }
  });

  return { positions, normals, indices };
}

/** A cylinder whose axis runs along X (used for wheel axles), centred at (cx,cy,cz). */
function cylinderGeometryX(cx, cy, cz, r, len, segments = 10) {
  const g = cylinderGeometryZ(0, 0, 0, r, len, segments);
  const positions = [];
  const normals = [];

  for (let i = 0; i < g.positions.length; i += 3) {
    const [x, y, z] = [g.positions[i], g.positions[i + 1], g.positions[i + 2]];

    // Swap Z (axis) <-> X (axis) to re-point the cylinder's axis from Z to X.
    positions.push(cx + z, cy + y, cz + x);
    const [nx, ny, nz] = [g.normals[i], g.normals[i + 1], g.normals[i + 2]];

    normals.push(nz, ny, nx);
  }

  return { positions, normals, indices: g.indices };
}

function wheelPairs(axleX, zPositions, radius, width, groundY) {
  const parts = [];

  zPositions.forEach(z => {
    [-1, 1].forEach(side => {
      parts.push({
        geo: cylinderGeometryX(side * (axleX + width / 2), groundY, z, radius, width, 10),
        mat: 'tyre',
      });
    });
  });

  return parts;
}

/** Quaternion [x,y,z,w] for +120° about the (1,1,1) diagonal — see the long comment at its one call site below. */
const AXIS_FIX = [0.5, 0.5, 0.5, 0.5];

const PALETTE = {
  body: 0xd8d3c8,
  'body-dark': 0x6b6f72,
  glass: 0x9fd0e6,
  tyre: 0x232323,
  light: 0xffd977,
  grille: 0x3a3d40,
};

/** A small pair of headlight blocks + a grille strip + two door mirrors, at the front face (cz) of a cab. */
function frontDetails(cabW, cabH, groundY, frontZ, cabBaseY) {
  const lampW = 0.34, lampH = 0.22, lampY = cabBaseY + cabH * 0.42;

  return [
    { geo: boxGeometry(-(cabW / 2 - 0.3), lampY, frontZ + 0.03, lampW, lampH, 0.06), mat: 'light' },
    { geo: boxGeometry(cabW / 2 - 0.3, lampY, frontZ + 0.03, lampW, lampH, 0.06), mat: 'light' },
    { geo: boxGeometry(0, cabBaseY + cabH * 0.2, frontZ + 0.03, cabW - 0.5, 0.26, 0.05), mat: 'grille' },
    { geo: boxGeometry(-(cabW / 2 + 0.12), cabBaseY + cabH * 0.66, frontZ - 0.25, 0.16, 0.2, 0.3), mat: 'body-dark' },
    { geo: boxGeometry(cabW / 2 + 0.12, cabBaseY + cabH * 0.66, frontZ - 0.25, 0.16, 0.2, 0.3), mat: 'body-dark' },
  ];
}

function buildDoc(name, parts) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mats = {};

  Object.entries(PALETTE).forEach(([key, hex]) => {
    const m = doc.createMaterial(key);
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;

    m.setBaseColorFactor([r, g, b, 1]);
    m.setMetallicFactor(0);
    m.setRoughnessFactor(key === 'glass' ? 0.25 : key === 'tyre' ? 0.9 : 0.75);
    mats[key] = m;
  });

  const mesh = doc.createMesh(name);

  parts.forEach(({ geo, mat }) => {
    const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.positions));
    const normal = doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.normals));
    const index = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(geo.indices));

    [position, normal, index].forEach(a => a.setBuffer(buffer));

    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(index)
      .setMaterial(mats[mat]);

    mesh.addPrimitive(prim);
  });

  // Geometry above is authored +Y up / +Z forward (the usual glTF convention, and the one this app's map code
  // reads back when deriving "which way is the hood pointing" from the file). deck.gl's ScenegraphLayer Euler
  // orientation, however, treats +Z as up and +X as forward (verified against its matrix.js source — "pitch"
  // rotates around Y and "roll" around X, which only makes sense if up=Z and forward=X). AXIS_FIX is the
  // corrective rotation (+120° about the (1,1,1) diagonal, i.e. old-Z→new-X, old-Y→new-Z, old-X→new-Y) that
  // Vehicle3DOverlay.ts relies on every model here already carrying, so the per-vehicle heading stays a plain
  // yaw and never needs a per-kind special case.
  const node = doc.createNode(name).setMesh(mesh).setRotation(AXIS_FIX);

  doc.createScene(name).addChild(node);

  return doc;
}

const wheelY = 0.5;

// --- BUS: one long boxy body on 2 axles, dark window band, a windscreen at each end. ---
const bus = buildDoc('bus', (() => {
  const bodyLen = 7.2, bodyW = 2.3, bodyH = 2.4;

  return [
    { geo: boxGeometry(0, wheelY + bodyH / 2, 0, bodyW, bodyH, bodyLen), mat: 'body' },
    { geo: boxGeometry(0, wheelY + bodyH - 0.18, 0, bodyW + 0.02, 0.5, bodyLen - 0.3), mat: 'body-dark' },
    { geo: boxGeometry(0, wheelY + bodyH * 0.58, bodyLen / 2 - 0.02, bodyW - 0.1, 1.0, 0.05), mat: 'glass' },
    { geo: boxGeometry(0, wheelY + bodyH * 0.58, -bodyLen / 2 + 0.02, bodyW - 0.1, 1.0, 0.05), mat: 'glass' },
    ...wheelPairs(bodyW / 2, [-bodyLen * 0.3, bodyLen * 0.3], 0.42, 0.3, wheelY - 0.42 + 0.45),
    ...frontDetails(bodyW, bodyH, wheelY, bodyLen / 2, wheelY),
  ];
})());

// --- SEMI: a short tall cab up front, a gap, then a long low box trailer (articulated read). ---
function cabAndTrailer({ trailerLen, trailerGeo }) {
  const cabW = 2.2, cabH = 2.3, cabLen = 1.9;
  const cabZ = trailerLen / 2 + 0.35 + cabLen / 2;

  return {
    cabZ,
    parts: [
      { geo: boxGeometry(0, wheelY + cabH / 2, cabZ, cabW, cabH, cabLen), mat: 'body' },
      { geo: boxGeometry(0, wheelY + cabH * 0.62, cabZ + cabLen / 2 - 0.02, cabW - 0.1, 0.9, 0.05), mat: 'glass' },
      { geo: boxGeometry(0, wheelY + 0.25, cabZ - cabLen / 2 - 0.3, cabW * 0.7, 0.5, 0.6), mat: 'body-dark' },
      trailerGeo,
      ...wheelPairs(cabW / 2, [cabZ], 0.4, 0.28, wheelY - 0.4 + 0.45),
      ...wheelPairs(1.15, [-trailerLen * 0.28, trailerLen * 0.05], 0.4, 0.28, wheelY - 0.4 + 0.45),
      ...frontDetails(cabW, cabH, wheelY, cabZ + cabLen / 2, wheelY),
    ],
  };
}

const semiBuild = cabAndTrailer({
  trailerLen: 6.4,
  trailerGeo: { geo: boxGeometry(0, wheelY + 2.2 / 2, 0, 2.3, 2.2, 6.4), mat: 'body-dark' },
});
const semi = buildDoc('semi', semiBuild.parts);

const tankLen = 6.0, tankR = 1.15;
const tankerBuild = cabAndTrailer({
  trailerLen: tankLen,
  trailerGeo: { geo: cylinderGeometryZ(0, wheelY + tankR + 0.35, 0, tankR, tankLen, 16), mat: 'body' },
});
// Add a dark belly rail under the tank for a riveted-tanker read.
tankerBuild.parts.push({
  geo: boxGeometry(0, wheelY + 0.1, 0, tankR * 1.7, 0.3, tankLen - 0.4),
  mat: 'body-dark',
});
const tanker = buildDoc('tanker', tankerBuild.parts);

const io = new NodeIO();

await io.write(path.join(outDir, 'bus.glb'), bus);
await io.write(path.join(outDir, 'semi.glb'), semi);
await io.write(path.join(outDir, 'tanker.glb'), tanker);
console.log('wrote bus.glb, semi.glb, tanker.glb to', outDir);
