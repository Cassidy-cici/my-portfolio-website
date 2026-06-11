// =============================================
// === SHARED HELPERS ==========================
// =============================================

// 页面加载动效
window.addEventListener('load', () => {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 600);
  }
});

// IntersectionObserver helper: fire callback once when section enters viewport.
function onSectionVisible(sectionId, callback, delay) {
  var started = false;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting && !started) {
        started = true;
        setTimeout(callback, delay != null ? delay : 300);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  observer.observe(document.getElementById(sectionId));
}

// Typewriter primitive: types `text` into `targetEl` char-by-char.
function typeText(targetEl, text, speed, onDone) {
  var i = 0;
  (function step() {
    if (i < text.length) {
      targetEl.textContent += text.charAt(i);
      i++;
      setTimeout(step, speed);
    } else if (onDone) {
      onDone();
    }
  })();
}

// Single-line typewriter bound to a section's visibility.
// Convention: cursor is the element immediately after `targetId`.
function setupTypewriter(sectionId, targetId, text, speed) {
  var target = document.getElementById(targetId);
  var cursor = target.nextElementSibling;
  onSectionVisible(sectionId, function() {
    typeText(target, text, speed, function() {
      if (cursor) cursor.style.display = 'none';
    });
  });
}

// =============================================
// === CARD-ENTER OBSERVER (all sections) ======
// =============================================
(function() {
  var cards = document.querySelectorAll('.card-enter');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('show');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  cards.forEach(function(card) { observer.observe(card); });
})();

// =============================================
// === TYPEWRITERS (Sections 1, 3, 5, 6, 7) ====
// =============================================
setupTypewriter('honor',      'typewriter-text-honor',      '晁芳蒂',                120);
setupTypewriter('experience', 'typewriter-text-experience', '经历',                  120);
setupTypewriter('ticktick',   'typewriter-text-ticktick',   '滴答清单',              120);
setupTypewriter('projects',   'typewriter-text-projects',   'Vibe Coding Projects',  80);
setupTypewriter('contact',    'typewriter-text-contact',    '核心能力',              120);

// =============================================
// === TYPEWRITER (Section 2: About — 2 lines) =
// =============================================
(function() {
  onSectionVisible('about', function() {
    var line1   = document.getElementById('typewriter-line1');
    var line2   = document.getElementById('typewriter-line2');
    var cursor1 = document.getElementById('cursor1');
    var cursor2 = document.getElementById('cursor2');
    var speed   = 80;

    typeText(line1, '二次元与女性向游戏运营，', speed, function() {
      cursor1.style.display = 'none';
      cursor2.style.display = 'inline-block';
      setTimeout(function() {
        typeText(line2, '以情感链接驱动用户付费与增长。', speed, function() {
          cursor2.style.display = 'none';
        });
      }, 200);
    });
  });
})();

// =============================================
// === SECTION 1: GALLERY ======================
// =============================================
(function() {
  var slides   = document.querySelectorAll('.gallery-slide');
  var dots     = document.querySelectorAll('.gallery-dot');
  var counter  = document.querySelector('.gallery-counter');
  var prevBtn  = document.querySelector('.gallery-arrow-prev');
  var nextBtn  = document.querySelector('.gallery-arrow-next');
  var total    = slides.length;
  var current  = 0;

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function goTo(index) {
    if (index < 0 || index >= total) return;
    current = index;
    slides.forEach(function(s, i) { s.classList.toggle('active', i === current); });
    dots.forEach(function(d, i) {
      if (i === current) {
        d.classList.add('bg-[#1C1C1C]/60', 'border-[#1C1C1C]/60');
        d.classList.remove('bg-transparent', 'border-[#1C1C1C]/20');
      } else {
        d.classList.remove('bg-[#1C1C1C]/60', 'border-[#1C1C1C]/60');
        d.classList.add('bg-transparent', 'border-[#1C1C1C]/20');
      }
    });
    counter.textContent = pad(current + 1) + ' / ' + pad(total);
  }

  function prev() { goTo(current === 0 ? total - 1 : current - 1); }
  function next() { goTo(current === total - 1 ? 0 : current + 1); }

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  dots.forEach(function(dot) {
    dot.addEventListener('click', function() {
      goTo(parseInt(dot.getAttribute('data-dot'), 10));
    });
  });

  // Keyboard: only when no input is focused (avoid typing interference)
  document.addEventListener('keydown', function(e) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  });
})();

