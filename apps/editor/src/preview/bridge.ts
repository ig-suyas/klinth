/**
 * The small script that runs inside the sandboxed preview frame. It has no
 * access to the editor: it only talks to the editor (`window.top`; its direct
 * parent is the preview.html shell) through `postMessage`.
 * Sent to the editor: `ready`, `select`, `edit`, `scroll`, `header` (header clicked),
 * `removeHeader` and `navigate` (a header link to another page). Received: `select`,
 * and `assets` (uploaded files as Blobs, shown through this frame's own blob: addresses).
 * Custom code frames inside the page may only report their height.
 *
 * Written as plain ES5 in a string because it is injected into `srcdoc`.
 * Text is only ever read with `innerText` and written with `textContent`.
 */
export const BRIDGE_JS = `(function () {
  'use strict';
  var cfg = window.__klinth;
  var PARAGRAPH_FIELDS = { intro: 1, subheading: 1, body: 1, caption: 1 };
  var selected = cfg.selected;
  var editing = null;

  function send(message) {
    message.source = 'klinth-preview';
    window.top.postMessage(message, cfg.origin);
  }
  function sectionOf(el) {
    return el && el.closest ? el.closest('[data-k-section]') : null;
  }
  function mark(id, scroll) {
    selected = id;
    var all = document.querySelectorAll('[data-k-section]');
    for (var i = 0; i < all.length; i++) {
      var on = all[i].getAttribute('data-k-section') === id;
      all[i].classList.toggle('k-selected', on);
      if (on && scroll) all[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    markHeader(id === HEADER);
  }

  // The header: click to select it; a small toolbar with "×" removes it (the editor can undo).
  var HEADER = '#header';
  var header = document.querySelector('[data-k-header]');
  var toolbar = null;
  function placeToolbar() {
    if (!toolbar || toolbar.hidden || !header) return;
    var box = header.getBoundingClientRect();
    toolbar.style.top = Math.max(6, Math.round(box.bottom) + 6) + 'px';
  }
  function makeToolbar() {
    var bar = document.createElement('div');
    bar.className = 'k-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Header');
    var name = document.createElement('span');
    name.textContent = 'Header';
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'k-remove';
    remove.title = 'Remove header';
    remove.setAttribute('aria-label', 'Remove header');
    remove.textContent = '\\u00d7';
    remove.addEventListener('click', function () { send({ type: 'removeHeader' }); });
    bar.appendChild(name);
    bar.appendChild(remove);
    document.body.appendChild(bar);
    return bar;
  }
  function markHeader(on) {
    if (!header) return;
    header.classList.toggle('k-selected', on);
    if (on && !toolbar) toolbar = makeToolbar();
    if (toolbar) toolbar.hidden = !on;
    placeToolbar();
  }

  // Header links never leave the preview: same-page sections scroll, other pages switch.
  var SAME_PAGE = /^#([A-Za-z][\\w-]{0,63})$/;
  var PAGE = /^(index|[a-z0-9]+(?:-[a-z0-9]+)*)\\.html(?:#([A-Za-z][\\w-]{0,63}))?$/;
  function scrollToAnchor(id, smooth) {
    var target = document.getElementById(id);
    if (!target) return;
    var still = !smooth || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var offset = parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' });
  }
  function follow(href) {
    var same = SAME_PAGE.exec(href);
    if (same) { scrollToAnchor(same[1], true); return; }
    var page = PAGE.exec(href);
    if (!page) return;
    var slug = page[1] === 'index' ? '' : page[1];
    if (slug !== cfg.page) { send({ type: 'navigate', page: slug, anchor: page[2] || undefined }); return; }
    if (page[2]) scrollToAnchor(page[2], true);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fieldValue(section, name) {
    var parts = section.querySelectorAll('[data-k-field="' + name + '"]');
    var values = [];
    for (var i = 0; i < parts.length; i++) {
      var text = parts[i].innerText.replace(/\\u00a0/g, ' ').trim();
      if (text) values.push(text);
    }
    return values.join(PARAGRAPH_FIELDS[name] ? '\\n\\n' : '\\n');
  }

  function stopEditing(save) {
    if (!editing) return;
    var current = editing;
    editing = null;
    current.el.removeAttribute('contenteditable');
    current.el.classList.remove('k-editing');
    if (!save) {
      // Put back the untouched copy (keeps line breaks; no HTML strings involved).
      current.el.replaceWith(current.original);
      return;
    }
    var value = fieldValue(current.section, current.field);
    if (value !== current.before) {
      send({ type: 'edit', id: current.section.getAttribute('data-k-section'), field: current.field, value: value });
    }
  }

  // Animated headings: marquee copies go, and words or letters split for the animation
  // become plain lines again, so editing sees the text once and as typed.
  function plainText(el) {
    var copies = el.querySelectorAll('[data-k-clone]');
    for (var i = 0; i < copies.length; i++) copies[i].remove();
    if (!el.hasAttribute('data-k-split')) return;
    var rows = el.innerText.replace(/\\u00a0/g, ' ').split('\\n');
    el.removeAttribute('data-k-split');
    el.removeAttribute('aria-label');
    while (el.firstChild) el.removeChild(el.firstChild);
    for (var r = 0; r < rows.length; r++) {
      if (r) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(rows[r]));
    }
  }

  function startEditing(el, section) {
    var name = el.getAttribute('data-k-field');
    var original = el.cloneNode(true);
    plainText(el);
    editing = { el: el, section: section, field: name, original: original, before: fieldValue(section, name) };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.classList.add('k-editing');
    el.focus();
  }

  // Capture phase: runs before the site script, which then sees defaultPrevented
  // and leaves video players unloaded in the preview.
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (toolbar && toolbar.contains(target)) return;
    var inHeader = header && header.contains(target);
    // The header's Menu button still opens its panel, so its links can be tried.
    if (inHeader && target.closest('summary')) return;
    // Links and buttons never navigate away from the preview.
    if (target.closest('a, button, summary')) e.preventDefault();
    if (editing && editing.el.contains(target)) return;
    stopEditing(true);
    if (inHeader) {
      var link = target.closest('a');
      if (link) {
        var menu = link.closest('details');
        if (menu) menu.removeAttribute('open');
        follow(link.getAttribute('href') || '');
        return;
      }
      mark(HEADER, false);
      send({ type: 'header' });
      return;
    }
    var section = sectionOf(target);
    if (!section) return;
    var id = section.getAttribute('data-k-section');
    var fieldEl = target.closest('[data-k-field]');
    if (fieldEl && id === selected) {
      startEditing(fieldEl, section);
      return;
    }
    mark(id, false);
    send({ type: 'select', id: id });
  }, true);
  // Safari (iPad, iPhone) turns a tap into a click only when an element under
  // the finger has its own click listener; one on the document does not count.
  // This empty one on <body> makes every tap a click, so taps select and edit.
  document.body.addEventListener('click', function () {});

  document.addEventListener('dblclick', function (e) {
    var fieldEl = e.target.closest('[data-k-field]');
    var section = sectionOf(fieldEl);
    if (fieldEl && section && !editing) startEditing(fieldEl, section);
  });

  document.addEventListener('submit', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); }
    else if (e.key === 'Enter' && !e.shiftKey && !PARAGRAPH_FIELDS[editing.field]) {
      e.preventDefault();
      stopEditing(true);
    }
  });

  document.addEventListener('focusout', function (e) {
    if (editing && e.target === editing.el) stopEditing(true);
  });

  var scrollTimer = 0;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { send({ type: 'scroll', y: Math.round(window.scrollY) }); }, 100);
    placeToolbar();
  }, { passive: true });
  window.addEventListener('resize', placeToolbar);

  function showAssets(items) {
    if (!items || !items.length) return;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item.id !== 'string' || !(item.blob instanceof Blob)) continue;
      var url = URL.createObjectURL(item.blob);
      var els = document.querySelectorAll('[data-k-asset]');
      for (var j = 0; j < els.length; j++) {
        if (els[j].getAttribute('data-k-asset') === item.id) els[j].src = url;
      }
    }
  }

  function fitCodeFrame(e) {
    var frames = document.querySelectorAll('iframe.code-frame');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var h = Number(e.data.height);
        if (h > 0) frames[i].style.height = Math.min(Math.max(Math.round(h), 80), 1600) + 'px';
      }
    }
  }

  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.source === 'klinth-code' && e.source !== window.top) { fitCodeFrame(e); return; }
    if (e.source !== window.top || e.data.source !== 'klinth-editor') return;
    if (e.data.type === 'select') mark(e.data.id, true);
    else if (e.data.type === 'assets') showAssets(e.data.items);
  });

  if (cfg.scrollTo) scrollToAnchor(cfg.scrollTo, false);
  else if (cfg.scrollY) window.scrollTo(0, cfg.scrollY);
  if (selected) mark(selected, false);
  send({ type: 'ready' });
})();
`;

