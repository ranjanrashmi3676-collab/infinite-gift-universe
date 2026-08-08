/* ==========================================================================
   INFINITE GIFT UNIVERSE — script.js
   Modular vanilla JS. GSAP used for cinematic tweens where loaded; every
   animation has a CSS/JS fallback so one failed library never breaks flow.
   ========================================================================== */

'use strict';

/* ============================================================
   0. STATE
   ============================================================ */

const State = {
  profile: {
    name: '',
    occasion: 'Birthday',
    relationship: 'Someone Special',
    message: '',
    color: '#EC4899'
  },
  soundOn: true,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  lowPerf: false,
  collected: new Set(),
  secretUnlocked: false,
  infiniteMode: false,
  objectPool: [],
  maxLiveObjects: 16,
  spawnTimer: null,
  activeScreen: 'screen-setup'
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const hasGSAP = typeof window.gsap !== 'undefined';

/* ============================================================
   1. PERFORMANCE DETECTION
   ============================================================ */

function detectLowPerformance() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 380;
  State.lowPerf = cores <= 4 && (mem <= 4 || smallScreen);
}

/* ============================================================
   2. STARFIELD (canvas — cheaper & more reliable on mid-range
      Android than a WebGL/Three.js scene for a passive backdrop)
   ============================================================ */

const StarField = (() => {
  const canvas = $('#starfield');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let shootingStars = [];
  let w, h, dpr;
  let raf = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
  }

  function buildStars() {
    const count = State.lowPerf ? 90 : 220;
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.3,
      baseAlpha: Math.random() * 0.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.4 + 0.15,
      driftY: Math.random() * 0.06 + 0.02
    }));
  }

  function maybeSpawnShootingStar() {
    if (Math.random() < 0.006 && shootingStars.length < 2) {
      const startX = Math.random() * w * 0.6;
      shootingStars.push({
        x: startX, y: Math.random() * h * 0.3,
        vx: 7 + Math.random() * 4, vy: 3 + Math.random() * 2,
        life: 1
      });
    }
  }

  let t = 0;
  function draw() {
    t += 0.016;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.y += s.driftY;
      if (s.y > h) s.y = 0;
      const alpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,243,255,${alpha})`;
      ctx.fill();
    }

    if (!State.reducedMotion) {
      maybeSpawnShootingStar();
      shootingStars.forEach((sh) => {
        sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.02;
        ctx.beginPath();
        const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 6, sh.y - sh.vy * 6);
        grad.addColorStop(0, `rgba(255,255,255,${sh.life})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 6, sh.y - sh.vy * 6);
        ctx.stroke();
      });
      shootingStars = shootingStars.filter((sh) => sh.life > 0 && sh.y < h + 50);
    }

    raf = requestAnimationFrame(draw);
  }

  function start() {
    resize();
    if (raf) cancelAnimationFrame(raf);
    draw();
  }

  window.addEventListener('resize', resize, { passive: true });

  return { start };
})();

/* ============================================================
   3. SOUND ENGINE (Web Audio API — synthesized, no asset files
      needed, never autoplays before user interaction)
   ============================================================ */

const Sound = (() => {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, duration = 0.15, type = 'sine', gain = 0.08, sweepTo = null, delay = 0 }) {
    if (!State.soundOn) return;
    const ac = ensureCtx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    const startAt = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, startAt);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, startAt + duration);
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(gain, startAt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(g).connect(ac.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }

  return {
    click: () => tone({ freq: 520, duration: 0.09, type: 'triangle', gain: 0.06 }),
    open: () => {
      tone({ freq: 220, duration: 0.5, type: 'sawtooth', sweepTo: 660, gain: 0.09 });
      tone({ freq: 110, duration: 0.6, type: 'sine', sweepTo: 55, gain: 0.1, delay: 0.05 });
    },
    sparkle: () => {
      [880, 1108, 1318].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sine', gain: 0.05, delay: i * 0.06 }));
    },
    portal: () => {
      tone({ freq: 90, duration: 1.2, type: 'sawtooth', sweepTo: 340, gain: 0.08 });
    },
    achievement: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.28, type: 'triangle', gain: 0.06, delay: i * 0.09 }));
    },
    ambientStart: () => {
      const ac = ensureCtx();
      if (!ac || !State.soundOn) return null;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 80;
      g.gain.value = 0.015;
      osc.connect(g).connect(ac.destination);
      osc.start();
      return { osc, g };
    }
  };
})();

