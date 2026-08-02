/* ============================================================
   LEASELINE, interaction layer
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     Scroll progress bar
     ---------------------------------------------------------- */
  var progressFill = document.getElementById('progress-fill');

  function updateProgress() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    var pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
    progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  /* ----------------------------------------------------------
     Scroll reveals
     ---------------------------------------------------------- */
  var revealables = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    revealables.forEach(function (el) { revealObserver.observe(el); });

    /* Backstop. The observer can legitimately fail to fire: an anchor jump
       or restored scroll position can land past an element, a zoomed or
       short viewport can stop a tall element from ever reaching the 12%
       threshold, and a throw further down this file would strand whatever
       has not fired yet. Once loaded, force-reveal anything at or above the
       fold so nothing is left invisible. */
    var aboveFold = function (el) {
      return el.getBoundingClientRect().top < window.innerHeight;
    };

    var sweep = function () {
      document.querySelectorAll('.reveal:not(.is-visible)').forEach(function (el) {
        if (!aboveFold(el)) return;
        el.classList.add('is-visible');
        revealObserver.unobserve(el);
      });

      /* The sparkline and the count-up numbers run on their own observers
         with the same exposure, so they get the same backstop. Without it an
         anchor jump past the dashboard leaves an undrawn chart and metrics
         frozen at their placeholder 0. */
      if (sparkFigure && !sparkFigure.classList.contains('is-drawn') && aboveFold(sparkFigure)) {
        sparkFigure.classList.add('is-drawn');
      }

      document.querySelectorAll('[data-count]').forEach(function (el) {
        if (el.dataset.counted || !aboveFold(el)) return;
        countUp(el);
      });
    };

    window.addEventListener('load', function () { setTimeout(sweep, 200); });
    setTimeout(sweep, 2500);
  } else {
    revealables.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ----------------------------------------------------------
     Count-up animations
     ---------------------------------------------------------- */
  function format(el, value) {
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    return prefix + value.toFixed(decimals) + suffix;
  }

  function countUp(el) {
    // idempotent: the observer and the backstop sweep can both reach this
    if (el.dataset.counted) return;
    el.dataset.counted = '1';

    var target = parseFloat(el.dataset.count);
    var duration = 1600;
    var start = null;

    if (reduceMotion) {
      el.textContent = format(el, target);
      return;
    }

    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / duration);
      // easeOutExpo, matches the cubic-bezier(0.16, 1, 0.3, 1) feel
      var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = format(el, target * eased);
      if (t < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  var counters = document.querySelectorAll('[data-count]');

  if ('IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = format(el, parseFloat(el.dataset.count)); });
  }

  /* ----------------------------------------------------------
     Sparkline draw-in
     ---------------------------------------------------------- */
  var sparkFigure = document.getElementById('spark-figure');

  if (sparkFigure && 'IntersectionObserver' in window) {
    var sparkObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        sparkFigure.classList.add('is-drawn');
        sparkObserver.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    sparkObserver.observe(sparkFigure);
  } else if (sparkFigure) {
    sparkFigure.classList.add('is-drawn');
  }

  /* ----------------------------------------------------------
     Hero parallax (mouse + scroll)
     ---------------------------------------------------------- */
  var shapeHost = document.getElementById('hero-shapes');
  var shapes = shapeHost ? Array.prototype.slice.call(shapeHost.querySelectorAll('.shape')) : [];
  var depths = [26, -18, 34, -24, 16, -30];
  var pointer = { x: 0, y: 0 };
  var scrollShift = 0;

  function applyShapeTransforms() {
    shapes.forEach(function (shape, i) {
      var depth = depths[i % depths.length];
      var x = pointer.x * depth;
      var y = pointer.y * depth + scrollShift * (depth / 26) * 0.5;
      shape.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    });
  }

  if (shapes.length && !reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      applyShapeTransforms();
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     Scroll handling (rAF-throttled)
     ---------------------------------------------------------- */
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateProgress();
      if (shapes.length && !reduceMotion) {
        scrollShift = Math.min(window.scrollY, window.innerHeight) * 0.12;
        applyShapeTransforms();
      }
      ticking = false;
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  /* ----------------------------------------------------------
     Global toast system
     ---------------------------------------------------------- */
  var toastStack = document.getElementById('toast-stack');

  var ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.2"/></svg>'
  };

  function toast(message, type) {
    var kind = ICONS[type] ? type : 'info';

    var el = document.createElement('div');
    el.className = 'toast toast-' + kind;

    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[kind];

    var msg = document.createElement('p');
    msg.className = 'toast-msg';
    msg.textContent = message;

    el.appendChild(icon);
    el.appendChild(msg);
    toastStack.appendChild(el);

    requestAnimationFrame(function () { el.classList.add('is-in'); });

    var dismiss = function () {
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 700);
    };

    var timer = setTimeout(dismiss, 3600);
    el.addEventListener('click', function () { clearTimeout(timer); dismiss(); });
  }

  window.toast = toast;

  var TOAST_COPY = {
    success: 'FORM SUBMITTED',
    info: 'DEMO LINK COPIED'
  };

  document.querySelectorAll('[data-toast]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var type = trigger.dataset.toast;
      toast(TOAST_COPY[type] || 'ACTION COMPLETE', type);
    });
  });

  /* ----------------------------------------------------------
     Mobile nav
     ---------------------------------------------------------- */
  var navToggle = document.getElementById('nav-toggle');
  var navPill = document.querySelector('.nav-pill');

  if (navToggle && navPill) {
    navToggle.addEventListener('click', function () {
      var open = navPill.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    navPill.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navPill.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();

/* ============================================================
   BOOK A CALL MODAL
   Opened by any [data-book-open]. Submits to Formspree over fetch
   so the visitor is never navigated away from the page.
   ============================================================ */
(function () {
  'use strict';

  var overlay = document.getElementById('book-overlay');
  if (!overlay) return;

  var card     = document.getElementById('book-card');
  var form     = document.getElementById('book-form');
  var submit   = document.getElementById('book-submit');
  var statusEl = document.getElementById('book-status');
  var openEls  = document.querySelectorAll('[data-book-open]');
  var closeEls = overlay.querySelectorAll('[data-book-close]');

  var lastFocus = null;
  var sending = false;

  function setStatus(message, state) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-ok', state === 'ok');
    statusEl.classList.toggle('is-err', state === 'err');
  }

  function isOpen() { return !overlay.hidden; }

  function open() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('demo-lock');   // reuse the existing scroll lock
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    setTimeout(function () {
      var first = form.querySelector('input:not([type="hidden"]):not(.book-gotcha)');
      if (first) first.focus();
    }, 60);
  }

  function close() {
    overlay.classList.remove('is-open');
    document.body.classList.remove('demo-lock');
    setTimeout(function () {
      overlay.hidden = true;
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }, 380);
  }

  openEls.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
  });

  closeEls.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      close();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== 'Tab') return;

    var focusables = card.querySelectorAll(
      'button, [href], input:not([type="hidden"]):not(.book-gotcha), textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;

    var first = focusables[0];
    var last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    sending = true;
    submit.disabled = true;
    setStatus('Sending...', null);

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      form.reset();
      setStatus('Thanks. We will be in touch shortly.', 'ok');
      if (typeof window.toast === 'function') window.toast('REQUEST SENT', 'success');
      setTimeout(function () { if (isOpen()) close(); }, 1800);
    }).catch(function () {
      setStatus('That did not send. Email scalesliding@gmail.com and we will pick it up.', 'err');
    }).then(function () {
      sending = false;
      submit.disabled = false;
    });
  });
})();

