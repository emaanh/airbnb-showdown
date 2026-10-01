(function () {
  'use strict';

  var MIN = (window.CONFIG && window.CONFIG.MIN_MATCHUPS) || 36;
  var API = (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL) || '';
  var IMG = 'https://a0.muscache.com/im/pictures/';
  var LISTINGS = window.LISTINGS || [];
  var BY_ID = {};
  LISTINGS.forEach(function (l) { BY_ID[l.id] = l; });

  var $ = function (id) { return document.getElementById(id); };
  var screens = ['join', 'match', 'milestone', 'done'];

  // ---- storage (per device convenience; the sheet is the source of truth) ----
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var state = {
    voter: load('rs.voter', ''),
    history: [],          // [{vote_id, left, right, winner}]
    current: null,        // {left, right}
    milestoneShown: false,
    busy: false
  };

  function histKey() { return 'rs.history.' + state.voter.toLowerCase(); }
  function pendingQueue() { return load('rs.pending', []); }

  // ---- networking ----
  function post(payload) {
    if (!API) return Promise.resolve();
    return fetch(API, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  }
  function send(payload) {
    var q = pendingQueue();
    q.push(payload);
    save('rs.pending', q);
    return flush();
  }
  var flushing = false;
  function flush() {
    if (flushing) return Promise.resolve();
    var q = pendingQueue();
    if (!q.length) return Promise.resolve();
    flushing = true;
    var item = q[0];
    return post(item).then(function () {
      var rest = pendingQueue().slice(1);
      save('rs.pending', rest);
      flushing = false;
      if (rest.length) return flush();
    }).catch(function () {
      flushing = false;
      toast('Offline. Your picks will send when you reconnect.');
    });
  }
  window.addEventListener('online', flush);

  function fetchHistory(voter) {
    if (!API) return Promise.reject(new Error('no api'));
    var url = API + (API.indexOf('?') > -1 ? '&' : '?') + 'voter=' + encodeURIComponent(voter);
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error('bad response');
      return d.votes || [];
    });
  }

  // ---- matchup selection: spread appearances evenly, avoid repeat pairs ----
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function nextPair() {
    var seen = {}, pairs = {};
    LISTINGS.forEach(function (l) { seen[l.id] = 0; });
    state.history.forEach(function (h) {
      if (h.left in seen) seen[h.left]++;
      if (h.right in seen) seen[h.right]++;
      var k = pairKey(h.left, h.right);
      pairs[k] = (pairs[k] || 0) + 1;
    });
    var last = state.history[state.history.length - 1];
    var lastKey = last ? pairKey(last.left, last.right) : '';
    var ids = shuffle(LISTINGS.map(function (l) { return l.id; }));
    ids.sort(function (a, b) { return seen[a] - seen[b]; });
    var a = ids[0];
    var partners = ids.slice(1).filter(function (b) { return pairKey(a, b) !== lastKey; });
    partners.sort(function (x, y) {
      var px = pairs[pairKey(a, x)] || 0, py = pairs[pairKey(a, y)] || 0;
      return px - py || seen[x] - seen[y];
    });
    var b = partners[0];
    return Math.random() < 0.5 ? { left: a, right: b } : { left: b, right: a };
  }

  // ---- rendering ----
  function show(name) {
    screens.forEach(function (s) { $('screen-' + s).hidden = s !== name; });
    window.scrollTo(0, 0);
  }

  function photoUrl(path, w) { return IMG + path + '?im_w=' + w; }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function renderCard(id, side) {
    var l = BY_ID[id];
    var strip = el('div', { class: 'strip' });
    var SHOWN = 6;
    var more = l.photos.length - SHOWN;
    l.photos.slice(0, SHOWN).forEach(function (p, i) {
      var img = el('img', { src: photoUrl(p, 480), alt: l.label + ', photo ' + (i + 1) + ' of ' + l.photos.length, decoding: 'async' });
      var isLast = i === SHOWN - 1 && more > 0;
      var tile = el('button', {
        type: 'button',
        'aria-label': isLast ? 'See all ' + l.photos.length + ' photos' : 'Open photo ' + (i + 1),
        onclick: function () { openViewer(l, i); }
      }, [img, isLast ? el('span', { class: 'more', text: '+' + more }) : null]);
      strip.appendChild(tile);
    });
    var amen = el('ul', { class: 'amenities', 'aria-label': 'Highlights' });
    l.amenities.forEach(function (a) { amen.appendChild(el('li', { text: a })); });

    var card = el('article', { class: 'card', 'data-side': side }, [
      el('div', { class: 'photos' }, [strip, el('div', { class: 'photo-count', text: l.photos.length + ' photos' })]),
      el('div', { class: 'info' }, [
        el('div', { class: 'info-main' }, [
          el('div', { class: 'label', text: l.label }),
          el('div', { class: 'where', text: l.city + ' · ' + l.drive + ' from USC' }),
          amen
        ]),
        el('a', { class: 'airbnb-link', href: l.url, target: '_blank', rel: 'noopener', text: 'Airbnb ↗' })
      ]),
      el('button', { type: 'button', class: 'btn btn-pick', text: 'Pick this one', onclick: function () { pick(id, card); } })
    ]);
    return card;
  }

  function renderMatch() {
    var done = state.history.length;
    var extra = done - MIN;
    $('progress-label').textContent = extra >= 0
      ? 'Minimum done · +' + extra + ' extra'
      : 'Matchup ' + (done + 1) + ' of ' + MIN;
    $('bar-fill').style.width = Math.min(100, done / MIN * 100) + '%';
    $('undo-btn').disabled = done === 0;
    var cards = $('cards');
    cards.classList.remove('is-busy');
    cards.innerHTML = '';
    cards.appendChild(renderCard(state.current.left, 'left'));
    cards.appendChild(renderCard(state.current.right, 'right'));
  }

  function goToNext() {
    state.current = nextPair();
    save('rs.current.' + state.voter.toLowerCase(), state.current);
    renderMatch();
    show('match');
  }

  // ---- actions ----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function pick(winner, cardEl) {
    if (state.busy) return;
    state.busy = true;
    var c = state.current;
    var loser = winner === c.left ? c.right : c.left;
    var vote = { vote_id: uuid(), left: c.left, right: c.right, winner: winner };
    state.history.push(vote);
    save(histKey(), state.history);
    send({
      action: 'vote', vote_id: vote.vote_id, voter: state.voter,
      left_id: c.left, left_label: BY_ID[c.left].label,
      right_id: c.right, right_label: BY_ID[c.right].label,
      winner_id: winner, winner_label: BY_ID[winner].label,
      loser_id: loser, loser_label: BY_ID[loser].label,
      n: state.history.length, ua: navigator.userAgent
    });
    cardEl.classList.add('is-picked');
    $('cards').classList.add('is-busy');
    setTimeout(function () {
      state.busy = false;
      if (state.history.length === MIN && !state.milestoneShown) {
        state.milestoneShown = true;
        save('rs.milestone.' + state.voter.toLowerCase(), true);
        show('milestone');
      } else {
        goToNext();
      }
    }, 280);
  }

  function undo() {
    if (state.busy || !state.history.length) return;
    var last = state.history.pop();
    save(histKey(), state.history);
    send({ action: 'undo', vote_id: last.vote_id, voter: state.voter });
    state.current = { left: last.left, right: last.right };
    renderMatch();
    show('match');
    toast('Undone. Pick again.');
  }

  function start(name) {
    state.voter = name.trim().replace(/\s+/g, ' ');
    save('rs.voter', state.voter);
    var key = state.voter.toLowerCase();
    state.milestoneShown = load('rs.milestone.' + key, false);
    state.history = load(histKey(), []);
    $('join-btn').disabled = true;
    $('join-btn').textContent = 'Loading…';
    // Pending local votes not yet sent are kept; server history wins otherwise.
    fetchHistory(state.voter).then(function (votes) {
      var pendingIds = {};
      pendingQueue().forEach(function (p) { if (p.action === 'vote' && p.voter.toLowerCase() === key) pendingIds[p.vote_id] = true; });
      var local = state.history.filter(function (h) { return pendingIds[h.vote_id]; });
      state.history = votes.concat(local.filter(function (h) { return !votes.some(function (v) { return v.vote_id === h.vote_id; }); }));
      save(histKey(), state.history);
    }).catch(function () { /* offline or not configured: keep local history */ }).then(function () {
      $('join-btn').disabled = false;
      $('join-btn').textContent = 'Start';
      if (state.history.length >= MIN) state.milestoneShown = true;
      var saved = load('rs.current.' + key, null);
      if (saved && BY_ID[saved.left] && BY_ID[saved.right] && !state.history.some(function (h) { return pairKey(h.left, h.right) === pairKey(saved.left, saved.right); })) {
        state.current = saved;
        renderMatch();
        show('match');
      } else {
        goToNext();
      }
    });
  }

  function finish() {
    $('done-name').textContent = state.voter;
    var n = state.history.length;
    $('done-summary').textContent = 'You made ' + n + ' pick' + (n === 1 ? '' : 's') + '. Thanks for helping choose.';
    show('done');
  }

  // ---- photo viewer ----
  var viewer = { listing: null, index: 0, lastFocus: null };
  function openViewer(listing, index) {
    viewer.listing = listing; viewer.index = index; viewer.lastFocus = document.activeElement;
    $('viewer').hidden = false;
    document.body.style.overflow = 'hidden';
    paintViewer();
    $('viewer-close').focus();
  }
  function paintViewer() {
    var l = viewer.listing, i = viewer.index;
    $('viewer-img').src = photoUrl(l.photos[i], 1440);
    $('viewer-img').alt = l.label + ', photo ' + (i + 1);
    $('viewer-count').textContent = (i + 1) + ' / ' + l.photos.length;
    [i + 1, i - 1].forEach(function (j) { if (l.photos[j]) { var pre = new Image(); pre.src = photoUrl(l.photos[j], 1440); } });
  }
  function stepViewer(d) {
    var n = viewer.listing.photos.length;
    viewer.index = (viewer.index + d + n) % n;
    paintViewer();
  }
  function closeViewer() {
    $('viewer').hidden = true;
    document.body.style.overflow = '';
    if (viewer.lastFocus) viewer.lastFocus.focus();
  }
  $('viewer-close').addEventListener('click', closeViewer);
  $('viewer-prev').addEventListener('click', function () { stepViewer(-1); });
  $('viewer-next').addEventListener('click', function () { stepViewer(1); });
  $('viewer').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight') stepViewer(1);
    else if (e.key === 'ArrowLeft') stepViewer(-1);
  });
  var touchX = null;
  $('viewer-img').addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  $('viewer-img').addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) stepViewer(dx < 0 ? 1 : -1);
    touchX = null;
  });

  // ---- toast ----
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ---- wire up ----
  $('join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('voter-name').value.trim();
    if (name) start(name);
  });
  $('undo-btn').addEventListener('click', undo);
  $('keep-going-btn').addEventListener('click', goToNext);
  $('im-done-btn').addEventListener('click', finish);
  $('more-btn').addEventListener('click', goToNext);

  // Join screen
  $('place-count').textContent = LISTINGS.length;
  $('min-count').textContent = MIN;
  var picks = shuffle(LISTINGS.slice()).slice(0, 5);
  picks.forEach(function (l) {
    $('collage').appendChild(el('img', { src: photoUrl(l.photos[0], 720), alt: l.label }));
  });
  if (state.voter) {
    $('voter-name').value = state.voter;
    var prior = load('rs.history.' + state.voter.toLowerCase(), []);
    if (prior.length) {
      $('join-hint').hidden = false;
      $('join-hint').textContent = 'Welcome back. You\'ve made ' + prior.length + ' pick' + (prior.length === 1 ? '' : 's') + ' so far.';
      $('join-btn').textContent = 'Continue';
    }
  }
  if (!API) toast('Test mode: votes are not being saved yet.');
  show('join');
  flush();
})();
