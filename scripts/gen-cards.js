'use strict';
const fs = require('fs');
const path = require('path');

function write(dir, name, svg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), svg);
}

const SUIT_META = {
  s: { glyph: '♠', color: '#111111', name: 'spades' },
  h: { glyph: '♥', color: '#c62828', name: 'hearts' },
  d: { glyph: '♦', color: '#c62828', name: 'diamonds' },
  c: { glyph: '♣', color: '#111111', name: 'clubs' },
};
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const RANK_LABEL = { T: '10' };

function pipLayout(rank) {
  const cx = 125, colL = 78, colR = 172, colC = 125;
  const rows = {
    2: [[cx, 90], [cx, 260]],
    3: [[cx, 80], [cx, 175], [cx, 270]],
    4: [[colL, 90], [colR, 90], [colL, 260], [colR, 260]],
    5: [[colL, 90], [colR, 90], [cx, 175], [colL, 260], [colR, 260]],
    6: [[colL, 90], [colR, 90], [colL, 175], [colR, 175], [colL, 260], [colR, 260]],
    7: [[colL, 85], [colR, 85], [cx, 140], [colL, 175], [colR, 175], [colL, 265], [colR, 265]],
    8: [[colL, 80], [colR, 80], [colL, 140], [colR, 140], [colL, 210], [colR, 210], [colL, 270], [colR, 270]],
    9: [[colL, 78], [colR, 78], [colL, 135], [colR, 135], [cx, 175], [colL, 215], [colR, 215], [colL, 272], [colR, 272]],
    10: [[colL, 72], [colR, 72], [cx, 108], [colL, 145], [colR, 145], [colL, 205], [colR, 205], [cx, 242], [colL, 278], [colR, 278]],
  };
  if (rank === 'A') return [[cx, 175]];
  const n = rank === 'T' ? 10 : parseInt(rank, 10);
  return rows[n] || [];
}

function pokerCard(rank, suit) {
  const { glyph, color } = SUIT_META[suit];
  const label = RANK_LABEL[rank] || rank;
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K';
  const isAce = rank === 'A';
  const pips = pipLayout(rank).map(([x, y], i) => {
    const flip = y > 175;
    const fs = isAce ? 92 : 36;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fs}" fill="${color}" font-family="Georgia,serif"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}>${glyph}</text>`;
  }).join('');

  let center = pips;
  if (isFace) {
    const faceBg = rank === 'K' ? '#fff8e1' : rank === 'Q' ? '#fce4ec' : '#e3f2fd';
    const letter = rank;
    center = `
      <rect x="58" y="78" width="134" height="194" rx="12" fill="${faceBg}" stroke="${color}" stroke-width="2"/>
      <text x="125" y="175" text-anchor="middle" font-size="92" font-weight="700" fill="${color}" font-family="Georgia,serif">${letter}</text>
      <text x="125" y="230" text-anchor="middle" font-size="42" fill="${color}">${glyph}</text>
      <text x="125" y="258" text-anchor="middle" font-size="14" fill="${color}" opacity=".7">${rank === 'K' ? 'KING' : rank === 'Q' ? 'QUEEN' : 'JACK'}</text>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350" width="250" height="350">
  <defs>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect x="1" y="1" width="248" height="348" rx="18" fill="#f7f3ea" stroke="#1a1a1a" stroke-width="2"/>
  <rect x="10" y="10" width="230" height="330" rx="12" fill="#fffef8" stroke="#e0d8c8" stroke-width="1"/>
  <text x="22" y="42" font-size="${label === '10' ? 28 : 32}" font-weight="700" fill="${color}" font-family="Georgia,serif">${label}</text>
  <text x="22" y="72" font-size="26" fill="${color}">${glyph}</text>
  <text x="228" y="318" font-size="${label === '10' ? 28 : 32}" font-weight="700" fill="${color}" font-family="Georgia,serif" text-anchor="end" transform="rotate(180 228 308)">${label}</text>
  <text x="228" y="288" font-size="26" fill="${color}" text-anchor="end" transform="rotate(180 228 278)">${glyph}</text>
  ${center}
</svg>`;
}

