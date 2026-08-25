'use strict';

function shuffle(arr) {
  const d = arr.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const MONTH_META = {
  1:  { name: '송학',   flower: '소나무' },
  2:  { name: '매화',   flower: '매화' },
  3:  { name: '벚꽃',   flower: '벚꽃' },
  4:  { name: '흑싸리', flower: '흑싸리' },
  5:  { name: '난초',   flower: '난초' },
  6:  { name: '모란',   flower: '모란' },
  7:  { name: '홍싸리', flower: '홍싸리' },
  8:  { name: '공산',   flower: '공산' },
  9:  { name: '국화',   flower: '국화' },
  10: { name: '단풍',   flower: '단풍' },
  11: { name: '오동',   flower: '오동' },
  12: { name: '비',     flower: '버드나무' },
};

function kindLabel(c) {
  if (c.kind === 'gwang') return c.bigwang ? '비광' : '광';
  if (c.kind === 'yeol') return c.godori ? '고도리' : c.kukjin ? '국진' : c.ddong ? '똥' : '열끗';
  if (c.kind === 'tti') return c.ttiColor === 'hong' ? '홍단' : c.ttiColor === 'cheong' ? '청단' : '초단';
  if (c.kind === 'ssangpi') return '쌍피';
  return '피';
}

function makeCard(month, kind, extra, slot) {
  const meta = MONTH_META[month];
  const c = {
    month,
    kind,
    monthName: meta.name,
    ...extra,
    slot: slot || 0,
  };
  c.img = hwatuImgName(c);
  c.name = `${month}월 ${meta.name} ${kindLabel(c)}`;
  return c;
}

function hwatuImgName(c) {
  const m = String(c.month).padStart(2, '0');
  if (c.kind === 'gwang') return `m${m}-gwang`;
  if (c.kind === 'yeol') return `m${m}-yeol`;
  if (c.kind === 'tti') return `m${m}-${c.ttiColor}`;
  if (c.kind === 'ssangpi') return `m${m}-ssangpi${c.slot ? '-' + c.slot : ''}`;
  return `m${m}-pi${c.slot ? '-' + c.slot : '-a'}`;
}

function hwatuDefs() {
  return [
    makeCard(1, 'gwang', {}, 0),
    makeCard(1, 'tti', { ttiColor: 'hong' }, 0),
    makeCard(1, 'pi', {}, 'a'),
    makeCard(1, 'pi', {}, 'b'),

    makeCard(2, 'yeol', { godori: true }, 0),
    makeCard(2, 'tti', { ttiColor: 'hong' }, 0),
    makeCard(2, 'pi', {}, 'a'),
    makeCard(2, 'pi', {}, 'b'),

    makeCard(3, 'gwang', {}, 0),
    makeCard(3, 'tti', { ttiColor: 'hong' }, 0),
    makeCard(3, 'pi', {}, 'a'),
    makeCard(3, 'pi', {}, 'b'),

    makeCard(4, 'yeol', { godori: true }, 0),
    makeCard(4, 'tti', { ttiColor: 'cho' }, 0),
    makeCard(4, 'pi', {}, 'a'),
    makeCard(4, 'pi', {}, 'b'),

    makeCard(5, 'yeol', {}, 0),
    makeCard(5, 'tti', { ttiColor: 'cho' }, 0),
    makeCard(5, 'pi', {}, 'a'),
    makeCard(5, 'pi', {}, 'b'),

    makeCard(6, 'yeol', {}, 0),
    makeCard(6, 'tti', { ttiColor: 'cheong' }, 0),
    makeCard(6, 'pi', {}, 'a'),
    makeCard(6, 'pi', {}, 'b'),

    makeCard(7, 'yeol', {}, 0),
    makeCard(7, 'tti', { ttiColor: 'cho' }, 0),
    makeCard(7, 'pi', {}, 'a'),
    makeCard(7, 'pi', {}, 'b'),

    makeCard(8, 'gwang', {}, 0),
    makeCard(8, 'yeol', { godori: true }, 0),
    makeCard(8, 'pi', {}, 'a'),
    makeCard(8, 'pi', {}, 'b'),

    makeCard(9, 'yeol', { kukjin: true }, 0),
    makeCard(9, 'tti', { ttiColor: 'cheong' }, 0),
    makeCard(9, 'pi', {}, 'a'),
    makeCard(9, 'pi', {}, 'b'),

    makeCard(10, 'yeol', {}, 0),
    makeCard(10, 'tti', { ttiColor: 'cheong' }, 0),
    makeCard(10, 'pi', {}, 'a'),
    makeCard(10, 'pi', {}, 'b'),

    makeCard(11, 'gwang', {}, 0),
    makeCard(11, 'ssangpi', {}, ''),
    makeCard(11, 'pi', {}, 'a'),
    makeCard(11, 'pi', {}, 'b'),

    makeCard(12, 'gwang', { bigwang: true }, 0),
    makeCard(12, 'yeol', { ddong: true }, 0),
    makeCard(12, 'ssangpi', {}, 'a'),
    makeCard(12, 'ssangpi', {}, 'b'),
  ];
}

function stampIds(cards) {
  return cards.map((c, i) => ({ ...c, id: `${c.img}-${i}` }));
}

function createHwatuDeck() {
  return shuffle(stampIds(hwatuDefs()));
}

function createSutdaDeck() {
  const defs = hwatuDefs().filter(c => c.month <= 10);
  const byMonth = {};
  for (const c of defs) {
    (byMonth[c.month] = byMonth[c.month] || []).push(c);
  }
  const picked = [];
  for (let m = 1; m <= 10; m++) {
    const list = byMonth[m];
    const picture = list.find(c => c.kind === 'gwang') || list.find(c => c.kind === 'yeol') || list[0];
    const plain = list.find(c => c !== picture && (c.kind === 'pi' || c.kind === 'tti')) || list.find(c => c !== picture);
    picked.push({ ...picture, sutdaGwang: picture.kind === 'gwang', sutdaYeol: picture.kind === 'yeol' || picture.kind === 'gwang' });
    picked.push({ ...plain, sutdaGwang: false, sutdaYeol: false });
  }
  return shuffle(stampIds(picked));
}

// ─── 섯다 족보 ───────────────────────────────────────────────────────────────
// rank: higher is better. specials applied in compare.
function sutdaEval(cards) {
  if (!cards || cards.length < 2) return { rank: 0, name: '오류', kkut: 0, special: null };
  const a = cards[0], b = cards[1];
  const months = [a.month, b.month].sort((x, y) => x - y);
  const gwangCount = (a.sutdaGwang ? 1 : 0) + (b.sutdaGwang ? 1 : 0);
  const yeolA = !!a.sutdaYeol, yeolB = !!b.sutdaYeol;
  const pair = months[0] === months[1];
  const kkut = (a.month + b.month) % 10;

  const is38 = months[0] === 3 && months[1] === 8 && gwangCount === 2;
  const isGwangDdang = gwangCount === 2 && !is38;
  const isAmhaeng = months[0] === 4 && months[1] === 7 && yeolA && yeolB;
  const sevenYeol = (a.month === 7 && a.sutdaYeol) || (b.month === 7 && b.sutdaYeol);
  const isDdangJabi = months[0] === 3 && months[1] === 7 && gwangCount === 1 && sevenYeol;
  const isGusa = months[0] === 4 && months[1] === 9;
  const isMeongGusa = isGusa && !yeolA && !yeolB;

  if (is38) return { rank: 1000, name: '삼팔광땡', kkut, special: '38gwang', months, gwangCount };
  if (isGwangDdang) {
    const name = months[0] === 1 && months[1] === 3 ? '13광땡' : '18광땡';
    return { rank: 900, name, kkut, special: 'gwangddang', months, gwangCount };
  }
  if (pair) {
    const n = months[0];
    if (n === 10) return { rank: 800, name: '장땡', kkut, special: null, months, gwangCount };
    return { rank: 700 + n, name: `${n}땡`, kkut, special: null, months, gwangCount };
  }

  const joks = [
    [1, 2, 650, '알리'],
    [1, 4, 640, '독사'],
    [1, 9, 630, '구삥'],
    [1, 10, 620, '장삥'],
    [4, 10, 610, '장사'],
    [4, 6, 600, '세륙'],
  ];
  for (const [x, y, rank, name] of joks) {
    if (months[0] === x && months[1] === y) {
      return { rank, name, kkut, special: isGusa ? 'gusa' : null, months, gwangCount };
    }
  }

  let special = null;
  if (isAmhaeng) special = 'amhaeng';
  else if (isDdangJabi) special = 'ddangjabi';
  else if (isMeongGusa) special = 'meonggusa';
  else if (isGusa) special = 'gusa';

  if (kkut === 9) return { rank: 509, name: '갑오', kkut, special, months, gwangCount };
  if (kkut === 0) return { rank: 500, name: '망통', kkut, special, months, gwangCount };
  return { rank: 500 + kkut, name: `${kkut}끗`, kkut, special, months, gwangCount };
}

function sutdaCompare(e0, e1) {
  const a = e0, b = e1;
  // 암행어사: 상대 광땡(38 제외)만 잡음
  if (a.special === 'amhaeng' && b.special === 'gwangddang') return 1;
  if (b.special === 'amhaeng' && a.special === 'gwangddang') return -1;
  // 땡잡이: 상대 1~9땡만 잡음 (장땡/광땡 제외)
  if (a.special === 'ddangjabi' && b.rank >= 701 && b.rank <= 709) return 1;
  if (b.special === 'ddangjabi' && a.rank >= 701 && a.rank <= 709) return -1;
  // 구사: 상대가 땡 미만이면 재경기. 멍텅구리 구사는 장땡 미만 재경기
  const gusaRematch = (mine, opp) => {
    if (mine.special === 'meonggusa' && opp.rank < 800) return true;
    if (mine.special === 'gusa' && opp.rank < 700) return true;
    return false;
  };
  if (gusaRematch(a, b) || gusaRematch(b, a)) return 'rematch';
  if (a.rank === b.rank) return a.rank >= 700 ? 0 : 'rematch';
  return a.rank > b.rank ? 1 : -1;
}

// ─── 고스톱 점수 ─────────────────────────────────────────────────────────────
function piValue(c) {
  if (c.kind === 'pi') return 1;
  if (c.kind === 'ssangpi') return 2;
  if (c.kind === 'yeol' && c.kukjin && c._asPi) return 2;
  return 0;
}

function gostopScore(captured) {
  const cards = (captured || []).map(c => ({ ...c }));
  const kukjins = cards.filter(c => c.kukjin);
  let best = scoreOnce(cards);
  if (kukjins.length) {
    for (const k of kukjins) k._asPi = true;
    const alt = scoreOnce(cards);
    if (alt.score > best.score) best = alt;
    else for (const k of kukjins) k._asPi = false;
  }
  return best;
}

function scoreOnce(captured) {
  const gwang = captured.filter(c => c.kind === 'gwang');
  const yeol = captured.filter(c => c.kind === 'yeol' && !c._asPi);
  const tti = captured.filter(c => c.kind === 'tti');
  const parts = [];
  let score = 0;

  const gc = gwang.length;
  const hasBi = gwang.some(c => c.bigwang);
  if (gc >= 5) { score += 15; parts.push('오광 15'); }
  else if (gc === 4) { score += 4; parts.push('사광 4'); }
  else if (gc === 3) {
    if (hasBi) { score += 2; parts.push('비삼광 2'); }
    else { score += 3; parts.push('삼광 3'); }
  }

  const godori = yeol.filter(c => c.godori);
  if (godori.length === 3) { score += 5; parts.push('고도리 5'); }
  if (yeol.length >= 5) { score += yeol.length - 4; parts.push(`열끗 ${yeol.length - 4}`); }

  const hong = tti.filter(c => c.ttiColor === 'hong');
  const cheong = tti.filter(c => c.ttiColor === 'cheong');
  const cho = tti.filter(c => c.ttiColor === 'cho');
  if (hong.length >= 3) { score += 3; parts.push('홍단 3'); }
  if (cheong.length >= 3) { score += 3; parts.push('청단 3'); }
  if (cho.length >= 3) { score += 3; parts.push('초단 3'); }
  if (tti.length >= 5) { score += tti.length - 4; parts.push(`띠 ${tti.length - 4}`); }

  let pi = 0;
  for (const c of captured) pi += piValue(c);
  if (pi >= 10) { score += pi - 9; parts.push(`피 ${pi - 9}`); }

  return { score, parts, pi, gwang: gc, yeol: yeol.length, tti: tti.length };
}

function monthOnField(field, month) {
  return (field || []).filter(c => c.month === month);
}

function gostopChoiceNeeded(field, card) {
  return monthOnField(field, card.month).length === 2;
}

function gostopResolve(field, played, drawn, playChoiceId, drawChoiceId) {
  const events = [];
  const captures = [];
  let newField = field.slice();
  const peokMonths = [];

  const takeFromField = (ids) => {
    const idset = new Set(ids);
    const taken = newField.filter(c => idset.has(c.id));
    newField = newField.filter(c => !idset.has(c.id));
    return taken;
  };

  if (played.month === drawn.month) {
    const on = monthOnField(newField, played.month);
    if (on.length === 0) {
      captures.push(played, drawn);
      events.push('쪽');
    } else if (on.length === 1) {
      newField = newField.filter(c => c.id !== on[0].id);
      newField.push(played, drawn, on[0]);
      peokMonths.push(played.month);
      events.push('뻑');
    } else if (on.length === 2) {
      captures.push(played, drawn, ...on);
      newField = newField.filter(c => c.month !== played.month);
      events.push('따닥');
    } else {
      captures.push(played, drawn, ...on);
      newField = newField.filter(c => c.month !== played.month);
      events.push('쓸');
    }
  } else {
    const handle = (card, choiceId, label) => {
      const on = monthOnField(newField, card.month);
      if (on.length === 0) {
        newField.push(card);
        return 'place';
      }
      if (on.length === 1) {
        captures.push(card, on[0]);
        newField = newField.filter(c => c.id !== on[0].id);
        return 'match1';
      }
      if (on.length === 2) {
        const chosen = on.find(c => c.id === choiceId) || on[0];
        captures.push(card, chosen);
        newField = newField.filter(c => c.id !== chosen.id);
        return 'match2';
      }
      captures.push(card, ...on);
      newField = newField.filter(c => c.month !== card.month);
      events.push('쓸');
      return 'sseul';
    };
    handle(played, playChoiceId, 'play');
    handle(drawn, drawChoiceId, 'draw');
  }

  if (field.length > 0 && newField.length === 0) events.push('싹쓸이');

  return { field: newField, captures, events, peokMonths };
}

function stealPiCards(fromCaptured, n) {
  if (!fromCaptured || !fromCaptured.length || n <= 0) return { stolen: [], remain: fromCaptured.slice() };
  const remain = fromCaptured.slice();
  const stolen = [];
  let need = n;
  const order = (c) => (c.kind === 'pi' ? 0 : c.kind === 'ssangpi' ? 1 : 9);
  remain.sort((a, b) => order(a) - order(b));
  while (need > 0) {
    const idx = remain.findIndex(c => c.kind === 'pi' || c.kind === 'ssangpi');
    if (idx < 0) break;
    const [c] = remain.splice(idx, 1);
    stolen.push(c);
    need -= piValue(c);
  }
  return { stolen, remain };
}

function gostopDeal() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const deck = createHwatuDeck();
    const p0 = [], p1 = [], field = [];
    for (let i = 0; i < 10; i++) { p0.push(deck.pop()); p1.push(deck.pop()); }
    for (let i = 0; i < 8; i++) field.push(deck.pop());
    const fieldMonths = {};
    field.forEach(c => { fieldMonths[c.month] = (fieldMonths[c.month] || 0) + 1; });
    if (Object.values(fieldMonths).some(n => n >= 4)) continue;
    return { deck, hands: [p0, p1], field };
  }
  const deck = createHwatuDeck();
  const p0 = [], p1 = [], field = [];
  for (let i = 0; i < 10; i++) { p0.push(deck.pop()); p1.push(deck.pop()); }
  for (let i = 0; i < 8; i++) field.push(deck.pop());
  return { deck, hands: [p0, p1], field };
}