// =============================================
// === SECTION 3: FAN-DIAL =====================
// =============================================
(function() {
  var wrappers = document.querySelectorAll('.fan-card-wrapper');
  var N        = wrappers.length;
  var active   = 2;

  var arcCenter        = document.getElementById('dialArcCenter');
  var dialPointerWrap  = document.getElementById('dialPointerWrap');
  var dialPrev         = document.getElementById('dialPrev');
  var dialNext         = document.getElementById('dialNext');
  var dialProgressFill = document.getElementById('dialProgressFill');
  var dialProgressDots = document.getElementById('dialProgressDots');

  var dialYears     = ['2019', '2020', '2021', '2025', '2026'];
  var markerAngles  = [-37.5, -18.75, 0, 18.75, 37.5];
  var pointerAngles = [-80, -40, 0, 40, 80];
  var arcStart = -75, arcEnd = 75;

  // Tick marks
  for (var d = arcStart; d <= arcEnd; d += 3) {
    var t = document.createElement('div');
    t.className = 'dial-tick';
    t.style.transform = 'rotate(' + d + 'deg)';
    arcCenter.appendChild(t);
  }

  // Year markers
  var markerEls = [];
  for (var i = 0; i < N; i++) {
    var m = document.createElement('button');
    m.className = 'dial-marker';
    m.style.transform = 'rotate(' + markerAngles[i] + 'deg)';
    m.innerHTML = '<span class="dial-marker-year">' + dialYears[i] + '</span><span class="dial-marker-bar"></span>';
    m.addEventListener('click', (function(idx) { return function() { go(idx); }; })(i));
    arcCenter.appendChild(m);
    markerEls.push(m);
  }

  // Sub markers (between years)
  for (var j = 0; j < N - 1; j++) {
    var mid = (markerAngles[j] + markerAngles[j + 1]) / 2;
    var sm = document.createElement('div');
    sm.className = 'dial-marker';
    sm.style.transform = 'rotate(' + mid + 'deg)';
    sm.style.pointerEvents = 'none';
    sm.innerHTML = '<span class="dial-marker-bar dial-marker-bar--sub"></span>';
    arcCenter.appendChild(sm);
  }

  // Progress dots
  var progressDots = [];
  for (var k = 0; k < N; k++) {
    var pd = document.createElement('div');
    pd.className = 'dial-progress-dot';
    dialProgressDots.appendChild(pd);
    progressDots.push(pd);
  }

  function setPointerAngle(deg) {
    dialPointerWrap.style.transform = 'rotate(' + deg + 'deg)';
  }

  function go(i) {
    if (active === i) return;
    active = i;
    layout();
  }

  function layout() {
    var spreadAngle = 15;
    var xStep = 170;
    wrappers.forEach(function(w, i) {
      var off = i - active;
      var rot = off * spreadAngle;
      var tx  = off * xStep;
      var ty  = Math.abs(off) * 14;
      var s   = i === active ? 1.05 : 0.9;
      w.style.transform = 'translateX(' + tx + 'px) rotate(' + rot + 'deg) translateY(' + ty + 'px) scale(' + s + ')';
      w.style.zIndex = i === active ? 20 : (10 - Math.abs(off));
      w.classList.toggle('active', i === active);
      w.classList.toggle('inactive', i !== active);
    });

    setPointerAngle(pointerAngles[active]);
    markerEls.forEach(function(m, i) { m.classList.toggle('dial-marker--active', i === active); });
    dialProgressFill.style.width = (active / (N - 1) * 100) + '%';
    progressDots.forEach(function(d, i) { d.classList.toggle('active', i === active); });
  }

  dialPrev.addEventListener('click', function() { go(active > 0 ? active - 1 : N - 1); });
  dialNext.addEventListener('click', function() { go(active < N - 1 ? active + 1 : 0); });
  wrappers.forEach(function(w, i) {
    w.addEventListener('click', function() { go(i); });
  });

  layout();
})();