/* ============================================================
   BILLING TOGGLE
   Only the Standard tier has a monthly number to discount:
   Pilot is a flat 7-day trial, Enterprise is custom-quoted.
   The annual price is COMPUTED from BASE_PRICE, so changing the
   base here keeps both states correct.
   ============================================================ */
(function () {
  'use strict';

  var BASE_PRICE      = 6;      // $/unit/mo
  var ANNUAL_DISCOUNT = 0.2;    // 20% off  ->  6 * 0.8 = 4.80
  var SETUP_CAPTION   = '+ $3,000–$7,000 one-time setup';
  var ANNUAL_NOTE     = ' · billed annually';

  // [PARKED] The pricing section is currently removed from index.html,
  // so this exits here. It reactivates on its own if the markup returns.
  var toggle = document.getElementById('billing-switch');
  if (!toggle) return;

  var priceEl   = document.getElementById('std-price');
  var captionEl = document.getElementById('std-caption');

  var isAnnual = false;

  function formatPrice(value) {
    // whole dollars stay whole ($6), fractional show cents ($4.80)
    var rounded = Math.round(value * 100) / 100;
    return '$' + (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2));
  }

  function render() {
    var value = isAnnual ? BASE_PRICE * (1 - ANNUAL_DISCOUNT) : BASE_PRICE;

    priceEl.textContent = formatPrice(value);
    captionEl.textContent = SETUP_CAPTION + (isAnnual ? ANNUAL_NOTE : '');
    toggle.setAttribute('aria-checked', String(isAnnual));
  }

  toggle.addEventListener('click', function () {
    isAnnual = !isAnnual;
    render();
  });

  render();
})();

