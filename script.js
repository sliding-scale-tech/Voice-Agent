/* ============================================================
   LEASELINE — interaction layer
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
      // easeOutExpo — matches the cubic-bezier(0.16, 1, 0.3, 1) feel
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
     Hero parallax — mouse + scroll
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