/* ============================================================
   4. SCREEN MANAGEMENT
   ============================================================ */

function showScreen(id, { instant = false } = {}) {
  const current = $('.screen.active-screen');
  const next = document.getElementById(id);
  if (!next) return;

  State.activeScreen = id;

  if (current && current !== next) {
    if (hasGSAP && !instant && !State.reducedMotion) {
      gsap.to(current, {
        opacity: 0, duration: 0.5, ease: 'power2.inOut',
        onComplete: () => { current.classList.remove('active-screen'); revealNext(next); }
      });
    } else {
      current.classList.remove('active-screen');
      revealNext(next);
    }
  } else {
    revealNext(next);
  }
}

function revealNext(next) {
  next.classList.add('active-screen');
  next.style.opacity = 0;
  if (hasGSAP && !State.reducedMotion) {
    gsap.to(next, { opacity: 1, duration: 0.7, ease: 'power2.out' });
  } else {
    next.style.transition = 'opacity 0.5s ease';
    requestAnimationFrame(() => { next.style.opacity = 1; });
  }
}

/* ============================================================
   5. SETUP / PERSONALIZATION
   ============================================================ */

function initSetup() {
  const swatches = $$('.swatch');
  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      swatches.forEach((b) => b.setAttribute('aria-checked', 'false'));
      btn.setAttribute('aria-checked', 'true');
      State.profile.color = btn.dataset.color;
      Sound.click();
    });
  });

  $('#ai-toggle-btn').addEventListener('click', () => {
    const panel = $('#ai-panel');
    panel.hidden = !panel.hidden;
    Sound.click();
  });

  $('#ai-generate-btn').addEventListener('click', generateAIGift);

  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    State.profile.name = form.name.value.trim() || 'You';
    State.profile.occasion = form.occasion.value;
    State.profile.relationship = form.relationship.value;
    State.profile.message = form.message.value.trim();
    document.documentElement.style.setProperty('--accent', State.profile.color);
    Sound.click();
    startExperience();
  });
}

/* ---- AI Gift Creator ----------------------------------------------------
   Structured so a real API call can be dropped in later: swap
   `localMockGenerate()` for a fetch() to your backend/API and keep the
   same return shape. Never call a real API with a key from the frontend.
--------------------------------------------------------------------------- */

function generateAIGift() {
  const input = $('#ai-input').value.trim();
  const resultBox = $('#ai-result');
  const btn = $('#ai-generate-btn');
  if (!input) {
    resultBox.hidden = false;
    resultBox.textContent = 'Tell me a little about them first — a hobby, a habit, anything true.';
    return;
  }
  btn.textContent = 'Dreaming up their universe…';
  btn.disabled = true;

  // Simulated latency for a believable "AI thinking" beat.
  setTimeout(() => {
    const result = localMockGenerate(input);
    resultBox.hidden = false;
    resultBox.innerHTML = `<strong>Suggested message:</strong> ${result.message}<br><br><strong>Universe mood:</strong> ${result.mood}`;
    $('#f-message').value = result.message;
    btn.textContent = '✨ Generate with AI';
    btn.disabled = false;
    Sound.sparkle();
  }, 900);
}

