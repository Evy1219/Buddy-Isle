import { BLOCKS, B } from '../world/blocks.js';
import { SEA } from '../world/terrain.js';

const TYPE_COLORS = {
  campfire: '#ff8a2a', cottage: '#ffd27a', tower: '#c9ccd2', garden: '#9be36d', grove: '#4fbf62', pond: '#5fb4ff',
  well: '#9fb0c4', statue: '#f4f1ea', gallery: '#ff9ed2', windmill: '#f2e3c4', lighthouse: '#ff6b6b', pier: '#d9b07a',
  mosaic: '#c98cff', flowerfield: '#ffb3d9', restspot: '#e6c08a', greenhouse: '#a8f0e0', arch: '#d8d8e8', treehouse: '#8bd17c', islet: '#fff3b0',
  fountain: '#9fd8ff', ferris: '#ff9ad5', balloon: '#ffb070', gazebo: '#e0c890', observatory: '#7f9fff', sapling: '#6fd06f',
};
export const typeColor = (t) => TYPE_COLORS[t] || '#ffffff';

// Top-down picture of the island
export function renderTerrain(world) {
  const S = world.size;
  const img = new ImageData(S, S);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const y = world.top(x, z);
    let id = world.get(x, y, z);
    let def = BLOCKS[id];
    let hex = def.shape === 'cube' ? def.top : (def.boxes ? def.boxes[def.boxes.length - 1].c : 0x777777);
    if (id === B.WATER) hex = 0x3b8fd0;
    let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const shade = 0.75 + Math.min(0.45, (y - SEA) * 0.02);
    r *= shade; g *= shade; b *= shade;
    if (y <= SEA) {
      const depth = Math.min(1, (SEA + 1 - y) / 8);
      r = r * (1 - depth) * 0.4 + 30 * (0.6 + depth * 0.4);
      g = g * (1 - depth) * 0.4 + 110 * (0.6 + depth * 0.4) - depth * 30;
      b = b * (1 - depth) * 0.4 + 180 * (0.6 + depth * 0.4) - depth * 20;
    }
    // light from the north-west so hills read
    const dh = world.top(x - 1, z - 1) - y;
    const k = dh > 0 ? 0.85 : dh < 0 ? 1.08 : 1;
    const i = (z * S + x) * 4;
    img.data[i] = r * k; img.data[i + 1] = g * k; img.data[i + 2] = b * k; img.data[i + 3] = 255;
  }
  return img;
}

export function drawMap(canvas, game, terrainImg) {
  const S = game.world.size;
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / S;
  const tmp = document.createElement('canvas');
  tmp.width = S; tmp.height = S;
  tmp.getContext('2d').putImageData(terrainImg, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  for (const p of game.state.projects) {
    if (!p.done || p.type === 'path') continue;
    const cx = (p.x0 + p.w / 2) * scale, cz = (p.z0 + p.d / 2) * scale;
    ctx.fillStyle = 'rgba(8, 26, 40, 0.75)';
    ctx.fillRect(cx - 5, cz - 5, 10, 10);
    ctx.fillStyle = typeColor(p.type);
    ctx.fillRect(cx - 3.5, cz - 3.5, 7, 7);
  }
  const b = game.buddyEntity.pos;
  ctx.fillStyle = '#' + game.state.buddy.color.toString(16).padStart(6, '0');
  ctx.strokeStyle = '#0b2235'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(b.x * scale, b.z * scale, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const p = game.player.pos;
  ctx.save();
  ctx.translate(p.x * scale, p.z * scale);
  ctx.rotate(-game.player.yaw);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
