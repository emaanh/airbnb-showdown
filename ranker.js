// Adaptive matchup selection for finding the group's top K.
// Bradley-Terry strengths (with a light prior so new places start at "average"),
// a normal approximation of each strength's uncertainty, and Monte Carlo
// estimates of each place's chance of being in the top K. Matchups are chosen
// where the result is most likely to change who makes the top K.
(function (root) {
  'use strict';

  function fit(ids, votes) {
    var n = ids.length, idx = {}, W = new Array(n).fill(0), games = {};
    ids.forEach(function (id, k) { idx[id] = k; });
    votes.forEach(function (v) {
      var w = idx[v.w], l = idx[v.l];
      if (w === undefined || l === undefined || w === l) return;
      W[w]++;
      var key = w < l ? w + ',' + l : l + ',' + w;
      games[key] = (games[key] || 0) + 1;
    });
    var pairs = Object.keys(games).map(function (k) {
      var p = k.split(','); return [+p[0], +p[1], games[k]];
    });
    var s = new Array(n).fill(1);
    for (var it = 0; it < 200; it++) {
      var denom = new Array(n).fill(2 / (1 + 1)); // prior: one win + one loss vs an average place
      for (var k = 0; k < n; k++) denom[k] = 2 / (s[k] + 1);
      pairs.forEach(function (p) {
        var d = p[2] / (s[p[0]] + s[p[1]]);
        denom[p[0]] += d; denom[p[1]] += d;
      });
      var next = s.map(function (_, k) { return (W[k] + 1) / denom[k]; });
      var logMean = next.reduce(function (a, x) { return a + Math.log(x); }, 0) / n;
      s = next.map(function (x) { return x / Math.exp(logMean); });
    }
    var info = new Array(n).fill(0);
    for (var k2 = 0; k2 < n; k2++) { var q0 = s[k2] / (s[k2] + 1); info[k2] = 2 * q0 * (1 - q0); }
    pairs.forEach(function (p) {
      var q = s[p[0]] / (s[p[0]] + s[p[1]]), f = p[2] * q * (1 - q);
      info[p[0]] += f; info[p[1]] += f;
    });
    return {
      ids: ids,
      mu: s.map(function (x) { return Math.log(x); }),
      se: info.map(function (x) { return 1 / Math.sqrt(x); }),
      games: votes.length
    };
  }

  function gauss(rand) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function topKProb(model, K, samples, rand) {
    rand = rand || Math.random;
    samples = samples || 400;
    var n = model.ids.length, hits = new Array(n).fill(0), order = model.ids.map(function (_, k) { return k; });
    for (var t = 0; t < samples; t++) {
      var draw = model.mu.map(function (m, k) { return m + model.se[k] * gauss(rand); });
      order.sort(function (a, b) { return draw[b] - draw[a]; });
      for (var r = 0; r < K && r < n; r++) hits[order[r]]++;
    }
    return hits.map(function (h) { return h / samples; });
  }

  // seen: { pairKey: count } of pairs this voter already judged; avoidKey: the last pair shown.
  function choosePair(model, P, seen, avoidKey, rand, opts) {
    rand = rand || Math.random;
    opts = opts || {};
    var orderW = opts.orderWeight != null ? opts.orderWeight : 0.3, pool = opts.pool || 3, hi = opts.topCut != null ? opts.topCut : 0.8;
    var ids = model.ids, n = ids.length, cands = [];
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var key = ids[i] < ids[j] ? ids[i] + '|' + ids[j] : ids[j] + '|' + ids[i];
        if (seen[key] || key === avoidKey) continue;
        var q = 1 / (1 + Math.exp(model.mu[j] - model.mu[i]));
        var close = 4 * q * (1 - q);                       // 1 when evenly matched
        var boundary = P[i] * (1 - P[i]) + P[j] * (1 - P[j]); // uncertainty about the top-K cut
        var order = (P[i] > hi && P[j] > hi) ? orderW * close : 0; // some value in ordering the top
        var score = (boundary + order) * (0.4 + 0.6 * close);
        cands.push({ a: ids[i], b: ids[j], score: score });
      }
    }
    if (!cands.length) return null;
    cands.sort(function (x, y) { return y.score - x.score; });
    // Pick among the best few, weighted by score, so voters don't all get identical matchups.
    var top = cands.slice(0, pool), total = top.reduce(function (a, c) { return a + c.score; }, 0);
    var r = rand() * total;
    for (var k = 0; k < top.length; k++) { r -= top[k].score; if (r <= 0) return top[k]; }
    return top[0];
  }

  root.Ranker = { fit: fit, topKProb: topKProb, choosePair: choosePair };
  if (typeof module !== 'undefined') module.exports = root.Ranker;
})(typeof window !== 'undefined' ? window : globalThis);
