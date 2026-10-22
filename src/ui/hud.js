import { h } from '../core/util.js';
import { renderTerrain, typeColor } from './map.js';

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// The strip at the top that shows which way you're facing, and where your buddy is.
export class Compass {
  constructor(parent) {
    this.el = h('div.compass', { 'aria-hidden': 'true' });
    this.track = h('div.compass-track');
    this.el.append(this.track);
    this.letters = [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['W', -Math.PI / 2], ['', Math.PI * 0.75], ['', Math.PI * 0.25], ['', -Math.PI * 0.25], ['', -Math.PI * 0.75]]
      .map(([t, a]) => { const e = h(`span.cmp-mark${t ? '.cmp-letter' : ''}`, t || ''); this.track.append(e); return { e, a }; });
    this.markers = new Map();
    parent.append(this.el);
  }

  setMarker(id, { color, label, pos, kind }) {
    let m = this.markers.get(id);
    if (!m) {
      const e = h(`div.cmp-pin.k-${kind || 'dot'}`, h('i'), h('span'));
      this.track.append(e);
      m = { e };
      this.markers.set(id, m);
    }
    m.pos = pos; m.color = color; m.label = label;
    m.e.style.setProperty('--c', color);
    m.e.querySelector('span').textContent = label || '';
  }
  removeMarker(id) { const m = this.markers.get(id); if (m) { m.e.remove(); this.markers.delete(id); } }

  update(yaw, from) {
    const hf = yaw + Math.PI; // which way the camera faces
    const place = (e, rel) => {
      const vis = Math.abs(rel) < Math.PI / 2;
      e.style.display = vis ? '' : 'none';
      // angles grow anticlockwise seen from above, so a bigger angle is to your left
      if (vis) e.style.left = `${50 - (rel / (Math.PI / 2)) * 50}%`;
    };
    for (const l of this.letters) place(l.e, wrap(l.a - hf));
    for (const m of this.markers.values()) {
      if (!m.pos) continue;
      const dx = m.pos.x - from.x, dz = m.pos.z - from.z;
      const d = Math.hypot(dx, dz);
      place(m.e, wrap(Math.atan2(dx, dz) - hf));
      m.e.querySelector('span').textContent = m.label ? `${m.label} ${Math.round(d)}m` : `${Math.round(d)}m`;
      m.e.classList.toggle('near', d < 6);
    }
  }
}

// Round map in the corner that turns with you.
export class Minimap {
  constructor(parent) {
    this.canvas = h('canvas.minimap', { width: 280, height: 280, 'aria-label': 'Mini map' });
    parent.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.img = null; this.tmp = null; this.t = 0; this.dirtyT = 0;
  }

  refresh(world) {
    this.img = renderTerrain(world);
    if (!this.tmp) this.tmp = document.createElement('canvas');
    this.tmp.width = world.size; this.tmp.height = world.size;
    this.tmp.getContext('2d').putImageData(this.img, 0, 0);
  }

  draw(game, dt) {
    this.t -= dt;
    this.dirtyT -= dt;
    if (game.ui.mapDirty && this.dirtyT <= 0) { this.refresh(game.world); game.ui.mapDirty = false; this.dirtyT = 3; }
    if (!this.tmp) this.refresh(game.world);
    if (this.t > 0) return;
    this.t = 0.1;
    const c = this.ctx, W = 280, R = 140, zoom = 2.6;
    const p = game.player.pos;
    const fx = -Math.sin(game.player.yaw), fz = -Math.cos(game.player.yaw);
    const rot = -Math.PI / 2 - Math.atan2(fz, fx);
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - 4, 0, TAU); c.clip();
    c.fillStyle = '#123a58'; c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(rot);
    c.scale(zoom, zoom);
    c.translate(-p.x, -p.z);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.tmp, 0, 0);
    // buildings, gifts, buddy
    for (const pr of game.state.projects) {
      if (!pr.done || pr.type === 'path') continue;
      c.fillStyle = typeColor(pr.type);
      c.fillRect(pr.x0 + pr.w / 2 - 1.5, pr.z0 + pr.d / 2 - 1.5, 3, 3);
    }
    for (const pr of game.state.props) if (pr.type === 'gift') { c.fillStyle = '#ff8fb6'; c.beginPath(); c.arc(pr.x + 0.5, pr.z + 0.5, 1.8, 0, TAU); c.fill(); }
    const b = game.buddyEntity.pos;
    c.fillStyle = '#' + game.state.buddy.color.toString(16).padStart(6, '0');
    c.strokeStyle = '#0b2235'; c.lineWidth = 0.6;
    c.beginPath(); c.arc(b.x, b.z, 2.2, 0, TAU); c.fill(); c.stroke();
    c.restore();
    // you
    c.fillStyle = '#ffffff'; c.strokeStyle = '#0b2235'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(R, R - 11); c.lineTo(R + 8, R + 8); c.lineTo(R, R + 4); c.lineTo(R - 8, R + 8); c.closePath(); c.fill(); c.stroke();
    // north marker on the rim
    const na = rot + Math.atan2(-1, 0);
    c.fillStyle = '#ffd27a'; c.font = 'bold 22px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', R + Math.cos(na) * (R - 18), R + Math.sin(na) * (R - 18));
  }
}