/* ============================================================
   CALL DEMO MODAL
   Self-contained. Does not touch anything above.
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     >>> FILL THIS IN <<<

     `audio` and `speaker` are correct. Filenames are read straight
     from ./audio/ and the speaker follows the filename convention
     (01 opens as the agent, then tenant/ai alternate through 15ai).

     `text`      is a PLACEHOLDER. Replace with the real transcript line.
     `qualifies` is a PLACEHOLDER MAPPING. List the CRITERIA ids that the
                  line satisfies. Ticks fire when the line starts, so
                  put an id on the turn where the answer is actually
                  given. An empty array means no tick on that turn.
     ------------------------------------------------------------------ */

  var CRITERIA = [
    { id: 'c1', label: 'Unit type' },
    { id: 'c2', label: 'Move-in date' },
    { id: 'c3', label: 'Budget range' },
    { id: 'c4', label: 'Pet policy' },
    { id: 'c5', label: 'Contact info' }
  ];

  var DEMO_SCRIPT = [
    { audio: 'audio/01.mp3',        speaker: 'ai',     text: '[AI line 1, add transcript]',      qualifies: [] },
    { audio: 'audio/02tenant.mp3',  speaker: 'caller', text: '[Caller line 2, add transcript]',  qualifies: [] },
    { audio: 'audio/03ai.mp3',      speaker: 'ai',     text: '[AI line 3, add transcript]',      qualifies: [] },
    { audio: 'audio/04tenant.mp3',  speaker: 'caller', text: '[Caller line 4, add transcript]',  qualifies: ['c1'] },
    { audio: 'audio/05ai.mp3',      speaker: 'ai',     text: '[AI line 5, add transcript]',      qualifies: [] },
    { audio: 'audio/06tenant.mp3',  speaker: 'caller', text: '[Caller line 6, add transcript]',  qualifies: ['c2'] },
    { audio: 'audio/07ai.mp3',      speaker: 'ai',     text: '[AI line 7, add transcript]',      qualifies: [] },
    { audio: 'audio/08tenant.mp3',  speaker: 'caller', text: '[Caller line 8, add transcript]',  qualifies: ['c3'] },
    { audio: 'audio/09ai.mp3',      speaker: 'ai',     text: '[AI line 9, add transcript]',      qualifies: [] },
    { audio: 'audio/10tenant.mp3',  speaker: 'caller', text: '[Caller line 10, add transcript]', qualifies: ['c4'] },
    { audio: 'audio/11ai.mp3',      speaker: 'ai',     text: '[AI line 11, add transcript]',     qualifies: [] },
    { audio: 'audio/12tenant.mp3',  speaker: 'caller', text: '[Caller line 12, add transcript]', qualifies: ['c5'] },
    { audio: 'audio/13ai.mp3',      speaker: 'ai',     text: '[AI line 13, add transcript]',     qualifies: [] },
    { audio: 'audio/14tenant.mp3',  speaker: 'caller', text: '[Caller line 14, add transcript]', qualifies: [] },
    { audio: 'audio/15ai.mp3',      speaker: 'ai',     text: '[AI line 15, add transcript]',     qualifies: [] }
  ];

  var SPEAKER_LABEL = { ai: 'Agent', caller: 'Caller' };

  /* ---------- elements ---------- */

  var overlay = document.getElementById('demo-overlay');
  if (!overlay) return;

  var card         = document.getElementById('demo-card');
  var transcriptEl = document.getElementById('demo-transcript');
  var emptyEl      = document.getElementById('demo-empty');
  var checklistEl  = document.getElementById('demo-checklist');
  var turnEl       = document.getElementById('demo-turn');
  var scoreEl      = document.getElementById('demo-score');
  var progressEl   = document.getElementById('demo-progress-fill');
  var playBtn      = document.getElementById('demo-play');
  var playLabel    = document.getElementById('demo-play-label');
  var liveLabel    = document.getElementById('demo-live-label');
  var noteEl       = document.getElementById('demo-note');
  var closeEls     = overlay.querySelectorAll('[data-demo-close]');
  var openEls      = document.querySelectorAll('[data-demo-open]');

  var NOTE_DEFAULT = noteEl.textContent;

  /* ---------- state ---------- */

  var audio    = new Audio();
  var index    = -1;      // index of the line currently playing
  var playing  = false;
  var finished = false;
  var runToken = 0;       // invalidates stale async callbacks after a reset
  var lastFocus = null;
  var critNodes = {};

  audio.preload = 'none';

  /* ---------- build checklist ---------- */

  CRITERIA.forEach(function (crit) {
    var li = document.createElement('li');
    li.className = 'demo-crit';
    li.dataset.crit = crit.id;

    var box = document.createElement('span');
    box.className = 'demo-crit-box';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

    var text = document.createElement('span');
    text.textContent = crit.label;

    li.appendChild(box);
    li.appendChild(text);
    li.setAttribute('aria-label', crit.label + ': not yet confirmed');

    checklistEl.appendChild(li);
    critNodes[crit.id] = li;
  });

  /* ---------- rendering ---------- */

  function setNote(message, isError) {
    noteEl.textContent = message;
    noteEl.classList.toggle('is-error', !!isError);
  }

  function updateScore() {
    var met = Object.keys(critNodes).filter(function (id) {
      return critNodes[id].classList.contains('is-met');
    }).length;
    scoreEl.textContent = met + '/' + CRITERIA.length;
    scoreEl.classList.toggle('is-complete', met === CRITERIA.length);
  }

  function markCriteria(ids) {
    (ids || []).forEach(function (id) {
      var node = critNodes[id];
      if (!node || node.classList.contains('is-met')) return;
      node.classList.add('is-met');
      node.setAttribute('aria-label', node.textContent + ': confirmed');
    });
    updateScore();
  }

  function appendLine(entry, i) {
    if (emptyEl) emptyEl.hidden = true;

    var prev = transcriptEl.querySelector('.demo-line.is-active');
    if (prev) prev.classList.remove('is-active');

    var line = document.createElement('div');
    line.className = 'demo-line demo-line-' + entry.speaker + ' is-active';

    var who = document.createElement('span');
    who.className = 'demo-speaker';
    who.textContent = SPEAKER_LABEL[entry.speaker] || entry.speaker;

    var body = document.createElement('p');
    body.style.margin = '0';
    body.textContent = entry.text;

    line.appendChild(who);
    line.appendChild(body);
    transcriptEl.appendChild(line);

    transcriptEl.scrollTop = transcriptEl.scrollHeight;

    turnEl.textContent = 'Turn ' + (i + 1) + ' / ' + DEMO_SCRIPT.length;
    progressEl.style.width = (((i + 1) / DEMO_SCRIPT.length) * 100) + '%';
  }

  function setPlayButton(mode) {
    // mode: 'idle' | 'playing' | 'replay'
    if (mode === 'playing') {
      playLabel.textContent = 'Pause';
      playBtn.setAttribute('aria-label', 'Pause call');
    } else if (mode === 'replay') {
      playLabel.textContent = 'Replay call';
      playBtn.setAttribute('aria-label', 'Replay call');
    } else {
      playLabel.textContent = 'Play call';
      playBtn.setAttribute('aria-label', 'Play call');
    }
    playBtn.dataset.mode = mode;
  }

  /* ---------- playback ---------- */

  function playIndex(i) {
    var token = runToken;

    if (i >= DEMO_SCRIPT.length) {
      finish();
      return;
    }

    index = i;
    var entry = DEMO_SCRIPT[i];

    appendLine(entry, i);
    markCriteria(entry.qualifies);

    audio.src = entry.audio;

    var attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () {
        if (token !== runToken) return;   // reset happened mid-await
        playing = false;
        setPlayButton('idle');
        setNote('Could not play ' + entry.audio + '. Check the file path.', true);
      });
    }
  }

  function onEnded() {
    if (!playing) return;
    playIndex(index + 1);
  }

  function onError() {
    if (!playing) return;
    playing = false;
    setPlayButton('idle');
    var entry = DEMO_SCRIPT[index];
    setNote('Audio failed to load: ' + (entry ? entry.audio : 'unknown file'), true);
  }

  function finish() {
    playing = false;
    finished = true;
    overlay.classList.add('is-done');
    liveLabel.textContent = 'Call ended';
    setPlayButton('replay');

    var active = transcriptEl.querySelector('.demo-line.is-active');
    if (active) active.classList.remove('is-active');
  }

  function start() {
    if (finished) reset();
    playing = true;
    finished = false;
    overlay.classList.remove('is-done');
    liveLabel.textContent = 'Call in progress';
    setNote(NOTE_DEFAULT, false);
    setPlayButton('playing');
    playIndex(index < 0 ? 0 : index);
  }

  function pause() {
    playing = false;
    audio.pause();
    setPlayButton('idle');
  }

  function resume() {
    playing = true;
    setPlayButton('playing');
    liveLabel.textContent = 'Call in progress';
    var attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () { pause(); });
    }
  }

  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  /* ---------- full reset ---------- */

  function reset() {
    runToken++;              // any in-flight play()/ended callback is now stale
    playing = false;
    finished = false;
    index = -1;

    audio.pause();
    audio.removeAttribute('src');   // stops buffering immediately
    audio.load();

    // transcript back to its initial state
    Array.prototype.slice.call(transcriptEl.querySelectorAll('.demo-line'))
      .forEach(function (n) { n.remove(); });
    if (emptyEl) emptyEl.hidden = false;

    // checklist back to zero
    Object.keys(critNodes).forEach(function (id) {
      var node = critNodes[id];
      node.classList.remove('is-met');
      node.setAttribute('aria-label', node.textContent + ': not yet confirmed');
    });

    updateScore();
    turnEl.textContent = '-';   // ASCII only: no encoding ambiguity
    progressEl.style.width = '0%';
    liveLabel.textContent = 'Incoming call';
    overlay.classList.remove('is-done');
    setNote(NOTE_DEFAULT, false);
    setPlayButton('idle');
  }

  /* ---------- open / close ---------- */

  function open() {
    lastFocus = document.activeElement;
    reset();                       // always fresh from line 1
    overlay.hidden = false;
    document.body.classList.add('demo-lock');
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    setTimeout(function () { playBtn.focus(); }, 60);
  }

  function close() {
    reset();                       // stops audio + clears widget state
    overlay.classList.remove('is-open');
    document.body.classList.remove('demo-lock');

    setTimeout(function () {
      overlay.hidden = true;
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }, 380);
  }

  function isOpen() {
    return !overlay.hidden;
  }

  openEls.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      open();
    });
  });

  closeEls.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      close();
    });
  });

  playBtn.addEventListener('click', function () {
    var mode = playBtn.dataset.mode || 'idle';
    if (mode === 'playing') { pause(); return; }
    if (mode === 'replay')  { reset(); start(); return; }
    // idle: either a fresh start or resuming a pause mid-line
    if (index >= 0 && audio.currentTime > 0 && !audio.ended) resume();
    else start();
  });

  /* Escape to close, and a simple focus trap inside the card */
  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== 'Tab') return;

    var focusables = card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;

    var first = focusables[0];
    var last  = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  updateScore();
})();
