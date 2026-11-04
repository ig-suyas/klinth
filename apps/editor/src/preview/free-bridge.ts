import { clampBox, moveBox, resizeBox, snapBox } from './free-geometry.ts';

/**
 * The free layout part of the preview script (bridge.ts inserts it inside its
 * own function, so it shares `cfg`, `send`, `sectionOf`, `mark`, `selected`,
 * `editing` and `stopEditing`). The geometry helpers are the tested ones from
 * free-geometry.ts, copied in as source.
 *
 * Flow sections: a double-click on an element puts it in "move mode" (its text
 * can still be typed in place); only a drag of more than DRAG_PX after that sends `freeIntent` (with the measured
 * layout) and the element follows the pointer until the editor answers
 * (`freeDecision`). Plain clicks, text selection and short wobbles never ask.
 *
 * Free sections: click selects an item, drag moves it (snapping to other
 * items, the artboard's edges and middle, and a grid; Alt turns snapping off),
 * handles resize it (pictures and videos keep their shape; Shift locks any
 * item), arrow keys nudge it (Shift = bigger steps), double-click or Enter
 * edits text. Positions are written to the item's CSS variables at once and
 * sent as `freeChange` when the pointer is let go.
 */
export const FREE_BRIDGE_JS = `
  var FREE = (function () {
    var DRAG_PX = 8;
    var DOUBLE_MS = 500;
    var SNAP_PX = 6;
    var NUDGE = 0.5;
    var NUDGE_BIG = 5;
    var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    var clampBox = ${clampBox.toString()};
    var moveBox = ${moveBox.toString()};
    var snapBox = ${snapBox.toString()};
    var resizeBox = ${resizeBox.toString()};
    var freeable = {};
    var freeIds = {};
    (cfg.freeable || []).forEach(function (id) { freeable[id] = true; });
    (cfg.free || []).forEach(function (id) { freeIds[id] = true; });
    var item = typeof cfg.item === 'string' ? cfg.item : null;
    var lastDown = null;
    var moving = null;
    var track = null;
    var pending = null;
    var clickBlockedUntil = 0;
    var dragSentAt = 0;
    var frame = null;
    var guides = null;
    var freeEditing = null;
    var NBSP = String.fromCharCode(160);

    function idOf(section) { return section.getAttribute('data-k-section'); }
    function closest(target, css) { return target && target.closest ? target.closest(css) : null; }
    function capture(el, id) {
      if (el.setPointerCapture) { try { el.setPointerCapture(id); } catch (err) { /* not captured */ } }
    }
    function clearSelection() {
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }
    function blockClick() { clickBlockedUntil = Date.now() + 400; }

    // ---- Flow sections: measure, move mode, the question ----

    function movableAt(target) {
      var el = closest(target, '[data-k-from]');
      var section = sectionOf(el);
      if (!el || !section || !freeable[idOf(section)]) return null;
      return { el: el, section: section, from: el.getAttribute('data-k-from') };
    }
    function enterMoveMode(m) {
      endMoveMode();
      if (editing) stopEditing(true);
      moving = m;
      m.el.classList.add('k-move');
      clearSelection();
    }
    function endMoveMode() {
      if (!moving) return;
      moving.el.classList.remove('k-move');
      moving.el.classList.remove('k-pending');
      moving.el.style.removeProperty('--k-drag');
      moving = null;
    }
    function contentBox(el) {
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      var n = function (v) { return parseFloat(v) || 0; };
      var l = n(cs.paddingLeft) + n(cs.borderLeftWidth);
      var t = n(cs.paddingTop) + n(cs.borderTopWidth);
      var w = r.width - l - n(cs.paddingRight) - n(cs.borderRightWidth);
      var h = r.height - t - n(cs.paddingBottom) - n(cs.borderBottomWidth);
      return { left: r.left + l, top: r.top + t, width: Math.max(0, w), height: Math.max(0, h) };
    }
    // Every element the section shows, in px inside its .wrap, in page (stacking) order.
    // A field split over several elements (paragraphs) is measured as one box.
    function measure(section) {
      var wrap = null;
      for (var c = section.firstElementChild; c; c = c.nextElementSibling) {
        if (c.classList.contains('wrap')) { wrap = c; break; }
      }
      var box = contentBox(wrap || section);
      var groups = [];
      var byPath = {};
      var els = section.querySelectorAll('[data-k-from]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest('[data-k-clone]')) continue;
        var r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
        var path = el.getAttribute('data-k-from');
        var g = Object.prototype.hasOwnProperty.call(byPath, path) ? byPath[path] : null;
        if (!g) {
          var fs = parseFloat(window.getComputedStyle(el).fontSize);
          g = { from: path, l: r.left, t: r.top, r: r.right, b: r.bottom, fs: fs > 0 ? fs : 0 };
          byPath[path] = g;
          groups.push(g);
        } else {
          g.l = Math.min(g.l, r.left); g.t = Math.min(g.t, r.top);
          g.r = Math.max(g.r, r.right); g.b = Math.max(g.b, r.bottom);
        }
      }
      return {
        width: box.width,
        height: box.height,
        elements: groups.slice(0, 100).map(function (g) {
          var e = { from: g.from, x: g.l - box.left, y: g.t - box.top, width: g.r - g.l, height: g.b - g.t };
          if (g.fs) e.fontSize = g.fs;
          return e;
        })
      };
    }
    function decided(accept) {
      if (!pending) return;
      var el = pending.el;
      if (accept) { pending.accepted = true; return; }
      pending = null;
      if (track && track.kind === 'flow') track = null;
      el.classList.add('k-return');
      endMoveMode();
      setTimeout(function () { el.classList.remove('k-return'); }, 260);
    }

    // ---- Free sections: items, selection frame, guides ----

    function asItem(el) {
      var section = sectionOf(el);
      if (!el || !section || !freeIds[idOf(section)]) return null;
      return { el: el, section: section, board: el.parentElement, id: el.getAttribute('data-k-item') };
    }
    function itemAt(target) { return asItem(closest(target, '[data-k-item]')); }
    function findItem(id) {
      if (!id) return null;
      var els = document.querySelectorAll('[data-k-item]');
      for (var i = 0; i < els.length; i++) {
        var it = asItem(els[i]);
        if (it && it.id === id && idOf(it.section) === selected) return it;
      }
      return null;
    }
    function positioned(el) { return window.getComputedStyle(el).position === 'absolute'; }
    // Phones with their own arrangement edit the phone boxes (--px...); otherwise --x...
    function prefix(board) {
      var phone = board.classList.contains('free-phone') && window.matchMedia &&
        window.matchMedia('(max-width:37.49rem)').matches;
      return phone ? 'p' : '';
    }
    function readBox(el, p) {
      var v = function (k) { return parseFloat(el.style.getPropertyValue('--' + p + k)) || 0; };
      return { x: v('x'), y: v('y'), w: v('w'), h: v('h') };
    }
    function writeBox(el, b, p) {
      el.style.setProperty('--' + p + 'x', String(b.x));
      el.style.setProperty('--' + p + 'y', String(b.y));
      el.style.setProperty('--' + p + 'w', String(b.w));
      el.style.setProperty('--' + p + 'h', String(b.h));
    }
    function locked(el) {
      return el.classList.contains('free-image') || el.classList.contains('free-video');
    }
    function drawFrame() {
      if (frame) { frame.remove(); frame = null; }
      var marked = document.querySelectorAll('.k-item-on');
      for (var i = 0; i < marked.length; i++) marked[i].classList.remove('k-item-on');
      var it = findItem(item);
      if (!it) return;
      it.el.classList.add('k-item-on');
      if (!positioned(it.el)) return;
      frame = document.createElement('div');
      frame.className = 'k-frame';
      frame.setAttribute('aria-hidden', 'true');
      for (var h = 0; h < HANDLES.length; h++) {
        var handle = document.createElement('span');
        handle.className = 'k-handle';
        handle.setAttribute('data-h', HANDLES[h]);
        frame.appendChild(handle);
      }
      it.board.appendChild(frame);
      syncFrame(it);
    }
    function syncFrame(it) {
      if (!frame) return;
      var b = readBox(it.el, prefix(it.board));
      writeBox(frame, b, '');
    }
    function selectItem(it) {
      var sid = it ? idOf(it.section) : selected;
      if (it && sid !== selected) { mark(sid, false); send({ type: 'select', id: sid }); }
      var id = it ? it.id : null;
      var changed = id !== item;
      item = id;
      drawFrame();
      if (changed && sid) send({ type: 'freeSelect', id: sid, item: id });
    }
    function lines(it) {
      var p = prefix(it.board);
      var xs = [0, 50, 100];
      var ys = [0, 50, 100];
      var els = it.board.querySelectorAll('[data-k-item]');
      for (var i = 0; i < els.length; i++) {
        if (els[i] === it.el) continue;
        var b = readBox(els[i], p);
        xs.push(b.x, b.x + b.w / 2, b.x + b.w);
        ys.push(b.y, b.y + b.h / 2, b.y + b.h);
      }
      return { xs: xs, ys: ys };
    }
    function showGuides(board, gx, gy) {
      if (!guides) {
        guides = { x: document.createElement('div'), y: document.createElement('div') };
        guides.x.className = 'k-guide k-guide-x';
        guides.y.className = 'k-guide k-guide-y';
        guides.x.setAttribute('aria-hidden', 'true');
        guides.y.setAttribute('aria-hidden', 'true');
      }
      if (guides.x.parentNode !== board) { board.appendChild(guides.x); board.appendChild(guides.y); }
      guides.x.hidden = gx === null;
      guides.y.hidden = gy === null;
      if (gx !== null) guides.x.style.left = gx + '%';
      if (gy !== null) guides.y.style.top = gy + '%';
    }
    function hideGuides() {
      if (!guides) return;
      guides.x.remove();
      guides.y.remove();
    }

    // ---- Text in a free section ----

    function textOf(el) {
      return (el.innerText || el.textContent || '').split(NBSP).join(' ').trim();
    }
    function startFreeEdit(it) {
      if (!it.el.classList.contains('free-text')) return;
      stopFreeEdit(true);
      freeEditing = { el: it.el, section: it.section, id: it.id, original: it.el.cloneNode(true), before: textOf(it.el) };
      it.el.setAttribute('contenteditable', 'plaintext-only');
      it.el.classList.add('k-editing');
      it.el.focus();
    }
    function stopFreeEdit(save) {
      if (!freeEditing) return;
      var cur = freeEditing;
      freeEditing = null;
      cur.el.removeAttribute('contenteditable');
      cur.el.classList.remove('k-editing');
      var text = textOf(cur.el);
      if (!save || !text) { cur.el.replaceWith(cur.original); return; }
      if (text !== cur.before) send({ type: 'freeText', id: idOf(cur.section), item: cur.id, text: text });
    }

    // ---- Pointer ----

    function freeDown(e) {
      var handle = closest(e.target, '.k-handle');
      var hit = handle ? findItem(item) : null;
      if (hit) {
        var hp = prefix(hit.board);
        track = { kind: 'resize', id: e.pointerId, x0: e.clientX, y0: e.clientY, it: hit, p: hp,
          handle: handle.getAttribute('data-h') || 'se', start: readBox(hit.el, hp),
          rect: hit.board.getBoundingClientRect(), lock: locked(hit.el), started: false };
        capture(handle, e.pointerId);
        return true;
      }
      var it = itemAt(e.target);
      if (!it) {
        if (item && closest(e.target, '.free-board')) selectItem(null);
        return false;
      }
      if (freeEditing && freeEditing.el === it.el) return true;
      if (freeEditing) stopFreeEdit(true);
      selectItem(it);
      if (!positioned(it.el)) return true;
      var p = prefix(it.board);
      track = { kind: 'move', id: e.pointerId, x0: e.clientX, y0: e.clientY, it: it, p: p,
        start: readBox(it.el, p), rect: it.board.getBoundingClientRect(), targets: lines(it), started: false };
      capture(it.el, e.pointerId);
      return true;
    }
    function freeMove(e, dx, dy) {
      var t = track;
      if (!t.started) {
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        t.started = true;
        t.it.board.classList.add('k-dragging');
      }
      var w = t.rect.width || 1;
      var h = t.rect.height || 1;
      var b;
      if (t.kind === 'move') {
        b = moveBox(t.start, (dx / w) * 100, (dy / h) * 100);
        if (e.altKey) hideGuides();
        else {
          var s = snapBox(b, t.targets, dx ? (SNAP_PX / w) * 100 : 0, dy ? (SNAP_PX / h) * 100 : 0);
          b = s.box;
          showGuides(t.it.board, s.gx, s.gy);
        }
      } else {
        b = resizeBox(t.start, t.handle, (dx / w) * 100, (dy / h) * 100, t.lock || e.shiftKey);
      }
      writeBox(t.it.el, b, t.p);
      syncFrame(t.it);
    }
    function freeUp(t) {
      if (!t.started) return;
      t.it.board.classList.remove('k-dragging');
      hideGuides();
      blockClick();
      var message = { type: 'freeChange', id: idOf(t.it.section), item: t.it.id, box: clampBox(readBox(t.it.el, t.p)) };
      if (t.p) message.phone = true;
      send(message);
    }

    function down(e) {
      if (typeof e.button === 'number' && e.button > 0) return;
      if (pending) return;
      if (freeDown(e)) { lastDown = null; return; }
      var now = Date.now();
      var prev = lastDown;
      var m = movableAt(e.target);
      lastDown = m ? { el: m.el, t: now, x: e.clientX, y: e.clientY } : null;
      if (moving && (!m || moving.el !== m.el)) endMoveMode();
      if (!m) return;
      var second = prev && prev.el === m.el && now - prev.t <= DOUBLE_MS &&
        Math.abs(prev.x - e.clientX) <= 10 && Math.abs(prev.y - e.clientY) <= 10;
      if (second && !moving) enterMoveMode(m);
      if (!moving) return;
      lastDown = null;
      track = { kind: 'flow', id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, started: false };
      capture(m.el, e.pointerId);
    }
    function move(e) {
      if (!track || e.pointerId !== track.id) return;
      var dx = e.clientX - track.x0;
      var dy = e.clientY - track.y0;
      if (track.kind !== 'flow') { freeMove(e, dx, dy); return; }
      if (!moving) return;
      if (!track.started) {
        if (Math.sqrt(dx * dx + dy * dy) <= DRAG_PX) return;
        track.started = true;
        if (editing) stopEditing(true);
        clearSelection();
        // Measure before anything moves: these are the positions the free layout starts from.
        var layout = measure(moving.section);
        pending = { el: moving.el, accepted: false };
        moving.el.classList.add('k-pending');
        send({ type: 'freeIntent', id: idOf(moving.section), from: moving.from, dx: dx, dy: dy, measure: layout });
      }
      track.dx = dx;
      track.dy = dy;
      moving.el.style.setProperty('--k-drag', dx + 'px ' + dy + 'px');
      // The editor keeps the latest position, in case the release happens outside this frame.
      var now = Date.now();
      if (now - dragSentAt > 50) { dragSentAt = now; send({ type: 'freeDrag', dx: dx, dy: dy }); }
    }
    function up(e, cancelled) {
      if (!track || e.pointerId !== track.id) return;
      var t = track;
      track = null;
      if (t.kind !== 'flow') { freeUp(t); return; }
      if (!t.started) return;
      blockClick();
      var dx = cancelled ? t.dx : e.clientX - t.x0;
      var dy = cancelled ? t.dy : e.clientY - t.y0;
      send({ type: 'freeDrop', dx: dx, dy: dy });
    }

    // ---- What bridge.ts calls ----

    function click(e) {
      if (Date.now() < clickBlockedUntil || pending) { e.preventDefault(); return true; }
      // A click on an element in move mode still edits its text (bridge.ts does that), so a
      // quick "select, then click to type" works; only a drag afterwards asks.
      if (freeEditing && freeEditing.el.contains(e.target)) return true;
      if (freeEditing) stopFreeEdit(true);
      if (itemAt(e.target)) { e.preventDefault(); return true; }
      return false;
    }
    function dblclick(e) {
      var it = itemAt(e.target);
      if (it) { startFreeEdit(it); return true; }
      var m = movableAt(e.target);
      if (!m) return false;
      if (!moving || moving.el !== m.el) enterMoveMode(m);
      clearSelection();
      return true;
    }
    function keydown(e) {
      if (freeEditing) {
        var body = freeEditing.el.classList.contains('free-body');
        if (e.key === 'Escape') { e.preventDefault(); stopFreeEdit(false); }
        else if (e.key === 'Enter' && !e.shiftKey && !body) { e.preventDefault(); stopFreeEdit(true); }
        return true;
      }
      if (editing) return false;
      var key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        send({ type: 'history', action: key === 'y' || e.shiftKey ? 'redo' : 'undo' });
        return true;
      }
      if (e.key === 'Escape') {
        if (moving && !pending) { endMoveMode(); return true; }
        if (item) { selectItem(null); return true; }
        return false;
      }
      var it = findItem(item);
      if (!it) return false;
      if (e.key === 'Enter') { e.preventDefault(); startFreeEdit(it); return true; }
      var step = e.shiftKey ? NUDGE_BIG : NUDGE;
      var dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      var dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if ((!dx && !dy) || !positioned(it.el)) return false;
      e.preventDefault();
      var p = prefix(it.board);
      var b = moveBox(readBox(it.el, p), dx, dy);
      writeBox(it.el, b, p);
      syncFrame(it);
      var message = { type: 'freeChange', id: idOf(it.section), item: it.id, box: b, nudge: true };
      if (p) message.phone = true;
      send(message);
      return true;
    }
    function focusout(e) {
      if (freeEditing && e.target === freeEditing.el) stopFreeEdit(true);
    }
    function fromEditor(id) {
      item = id;
      drawFrame();
      var it = findItem(item);
      if (it && it.el.scrollIntoView) it.el.scrollIntoView({ block: 'nearest' });
    }

    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', function (e) { up(e, false); });
    document.addEventListener('pointercancel', function (e) { up(e, true); });
    document.addEventListener('dragstart', function (e) {
      if (moving || itemAt(e.target)) e.preventDefault();
    });
    // A small "Free layout" label on each free section (preview only).
    var all = document.querySelectorAll('[data-k-section]');
    for (var s = 0; s < all.length; s++) {
      if (!freeIds[idOf(all[s])]) continue;
      var badge = document.createElement('span');
      badge.className = 'k-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'Free layout';
      all[s].appendChild(badge);
    }
    window.addEventListener('resize', function () { var it = findItem(item); if (it) syncFrame(it); });

    return { click: click, dblclick: dblclick, keydown: keydown, focusout: focusout,
      decided: decided, select: fromEditor, redraw: drawFrame };
  })();
`;

