/* AEO · GEO · SEO Generator — UI layer. Vanilla, no build step. */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, html = '') => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  if (html) node.innerHTML = html;
  return node;
};

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ICON = {
  pass: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/></svg>',
  warn: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  fail: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  info: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  chevron: '<svg class="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 12l4 4 4-4M5 19h14"/></svg>',
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  open: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 10.5V8a4 4 0 0 1 7.5-2"/><rect x="5" y="10.5" width="14" height="9.5" rx="2"/></svg>',
  file: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  person: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>',
  input: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5 17.5 10.5"/></svg>',
  fork: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 21V13"/><path d="M12 13 5 8V3"/><path d="m12 13 7-5V3"/><circle cx="12" cy="21" r="1.4"/></svg>',
};

const STATUS_LABEL = { pass: 'Passing', warn: 'Needs work', fail: 'Failing', info: 'Info' };

const state = {
  report: null,
  generated: null,
  profile: {},
  tab: 'overview',
  filters: { seo: 'all', aeo: 'all', geo: 'all', overview: 'all' },
  artifactId: 'schema-graph',
  loading: false,
};

/* ------------------------------------------------------------- helpers */

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.dataset.show = 'true';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (node.dataset.show = 'false'), 1900);
}

function scoreColor(score) {
  if (score >= 80) return 'var(--pass)';
  if (score >= 55) return 'var(--warn)';
  return 'var(--fail)';
}

function ring(score, size = 62, stroke = 6) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return `
    <div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${scoreColor(score)}" stroke-width="${stroke}"
                stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <span class="ring-val" style="font-size:${Math.round(size / 3.4)}px">${score}</span>
    </div>`;
}

