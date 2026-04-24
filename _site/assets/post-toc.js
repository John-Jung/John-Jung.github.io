/* ═══════════════════════════════════════════════════════════
   post-toc.js — Auto-generate TOC from h2/h3 headings
   with scroll-spy active state highlighting
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var toc = document.getElementById('post-toc');
  var body = document.querySelector('.post-body');
  if (!toc || !body) return;

  // ── 1. Collect h2 and h3 headings ───────────────────────
  var headings = body.querySelectorAll('h2, h3');
  if (headings.length === 0) {
    toc.style.display = 'none';
    return;
  }

  // ── 2. Ensure each heading has an id ────────────────────
  headings.forEach(function (h, i) {
    if (!h.id) {
      h.id = 'heading-' + i;
    }
  });

  // ── 3. Build the TOC list ───────────────────────────────
  var ul = document.createElement('ul');

  headings.forEach(function (h) {
    var li = document.createElement('li');
    var a = document.createElement('a');

    a.href = '#' + h.id;
    a.textContent = h.textContent;
    a.className = 'post-toc-link';

    if (h.tagName === 'H3') {
      li.className = 'post-toc-h3';
    }

    // Smooth scroll on click
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById(h.id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + h.id);
      }
    });

    li.appendChild(a);
    ul.appendChild(li);
  });

  toc.appendChild(ul);

  // ── 4. Scroll-spy: highlight active heading ─────────────
  var links = toc.querySelectorAll('.post-toc-link');
  var headingArr = Array.prototype.slice.call(headings);
  var scrollOffset = 100; // px from top to consider "active"

  function updateActive() {
    var scrollY = window.scrollY || window.pageYOffset;
    var active = null;

    for (var i = headingArr.length - 1; i >= 0; i--) {
      if (headingArr[i].getBoundingClientRect().top <= scrollOffset) {
        active = headingArr[i];
        break;
      }
    }

    links.forEach(function (link) {
      link.classList.remove('active');
    });

    if (active) {
      var activeLink = toc.querySelector('a[href="#' + active.id + '"]');
      if (activeLink) activeLink.classList.add('active');
    }
  }

  // Throttled scroll listener
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        updateActive();
        ticking = false;
      });
      ticking = true;
    }
  });

  // Initial highlight
  updateActive();
})();
