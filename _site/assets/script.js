// Apply saved theme immediately to prevent flash of wrong theme
(function () {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();

document.addEventListener('DOMContentLoaded', function () {

  // ── Dark mode toggle ──────────────────────────────────────────────────────
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var html = document.documentElement;
      var current = html.getAttribute('data-theme');
      var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var isDark = current === 'dark' || (current !== 'light' && systemDark);
      var next = isDark ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // ── Vulnerability card expand / collapse ──────────────────────────────────
  var vulnCards = document.querySelectorAll('.vuln-card');
  console.log('[vulns] Found ' + vulnCards.length + ' card(s).');

  vulnCards.forEach(function (card) {
    var toggleBtn = card.querySelector('.vuln-toggle');
    var row       = card.querySelector('.vuln-row');

    function handleToggle(e) {
      // Ignore clicks on inner links (NVD / Fix PR / PoC etc.)
      if (e && e.target && e.target.closest('a')) return;
      if (e) e.stopPropagation();

      var wasCollapsed = card.classList.contains('collapsed');
      card.classList.toggle('collapsed');

      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', wasCollapsed ? 'true' : 'false');
      }
    }

    if (toggleBtn) toggleBtn.addEventListener('click', handleToggle);
    if (row)       row.addEventListener('click', handleToggle);
  });

  // ── Scroll-spy TOC ────────────────────────────────────────────────────────
  var sections = document.querySelectorAll('section[id]');
  var tocLinks = document.querySelectorAll('.toc-link');

  if (!sections.length || !tocLinks.length) return;

  var activeId = null;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        activeId = entry.target.id;
        tocLinks.forEach(function (link) {
          var href = link.getAttribute('href');
          link.classList.toggle('active', href === '#' + activeId);
        });
      }
    });
  }, {
    rootMargin: '-15% 0px -75% 0px',
    threshold: 0
  });

  sections.forEach(function (s) { observer.observe(s); });
});