const HIGHLIGHT = {
  html: {
    re: /(&lt;!--[\s\S]*?--&gt;)|(&quot;(?:(?!&quot;)[\s\S])*?&quot;)|(&lt;\/?[a-zA-Z][\w:.-]*)/g,
    classes: ['c', 's', 'k'],
  },
  json: {
    re: /(&quot;(?:(?!&quot;)[\s\S])*?&quot;(?=\s*:))|(&quot;(?:(?!&quot;)[\s\S])*?&quot;)|(\b-?\d+(?:\.\d+)?\b)/g,
    classes: ['k', 's', 't'],
  },
  markdown: {
    re: /(^#{1,6} .*$)|(&lt;!--[\s\S]*?--&gt;)|(\[[^\]]*\]\([^)]*\))/gm,
    classes: ['k', 'c', 's'],
  },
  text: {
    re: /(^#.*$)|(^(?:User-agent|Allow|Disallow|Sitemap|Crawl-delay))/gm,
    classes: ['c', 'k'],
  },
};

function highlight(code, lang) {
  const esc = escapeHtml(code);
  const rule = HIGHLIGHT[lang];
  if (!rule) return esc;
  return esc.replace(rule.re, (match, ...groups) => {
    const idx = groups.slice(0, rule.classes.length).findIndex((g) => g !== undefined);
    return idx < 0 ? match : `<span class="${rule.classes[idx]}">${match}</span>`;
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const ta = el('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied to clipboard');
  }
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${filename}`);
}

const num = (n) => new Intl.NumberFormat().format(n);

/* --------------------------------------------------------------- checks */

function checkRow(check) {
  const node = el('div', { class: 'check', 'data-open': 'false' });
  const head = el('button', { class: 'check-head', type: 'button' });
  head.innerHTML = `
    <span class="status-icon" title="${STATUS_LABEL[check.status]}">${ICON[check.status]}</span>
    <span>
      <span class="check-title">${escapeHtml(check.title)}</span>
      <div class="check-found">${escapeHtml(check.found)}</div>
      <div class="tagline">
        <span class="tag st-${check.status}">${STATUS_LABEL[check.status]}</span>
        <span class="tag cat">${check.category}</span>
        <span class="tag ${check.impact}">${check.impact} impact</span>
      </div>
    </span>
    ${ICON.chevron}`;
  head.addEventListener('click', () => {
    node.dataset.open = node.dataset.open === 'true' ? 'false' : 'true';
  });

  const body = el('div', { class: 'check-body' });
  body.innerHTML = `<p class="fix">${escapeHtml(check.fix)}</p>`;
  if (check.evidence?.length) {
    const ul = el('ul', { class: 'evidence' });
    for (const item of check.evidence.slice(0, 8)) ul.appendChild(el('li', {}, escapeHtml(item)));
    body.appendChild(ul);
  }
  if (check.snippet) {
    const pre = el('pre', { class: 'code' });
    pre.innerHTML = highlight(check.snippet, 'html');
    pre.style.padding = '10px 12px';
    pre.style.border = '1px solid var(--line-soft)';
    pre.style.borderRadius = '8px';
    pre.style.marginTop = '10px';
    body.appendChild(pre);
  }
  node.append(head, body);
  return node;
}

function checkList(checks, { emptyText = 'Nothing here.' } = {}) {
  const card = el('div', { class: 'card' });
  if (!checks.length) {
    card.appendChild(el('div', { class: 'empty' }, escapeHtml(emptyText)));
    return card;
  }
  for (const c of checks) card.appendChild(checkRow(c));
  return card;
}

function filterBar(category, onChange) {
  const bar = el('div', { class: 'filters' });
  const current = state.filters[category];
  for (const [key, label] of [['all', 'All'], ['fail', 'Failing'], ['warn', 'Needs work'], ['pass', 'Passing']]) {
    const chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(current === key) }, label);
    chip.addEventListener('click', () => {
      state.filters[category] = key;
      onChange();
    });
    bar.appendChild(chip);
  }
  return bar;
}

/* -------------------------------------------------------------- panels */

function vitalsCard(report) {
  const p = report.page;
  const ctx = report.context;
  const rows = [
    ['HTTP', `${report.http.status} · ${report.http.timingMs} ms`],
    ['Page weight', `${(report.http.bytes / 1024).toFixed(0)} KB`],
    ['Words', num(p.wordCount)],
    ['Readability', p.readability.flesch != null ? `Flesch ${p.readability.flesch}` : '—'],
    ['Headings', `${p.headings.length} (${p.h1s.length} H1)`],
    ['Questions', `${p.questionHeadings.length} question headings`],
    ['Images', `${p.images.total} · ${p.images.missing.length} without alt`],
    ['Links', `${p.links.internal.length} internal / ${p.links.external.length} external`],
    ['Structured data', p.jsonLdTypes.length ? p.jsonLdTypes.join(', ') : 'none'],
    ['robots.txt', ctx.robotsFound ? 'found' : 'missing'],
    ['Sitemap', ctx.sitemap.found ? `${num(ctx.sitemap.urlCount || 0)} URLs` : 'missing'],
    ['llms.txt', ctx.llmsTxtFound ? 'found' : 'missing'],
  ];
  const dl = el('dl', { class: 'vitals' });
  for (const [k, v] of rows) {
    dl.appendChild(
      el('div', { class: 'vital' }, `<dt>${escapeHtml(k)}</dt><dd class="${String(v).length > 22 ? 'small' : ''}">${escapeHtml(v)}</dd>`),
    );
  }
  return dl;
}

function crawlerCard(report) {
  const card = el('div', { class: 'card' });
  card.appendChild(
    el(
      'div',
      { style: 'padding:16px 18px;border-bottom:1px solid var(--line-soft)' },
      `<div class="section-title" style="margin:0"><h2>AI crawler access</h2><p>from ${escapeHtml(report.context.robotsUrl || 'no robots.txt')}</p></div>`,
    ),
  );
  const grid = el('div', { class: 'agents', style: 'padding:14px' });
  for (const agent of report.context.agents) {
    const verdict = report.context.aiVerdicts[agent.id];
    grid.appendChild(
      el(
        'div',
        { class: 'agent' },
        `<span class="status-icon">${verdict.allowed ? ICON.open : ICON.lock}</span>
         <span><b>${escapeHtml(agent.id)}</b><small><span class="${verdict.allowed ? 'yes' : 'no'}">${verdict.allowed ? 'allowed' : 'blocked'}</span> · ${escapeHtml(agent.vendor)}</small></span>`,
      ),
    );
  }
  card.appendChild(grid);
  return card;
}

function overviewPanel(report) {
  const frag = document.createDocumentFragment();

  frag.appendChild(el('div', { class: 'section-title' }, '<h2>Page vitals</h2><p>what the crawler actually received</p>'));
  frag.appendChild(vitalsCard(report));

  const grid = el('div', { class: 'grid-2', style: 'margin-top:26px' });

  const left = el('div');
  left.appendChild(
    el(
      'div',
      { class: 'section-title' },
      `<h2>Fix these first</h2><p>${report.counts.fail} failing · ${report.counts.warn} weak · ${report.counts.pass} passing</p>`,
    ),
  );
  left.appendChild(checkList(report.priorities, { emptyText: 'Nothing failing. Move on to the Generate tab and ship the schema.' }));
  grid.appendChild(left);

  const right = el('div');
  right.appendChild(crawlerCard(report));

  const notes = el('div', { class: 'card', style: 'margin-top:16px;padding:16px 18px' });
  const missing = [
    !report.context.llmsTxtFound && 'Publish /llms.txt (Generate → AI access)',
    !report.context.sitemap.found && 'Publish /sitemap.xml and link it from robots.txt',
    !report.page.jsonLdTypes.some((t) => /FAQPage/i.test(t)) && 'Add FAQPage markup (Generate → Structured data)',
    !report.page.jsonLdTypes.some((t) => /Organization|Person/i.test(t)) && 'Add Organization schema with sameAs links',
    report.page.wordCount < 300 && 'Server-render the copy — most AI crawlers do not run JavaScript',
  ].filter(Boolean);
  notes.innerHTML = `<div class="section-title" style="margin-bottom:10px"><h2>Quick wins</h2><p>ready-made in Generate</p></div>`;
  const ul = el('ul', { style: 'margin:0;padding-left:18px;color:var(--text-dim);font-size:13.5px;display:flex;flex-direction:column;gap:6px' });
  if (!missing.length) ul.appendChild(el('li', {}, 'The structural basics are already in place.'));
  for (const m of missing) ul.appendChild(el('li', {}, escapeHtml(m)));
  notes.appendChild(ul);

  // The files are the floor. Say so here, before anyone mistakes a download for a finished job.
  const outstanding = handoverCount();
  if (outstanding) {
    const nudge = el('p', { class: 'hand-lede', style: 'margin:14px 0 0' });
    const link = el('button', { class: 'linkish', type: 'button' }, `${outstanding} item${outstanding === 1 ? '' : 's'} no generated file can fix`);
    link.addEventListener('click', () => {
      state.tab = 'handover';
      render();
    });
    nudge.append(link, document.createTextNode(' — writing, engineering and decisions. See What’s left.'));
    notes.appendChild(nudge);
  }
  right.appendChild(notes);

  grid.appendChild(right);
  frag.appendChild(grid);
  return frag;
}

const CATEGORY_BLURB = {
  seo: 'Can engines crawl, understand and rank this page?',
  aeo: 'Can a machine lift a correct, self-contained answer off it?',
  geo: 'Will a language model ingest it, trust it, and cite it by name?',
};

function categoryPanel(report, category) {
  const frag = document.createDocumentFragment();
  const all = report.checks.filter((c) => c.category === category);
  const filter = state.filters[category];
  const shown = filter === 'all' ? all : all.filter((c) => c.status === filter);

  frag.appendChild(
    el(
      'div',
      { class: 'section-title' },
      `<h2>${category.toUpperCase()} — ${report.scores[category]}/100 (grade ${report.grades[category]})</h2><p>${CATEGORY_BLURB[category]}</p>`,
    ),
  );
  frag.appendChild(filterBar(category, render));
  frag.appendChild(checkList(shown, { emptyText: 'No checks match this filter.' }));
  return frag;
}

/* ------------------------------------------------------------ generate */

function metaDiffCard(generated) {
  const card = el('div', { class: 'card', style: 'margin-bottom:20px;overflow:hidden' });
  const table = el('table', { class: 'diff' });
  table.innerHTML = `<thead><tr><th style="width:130px">Field</th><th>Current</th><th>Proposed</th></tr></thead>`;
  const tbody = el('tbody');
  for (const row of generated.meta.diff) {
    tbody.appendChild(
      el(
        'tr',
        {},
        `<td><b>${escapeHtml(row.field)}</b></td>
         <td class="now">${row.current ? escapeHtml(row.current) : '<i>missing</i>'}<div class="len">${row.currentLength} chars</div></td>
         <td class="next">${escapeHtml(row.proposed)}<div class="len">${row.proposedLength} chars</div></td>`,
      ),
    );
  }
  table.appendChild(tbody);
  card.appendChild(table);
  return card;
}

function generatePanel(report, generated) {
  const frag = document.createDocumentFragment();
  frag.appendChild(
    el(
      'div',
      { class: 'section-title' },
      '<h2>Generated enhancements</h2><p>tuned to this page — set brand and author details in the Profile tab</p>',
    ),
  );
  frag.appendChild(metaDiffCard(generated));

  const wrap = el('div', { class: 'gen' });
  const rail = el('div', { class: 'gen-rail' });
  const groups = new Map();
  for (const a of generated.artifacts) {
    if (!groups.has(a.group)) groups.set(a.group, []);
    groups.get(a.group).push(a);
  }
  if (!generated.artifacts.some((a) => a.id === state.artifactId)) state.artifactId = generated.artifacts[0].id;

  for (const [group, items] of groups) {
    const box = el('div', { class: 'rail-group' });
    box.appendChild(el('h5', {}, escapeHtml(group)));
    for (const item of items) {
      const btn = el('button', { class: 'rail-item', type: 'button', 'aria-current': String(item.id === state.artifactId) }, escapeHtml(item.label));
      btn.addEventListener('click', () => {
        state.artifactId = item.id;
        render();
      });
      box.appendChild(btn);
    }
    rail.appendChild(box);
  }
  wrap.appendChild(rail);

  const artifact = generated.artifacts.find((a) => a.id === state.artifactId);
  const pane = el('div', { class: 'card', style: 'overflow:hidden' });
  const head = el('div', { class: 'code-head' });
  head.innerHTML = `<div><h3>${escapeHtml(artifact.label)}</h3><p>${escapeHtml(artifact.description)}</p></div>`;
  const actions = el('div', { class: 'code-actions' });
  const copyBtn = el('button', { class: 'ghost-btn', type: 'button' }, `${ICON.copy} Copy`);
  copyBtn.addEventListener('click', () => copyText(artifact.code));
  const dlBtn = el('button', { class: 'ghost-btn', type: 'button' }, `${ICON.download} ${escapeHtml(artifact.filename)}`);
  dlBtn.addEventListener('click', () => download(artifact.filename, artifact.code));
  actions.append(copyBtn, dlBtn);
  head.appendChild(actions);
  pane.appendChild(head);

  const pre = el('pre', { class: 'code' });
  pre.innerHTML = highlight(artifact.code, artifact.language);
  pane.appendChild(pre);
  wrap.appendChild(pane);

  frag.appendChild(wrap);
  return frag;
}

/* ------------------------------------------------------------ handover */

function openArtifact(id) {
  state.artifactId = id;
  state.tab = 'generate';
  render();
}

/** Same collapsible shape as a check row, but for handover items. */
function handRow({ icon, title, sub, tags = [], body }) {
  const node = el('div', { class: 'check', 'data-open': 'false' });
  const head = el('button', { class: 'check-head', type: 'button' });
  head.innerHTML = `
    <span class="status-icon">${icon}</span>
    <span>
      <span class="check-title">${escapeHtml(title)}</span>
      ${sub ? `<div class="check-found">${escapeHtml(sub)}</div>` : ''}
      <div class="tagline">${tags.map((t) => `<span class="tag ${t.class || ''}">${escapeHtml(t.label)}</span>`).join('')}</div>
    </span>
    ${ICON.chevron}`;
  head.addEventListener('click', () => {
    node.dataset.open = node.dataset.open === 'true' ? 'false' : 'true';
  });
  const bodyNode = el('div', { class: 'check-body' });
  bodyNode.appendChild(body);
  node.append(head, bodyNode);
  return node;
}

function shippedRow(item) {
  const body = document.createDocumentFragment();
  body.appendChild(el('p', { class: 'fix' }, `<b>Where it goes:</b> ${escapeHtml(item.paste)}`));
  if (item.caveat) body.appendChild(el('p', { class: 'fix' }, `<b>Careful:</b> ${escapeHtml(item.caveat)}`));
  if (item.blockers.length) {
    const ul = el('ul', { class: 'evidence' });
    for (const b of item.blockers) ul.appendChild(el('li', { class: 'blocker' }, escapeHtml(b)));
    body.appendChild(ul);
  }
  const btn = el('button', { class: 'ghost-btn', type: 'button', style: 'margin-top:12px' }, `${ICON.file} Open ${escapeHtml(item.filename)}`);
  btn.addEventListener('click', () => openArtifact(item.artifactId));
  body.appendChild(btn);

  return handRow({
    icon: ICON.file,
    title: item.title,
    sub: item.found,
    tags: [
      { label: item.filename, class: 'file' },
      { label: item.category, class: 'cat' },
      ...(item.blockers.length ? [{ label: `${item.blockers.length} blocker${item.blockers.length === 1 ? '' : 's'}`, class: 'st-warn' }] : []),
    ],
    body,
  });
}

function yoursRow(item) {
  const body = document.createDocumentFragment();
  body.appendChild(el('p', { class: 'fix' }, `<b>Do:</b> ${escapeHtml(item.fix)}`));
  body.appendChild(el('p', { class: 'fix' }, `<b>Why no file fixes this:</b> ${escapeHtml(item.why)}`));
  if (item.assist) {
    const btn = el('button', { class: 'ghost-btn', type: 'button' }, `${ICON.file} Starting point: ${escapeHtml(item.assist.filename)}`);
    btn.addEventListener('click', () => openArtifact(item.assist.id));
    body.appendChild(btn);
  }
  return handRow({
    icon: ICON.person,
    title: item.title,
    sub: item.found,
    tags: [
      { label: item.owner, class: 'owner' },
      { label: `~${item.effort}`, class: '' },
      { label: item.category, class: 'cat' },
      { label: `${item.impact} impact`, class: item.impact },
    ],
    body,
  });
}

function decisionCard(d) {
  const card = el('div', { class: 'decision' });
  card.innerHTML = `
    <h3>${escapeHtml(d.title)}</h3>
    <p class="state">${escapeHtml(d.state)}</p>
    <p>${escapeHtml(d.question)}</p>
    <ul class="options">
      ${d.options.map(([label, detail]) => `<li><b>${escapeHtml(label)}</b> — ${escapeHtml(detail)}</li>`).join('')}
    </ul>
    <p class="note">${escapeHtml(d.note)}</p>`;
  return card;
}

function handoverGroup(title, lede, rows, emptyText) {
  const box = el('div', { class: 'hand-group' });
  box.appendChild(el('div', { class: 'section-title' }, `<h2>${escapeHtml(title)}</h2>`));
  box.appendChild(el('p', { class: 'hand-lede' }, escapeHtml(lede)));
  const card = el('div', { class: 'card' });
  if (!rows.length) card.appendChild(el('div', { class: 'empty' }, escapeHtml(emptyText)));
  for (const row of rows) card.appendChild(row);
  box.appendChild(card);
  return box;
}

function handoverPanel(report, generated) {
  const h = generated?.handover;
  const frag = document.createDocumentFragment();
  if (!h) {
    frag.appendChild(el('div', { class: 'card' }, '<div class="empty">Run a scan to see the handover.</div>'));
    return frag;
  }

  frag.appendChild(
    el(
      'div',
      { class: 'section-title' },
      `<h2>What we ship, and what stays yours</h2><p>${h.counts.openTotal} open finding${h.counts.openTotal === 1 ? '' : 's'} on this page</p>`,
    ),
  );
  frag.appendChild(
    el(
      'p',
      { class: 'hand-lede' },
      'The files are the floor, not the ceiling. Machine-readability takes an afternoon; being worth citing takes a quarter. Here is the honest split.',
    ),
  );

  const dl = el('dl', { class: 'vitals' });
  const stats = [
    ['Closed by our files', String(h.counts.shipped)],
    ['Waiting on your input', String(h.counts.inputs + h.placeholders.length)],
    ['TODO placeholders', String(h.counts.placeholders)],
    ['Only you can do', String(h.counts.yours)],
    ['Decisions to make', String(h.decisions.length)],
    ['Blocked files', String(h.counts.blocked)],
  ];
  for (const [k, v] of stats) dl.appendChild(el('div', { class: 'vital' }, `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`));
  frag.appendChild(dl);

  frag.appendChild(
    handoverGroup(
      '1 — Closed by the generated files',
      'Paste these and the finding goes away. This is the fast half, and it is the half that gets mistaken for the whole job.',
      h.shipped.map(shippedRow),
      'No open finding on this page is fixable by markup alone.',
    ),
  );

  const inputRows = [
    ...h.inputs.map((i) =>
      handRow({
        icon: ICON.input,
        title: i.label,
        sub: `Unlocks: ${i.unlocks}`,
        tags: [{ label: 'Profile tab', class: 'owner' }, { label: '~5 min', class: '' }],
        body: (() => {
          const body = document.createDocumentFragment();
          body.appendChild(
            el('p', { class: 'fix' }, 'Fill this in on the Profile tab and every artifact regenerates against it. Until then the generated files use a fallback that is valid but not true.'),
          );
          const btn = el('button', { class: 'ghost-btn', type: 'button' }, 'Open Profile');
          btn.addEventListener('click', () => {
            state.tab = 'profile';
            render();
          });
          body.appendChild(btn);
          return body;
        })(),
      }),
    ),
    ...h.placeholders.map((p) =>
      handRow({
        icon: ICON.input,
        title: `${p.count} TODO placeholder${p.count === 1 ? '' : 's'} in ${p.filename}`,
        sub: p.label,
        tags: [{ label: p.filename, class: 'file' }, { label: 'Editorial', class: 'owner' }],
        body: (() => {
          const body = document.createDocumentFragment();
          body.appendChild(
            el(
              'p',
              { class: 'fix' },
              'These are deliberate. FAQ schema whose answers are not visible on the page is invalid markup, and inventing your answers would be worse than leaving the gap. Write the real sentences, then publish.',
            ),
          );
          const btn = el('button', { class: 'ghost-btn', type: 'button' }, `${ICON.file} Open ${escapeHtml(p.filename)}`);
          btn.addEventListener('click', () => openArtifact(p.artifactId));
          body.appendChild(btn);
          return body;
        })(),
      }),
    ),
  ];

  frag.appendChild(
    handoverGroup(
      '2 — We need this from you',
      'Small inputs, large effect. Each one turns a file we already wrote from valid into true.',
      inputRows,
      'Profile complete and no placeholders left. Nothing outstanding here.',
    ),
  );

  const ownerLine = Object.entries(h.counts.byOwner)
    .sort((a, b) => b[1] - a[1])
    .map(([owner, n]) => `${owner} ${n}`)
    .join(' · ');

  frag.appendChild(
    handoverGroup(
      '3 — Still yours',
      ownerLine
        ? `No generator closes these — this is where the visibility is actually won. ${ownerLine}.`
        : 'No generator closes these — this is where the visibility is actually won.',
      h.yours.map(yoursRow),
      'Nothing outstanding. Everything open on this page is fixable with the generated files.',
    ),
  );

  const decisions = el('div', { class: 'hand-group' });
  decisions.appendChild(el('div', { class: 'section-title' }, '<h2>4 — Decisions only you can make</h2>'));
  decisions.appendChild(
    el('p', { class: 'hand-lede' }, 'Not technical questions. Each one is a commercial position, and the default is a position too.'),
  );
  const dcard = el('div', { class: 'card' });
  for (const d of h.decisions) dcard.appendChild(decisionCard(d));
  decisions.appendChild(dcard);
  frag.appendChild(decisions);

  const grab = el('div', { class: 'hand-group' });
  const dl2 = el('div', { class: 'card', style: 'padding:16px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap' });
  dl2.appendChild(el('p', { class: 'hand-lede', style: 'margin:0;flex:1 1 320px' }, 'Everything on this tab as one markdown document, ready to send with the file pack.'));
  const dlBtn = el('button', { class: 'primary-btn', type: 'button' }, 'Download handover.md');
  dlBtn.addEventListener('click', () => {
    const artifact = generated.artifacts.find((a) => a.id === 'handover');
    if (artifact) download(artifact.filename, artifact.code);
  });
  dl2.appendChild(dlBtn);
  grab.appendChild(dl2);
  frag.appendChild(grab);

  return frag;
}

/* ------------------------------------------------------------- profile */

const PROFILE_FIELDS = [
  { key: 'brandName', label: 'Brand / organisation name', placeholder: 'Acme Analytics' },
  { key: 'logoUrl', label: 'Logo or share image URL', placeholder: 'https://acme.com/logo.png' },
  { key: 'authorName', label: 'Author name', placeholder: 'Jordan Reyes' },
  { key: 'authorUrl', label: 'Author bio URL', placeholder: 'https://acme.com/team/jordan' },
  { key: 'authorTitle', label: 'Author job title', placeholder: 'Head of Research' },
  { key: 'contactEmail', label: 'Support email', placeholder: 'hello@acme.com' },
  { key: 'publishedAt', label: 'Published (ISO date)', placeholder: '2026-01-15T09:00:00Z' },
  { key: 'modifiedAt', label: 'Last modified (ISO date)', placeholder: '2026-08-11T09:00:00Z' },
  { key: 'searchUrlTemplate', label: 'Site search URL template', placeholder: 'https://acme.com/search?q={search_term_string}' },
  { key: 'tagline', label: 'One-line description', placeholder: 'Benchmarks and teardowns for data teams.' },
];

function profilePanel() {
  const frag = document.createDocumentFragment();
  frag.appendChild(
    el(
      'div',
      { class: 'section-title' },
      '<h2>Site profile</h2><p>feeds every generated artifact — stored locally per domain</p>',
    ),
  );
  const card = el('div', { class: 'card' });
  const form = el('form', { class: 'form-grid' });

  for (const field of PROFILE_FIELDS) {
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', { for: `f-${field.key}` }, escapeHtml(field.label)));
    wrap.appendChild(
      el('input', {
        id: `f-${field.key}`,
        name: field.key,
        type: 'text',
        placeholder: field.placeholder,
        value: state.profile[field.key] || '',
        spellcheck: 'false',
      }),
    );
    form.appendChild(wrap);
  }

  const sameAs = el('div', { class: 'field wide' });
  sameAs.appendChild(
    el('label', { for: 'f-sameAs' }, 'Entity profiles <small>— one URL per line: Wikipedia, LinkedIn, Crunchbase, X, GitHub</small>'),
  );
  sameAs.appendChild(
    el('textarea', { id: 'f-sameAs', name: 'sameAs', spellcheck: 'false' }, escapeHtml((state.profile.sameAs || []).join('\n'))),
  );
  form.appendChild(sameAs);

  const pageType = el('div', { class: 'field' });
  pageType.appendChild(el('label', { for: 'f-pageType' }, 'Page type'));
  const select = el('select', { id: 'f-pageType', name: 'pageType' });
  for (const [value, label] of [['auto', 'Detect automatically'], ['article', 'Article / blog post'], ['page', 'Landing or product page']]) {
    select.appendChild(el('option', { value, selected: (state.profile.pageType || 'auto') === value }, label));
  }
  pageType.appendChild(select);
  form.appendChild(pageType);

  const submit = el('div', { class: 'field', style: 'justify-content:flex-end;align-items:flex-start' });
  const btn = el('button', { class: 'primary-btn', type: 'submit' }, 'Regenerate artifacts');
  submit.appendChild(btn);
  form.appendChild(submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const profile = {};
    for (const [k, v] of data.entries()) profile[k] = String(v).trim();
    profile.sameAs = String(data.get('sameAs') || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    state.profile = profile;
    saveProfile();
    btn.disabled = true;
    btn.textContent = 'Regenerating…';
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: state.report.requestedUrl, profile }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Generation failed');
      state.generated = payload.generated;
      state.tab = 'generate';
      render();
      toast('Artifacts regenerated');
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Regenerate artifacts';
    }
  });

  card.appendChild(form);
  frag.appendChild(card);
  return frag;
}

/* ---------------------------------------------------------------- shell */

function renderDials(report) {
  const dials = $('#dials');
  dials.innerHTML = '';
  const items = [
    ['overall', 'Overall', `grade ${report.grades.overall} · ${report.counts.pass}/${report.counts.total} checks passing`, true],
    ['seo', 'SEO', 'crawl, index, rank', false],
    ['aeo', 'AEO', 'answer engines & snippets', false],
    ['geo', 'GEO', 'LLM citation readiness', false],
  ];
  for (const [key, label, sub, lead] of items) {
    dials.appendChild(
      el(
        'div',
        { class: `dial${lead ? ' lead' : ''}` },
        `${ring(report.scores[key], lead ? 74 : 62)}<div class="dial-meta"><h4>${label}</h4><p>${escapeHtml(sub)}</p></div>`,
      ),
    );
  }
}

/** Everything on this page that a file cannot close: human work, inputs, placeholders. */
function handoverCount() {
  const h = state.generated?.handover;
  if (!h) return 0;
  return h.counts.yours + h.counts.inputs + h.placeholders.length;
}

function renderTabs(report) {
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  const defs = [
    ['overview', 'Overview', report.counts.fail + report.counts.warn],
    ['seo', 'SEO', report.checks.filter((c) => c.category === 'seo').length],
    ['aeo', 'AEO', report.checks.filter((c) => c.category === 'aeo').length],
    ['geo', 'GEO', report.checks.filter((c) => c.category === 'geo').length],
    ['generate', 'Generate', state.generated?.artifacts.length || 0],
    ['handover', "What's left", handoverCount()],
    ['profile', 'Profile', null],
  ];
  for (const [key, label, count] of defs) {
    const tab = el(
      'button',
      { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(state.tab === key) },
      `${label}${count != null ? `<span class="count">${count}</span>` : ''}`,
    );
    tab.addEventListener('click', () => {
      state.tab = key;
      render();
    });
    tabs.appendChild(tab);
  }
}

function render() {
  const report = state.report;
  if (!report) return;

  $('#hero').classList.add('hidden');
  $('#results').classList.remove('hidden');
  $('#newScan').hidden = false;

  const line = $('#urlLine');
  line.innerHTML = '';
  line.append(
    el('a', { href: report.finalUrl, target: '_blank', rel: 'noopener noreferrer' }, escapeHtml(report.finalUrl)),
    el('span', { class: 'dot' }),
    el('span', {}, `HTTP ${report.http.status}`),
    el('span', { class: 'dot' }),
    el('span', {}, `${report.http.timingMs} ms`),
    el('span', { class: 'dot' }),
    el('span', {}, `${(report.http.bytes / 1024).toFixed(0)} KB`),
    el('span', { class: 'dot' }),
    el('span', {}, `${num(report.page.wordCount)} words`),
  );
  if (report.http.redirects.length) {
    line.append(el('span', { class: 'dot' }), el('span', {}, `${report.http.redirects.length} redirect(s)`));
  }

  renderDials(report);
  renderTabs(report);

  const body = $('#panelBody');
  body.innerHTML = '';
  if (state.tab === 'overview') body.appendChild(overviewPanel(report));
  else if (state.tab === 'generate') body.appendChild(generatePanel(report, state.generated));
  else if (state.tab === 'handover') body.appendChild(handoverPanel(report, state.generated));
  else if (state.tab === 'profile') body.appendChild(profilePanel());
  else body.appendChild(categoryPanel(report, state.tab));
}

/* ------------------------------------------------------------ analysis */

function profileKey(url) {
  try {
    return `aeo-profile:${new URL(url).hostname}`;
  } catch {
    return 'aeo-profile:default';
  }
}

function loadProfile(url) {
  try {
    state.profile = JSON.parse(localStorage.getItem(profileKey(url)) || '{}');
  } catch {
    state.profile = {};
  }
}

function saveProfile() {
  try {
    localStorage.setItem(profileKey(state.report?.requestedUrl || ''), JSON.stringify(state.profile));
  } catch {
    /* storage disabled — profile just will not persist */
  }
}

async function analyse(url, { refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  $('#errorBox').classList.add('hidden');
  $('#loading').classList.remove('hidden');
  $('#results').classList.add('hidden');
  $('#scanBtn').disabled = true;

  loadProfile(url);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, profile: state.profile, refresh }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
    state.report = payload.report;
    state.generated = payload.generated;
    state.tab = 'overview';
    render();
    const qs = new URLSearchParams({ url: payload.report.requestedUrl });
    history.replaceState(null, '', `/?${qs}`);
  } catch (err) {
    $('#errorText').textContent = err.message;
    $('#errorBox').classList.remove('hidden');
    $('#hero').classList.remove('hidden');
  } finally {
    state.loading = false;
    $('#loading').classList.add('hidden');
    $('#scanBtn').disabled = false;
  }
}

/* ---------------------------------------------------------------- wiring */

$('#scanForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = $('#urlInput').value.trim();
  if (url) analyse(url);
});

for (const chip of document.querySelectorAll('[data-example]')) {
  chip.addEventListener('click', () => {
    $('#urlInput').value = chip.dataset.example;
    analyse(chip.dataset.example);
  });
}

$('#newScan').addEventListener('click', () => {
  state.report = null;
  state.generated = null;
  $('#results').classList.add('hidden');
  $('#hero').classList.remove('hidden');
  $('#newScan').hidden = true;
  $('#urlInput').value = '';
  $('#urlInput').focus();
  history.replaceState(null, '', '/');
});

const themeBtn = $('#themeToggle');
const storedTheme = localStorage.getItem('aeo-theme');
if (storedTheme) document.documentElement.dataset.theme = storedTheme;
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('aeo-theme', next);
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('#urlInput')) {
    e.preventDefault();
    $('#urlInput').focus();
  }
});

const initial = new URLSearchParams(location.search).get('url');
if (initial) {
  $('#urlInput').value = initial;
  analyse(initial);
}