// =============================================
// === SECTION 4: FLIP-BOOK ====================
// =============================================
(function() {
  var pages     = document.querySelectorAll('#flipBook .flip-page');
  var buttonRow = document.getElementById('buttonRow');
  var flipBook  = document.getElementById('flipBook');
  var flipBw    = document.getElementById('flipBw');
  var prevBtn   = document.getElementById('prevBtn');
  var nextBtn   = document.getElementById('nextBtn');
  var flipDots  = document.getElementById('flipDots');
  var flipPN    = document.getElementById('flipPN');

  var N      = pages.length;
  var TOTAL  = N + 1;
  var turned = 0;

  function update() {
    pages.forEach(function(p, i) {
      if (i < turned) {
        p.style.transform = 'rotateY(-180deg)';
        p.style.zIndex    = i + 1;
      } else {
        p.style.transform = 'rotateY(0deg)';
        p.style.zIndex    = N - i;
      }
    });

    var bw = flipBook.getBoundingClientRect().width;
    flipBook.style.transform  = '';
    prevBtn.style.transform   = '';
    nextBtn.style.transform   = '';
    buttonRow.style.transform = '';

    if (turned === 0) {
      // cover: no offset
    } else if (turned >= N) {
      flipBook.style.transform = 'translateX(' + bw + 'px)';
    } else {
      buttonRow.style.transform = 'translateX(' + (bw * 0.5) + 'px)';
      prevBtn.style.transform   = 'translateX(' + (-bw) + 'px)';
    }

    flipDots.querySelectorAll('.flip-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === turned);
    });
    flipPN.textContent = (turned + 1) + ' / ' + TOTAL;
  }

  for (var i = 0; i < TOTAL; i++) {
    var dot = document.createElement('button');
    dot.className = 'flip-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', (function(target) {
      return function() {
        (function step() {
          if (turned < target)      { turned++; update(); setTimeout(step, 50); }
          else if (turned > target) { turned--; update(); setTimeout(step, 50); }
        })();
      };
    })(i));
    flipDots.appendChild(dot);
  }

  nextBtn.addEventListener('click', function() {
    if (turned < N) turned++; else turned = 0;
    update();
  });
  prevBtn.addEventListener('click', function() {
    if (turned > 0) turned--; else turned = N;
    update();
  });

  // Touch swipe within flip-book area
  var tx = 0;
  flipBw.addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; });
  flipBw.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) {
      if (dx < 0) { if (turned < N) turned++; else turned = 0; }
      else        { if (turned > 0) turned--; else turned = N; }
      update();
    }
  });

  window.addEventListener('resize', update);
  update();
})();

// =============================================
// === EXTERNAL EFFECTS INIT ===================
// =============================================
var ballpit = createBallpitGrace(document.getElementById('ballpit-honor-canvas'), {
  count: 80,
  gravity: 0.2,
  friction: 0.988,
  wallBounce: 0.75,
  maxVelocity: 0.12,
  followCursor: false,
  colors: [0x6d5dfc, 0x9e8b8e, 0xF9F8F6],
  materialParams: { metalness: 0.45, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 },
  minSize: 0.5,
  maxSize: 1.0,
  size0: 1.2
});

new ParticlesEffect('#contact-particles', {
  particleColors:       ['#ffffff'],
  particleCount:        200,
  particleSpread:       10,
  speed:                0.1,
  particleBaseSize:     100,
  moveParticlesOnHover: true,
  particleHoverFactor:  1,
  alphaParticles:       false,
  disableRotation:      false,
  sizeRandomness:       0.1,
  cameraDistance:       50,
  pixelRatio:           1
});

SplashCursor.init({ SPLAT_RADIUS: 0.02, SPLAT_FORCE: 10000, DENSITY_DISSIPATION: 2.0, COLOR: '#6d5dfc', CURL: 1 });