function localMockGenerate(input) {
  const lower = input.toLowerCase();
  const moods = [];
  if (/ocean|sea|beach|water/.test(lower)) moods.push('tranquil, tidal blues');
  if (/laugh|funny|joke|silly/.test(lower)) moods.push('playful and bright');
  if (/work|job|career|study/.test(lower)) moods.push('proud, golden light');
  if (/love|heart|miss/.test(lower)) moods.push('warm, rose-lit');
  if (!moods.length) moods.push('soft violet stardust');

  const opener = [
    'From everything you told me,',
    'Thinking about the person you described,',
    'Somewhere among the stars, a gift for someone who'
  ][Math.floor(Math.random() * 3)];

  const message = `${opener} this universe was shaped just for them — every star out there is a little proof that they're thought of, today and always.`;

  return { message, mood: moods.join(', ') };
}

/* ============================================================
   6. EXPERIENCE FLOW — intro → gift → open → universe → finale
   ============================================================ */

function startExperience() {
  $('#gift-heading').textContent = `${State.profile.name}'s Infinite Universe`;
  $('#universe-eyebrow').textContent = `${State.profile.name}'s Infinite Universe`;
  showScreen('screen-intro');
  playIntroSequence();
}

function playIntroSequence() {
  const l1 = $('.line-1');
  const l2 = $('.line-2');
  const btn = $('#enter-btn');
  [l1, l2, btn].forEach((el) => { el.style.opacity = 0; });

  if (hasGSAP && !State.reducedMotion) {
    gsap.timeline()
      .fromTo(l1, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' })
      .to(l1, { opacity: 1, duration: 1.4 })
      .to(l1, { opacity: 0, duration: 0.6 })
      .to(l2, { opacity: 1, duration: 1, ease: 'power2.out' })
      .to(l2, { opacity: 1, duration: 1.2 })
      .to(btn, { opacity: 1, duration: 0.8, ease: 'power2.out' });
  } else {
    l1.style.transition = 'opacity 1s ease';
    l2.style.transition = 'opacity 1s ease';
    btn.style.transition = 'opacity 0.8s ease';
    setTimeout(() => { l1.style.opacity = 1; }, 100);
    setTimeout(() => { l1.style.opacity = 0; }, 2400);
    setTimeout(() => { l2.style.opacity = 1; }, 3000);
    setTimeout(() => { btn.style.opacity = 1; }, 4600);
  }
}

$('#enter-btn').addEventListener('click', () => {
  Sound.click();
  showScreen('screen-gift');
});

/* ---- Gift box ---- */

let giftOpened = false;

function initGiftBox() {
  const box = $('#gift-box');
  const openBtn = $('#open-btn');
  const trigger = () => { if (!giftOpened) beginOpenSequence(); };
  box.addEventListener('click', trigger);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } });
  openBtn.addEventListener('click', trigger);
}

