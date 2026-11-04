/**
 * The small script that runs inside the sandboxed preview frame. It has no
 * access to the editor: it only talks to the parent through `postMessage`.
 * Sent to the parent: `ready`, `select`, `edit`, `scroll`. Received: `select`,
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
    window.parent.postMessage(message, cfg.origin);
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

  function startEditing(el, section) {
    var name = el.getAttribute('data-k-field');
    editing = { el: el, section: section, field: name, original: el.cloneNode(true), before: fieldValue(section, name) };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.classList.add('k-editing');
    el.focus();
  }

  // Capture phase: runs before the site script, which then sees defaultPrevented
  // and leaves video players unloaded in the preview.
  document.addEventListener('click', function (e) {
    var target = e.target;
    // Links and buttons never navigate away from the preview.
    if (target.closest('a, button, summary')) e.preventDefault();
    if (editing && editing.el.contains(target)) return;
    stopEditing(true);
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
  }, { passive: true });

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
    if (e.data.source === 'klinth-code' && e.source !== window.parent) { fitCodeFrame(e); return; }
    if (e.source !== window.parent || e.data.source !== 'klinth-editor') return;
    if (e.data.type === 'select') mark(e.data.id, true);
    else if (e.data.type === 'assets') showAssets(e.data.items);
  });

  if (cfg.scrollY) window.scrollTo(0, cfg.scrollY);
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
`;

/** Preview-only pieces of the page (custom code box). Thumbnails get it too. */
export const PREVIEW_CSS = `
.code-note { margin: 0 0 .75rem; font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: .02em; color: var(--muted); }
.code-frame { display: block; width: 100%; height: 320px; border: 1px dashed var(--line); border-radius: min(var(--radius), 12px); background: transparent; }
.code-empty { padding: 2.5rem 1rem; text-align: center; border: 1px dashed var(--line); border-radius: min(var(--radius), 12px); font: 500 14px/1.4 system-ui, sans-serif; color: var(--muted); }
`;

/** After the first load, reloads skip the scroll reveal so edits do not flicker. */
export const CALM_CSS = `
.reveal, .reveal.is-visible { opacity: 1 !important; transform: none !important; transition: none !important; }
.reveal-mask, .reveal-mask img, .reveal-mask video { clip-path: none !important; transform: none !important; transition: none !important; }
.status, .actions { animation: none !important; }
`;
