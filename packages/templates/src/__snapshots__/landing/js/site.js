(function () {
  'use strict';
  // Menu: close after picking a link or pressing Escape.
  document.querySelectorAll('.menu').forEach(function (menu) {
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) menu.removeAttribute('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('open')) {
        menu.removeAttribute('open');
        menu.querySelector('summary').focus();
      }
    });
  });

  // Scroll reveal. Skipped for reduced motion; the first section is never hidden.
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  var groups = '.cards > li, .index > li, .quotes > figure, .gallery > li, .linklist > li, .facts > div';
  var singles = '.head, .prose, .about-media, .split-media, .contact-details, .form';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  var blocks = document.querySelectorAll('main > .block');
  for (var b = 1; b < blocks.length; b++) {
    blocks[b].querySelectorAll(singles + ', ' + groups).forEach(function (el) {
      if (el.matches(groups)) {
        var index = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = Math.min(index, 5) * 80 + 'ms';
      }
      el.classList.add('reveal');
      io.observe(el);
    });
  }
})();