function beginOpenSequence() {
  giftOpened = true;
  Sound.click();
  const overlay = $('#countdown-overlay');
  const numberEl = $('#countdown-number');
  overlay.classList.add('show');

  const sequence = ['3', '2', '1', 'OPEN'];
  let i = 0;

  function step() {
    numberEl.textContent = sequence[i];
    numberEl.style.transform = 'scale(0.4)';
    numberEl.style.opacity = 0;
    if (hasGSAP && !State.reducedMotion) {
      gsap.to(numberEl, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
    } else {
      numberEl.style.transition = 'all 0.3s ease';
      requestAnimationFrame(() => { numberEl.style.transform = 'scale(1)'; numberEl.style.opacity = 1; });
    }
    Sound.click();
    i++;
    if (i < sequence.length) {
      setTimeout(step, 650);
    } else {
      setTimeout(finishOpen, 550);
    }
  }
  step();
}

function finishOpen() {
  const overlay = $('#countdown-overlay');
  overlay.classList.remove('show');

  // screen shake
  document.body.style.animation = 'none';
  const stage = $('#screen-gift');
  if (!State.reducedMotion) {
    stage.animate(
      [
        { transform: 'translate(0,0)' }, { transform: 'translate(-6px,4px)' },
        { transform: 'translate(6px,-4px)' }, { transform: 'translate(-4px,-4px)' },
        { transform: 'translate(4px,4px)' }, { transform: 'translate(0,0)' }
      ],
      { duration: 380, iterations: 1 }
    );
  }

  // flash
  const flash = $('#flash-overlay');
  if (hasGSAP && !State.reducedMotion) {
    gsap.timeline()
      .to(flash, { opacity: 1, duration: 0.12 })
      .to(flash, { opacity: 0, duration: 0.55 });
  } else {
    flash.style.transition = 'opacity 0.2s ease';
    flash.style.opacity = 1;
    setTimeout(() => { flash.style.opacity = 0; }, 200);
  }

  Sound.open();
  $('#gift-box').classList.add('opening');
  spawnExplosionParticles();

  setTimeout(() => {
    showScreen('screen-universe');
    initUniverseStage();
  }, 900);
}

function spawnExplosionParticles() {
  const wrap = $('#gift-box-wrap');
  const emojis = ['❤️', '⭐', '🌸', '🎈', '💎', '🎊', '✨'];
  const count = State.lowPerf ? 18 : 34;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    p.style.position = 'absolute';
    p.style.left = '50%';
    p.style.top = '40%';
    p.style.fontSize = (14 + Math.random() * 16) + 'px';
    p.style.pointerEvents = 'none';
    p.style.willChange = 'transform, opacity';
    p.style.zIndex = 5;
    wrap.appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 160;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;

    if (hasGSAP) {
      gsap.to(p, {
        x: dx, y: dy, opacity: 0, rotation: (Math.random() - 0.5) * 240,
        scale: 0.4 + Math.random() * 0.8,
        duration: 1 + Math.random() * 0.6, ease: 'power2.out',
        onComplete: () => p.remove()
      });
    } else {
      p.style.transition = 'transform 1.2s ease-out, opacity 1.2s ease-out';
      requestAnimationFrame(() => {
        p.style.transform = `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 240}deg)`;
        p.style.opacity = 0;
      });
      setTimeout(() => p.remove(), 1300);
    }
  }
}

/* ============================================================
   7. GIFT UNIVERSE — floating interactive objects
   ============================================================ */

const OBJECT_TYPES = [
  { emoji: '❤️', key: 'heart', special: false },
  { emoji: '⭐', key: 'star', special: true },
  { emoji: '🌸', key: 'flower', special: false },
  { emoji: '🧸', key: 'bear', special: true },
  { emoji: '🎈', key: 'balloon', special: false },
  { emoji: '💎', key: 'diamond', special: true },
  { emoji: '🪐', key: 'planet', special: true },
  { emoji: '🎁', key: 'gift', special: false }
];

function messageFor(type) {
  const name = State.profile.name;
  const occasion = State.profile.occasion.toLowerCase();
  const userMsg = State.profile.message;

  const library = {
    heart: [
      `Every heart in this universe carries the same message: you mean the world to someone.`,
      `A little love, floating just for ${name}.`
    ],
    star: [
      `Make a wish, ${name} — this star was placed here just for this ${occasion}.`,
      `Somewhere out there, a star is shining a little brighter today, for you.`
    ],
    flower: [
      `"The universe is not outside of you. Look inside yourself; everything that you want, you already are."`,
      `A flower that never wilts, because some things are meant to last.`
    ],
    bear: [
      `A tiny surprise: somebody out there is smiling just thinking of you right now.`,
      `This little bear is holding onto a secret — you're appreciated more than you know.`
    ],
    balloon: [
      `🎉 Time to celebrate! Let this balloon carry every good wish upward.`,
      `Pop the confetti in your mind — this moment is worth celebrating.`
    ],
    diamond: [
      `Rare, valuable, one of a kind — just like you.`,
      `A premium message, for a premium person: you're irreplaceable.`
    ],
    planet: [
      `🪐 A secret portal hums quietly here — the universe holds more than one surprise.`,
      `This little planet orbits just for you, ${name}.`
    ],
    gift: [
      `🎁 Surprise! ${userMsg ? userMsg : `A whole universe was built just to say happy ${occasion}.`}`,
      `Every gift here was chosen with you in mind.`
    ]
  };

  const arr = library[type] || library.heart;
  return arr[Math.floor(Math.random() * arr.length)];
}

