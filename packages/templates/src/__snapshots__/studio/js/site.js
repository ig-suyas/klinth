(function () {
  'use strict';
  // Videos: the YouTube or Vimeo player loads only after the visitor presses play.
  var PLAYERS = ['https://www.youtube-nocookie.com/embed/', 'https://player.vimeo.com/video/'];
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || !e.target.closest) return;
    var facade = e.target.closest('a.video-facade');
    var src = facade && facade.getAttribute('data-embed');
    if (!src || !PLAYERS.some(function (p) { return src.indexOf(p) === 0; })) return;
    e.preventDefault();
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = facade.getAttribute('data-title') || 'Video';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    facade.parentNode.replaceChild(frame, facade);
    frame.focus();
  });

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

  // A see-through sticky header turns solid once the page scrolls (CSS does the look).
  var overlay = document.querySelector('.hdr-transparent.hdr-sticky');
  if (overlay) {
    var pending = false;
    var update = function () {
      pending = false;
      overlay.classList.toggle('is-top', window.scrollY < 8);
    };
    window.addEventListener('scroll', function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  // Scroll reveal. Skipped for reduced motion; the first section is never hidden.
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  var groups = '.cards > li, .index > li, .quotes > figure, .gallery > li, .linklist > li, .facts > div';
  var singles = '.head, .prose, .contact-details, .form';
  // Pictures and video open like a curtain instead of sliding in.
  var media = '.about-media, .split-media, .video-frame, .video-file';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  var blocks = document.querySelectorAll('main > .block');
  for (var b = 1; b < blocks.length; b++) {
    blocks[b].querySelectorAll(singles + ', ' + groups + ', ' + media).forEach(function (el) {
      if (el.matches(groups)) {
        var index = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = Math.min(index, 5) * 70 + 'ms';
      }
      el.classList.add(el.matches(media) ? 'reveal-mask' : 'reveal');
      io.observe(el);
    });
  }
})();