function pokerBack() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350" width="250" height="350">
  <rect x="1" y="1" width="248" height="348" rx="18" fill="#0d1b4c" stroke="#050a1a" stroke-width="2"/>
  <rect x="14" y="14" width="222" height="322" rx="12" fill="none" stroke="#c9a227" stroke-width="2"/>
  <rect x="24" y="24" width="202" height="302" rx="8" fill="#152a6e"/>
  <pattern id="diam" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M10 0 L20 10 L10 20 L0 10 Z" fill="none" stroke="#c9a227" stroke-width=".6" opacity=".45"/>
  </pattern>
  <rect x="24" y="24" width="202" height="302" rx="8" fill="url(#diam)"/>
  <circle cx="125" cy="175" r="42" fill="#0d1b4c" stroke="#c9a227" stroke-width="2"/>
  <text x="125" y="188" text-anchor="middle" font-size="36" fill="#c9a227">🂠</text>
</svg>`;
}

const MONTH_COLOR = {
  1:  { bg: '#e8f5e9', ink: '#1b5e20', acc: '#2e7d32' },
  2:  { bg: '#fce4ec', ink: '#ad1457', acc: '#c2185b' },
  3:  { bg: '#fce4ec', ink: '#c2185b', acc: '#e91e63' },
  4:  { bg: '#ede7f6', ink: '#4527a0', acc: '#5e35b1' },
  5:  { bg: '#e8eaf6', ink: '#283593', acc: '#3949ab' },
  6:  { bg: '#fce4ec', ink: '#b71c1c', acc: '#d32f2f' },
  7:  { bg: '#f3e5f5', ink: '#6a1b9a', acc: '#8e24aa' },
  8:  { bg: '#fff8e1', ink: '#e65100', acc: '#f9a825' },
  9:  { bg: '#fffde7', ink: '#f9a825', acc: '#fbc02d' },
  10: { bg: '#fbe9e7', ink: '#bf360c', acc: '#e64a19' },
  11: { bg: '#e3f2fd', ink: '#0d47a1', acc: '#1565c0' },
  12: { bg: '#eceff1', ink: '#37474f', acc: '#546e7a' },
};

function motif(month, x, y) {
  const s = `transform="translate(${x},${y})"`;
  switch (month) {
    case 1: return `<g ${s}>
      <polygon points="0,-52 -28,10 28,10" fill="#1b5e20"/>
      <polygon points="0,-32 -22,18 22,18" fill="#2e7d32"/>
      <rect x="-5" y="10" width="10" height="22" fill="#5d4037"/>
      <ellipse cx="22" cy="-28" rx="16" ry="10" fill="#eceff1"/>
      <path d="M10,-28 Q22,-44 34,-28" fill="none" stroke="#90a4ae" stroke-width="2"/>
    </g>`;
    case 2: return `<g ${s}>
      <circle cx="-16" cy="-8" r="12" fill="#e91e63"/>
      <circle cx="8" cy="-22" r="11" fill="#f06292"/>
      <circle cx="18" cy="2" r="12" fill="#ec407a"/>
      <circle cx="-4" cy="10" r="10" fill="#f48fb1"/>
      <circle cx="0" cy="-6" r="5" fill="#fff59d"/>
    </g>`;
    case 3: return `<g ${s}>
      <g fill="#f8bbd0">${[0,72,144,216,288].map((a,i)=>`<ellipse cx="0" cy="-18" rx="10" ry="18" transform="rotate(${a})"/>`).join('')}</g>
      <circle r="8" fill="#fff59d"/>
      <g fill="#f48fb1" transform="translate(28,18)">${[0,72,144,216,288].map(a=>`<ellipse cx="0" cy="-12" rx="7" ry="12" transform="rotate(${a})"/>`).join('')}<circle r="5" fill="#ffe082"/></g>
    </g>`;
    case 4: return `<g ${s}>
      <path d="M-8,-48 C-28,-10 -18,30 0,40 C18,30 28,-10 8,-48" fill="#7e57c2"/>
      <path d="M-2,-40 C-16,-8 -10,22 2,32 C12,22 16,-8 4,-40" fill="#9575cd"/>
      <ellipse cx="24" cy="-8" rx="14" ry="8" fill="#eceff1"/>
      <path d="M12,-8 Q24,-22 36,-8" fill="none" stroke="#90a4ae" stroke-width="1.6"/>
    </g>`;
    case 5: return `<g ${s}>
      <path d="M0,36 C-6,10 -22,-30 0,-50 C22,-30 6,10 0,36" fill="#5c6bc0"/>
      <path d="M-18,20 C-28,-8 -8,-28 -2,-4" fill="#7986cb"/>
      <path d="M18,20 C28,-8 8,-28 2,-4" fill="#7986cb"/>
      <rect x="-3" y="28" width="6" height="18" fill="#2e7d32"/>
    </g>`;
    case 6: return `<g ${s}>
      ${[0,45,90,135,180,225,270,315].map(a=>`<ellipse cx="0" cy="-22" rx="9" ry="22" fill="#e53935" transform="rotate(${a})" opacity=".92"/>`).join('')}
      <circle r="10" fill="#ffeb3b"/>
    </g>`;
    case 7: return `<g ${s}>
      <circle cx="-14" cy="-16" r="11" fill="#ab47bc"/>
      <circle cx="10" cy="-24" r="10" fill="#8e24aa"/>
      <circle cx="16" cy="0" r="11" fill="#ce93d8"/>
      <circle cx="-4" cy="8" r="9" fill="#7b1fa2"/>
      <ellipse cx="20" cy="22" rx="16" ry="10" fill="#6d4c41"/>
      <circle cx="12" cy="18" r="3" fill="#efebe9"/>
    </g>`;
    case 8: return `<g ${s}>
      <circle r="36" fill="#fbc02d"/>
      <circle r="28" fill="#fff59d"/>
      <path d="M-40,18 Q-10,4 10,18 Q30,32 44,16" fill="none" stroke="#eceff1" stroke-width="3"/>
      <path d="M-36,28 Q-8,14 12,28 Q32,40 42,26" fill="none" stroke="#eceff1" stroke-width="2.4"/>
    </g>`;
    case 9: return `<g ${s}>
      ${[0,30,60,90,120,150,180,210,240,270,300,330].map(a=>`<ellipse cx="0" cy="-20" rx="6" ry="20" fill="#fdd835" transform="rotate(${a})" stroke="#f9a825" stroke-width=".5"/>`).join('')}
      <circle r="8" fill="#f57f17"/>
    </g>`;
    case 10: return `<g ${s}>
      <path d="M0,-8 L18,-28 L14,-4 L32,8 L10,10 L0,30 L-10,10 L-32,8 L-14,-4 L-18,-28 Z" fill="#e64a19"/>
      <path d="M22,6 L36,-8 L30,10 L46,20 L28,22 L22,38 L16,22 L-2,20 L14,10 L8,-8 Z" fill="#ff7043"/>
    </g>`;
    case 11: return `<g ${s}>
      <path d="M0,-20 C-30,-50 -40,10 -8,28 C-20,0 -10,-20 0,-20" fill="#42a5f5"/>
      <path d="M0,-20 C30,-50 40,10 8,28 C20,0 10,-20 0,-20" fill="#1e88e5"/>
      <path d="M-6,10 Q0,40 6,10" fill="#1565c0"/>
      <ellipse cx="0" cy="-6" rx="10" ry="14" fill="#fff59d"/>
    </g>`;
    default: return `<g ${s}>
      <path d="M-28,-40 Q-10,-10 -24,30" fill="none" stroke="#546e7a" stroke-width="3"/>
      <path d="M-24,-20 Q8,-36 22,-8" fill="none" stroke="#78909c" stroke-width="2"/>
      ${[-18,-6,8,20].map((x,i)=>`<line x1="${x}" y1="${-30+i*8}" x2="${x-6}" y2="${-10+i*8}" stroke="#90caf9" stroke-width="2"/>`).join('')}
    </g>`;
  }
}

function typeBadge(kind, extra) {
  if (kind === 'gwang') {
    return extra && extra.bigwang
      ? `<circle cx="110" cy="248" r="28" fill="#546e7a" stroke="#cfd8dc" stroke-width="2"/><text x="110" y="256" text-anchor="middle" font-size="20" fill="#eceff1" font-weight="700">非</text>`
      : `<circle cx="110" cy="248" r="30" fill="#f9a825" stroke="#ffecb3" stroke-width="3"/><text x="110" y="257" text-anchor="middle" font-size="22" fill="#4e342e" font-weight="700">光</text>`;
  }
  if (kind === 'yeol') {
    const label = extra.godori ? '鳥' : extra.kukjin ? '菊' : extra.ddong ? '雨' : '十';
    return `<rect x="78" y="226" width="64" height="36" rx="8" fill="#bf360c"/><text x="110" y="251" text-anchor="middle" font-size="18" fill="#fff3e0" font-weight="700">${label}</text>`;
  }
  if (kind === 'tti') {
    const col = extra.ttiColor === 'hong' ? '#c62828' : extra.ttiColor === 'cheong' ? '#1565c0' : '#2e7d32';
    return `<path d="M40,232 Q110,210 180,232 Q110,254 40,232" fill="${col}"/>
      <path d="M48,238 Q110,222 172,238" fill="none" stroke="#fff8e1" stroke-width="2" opacity=".7"/>`;
  }
  if (kind === 'ssangpi') {
    return `<g>
      <circle cx="88" cy="244" r="16" fill="#6d4c41" stroke="#d7ccc8"/>
      <circle cx="132" cy="244" r="16" fill="#6d4c41" stroke="#d7ccc8"/>
      <text x="88" y="250" text-anchor="middle" font-size="11" fill="#ffe0b2">皮</text>
      <text x="132" y="250" text-anchor="middle" font-size="11" fill="#ffe0b2">皮</text>
    </g>`;
  }
  return `<circle cx="110" cy="246" r="14" fill="#8d6e63"/><circle cx="110" cy="246" r="6" fill="#d7ccc8"/>`;
}

function hwatuCard(def) {
  const pal = MONTH_COLOR[def.month];
  const kindName = def.kind === 'gwang' ? (def.bigwang ? '비광' : '광')
    : def.kind === 'yeol' ? (def.godori ? '고도리' : def.kukjin ? '국진' : def.ddong ? '똥' : '열끗')
    : def.kind === 'tti' ? (def.ttiColor === 'hong' ? '홍단' : def.ttiColor === 'cheong' ? '청단' : '초단')
    : def.kind === 'ssangpi' ? '쌍피' : '피';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 360" width="220" height="360">
  <rect x="1" y="1" width="218" height="358" rx="14" fill="#3e2723" stroke="#1b0000" stroke-width="2"/>
  <rect x="8" y="8" width="204" height="344" rx="10" fill="#f3e5ab"/>
  <rect x="14" y="14" width="192" height="332" rx="8" fill="${pal.bg}" stroke="${pal.acc}" stroke-width="2"/>
  <rect x="14" y="14" width="192" height="46" rx="8" fill="${pal.ink}"/>
  <rect x="14" y="44" width="192" height="16" fill="${pal.ink}"/>
  <text x="28" y="44" font-size="22" font-weight="800" fill="#fff8e1">${def.month}</text>
  <text x="52" y="42" font-size="13" fill="#fff8e1" opacity=".9">월 ${def.monthName}</text>
  <text x="192" y="42" text-anchor="end" font-size="13" font-weight="700" fill="#ffe082">${kindName}</text>
  ${motif(def.month, 110, 150)}
  ${typeBadge(def.kind, def)}
  <text x="110" y="312" text-anchor="middle" font-size="12" fill="${pal.ink}" font-weight="700">${def.monthName}</text>
  <text x="110" y="330" text-anchor="middle" font-size="11" fill="${pal.acc}">${kindName}</text>
</svg>`;
}