function titleFor(type) {
  const titles = {
    heart: 'A Love Message', star: 'A Special Wish', flower: 'A Beautiful Quote',
    bear: 'A Cute Surprise', balloon: 'Celebration!', diamond: 'A Premium Message',
    planet: 'A Secret Portal', gift: 'A Random Surprise'
  };
  return titles[type] || 'A Surprise';
}

let stageEl, stageRect;

function initUniverseStage() {
  stageEl = $('#universe-stage');
  stageEl.innerHTML = '';
  State.objectPool = [];
  stageRect = stageEl.getBoundingClientRect();

  const initialCount = State.lowPerf ? 9 : 14;
  for (let i = 0; i < initialCount; i++) spawnObject();

  window.addEventListener('resize', () => { stageRect = stageEl.getBoundingClientRect(); }, { passive: true });

  clearInterval(State.spawnTimer);
  State.spawnTimer = setInterval(() => {
    const cap = State.infiniteMode ? State.maxLiveObjects + 6 : State.maxLiveObjects;
    if (State.objectPool.length < cap) spawnObject();
  }, 1400);
}

function spawnObject() {
  if (!stageEl) return;
  const type = OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)];
  const el = document.createElement('div');
  el.className = 'float-obj' + (type.special ? ' special' : '');
  el.textContent = type.emoji;
  el.dataset.type = type.key;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', titleFor(type.key));

  const w = stageRect.width || window.innerWidth;
  const h = stageRect.height || window.innerHeight;
  const x = 20 + Math.random() * (w - 60);
  const y = 90 + Math.random() * (h - 220);

  const obj = {
    el, type: type.key, special: type.special,
    x, y,
    baseX: x, baseY: y,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    phase: Math.random() * Math.PI * 2,
    amp: 14 + Math.random() * 18,
    speed: 0.4 + Math.random() * 0.5,
    dragging: false
  };

  el.style.transform = `translate(${x}px, ${y}px)`;
  stageEl.appendChild(el);
  State.objectPool.push(obj);
  attachObjectInteraction(obj);
}

function removeObject(obj) {
  obj.el.remove();
  State.objectPool = State.objectPool.filter((o) => o !== obj);
}

/* ---- animation loop for floating movement ---- */

let lastFrame = performance.now();
function animateUniverse(now) {
  if (State.activeScreen !== 'screen-universe') { requestAnimationFrame(animateUniverse); return; }
  const dt = Math.min(now - lastFrame, 48);
  lastFrame = now;
  const t = now / 1000;

  for (const obj of State.objectPool) {
    if (obj.dragging) continue;
    obj.x += obj.vx * (dt / 16);
    obj.y += obj.vy * (dt / 16);
    const bob = Math.sin(t * obj.speed + obj.phase) * (obj.amp * 0.02);

    const w = stageRect.width || window.innerWidth;
    const h = stageRect.height || window.innerHeight;
    if (obj.x < 10 || obj.x > w - 40) obj.vx *= -1;
    if (obj.y < 80 || obj.y > h - 130) obj.vy *= -1;
    obj.x = Math.max(10, Math.min(w - 40, obj.x));
    obj.y = Math.max(80, Math.min(h - 130, obj.y));

    obj.el.style.transform = `translate(${obj.x}px, ${obj.y + bob}px)`;
  }
  requestAnimationFrame(animateUniverse);
}
requestAnimationFrame(animateUniverse);

/* ---- touch / drag / tap interaction ---- */