function shakeMonths(hand) {
  const cnt = {};
  hand.forEach(c => { cnt[c.month] = (cnt[c.month] || 0) + 1; });
  return Object.keys(cnt).filter(m => cnt[m] >= 3).map(Number);
}

function fourOfKind(hand) {
  const cnt = {};
  hand.forEach(c => { cnt[c.month] = (cnt[c.month] || 0) + 1; });
  return Object.keys(cnt).some(m => cnt[m] >= 4);
}

function gostopPayoutMult(winner, loser, scoreInfo) {
  let mult = 1;
  const go = winner.goCount || 0;
  if (go >= 3) mult *= 2 ** Math.min(go - 2, 4);
  if (winner.shook) mult *= 2;
  if ((loser.goCount || 0) > 0) mult *= 2; // 고박
  const wScore = scoreInfo || gostopScore(winner.captured);
  const lScore = gostopScore(loser.captured);
  if (wScore.pi >= 10 && lScore.pi < 6) mult *= 2; // 피박
  if (wScore.gwang >= 3 && lScore.gwang === 0) mult *= 2; // 광박
  let score = wScore.score;
  if (go === 1) score += 1;
  if (go === 2) score += 2;
  return { score: Math.max(1, score), mult, parts: wScore.parts };
}

module.exports = {
  MONTH_META,
  hwatuDefs,
  hwatuImgName,
  createHwatuDeck,
  createSutdaDeck,
  sutdaEval,
  sutdaCompare,
  gostopScore,
  gostopChoiceNeeded,
  gostopResolve,
  stealPiCards,
  gostopDeal,
  shakeMonths,
  fourOfKind,
  gostopPayoutMult,
  monthOnField,
  piValue,
  shuffle,
};