function hwatuBack() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 360" width="220" height="360">
  <rect x="1" y="1" width="218" height="358" rx="14" fill="#4a0d0d" stroke="#1b0000" stroke-width="2"/>
  <rect x="12" y="12" width="196" height="336" rx="10" fill="#6d1b1b"/>
  <rect x="22" y="22" width="176" height="316" rx="8" fill="none" stroke="#c9a227" stroke-width="2"/>
  <pattern id="hpat" width="18" height="18" patternUnits="userSpaceOnUse">
    <path d="M9 0 L18 9 L9 18 L0 9 Z" fill="none" stroke="#c9a227" stroke-width=".7" opacity=".4"/>
  </pattern>
  <rect x="22" y="22" width="176" height="316" rx="8" fill="url(#hpat)"/>
  <circle cx="110" cy="180" r="38" fill="#4a0d0d" stroke="#c9a227" stroke-width="2"/>
  <text x="110" y="188" text-anchor="middle" font-size="22" fill="#c9a227" font-weight="700">화투</text>
</svg>`;
}

const { hwatuDefs } = require('../lib/korean-cards');

function main() {
  const pokerDir = path.join(__dirname, '..', 'public', 'img', 'cards');
  const hwatuDir = path.join(__dirname, '..', 'public', 'img', 'hwatu');
  for (const r of RANKS) {
    for (const s of Object.keys(SUIT_META)) {
      write(pokerDir, `${r}${s}.svg`, pokerCard(r, s));
    }
  }
  write(pokerDir, 'back.svg', pokerBack());

  const seen = new Set();
  for (const def of hwatuDefs()) {
    const name = `${def.img}.svg`;
    if (seen.has(name)) continue;
    seen.add(name);
    write(hwatuDir, name, hwatuCard(def));
  }
  write(hwatuDir, 'back.svg', hwatuBack());
  console.log('generated', fs.readdirSync(pokerDir).length, 'poker +', fs.readdirSync(hwatuDir).length, 'hwatu cards');
}

main();
