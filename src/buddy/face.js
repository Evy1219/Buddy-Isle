import * as THREE from 'three';

// The buddy's face is a tiny screen. Eyes follow whatever it's looking at,
// and the expression changes with its mood.
const W = 160, H = 100;
const EYE = { normal: '#9df3ff', love: '#ff8fb6', excited: '#ffe27a', sleepy: '#7fb7d6', sad: '#8fc0ff' };

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
}
function heart(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.3, y, x - s, y - s, x, y - s * 0.35);
  g.bezierCurveTo(x + s, y - s, x + s * 1.3, y, x, y + s * 0.9); g.fill();
}
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr2 = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  g.closePath(); g.fill();
}

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.expr = 'happy';
    this.look = { x: 0, y: 0 };
    this.blink = 0;
    this.key = '';
    this.t = 0;
    this.talk = 0;
    this.draw();
  }

  set(expr) { this.expr = expr; }

  update(dt, { expr, lookX = 0, lookY = 0, blink = 0, talking = false }) {
    this.t += dt;
    if (expr) this.expr = expr;
    this.look.x += (lookX - this.look.x) * Math.min(1, dt * 8);
    this.look.y += (lookY - this.look.y) * Math.min(1, dt * 8);
    this.blink = blink;
    this.talk = talking ? Math.abs(Math.sin(this.t * 14)) : 0;
    const key = `${this.expr}|${Math.round(this.look.x * 8)}|${Math.round(this.look.y * 6)}|${Math.round(this.blink * 4)}|${Math.round(this.talk * 3)}|${Math.floor(this.t * 3) % 4}`;
    if (key !== this.key) { this.key = key; this.draw(); this.tex.needsUpdate = true; }
  }

  draw() {
    const g = this.g, e = this.expr;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16233a'); bg.addColorStop(1, '#0b1322');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    const col = e === 'love' ? EYE.love : e === 'excited' ? EYE.excited : e === 'sleep' ? EYE.sleepy : e === 'sad' ? EYE.sad : EYE.normal;
    g.fillStyle = col; g.strokeStyle = col;
    g.shadowColor = col; g.shadowBlur = 10;
    const lx = this.look.x * 9, ly = this.look.y * 7;
    const L = 52 + lx, R = 108 + lx, Y = 42 + ly;
    const bl = 1 - this.blink * 0.9;
    g.lineCap = 'round'; g.lineWidth = 7;
    const rect = (x, h) => rr(g, x - 12, Y - h / 2, 24, h, 9);
    const arcEye = (x) => { g.beginPath(); g.arc(x, Y + 6, 12, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); };
    switch (e) {
      case 'love': heart(g, L, Y, 15); heart(g, R, Y, 15); break;
      case 'excited': star(g, L, Y, 16); star(g, R, Y, 16); break;
      case 'happy': if (bl < 0.5) { rect(L, 4); rect(R, 4); } else { arcEye(L); arcEye(R); } break;
      case 'sleep': g.fillRect(L - 12, Y + 2, 24, 5); g.fillRect(R - 12, Y + 2, 24, 5); break;
      case 'focus': rect(L, 12 * bl + 2); rect(R, 12 * bl + 2); g.fillRect(L - 14, Y - 14, 26, 4); g.fillRect(R - 12, Y - 14, 26, 4); break;
      case 'surprised': g.beginPath(); g.arc(L, Y, 15 * bl + 1, 0, Math.PI * 2); g.arc(R, Y, 15 * bl + 1, 0, Math.PI * 2); g.fill(); break;
      case 'sad':
        rect(L, 26 * bl + 2); rect(R, 26 * bl + 2);
        g.fillStyle = '#0f1a2c'; g.save(); g.shadowBlur = 0;
        g.beginPath(); g.moveTo(L - 14, Y - 18); g.lineTo(L + 14, Y - 18); g.lineTo(L - 14, Y - 4); g.fill();
        g.beginPath(); g.moveTo(R + 14, Y - 18); g.lineTo(R - 14, Y - 18); g.lineTo(R + 14, Y - 4); g.fill();
        g.restore(); g.fillStyle = col; break;
      case 'wink': rect(L, 30 * bl + 2); arcEye(R); break;
      case 'think': rect(L + 4, 26 * bl + 2); rect(R + 4, 26 * bl + 2); break;
      default: rect(L, 32 * bl + 2); rect(R, 32 * bl + 2);
    }
    // mouth
    g.lineWidth = 5;
    const my = 76 + ly * 0.5, mx = 80 + lx * 0.6;
    if (this.talk > 0.15) { rr(g, mx - 9, my - 6, 18, 6 + this.talk * 10, 6); }
    else if (e === 'surprised') { g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.stroke(); }
    else if (e === 'sad') { g.beginPath(); g.arc(mx, my + 10, 10, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
    else if (e === 'focus' || e === 'sleep') { g.beginPath(); g.moveTo(mx - 8, my); g.lineTo(mx + 8, my); g.stroke(); }
    else if (e === 'think') { const k = Math.floor(this.t * 3) % 4; for (let i = 0; i < 3; i++) { g.globalAlpha = i < k ? 1 : 0.25; g.beginPath(); g.arc(mx - 10 + i * 10, my, 3, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
    else if (e === 'excited' || e === 'love') { g.beginPath(); g.arc(mx, my - 6, 12, Math.PI * 0.15, Math.PI * 0.85); g.fill(); }
    else { g.beginPath(); g.arc(mx, my - 8, 11, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
    // cheeks
    if (e === 'happy' || e === 'love' || e === 'excited' || e === 'wink') {
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,120,160,0.45)';
      g.beginPath(); g.ellipse(L - 6, Y + 22, 9, 5, 0, 0, Math.PI * 2); g.ellipse(R + 6, Y + 22, 9, 5, 0, 0, Math.PI * 2); g.fill();
    }
    if (e === 'sleep') {
      g.shadowBlur = 0; g.fillStyle = 'rgba(200,220,255,0.8)'; g.font = 'bold 18px sans-serif';
      g.fillText('z', 130, 24 - (Math.floor(this.t * 2) % 2) * 3); g.font = 'bold 12px sans-serif'; g.fillText('z', 144, 14);
    }
    g.shadowBlur = 0;
  }

  // Copy of the face for the HUD
  drawInto(ctx, w, h) { ctx.drawImage(this.canvas, 0, 0, w, h); }
}