/** Highlights for hover, selection and in-place editing. Preview only. */
export const BRIDGE_CSS = `
[data-k-section] { cursor: pointer; outline-offset: -2px; }
[data-k-section]:hover { outline: 2px dashed rgba(194, 65, 12, 0.45); }
[data-k-section].k-selected { outline: 2px solid #c2410c; }
.k-selected [data-k-field] { cursor: text; }
.k-selected [data-k-field]:hover { box-shadow: 0 0 0 2px rgba(194, 65, 12, 0.35); border-radius: 2px; }
.k-editing { outline: 2px solid #c2410c; outline-offset: 4px; border-radius: 2px; cursor: text; }
[data-k-header] { cursor: pointer; outline-offset: -2px; }
[data-k-header]:hover { outline: 2px dashed rgba(194, 65, 12, 0.45); }
[data-k-header].k-selected { outline: 2px solid #c2410c; }
.k-toolbar { position: fixed; right: 12px; z-index: 2147483647; display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 10px; border-radius: 999px; background: #1d1b18; color: #fffdf8; font: 600 12px/1 system-ui, sans-serif; box-shadow: 0 6px 18px -6px rgba(0, 0, 0, .45); }
.k-toolbar[hidden] { display: none; }
.k-remove { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 999px; background: rgba(255, 253, 248, .16); color: inherit; font: 600 18px/1 system-ui, sans-serif; cursor: pointer; }
.k-remove:hover { background: #b42318; }
.k-remove:focus-visible { outline: 2px solid #fffdf8; outline-offset: 2px; }
`;

