// Keyboard + mouse. Click the world to capture the mouse (Esc releases it),
// or just drag with the mouse to look around without capturing.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.dragging = false;
    this.handlers = { click: [], key: [], wheel: [] };
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.touchMove = { x: 0, y: 0 };
    this.touchJump = false;

    const typing = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      this.handlers.key.forEach((f) => f(e));
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    let start = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      start = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      if (this.locked) this.handlers.click.forEach((f) => f(e.button, e));
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; return; }
      if (start && e.buttons) {
        const mx = e.movementX, my = e.movementY;
        start.moved += Math.abs(mx) + Math.abs(my);
        if (start.moved > 4) { this.dragging = true; this.dx += mx; this.dy += my; }
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (start && !this.locked && start.moved <= 4 && e.target === canvas) {
        this.handlers.click.forEach((f) => f(start.button, e, true));
      }
      start = null;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.handlers.wheel.forEach((f) => f(Math.sign(e.deltaY))); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch (_) { /* some browsers refuse; drag-look still works */ }
  }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  on(type, fn) { this.handlers[type].push(fn); }
  down(code) { return this.enabled && this.keys.has(code); }

  consumeLook() {
    const r = { dx: this.dx * this.sensitivity, dy: this.dy * this.sensitivity * (this.invertY ? -1 : 1) };
    this.dx = 0; this.dy = 0;
    return r;
  }

  axis() {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.touchMove.x; z += this.touchMove.y;
    return { x, z };
  }
}