function attachObjectInteraction(obj) {
  const el = obj.el;
  let startX, startY, moved, pointerId;

  function onDown(e) {
    pointerId = e.pointerId;
    el.setPointerCapture?.(pointerId);
    obj.dragging = true;
    moved = false;
    startX = e.clientX; startY = e.clientY;
  }
  function onMove(e) {
    if (!obj.dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    obj.x += dx; obj.y += dy;
    startX = e.clientX; startY = e.clientY;
    el.style.transform = `translate(${obj.x}px, ${obj.y}px) scale(1.15)`;
  }
  function onUp() {
    obj.dragging = false;
    el.style.transform = `translate(${obj.x}px, ${obj.y}px)`;
    if (!moved) openObjectModal(obj);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', () => { obj.dragging = false; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openObjectModal(obj); } });
}

/* ---- modal reveal ---- */

function openObjectModal(obj) {
  Sound.sparkle();
  const modal = $('#object-modal');
  $('#modal-icon').textContent = obj.el.textContent;
  $('#modal-title').textContent = titleFor(obj.type);
  $('#modal-text').textContent = messageFor(obj.type);
  modal.hidden = false;

  if (hasGSAP && !State.reducedMotion) {
    gsap.fromTo('#object-modal .modal-card', { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.6)' });
  }

  if (obj.special && !State.collected.has(obj.type + obj.x + obj.y)) {
    registerCollected(obj);
  }
}

function closeObjectModal() {
  $('#object-modal').hidden = true;
}

$('#modal-close-btn').addEventListener('click', closeObjectModal);
$('#object-modal').addEventListener('click', (e) => { if (e.target.id === 'object-modal') closeObjectModal(); });

/* ============================================================
   8. SECRET GALAXY ACHIEVEMENT SYSTEM
   ============================================================ */

function registerCollected(obj) {
  if (State.secretUnlocked) return;
  const id = `${obj.type}-${State.collected.size}`;
  State.collected.add(id);
  obj.el.classList.add('collected');
  $('#collect-count').textContent = Math.min(State.collected.size, 7);
  showAchievementToast(`✨ Discovered: ${titleFor(obj.type)}`);

  if (State.collected.size >= 7 && !State.secretUnlocked) {
    State.secretUnlocked = true;
    setTimeout(unlockSecretGalaxy, 900);
  }
}

function showAchievementToast(text) {
  const toast = $('#achievement-toast');
  $('#achievement-toast-text').textContent = text;
  toast.hidden = false;
  toast.classList.add('show');
  clearTimeout(showAchievementToast._t);
  showAchievementToast._t = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 500);
  }, 2200);
}

function unlockSecretGalaxy() {
  Sound.achievement();
  const overlay = $('#secret-overlay');
  overlay.hidden = false;
  if (hasGSAP && !State.reducedMotion) {
    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.8 });
  }
  Sound.portal();
}

$('#enter-secret-btn').addEventListener('click', () => {
  Sound.click();
  $('#secret-overlay').hidden = true;
  const relationship = State.profile.relationship.toLowerCase();
  $('#secret-message').textContent =
    `You found every hidden star in ${State.profile.name}'s universe. That kind of patience is rare — a bit like being their ${relationship}. Here's the truth this whole galaxy was hiding: you are deeply, unmistakably appreciated.`;
  showScreen('screen-secret');
});

$('#secret-continue-btn').addEventListener('click', () => {
  Sound.click();
  showScreen('screen-universe');
  activateInfiniteMode();
  revealFinaleButton();
});

$('#achievements-btn').addEventListener('click', () => {
  if (State.secretUnlocked) {
    showAchievementToast('🌌 Secret Universe already unlocked!');
  } else {
    showAchievementToast(`${State.collected.size}/7 special objects found`);
  }
});

/* ============================================================
   9. INFINITE MODE (object pooling / capped growth)
   ============================================================ */

