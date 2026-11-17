// Token Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view with the model's own inputs and the protocol's
// farm plan. No network: every byte it shows is in data.js.
//
// The page recomputes each row from the snapshot figures and the model in
// data.js and checks the number board.json carries, so the page's code and
// the board's data are visibly the same arithmetic. Deep links: #detail=<slug>
// opens a protocol, #cat=<category> and #chain=<chain> filter, #tab=live
// shows the trading set, #wl=1 keeps the watchlist only.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var boardEl = document.getElementById('board');
  var detailEl = document.getElementById('detail');
  var state = { q: '', category: 'all', chain: 'all', wl: false, sort: 'implied', tab: 'pre-token', selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // The model, exactly as lib/model.ts states it: the page recomputes a row
  // and checks the number the board carries.
  function impliedOf(row, model) {
    var mult = Object.prototype.hasOwnProperty.call(model.category_multiples, row.category)
      ? model.category_multiples[row.category] : model.default_multiple;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor,
      row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor +
      (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + Math.min(Math.max(row.chains.length - 1, 0), model.chain_cap) * model.chain_step;
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity * chainMult)),
      mult: mult, growth: growth, growthMult: growthMult,
      maturity: maturity, chainMult: chainMult, age: age,
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function renderMeta() {
    var meta = document.getElementById('meta');
    meta.innerHTML = '';
    var stats = [
      [DATA.board_size, 'ranked rows'],
      [DATA.watchlist_size, 'watchlist'],
      [DATA.early_size, 'early finds'],
      [DATA.live_size, 'already trading'],
    ];
    stats.forEach(function (s) {
      meta.appendChild(el('div', { 'class': 'stat' }, el('b', {}, String(s[0])), el('span', {}, s[1])));
    });
    document.getElementById('formula').innerHTML =
      'Implied value = TVL × <code>sector multiple</code> × <code>growth</code> × <code>maturity</code> × <code>chains</code>.' +
      ' <span class="dim">Snapshot ' + esc(DATA.as_of) + ' · ' + DATA.board_size + ' pre-token protocols ranked, ' +
      DATA.watchlist_size + ' on the watchlist · model ' + esc(DATA.model_version) +
      ' · every row recomputed on this page and checked against the board.</span>';
  }

  function fillSelects() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      r.chains.forEach(function (c) { chains[c] = true; });
    });
    var catSel = document.getElementById('cat');
    catSel.appendChild(el('option', { value: 'all' }, 'All categories'));
    Object.keys(cats).sort().forEach(function (c) {
      catSel.appendChild(el('option', { value: c }, c));
    });
    var chainSel = document.getElementById('chain');
    chainSel.appendChild(el('option', { value: 'all' }, 'All chains'));
    Object.keys(chains).sort().forEach(function (c) {
      chainSel.appendChild(el('option', { value: c }, c));
    });
  }

  function filteredRows() {
    var rows = DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      return a.rank - b.rank;
    });
    return rows;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.setAttribute('aria-busy', 'false');
    if (state.tab === 'live') return renderLive();
    var rows = filteredRows();
    var table = el('table', { 'class': 'board' });
    var head = el('tr', {},
      el('th', { 'class': 'num' }, '#'),
      el('th', {}, 'Protocol'),
      el('th', {}, 'Category'),
      el('th', {}, 'Chains'),
      el('th', { 'class': 'num' }, 'TVL'),
      el('th', { 'class': 'num' }, '7d'),
      el('th', { 'class': 'num' }, 'Age'),
      el('th', { 'class': 'num' }, 'Implied value'),
      el('th', { 'class': 'num' }, 'Check'));
    table.appendChild(el('thead', {}, head));
    var body = el('tbody', {});
    rows.forEach(function (r) {
      var check = impliedOf(r, DATA.model);
      var ok = check.implied === r.implied_value_usd;
      var tr = el('tr', { 'class': state.selected === r.slug ? 'sel' : '', onclick: function () { select(r.slug); } },
        el('td', { 'class': 'num' }, String(r.rank)),
        el('td', { 'class': 'name', html: esc(r.name) + (r.watchlist ? '<span class="badge">Watchlist</span>' : '') }),
        el('td', {}, r.category || '—'),
        el('td', { 'class': 'chain' }, r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')),
        el('td', { 'class': 'num' }, fmtUsd(r.tvl_usd)),
        el('td', { 'class': 'num ' + ((r.change_7d || 0) >= 0 ? 'up' : 'down') }, fmtPct(r.change_7d)),
        el('td', { 'class': 'num' }, fmtAge(r.age_days)),
        el('td', { 'class': 'num' }, fmtUsd(r.implied_value_usd)),
        el('td', { 'class': 'num ' + (ok ? 'ok' : 'down') }, ok ? '✓' : '✗'));
      body.appendChild(tr);
    });
    table.appendChild(body);
    boardEl.appendChild(table);
    boardEl.appendChild(el('p', { 'class': 'count' },
      rows.length + ' of ' + DATA.board_size + ' rows · click a row for its model and farm plan · ✓ means the page recomputed the same implied value the board carries.'));
  }

  function renderLive() {
    var table = el('table', { 'class': 'board' });
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'Protocol'),
      el('th', {}, 'Category'),
      el('th', {}, 'Chains'),
      el('th', { 'class': 'num' }, 'TVL'),
      el('th', { 'class': 'num' }, 'Market cap'),
      el('th', { 'class': 'num' }, '7d'))));
    var body = el('tbody', {});
    DATA.live.forEach(function (p) {
      body.appendChild(el('tr', {},
        el('td', { 'class': 'name' }, p.name),
        el('td', {}, p.category || '—'),
        el('td', { 'class': 'chain' }, p.chains.slice(0, 3).join(', ')),
        el('td', { 'class': 'num' }, fmtUsd(p.tvl_usd)),
        el('td', { 'class': 'num' }, fmtUsd(p.mcap_usd)),
        el('td', { 'class': 'num ' + ((p.change_7d || 0) >= 0 ? 'up' : 'down') }, fmtPct(p.change_7d))));
    });
    table.appendChild(body);
    boardEl.appendChild(table);
    boardEl.appendChild(el('p', { 'class': 'count' },
      'These ' + DATA.live.length + ' already trade, so the board shows the market\u2019s own value for them, never a model\u2019s. They are not farmable as pre-token launches.'));
  }

  function select(slug) {
    state.selected = slug;
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var v = impliedOf(row, DATA.model);
    detailEl.hidden = false;
    detailEl.innerHTML = '';
    var head = el('div', { 'class': 'head' },
      el('h2', {}, '#' + row.rank + ' ' + row.name + (row.watchlist ? ' — on the watchlist' : '')),
      el('button', { 'class': 'close', onclick: function () { state.selected = null; detailEl.hidden = true; renderBoard(); } }, 'Close'));
    detailEl.appendChild(head);
    detailEl.appendChild(el('p', { 'class': 'note' },
      (row.category || 'Uncategorised') + ' · ' + row.chains.join(', ') + ' · listed ' + (row.listed_at || 'unknown') +
      ' · records no token in the snapshot.'));
    var kv = el('div', { 'class': 'kv' });
    [
      [fmtUsd(row.tvl_usd), 'TVL'],
      ['×' + v.mult.toFixed(2), 'sector multiple'],
      [fmtPct(row.change_7d), '7-day growth'],
      ['×' + v.growthMult.toFixed(3), 'growth factor'],
      [fmtAge(row.age_days), 'age, no token'],
      ['×' + v.maturity.toFixed(3), 'maturity factor'],
      [row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's'), 'reach'],
      ['×' + v.chainMult.toFixed(3), 'chain factor'],
      [fmtUsd(row.implied_value_usd), 'implied value'],
    ].forEach(function (pair) {
      kv.appendChild(el('div', {}, el('b', {}, pair[0]), el('span', {}, pair[1])));
    });
    detailEl.appendChild(kv);
    detailEl.appendChild(el('p', { 'class': 'note' },
      'Check: ' + fmtUsd(row.tvl_usd) + ' × ' + v.mult.toFixed(2) + ' × ' + v.growthMult.toFixed(3) +
      ' × ' + v.maturity.toFixed(3) + ' × ' + v.chainMult.toFixed(3) + ' = ' + fmtUsd(v.implied) +
      (v.implied === row.implied_value_usd ? ' — matches the board. ✓' : ' — differs from the board. ✗')));
    detailEl.appendChild(el('h3', {}, 'Farm plan — six steps'));
    var steps = el('ol', { 'class': 'steps' });
    row.farm_steps.forEach(function (s) {
      var cut = s.lastIndexOf(' Cost: ');
      var text = cut > 0 ? s.slice(0, cut) : s;
      var cost = cut > 0 ? s.slice(cut + 1) : '';
      steps.appendChild(el('li', {}, text + ' ', el('span', { 'class': 'cost' }, cost)));
    });
    detailEl.appendChild(steps);
    detailEl.appendChild(el('p', { 'class': 'note' },
      'A launch is never promised: this protocol records no token today, and the plan is a suggestion, not advice.'));
    renderBoard();
    detailEl.scrollIntoView({ block: 'nearest' });
  }

  function renderMethod() {
    var m = DATA.model;
    var box = document.getElementById('method');
    box.innerHTML = '';
    box.appendChild(el('h2', {}, 'How the radar scores'));
    box.appendChild(el('p', {},
      'Implied value = TVL × sector multiple × growth factor × maturity factor × chain factor. ' +
      'Growth is the 7-day TVL change clamped to −60%…+120% and weighted one-half; maturity rises from 0.60 for a ' +
      'protocol tracked less than a day to 1.00 after three years with no token (unknown age counts as one year); ' +
      'each chain past the first adds 3%, up to four chains. Every factor comes from the snapshot\u2019s own figures.'));
    var mults = Object.keys(m.category_multiples).map(function (k) { return [k, m.category_multiples[k]]; });
    mults.sort(function (a, b) { return b[1] - a[1]; });
    var table = el('table', {});
    table.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', { 'class': 'num' }, 'Multiple'))));
    var body = el('tbody', {});
    mults.forEach(function (pair) {
      body.appendChild(el('tr', {}, el('td', {}, pair[0]), el('td', { 'class': 'num' }, '×' + pair[1].toFixed(2))));
    });
    body.appendChild(el('tr', {}, el('td', {}, 'Anything else'), el('td', { 'class': 'num' }, '×' + m.default_multiple.toFixed(2))));
    table.appendChild(body);
    box.appendChild(table);
    box.appendChild(el('p', { 'class': 'note' },
      'Why these priors: fee-earning venues (DEX, derivatives, prediction) usually launch dearer against TVL than ' +
      'asset-backed or yield products (RWA, basis trading, stablecoin wrappers); a chain token prices a whole ' +
      'economy, so chains sit highest. The table is a prior, not a verdict — argue with it.'));
    box.appendChild(el('h3', {}, 'What the board will and will not rank'));
    var ul = el('ul', {});
    [
      'Every protocol on the snapshot\u2019s watchlist is ranked — all ' + DATA.watchlist_size + ' of them.',
      'Below the $' + (DATA.floor_usd / 1e6) + 'M floor, every pre-token protocol the field guide allows is ranked — ' + DATA.early_size + ' early finds.',
      'Left out: exchanges, bridges, canonical bridges, liquid staking and restaking products, wrapped or staked products of a token that trades, versioned pools, and anything that already records a token.',
      '“Records no token” is what the snapshot says. It is not proof a token does not exist, and never a promise that one will launch.',
    ].forEach(function (t) { ul.appendChild(el('li', {}, t)); });
    box.appendChild(ul);
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var parts = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) parts[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (parts.tab === 'live') state.tab = 'live';
    if (parts.cat) state.category = parts.cat;
    if (parts.chain) state.chain = parts.chain;
    if (parts.wl === '1') state.wl = true;
    if (parts.q) state.q = parts.q;
    if (parts.sort) state.sort = parts.sort;
    if (parts.detail) state.selected = parts.detail;
  }

  function bind() {
    var tabs = document.querySelectorAll('#tabs button');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        tabs.forEach(function (x) { x.classList.toggle('on', x === b); });
        renderBoard();
      });
    });
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    document.getElementById('wl').addEventListener('change', function (e) { state.wl = e.target.checked; renderBoard(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  }

  readHash();
  renderMeta();
  fillSelects();
  document.getElementById('q').value = state.q;
  document.getElementById('cat').value = state.category;
  document.getElementById('chain').value = state.chain;
  document.getElementById('wl').checked = state.wl;
  document.getElementById('sort').value = state.sort;
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === state.tab);
  });
  bind();
  renderBoard();
  renderMethod();
  if (state.selected) select(state.selected);
  document.getElementById('board').setAttribute('aria-busy', 'false');
})();
