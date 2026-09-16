/* Mockup self-check. Paste into one browser eval against the finished file.
 *
 * Owns Phase 5 step 4. It replaces the manual walk: it visits every state at every device preset,
 * fires every control, and reports what a reader would have hit. It reads the harness globals
 * from shell.html, so it works unchanged on any mockup built from that shell.
 *
 * Returns an object. An empty `fail` array is a pass. Every other key is a defect list.
 */
(() => {
  const bucket = { fail: new Map(), dead: new Map(), overflow: new Map(), clipped: new Map(), blank: new Map() };
  const unreachable = [];
  const seen = new Set();
  let here = '', width = '';

  /* One finding per place, not one per width. The widths it fired at go in the message, because a
     clip that happens only at the narrow preset is the finding that matters. */
  const add = (kind, msg) => {
    const key = here + '|' + msg;
    const hit = bucket[kind].get(key) || { where: here, msg, at: [] };
    hit.at.push(width);
    bucket[kind].set(key, hit);
  };
  const drain = (kind) => [...bucket[kind].values()].map(
    (h) => `${h.where} @ ${h.at.length === widthCount ? 'all widths' : h.at.join(', ')}: ${h.msg}`);
  const label = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  const onErr = (e) => add('fail', 'uncaught: ' + (e.error && e.error.message || e.message));
  window.addEventListener('error', onErr);
  const realErr = console.error;
  console.error = (...a) => { add('fail', 'console.error: ' + a.join(' ')); realErr(...a); };

  const frame = document.getElementById('frame');
  const widths = DEVICES.map((d) => ({ id: d.id, px: d.px }));
  const widthCount = widths.length;
  const dirs = VARIANTS.length ? VARIANTS.map((v) => v.id) : [variant];

  for (const dir of dirs) {
    variant = dir;
    for (const w of widths) {
      for (const s of STATES) {
        const modes = s.ab ? ['after', 'before'] : ['after'];
        for (const mode of modes) {
          here = `${dir}/${s.id}${s.ab ? '/' + mode : ''}`;
          width = w.id;
          frameW = w.px;
          try {
            setState(s.id);
            ab = mode;
            render();
            applyWidth();
          } catch (e) {
            add('fail', 'render threw: ' + e.message);
            continue;
          }

          if (frame.textContent.trim().length < 2) add('blank', 'the frame rendered nothing');
          if (frame.scrollWidth > frame.clientWidth + 1) {
            add('overflow', `content is ${frame.scrollWidth}px inside a ${frame.clientWidth}px frame`);
          }

          /* Leaf elements only. A wrapper is "clipped" whenever any descendant overflows it, so
             walking every node reports the same defect once per ancestor. */
          for (const el of frame.querySelectorAll('*')) {
            if (el.children.length) continue;
            const r = el.getBoundingClientRect();
            if (!r.width && !r.height) continue;
            const ov = getComputedStyle(el).overflow;
            if (ov === 'auto' || ov === 'scroll') continue;
            const t = label(el);
            if (t && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
              add('clipped', `clipped "${t}"`);
            }
          }

          for (const b of frame.querySelectorAll('button, [role="button"], a')) {
            const name = label(b) || b.getAttribute('aria-label') || b.tagName;
            const go = b.dataset.go, act = b.dataset.act;
            if (!go && !act && !('inert' in b.dataset) && !b.dataset.ab && !b.dataset.var && !b.dataset.dev) {
              add('dead', `"${name}" has no data-go, data-act or data-inert`);
              continue;
            }
            if (go) {
              if (!STATES.some((x) => x.id === go)) add('fail', `"${name}" goes to unknown state "${go}"`);
              else seen.add(go);
              continue;
            }
            if (act) {
              if (!ACTIONS[act]) { add('fail', `"${name}" calls missing action "${act}"`); continue; }
              try { ACTIONS[act](b); render(); } catch (e) { add('fail', `action "${act}" threw: ` + e.message); }
              try { setState(s.id); ab = mode; render(); } catch (e) { add('fail', 're-render threw: ' + e.message); }
            }
          }
        }
      }
    }
  }

  for (const s of STATES) if (!seen.has(s.id)) unreachable.push(s.id);

  console.error = realErr;
  window.removeEventListener('error', onErr);
  try { setState(STATES[0].id); } catch (e) { /* report already carries the cause */ }

  return {
    states: STATES.length, widths: widthCount, variants: dirs.length,
    fail: drain('fail'), dead: drain('dead'), overflow: drain('overflow'),
    clipped: drain('clipped'), blank: drain('blank'),
    unreachableByClick: unreachable.filter((id) => id !== STATES[0].id),
  };
})()