function activateInfiniteMode() {
  if (State.infiniteMode) return;
  State.infiniteMode = true;
  const banner = $('#infinite-mode-banner');
  banner.hidden = false;
  showAchievementToast('∞ Infinite Mode Unlocked');

  // Trim + replenish loop keeps DOM node count bounded forever.
  clearInterval(State.infiniteTrimTimer);
  State.infiniteTrimTimer = setInterval(() => {
    while (State.objectPool.length > State.maxLiveObjects + 6) {
      removeObject(State.objectPool[0]);
    }
  }, 3000);
}

function revealFinaleButton() {
  const btn = $('#finale-btn');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    Sound.click();
    clearInterval(State.spawnTimer);
    clearInterval(State.infiniteTrimTimer);
    showFinale();
  }, { once: true });
}

/* ============================================================
   10. FINALE
   ============================================================ */

function showFinale() {
  $('#finale-name').textContent = State.profile.name;
  $('#finale-message').textContent = State.profile.message
    ? `"${State.profile.message}"`
    : `Happy ${State.profile.occasion}, ${State.profile.name}. This whole universe exists because someone wanted you to feel infinitely loved.`;
  showScreen('screen-finale');
}

$('#restart-btn').addEventListener('click', () => {
  Sound.click();
  resetExperience();
});

function resetExperience() {
  giftOpened = false;
  State.collected.clear();
  State.secretUnlocked = false;
  State.infiniteMode = false;
  clearInterval(State.spawnTimer);
  clearInterval(State.infiniteTrimTimer);
  $('#collect-count').textContent = '0';
  $('#infinite-mode-banner').hidden = true;
  $('#finale-btn').hidden = true;
  $('#gift-box').classList.remove('opening');
  showScreen('screen-setup');
}

/* ============================================================
   11. SHARE SYSTEM
   ============================================================ */

$('#share-btn').addEventListener('click', () => {
  Sound.click();
  const sheet = $('#share-sheet');
  sheet.hidden = false;
  $('#native-share-opt').hidden = !navigator.share;
});

$('#share-close-btn').addEventListener('click', () => { $('#share-sheet').hidden = true; });
$('#share-sheet').addEventListener('click', (e) => { if (e.target.id === 'share-sheet') $('#share-sheet').hidden = true; });

$$('.share-opt').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const url = window.location.href;
    const text = `✨ ${State.profile.name}'s Infinite Gift Universe is waiting for you...`;
    const kind = btn.dataset.share;

    if (kind === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else if (kind === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    } else if (kind === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const fb = $('#copy-feedback');
      fb.hidden = false;
      setTimeout(() => { fb.hidden = true; }, 2000);
    } else if (kind === 'native' && navigator.share) {
      navigator.share({ title: 'Infinite Gift Universe', text, url }).catch(() => {});
    }
  });
});

/* ============================================================
   12. SOUND TOGGLE
   ============================================================ */

$('#sound-btn').addEventListener('click', () => {
  State.soundOn = !State.soundOn;
  $('#sound-btn').textContent = State.soundOn ? '🔊' : '🔇';
  localStorage.setItem('gu_sound', State.soundOn ? '1' : '0');
  if (State.soundOn) Sound.click();
});

/* ============================================================
   13. PWA — INSTALL PROMPT + SERVICE WORKER
   ============================================================ */

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('#install-btn').hidden = false;
});

$('#install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $('#install-btn').hidden = true;
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* PWA is progressive enhancement — silent fail keeps the site working */
      });
    });
  }
}

/* ============================================================
   14. INIT
   ============================================================ */

function restoreSettings() {
  const savedSound = localStorage.getItem('gu_sound');
  if (savedSound !== null) {
    State.soundOn = savedSound === '1';
    $('#sound-btn').textContent = State.soundOn ? '🔊' : '🔇';
  }
  if (State.reducedMotion) {
    $('#reduced-motion-note').textContent = 'Reduced motion mode is active.';
  }
}

function init() {
  detectLowPerformance();
  restoreSettings();
  StarField.start();
  initSetup();
  initGiftBox();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