/** Preview-only pieces of the page (custom code box). Thumbnails get it too. */
export const PREVIEW_CSS = `
.code-note { margin: 0 0 .75rem; font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: .02em; color: var(--muted); }
.code-frame { display: block; width: 100%; height: 320px; border: 1px dashed var(--line); border-radius: min(var(--radius), 12px); background: transparent; }
.code-empty { padding: 2.5rem 1rem; text-align: center; border: 1px dashed var(--line); border-radius: min(var(--radius), 12px); font: 500 14px/1.4 system-ui, sans-serif; color: var(--muted); }
`;

/**
 * After the first load, reloads skip the scroll reveal and the chosen animations
 * so edits do not flicker. Marquees keep running; "Preview animations" plays the rest.
 */
export const CALM_CSS = `
.k-anim *:not(.k-mq), .k-anim *::after { animation: none !important; }
[class*="k-wait-"] * { opacity: 1 !important; }
[class*="k-wait-"] .k-w > span { transform: none !important; }
[class*="k-wait-"] *::after { transform: scaleX(0) !important; }
.reveal, .reveal.is-visible { opacity: 1 !important; transform: none !important; transition: none !important; }
.reveal-mask, .reveal-mask img, .reveal-mask video { clip-path: none !important; transform: none !important; transition: none !important; }
.status, .actions { animation: none !important; }
`;
