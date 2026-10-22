// On phones/tablets: left thumb moves, right side looks around, buttons for jump and talk.
export class Touch {
  constructor(game) {
    this.g = game;
    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!this.enabled) return;
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.className = 'touch-ui';
    root.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <button class="tbtn jump" aria-label="Jump">Jump</button>
      <button class="tbtn talk" aria-label="Talk">Talk</button>
      <button class="tbtn use" aria-label="Use">Use</button>`;
    document.body.appendChild(root);
    this.root = root;
    const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
    let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
    const inp = game.input;
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy), max = 46;
          if (d > max) { dx = dx / d * max; dy = dy / d * max; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          inp.touchMove.x = dx / max; inp.touchMove.y = -dy / max;
        } else if (t.identifier === lid) {
          inp.dx += (t.clientX - lx) * 1.6; inp.dy += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) { sid = null; knob.style.transform = ''; inp.touchMove.x = 0; inp.touchMove.y = 0; }
        if (t.identifier === lid) lid = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    game.canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (t.clientX > innerWidth * 0.35) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: true });
    const jump = root.querySelector('.jump');
    jump.addEventListener('touchstart', (e) => { inp.touchJump = true; e.preventDefault(); }, { passive: false });
    jump.addEventListener('touchend', () => { inp.touchJump = false; });
    root.querySelector('.talk').addEventListener('click', () => game.ui.openChat());
    this.useBtn = root.querySelector('.use');
    this.useBtn.addEventListener('click', () => game.interact?.press());
  }
  update() {
    if (!this.enabled) return;
    this.root.style.display = this.g.mode === 'play' && !this.g.photoMode ? '' : 'none';
    const t = this.g.interact?.target;
    this.useBtn.style.display = t && t.key ? '' : 'none';
    // the button says the verb ("Talk", "Sit", "Fish"); the full text shows above it
    const verb = !t ? '' : t.kind === 'buddy' ? this.g.state.buddy.name : t.label.split(' ')[0].replace(/[^\w']/g, '');
    if (t && this.useBtn.textContent !== verb) this.useBtn.textContent = verb;
  }
}