/** Preview-only looks for the free layout: move mode, selection frame, handles, guides, badge. */
export const FREE_BRIDGE_CSS = `
[data-k-from].k-move { outline: 2px dashed #c2410c; outline-offset: 3px; cursor: move; user-select: none; -webkit-user-select: none; touch-action: none; }
[data-k-from].k-move.k-editing { cursor: text; user-select: text; -webkit-user-select: text; }
.k-pending { translate: var(--k-drag, 0 0); position: relative; z-index: 2147483000; box-shadow: 0 18px 40px -18px rgba(0, 0, 0, .45); cursor: grabbing; }
.k-return { transition: translate .22s ease; }
@media (prefers-reduced-motion: reduce) { .k-return { transition: none; } }
.block-free [data-k-item] { cursor: move; user-select: none; -webkit-user-select: none; touch-action: none; }
.block-free [data-k-item].k-editing { cursor: text; user-select: text; -webkit-user-select: text; }
.block-free [data-k-item]:hover { box-shadow: 0 0 0 1px rgba(194, 65, 12, .5); }
.free-board > .k-frame { position: absolute; left: calc(var(--x) * 1%); top: calc(var(--y) * 1%); width: calc(var(--w) * 1%); height: calc(var(--h) * 1%); z-index: 10000; outline: 2px solid #c2410c; pointer-events: none; }
.k-item-on:not(.free-board > *) { outline: 2px solid #c2410c; outline-offset: 2px; }
.k-handle { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; box-sizing: border-box; border: 2px solid #c2410c; border-radius: 3px; background: #fffdf8; pointer-events: auto; touch-action: none; }
.k-handle[data-h="nw"] { left: 0; top: 0; cursor: nwse-resize; }
.k-handle[data-h="n"] { left: 50%; top: 0; cursor: ns-resize; }
.k-handle[data-h="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
.k-handle[data-h="e"] { left: 100%; top: 50%; cursor: ew-resize; }
.k-handle[data-h="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
.k-handle[data-h="s"] { left: 50%; top: 100%; cursor: ns-resize; }
.k-handle[data-h="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
.k-handle[data-h="w"] { left: 0; top: 50%; cursor: ew-resize; }
.free-board.k-dragging { background-image: linear-gradient(to right, rgba(194, 65, 12, .1) 1px, transparent 1px), linear-gradient(to bottom, rgba(194, 65, 12, .1) 1px, transparent 1px); background-size: 2.5% 2.5%; }
.k-guide { position: absolute; z-index: 10001; pointer-events: none; background: #db2777; }
.k-guide[hidden] { display: none; }
.k-guide-x { top: 0; bottom: 0; width: 1px; }
.k-guide-y { left: 0; right: 0; height: 1px; }
.k-badge { position: absolute; top: 8px; left: 8px; z-index: 10002; padding: 3px 8px; border-radius: 999px; background: #1d1b18; color: #fffdf8; font: 600 11px/1.3 system-ui, sans-serif; letter-spacing: .02em; pointer-events: none; }
`;
