// ═══════════════════════════════════════════
// hwatu.js – 화투 카드 렌더러 (섯다 / 고스톱 공용)
//
// 카드 그림은 "실제 이미지 우선"이다.
//   public/img/hwatu/<월>-<번호>.png  (예: 1-0.png = 1월 광, 12-3.png = 비 쌍피)
// 이미지가 있으면 그걸 쓰고, 없으면 아래 벡터 아트로 자동 대체된다.
// 이미지 세트를 폴더에 넣기만 하면 코드 수정 없이 바로 적용된다.
// ═══════════════════════════════════════════

const HW_IMG_BASE = './img/hwatu/';
const HW_IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];   // 순서대로 탐색
let HW_IMG_EXT = null;

// null = 아직 확인 전, true = 이미지 세트 있음, false = 벡터 아트 사용
let HW_IMG_READY = null;
const _hwImgWaiters = [];

// 1-0 카드로 확장자를 한 번만 탐색한다. 하나라도 뜨면 그 확장자로 전부 로드.
function hwProbeImages() {
  if (HW_IMG_READY !== null) return Promise.resolve(HW_IMG_READY);
  return new Promise(resolve => {
    _hwImgWaiters.push(resolve);
    if (_hwImgWaiters.length > 1) return;
    const done = ok => {
      HW_IMG_READY = ok;
      _hwImgWaiters.splice(0).forEach(fn => fn(ok));
    };
    let i = 0;
    const tryNext = () => {
      if (i >= HW_IMG_EXTS.length) return done(false);
      const ext = HW_IMG_EXTS[i++];
      const im = new Image();
      im.onload  = () => { HW_IMG_EXT = ext; done(true); };
      im.onerror = tryNext;
      im.src = HW_IMG_BASE + '1-0' + ext;
    };
    tryNext();
  });
}

const HW_MONTHS = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란',
                   '홍싸리', '공산', '국화', '단풍', '오동', '비'];
const HW_HANJA  = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

const HW_KIND_LABEL = { gwang: '광', yeol: '열', tti: '띠', pi: '피' };
const HW_TTI_LABEL  = { hong: '홍단', cheong: '청단', cho: '초단', bi: '비띠' };
const HW_KIND_COLOR = { gwang: '#d4af37', yeol: '#4a90d9', tti: '#e05555', pi: '#7b8a7b' };

// 월별 색 (배경 톤 / 주 모티프 색)
const HW_TONE = ['',
  ['#1e6b3a', '#e8f3e6'], ['#c2185b', '#fdeef4'], ['#e05a7a', '#fdeff2'],
  ['#2f2f2f', '#ecefec'], ['#7b4fa8', '#f3eefa'], ['#c62828', '#fdeeee'],
  ['#a63232', '#fceded'], ['#e0812a', '#fdf3e6'], ['#c9a227', '#fdf8e4'],
  ['#c0392b', '#fdeeea'], ['#6a4fa8', '#f1eefa'], ['#2b5f8a', '#eaf1f7'],
];

function hwCardLabel(card) {
  if (!card) return '';
  if (card.kind === 'pi') return card.pi === 2 ? '쌍피' : '피';
  if (card.kind === 'tti') return HW_TTI_LABEL[card.sub] || '띠';
  if (card.kind === 'gwang') return card.bi ? '비광' : '광';
  if (card.kind === 'yeol') return card.godori ? '고도리' : '열끗';
  return HW_KIND_LABEL[card.kind] || '';
}

// ── 벡터 아트 (이미지 세트가 없을 때) ──────────────────
function _hwMotif(m, kind, card) {
  const [ink] = HW_TONE[m] || ['#333'];
  const G = s => `<g transform="translate(45,74)">${s}</g>`;
  switch (m) {
    case 1: // 송학 — 소나무와 학
      return `<path d="M20 118 L45 62 L70 118 Z" fill="#1e6b3a"/><path d="M27 96 L45 52 L63 96 Z" fill="#2b8b4e"/>
        <rect x="42" y="112" width="6" height="14" fill="#5d4037"/>
        ${kind === 'gwang' ? `<circle cx="62" cy="42" r="15" fill="#e53935"/>
        <ellipse cx="36" cy="76" rx="17" ry="10" fill="#fff" stroke="#bbb"/><circle cx="24" cy="66" r="5" fill="#fff" stroke="#bbb"/>
        <circle cx="22" cy="62" r="2.6" fill="#e53935"/><path d="M28 84 l-4 12 M40 86 l2 12" stroke="#333" stroke-width="1.6"/>` : ''}`;
    case 2: // 매조 — 매화와 휘파람새
      return `<path d="M28 122 Q40 84 62 46" stroke="#6d4c41" stroke-width="4" fill="none"/>
        ${[[58,44],[46,64],[64,68],[38,86],[56,92]].map(([x,y])=>
          `<g transform="translate(${x},${y})">${[0,72,144,216,288].map(a=>
          `<ellipse cx="0" cy="-6" rx="3.4" ry="5" fill="#f06292" transform="rotate(${a})"/>`).join('')}<circle r="1.8" fill="#fff59d"/></g>`).join('')}
        ${kind === 'yeol' ? `<ellipse cx="34" cy="104" rx="11" ry="7.5" fill="#8bc34a"/><circle cx="25" cy="99" r="4.6" fill="#8bc34a"/>
        <path d="M21 99 l-5 1.6 5 1.6z" fill="#f9a825"/><circle cx="24" cy="97.5" r="1.2" fill="#222"/>
        <path d="M44 106 l9 4 -9 2z" fill="#689f38"/>` : ''}`;
    case 3: // 벚꽃 — 만막
      return `${kind === 'gwang' ? `<rect x="14" y="34" width="62" height="20" rx="3" fill="#fff" stroke="#c62828" stroke-width="2"/>
        <path d="M14 44 h62 M30 34 v20 M60 34 v20" stroke="#c62828" stroke-width="2"/>
        <path d="M22 54 l0 12 M68 54 l0 12" stroke="#c62828" stroke-width="2.4"/>` : ''}
        <path d="M30 124 Q42 100 40 74" stroke="#6d4c41" stroke-width="4" fill="none"/>
        ${[[40,70],[26,88],[56,84],[44,100],[64,104]].map(([x,y])=>
          `<g transform="translate(${x},${y})">${[0,72,144,216,288].map(a=>
          `<path d="M0 -3 L2.6 -9.4 L0 -11.6 L-2.6 -9.4 Z" fill="#f8bbd0" stroke="#ec407a" stroke-width=".5" transform="rotate(${a})"/>`).join('')}<circle r="2" fill="#fff59d"/></g>`).join('')}`;
    case 4: // 흑싸리 — 등나무와 두견새
      return `<path d="M45 34 v26" stroke="#4e342e" stroke-width="3"/>
        ${[[34,60],[45,64],[56,60]].map(([x,y])=>
          `<path d="M${x} ${y} q-6 18 -1 34 q6 -16 1 -34z" fill="#37474f"/>`).join('')}
        ${kind === 'yeol' ? `<ellipse cx="52" cy="112" rx="11" ry="7" fill="#455a64"/><circle cx="61" cy="107" r="4.4" fill="#455a64"/>
        <path d="M65 107 l5 1.6 -5 1.6z" fill="#f9a825"/><circle cx="62" cy="105.6" r="1.2" fill="#fff"/>` : ''}`;
    case 5: // 난초 — 창포와 다리
      return `${[[-16,0],[0,-4],[16,2]].map(([dx,dy])=>
          `<path d="M${45+dx} ${118+dy} q${dx/2} -36 ${dx*1.2} -58" stroke="#2e7d32" stroke-width="3.4" fill="none"/>`).join('')}
        <g transform="translate(45,56)">${[0,60,120,180,240,300].map(a=>
          `<ellipse cx="0" cy="-8" rx="4" ry="9" fill="#8e5fc4" transform="rotate(${a})"/>`).join('')}<circle r="2.4" fill="#fdd835"/></g>
        ${kind === 'yeol' ? `<rect x="14" y="96" width="62" height="7" rx="2" fill="#f9a825"/><rect x="20" y="103" width="5" height="14" fill="#ef6c00"/><rect x="65" y="103" width="5" height="14" fill="#ef6c00"/>` : ''}`;
    case 6: // 모란 — 나비
      return `${[[34,80],[58,96]].map(([x,y])=>
          `<g transform="translate(${x},${y})">${[0,60,120,180,240,300].map(a=>
          `<ellipse cx="0" cy="-9" rx="6.4" ry="9" fill="#d81b60" transform="rotate(${a})"/>`).join('')}<circle r="3.4" fill="#fff59d"/></g>`).join('')}
        <path d="M30 124 q10 -22 6 -40" stroke="#2e7d32" stroke-width="3" fill="none"/>
        ${kind === 'yeol' ? `<g transform="translate(58,52)"><ellipse cx="-7" cy="-3" rx="8" ry="10" fill="#5c6bc0" transform="rotate(-24)"/>
        <ellipse cx="7" cy="-3" rx="8" ry="10" fill="#5c6bc0" transform="rotate(24)"/><rect x="-1.2" y="-8" width="2.4" height="15" rx="1" fill="#283593"/>
        <path d="M-1 -8 l-5 -7 M1 -8 l5 -7" stroke="#283593" stroke-width="1.2"/></g>` : ''}`;
    case 7: // 홍싸리 — 멧돼지
      return `${[[30,54],[45,48],[60,56]].map(([x,y])=>
          `<path d="M${x} ${y} q-5 20 0 38 q5 -18 0 -38z" fill="#c62828"/>`).join('')}
        ${kind === 'yeol' ? `<ellipse cx="45" cy="106" rx="20" ry="12" fill="#5d4037"/><circle cx="63" cy="100" r="8" fill="#5d4037"/>
        <path d="M70 100 l6 2 -6 2z" fill="#4e342e"/><circle cx="66" cy="97" r="1.4" fill="#fff"/>
        <path d="M32 116 v6 M42 118 v6 M52 118 v6" stroke="#4e342e" stroke-width="2.4"/>
        <path d="M58 94 l4 -7 3 7z" fill="#3e2723"/>` : ''}`;
    case 8: // 공산 — 보름달과 기러기
      return `<path d="M6 126 q22 -34 39 -34 q17 0 39 34z" fill="#37474f"/>
        ${kind === 'gwang' ? `<circle cx="45" cy="48" r="19" fill="#fff8e1" stroke="#f9a825" stroke-width="1.4"/>` : ''}
        ${kind === 'yeol' ? `<circle cx="45" cy="42" r="14" fill="#fff8e1" opacity=".55"/>
        ${[[28,64],[45,54],[62,66]].map(([x,y])=>`<path d="M${x-9} ${y} q9 -9 9 0 q0 -9 9 0" stroke="#263238" stroke-width="2.6" fill="none"/>`).join('')}` : ''}`;
    case 9: // 국화 — 술잔
      return `<g transform="translate(45,62)">${[0,45,90,135,180,225,270,315].map(a=>
          `<ellipse cx="0" cy="-13" rx="5" ry="12" fill="#fdd835" transform="rotate(${a})"/>`).join('')}
        ${[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5].map(a=>
          `<ellipse cx="0" cy="-9" rx="4" ry="9" fill="#fbc02d" transform="rotate(${a})"/>`).join('')}<circle r="5" fill="#f57f17"/></g>
        <path d="M45 76 v22" stroke="#2e7d32" stroke-width="3"/>
        ${kind === 'yeol' ? `<path d="M28 98 h34 l-6 14 h-22z" fill="#e53935" stroke="#b71c1c"/><rect x="41" y="112" width="8" height="6" fill="#b71c1c"/>
        <rect x="33" y="118" width="24" height="4" rx="2" fill="#b71c1c"/><text x="45" y="110" font-size="8" fill="#fff" text-anchor="middle">壽</text>` : ''}`;
    case 10: // 단풍 — 사슴
      return `${[[28,50],[62,58],[42,42]].map(([x,y])=>
          `<g transform="translate(${x},${y})">${[0,72,144,216,288].map(a=>
          `<path d="M0 -2 L4 -12 L0 -15 L-4 -12 Z" fill="#e53935" transform="rotate(${a})"/>`).join('')}</g>`).join('')}
        ${kind === 'yeol' ? `<ellipse cx="42" cy="104" rx="17" ry="10" fill="#a1887f"/><circle cx="60" cy="94" r="7" fill="#a1887f"/>
        <path d="M56 88 l-4 -11 M62 87 l3 -12 M52 77 l-5 -4 M65 75 l5 -3" stroke="#5d4037" stroke-width="2"/>
        <circle cx="63" cy="93" r="1.3" fill="#3e2723"/><path d="M32 114 v9 M50 114 v9" stroke="#5d4037" stroke-width="2.4"/>` : ''}`;
    case 11: // 오동 — 봉황
      return `${[[26,52],[45,44],[64,54]].map(([x,y])=>
          `<path d="M${x} ${y} q-13 12 -4 24 q11 6 17 -6 q4 -14 -13 -18z" fill="#6a4fa8"/>`).join('')}
        ${kind === 'gwang' ? `<path d="M30 118 q14 -26 34 -14 q-6 -14 6 -20 q-16 -4 -20 8 q-14 -6 -20 10z" fill="#f9a825" stroke="#ef6c00"/>
        <circle cx="66" cy="82" r="1.6" fill="#3e2723"/><path d="M52 118 q12 8 22 2" stroke="#ef6c00" stroke-width="2" fill="none"/>` : ''}`;
    case 12: // 비 — 우산 쓴 사람 / 제비 / 비띠
      return `${[16,30,44,58,72].map(x=>`<path d="M${x} 30 l-5 26" stroke="#90a4ae" stroke-width="1.8"/>`).join('')}
        ${kind === 'gwang' ? `<path d="M22 74 q23 -26 46 0z" fill="#c62828" stroke="#8e0000"/><path d="M45 74 v34" stroke="#4e342e" stroke-width="3"/>
        <circle cx="45" cy="60" r="0" /><ellipse cx="45" cy="116" rx="13" ry="8" fill="#37474f"/>` : ''}
        ${kind === 'yeol' ? `<path d="M22 96 q22 -22 46 -8 q-20 2 -26 14 q-12 4 -20 -6z" fill="#263238"/><path d="M50 102 l16 12 -18 -3z" fill="#263238"/>` : ''}`;
    default: return G(`<circle r="20" fill="${ink}" opacity=".2"/>`);
  }
}

function hwFallbackSVG(card) {
  const m = card.m;
  const [ink, bg] = HW_TONE[m] || ['#333', '#f5f5f0'];
  const kind = card.kind || (card.gwang ? 'gwang' : 'pi');
  const label = hwCardLabel(card);
  const badge = HW_KIND_COLOR[kind] || '#888';
  let ribbon = '';
  if (kind === 'tti') {
    const rc = { hong: '#e53935', cheong: '#3f51b5', cho: '#e53935', bi: '#e53935' }[card.sub] || '#e53935';
    const txt = { hong: '홍단', cheong: '청단' }[card.sub] || '';
    ribbon = `<rect x="13" y="60" width="64" height="15" rx="3" fill="${rc}" opacity=".92"/>
      ${txt ? `<text x="45" y="71.5" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">${txt}</text>` : ''}`;
  }
  return `<svg viewBox="0 0 90 140" xmlns="http://www.w3.org/2000/svg" class="hw-svg">
  <rect x="1" y="1" width="88" height="138" rx="8" fill="${bg}" stroke="${ink}" stroke-width="2"/>
  <rect x="5" y="5" width="80" height="130" rx="6" fill="none" stroke="${ink}" stroke-width=".7" opacity=".35"/>
  <rect x="5" y="5" width="80" height="17" rx="5" fill="${ink}" opacity=".9"/>
  <text x="10" y="18" font-size="11" fill="#fff" font-weight="bold">${HW_HANJA[m]}</text>
  <text x="80" y="18" font-size="8.5" fill="rgba(255,255,255,.85)" text-anchor="end">${HW_MONTHS[m]}</text>
  ${_hwMotif(m, kind, card)}
  ${ribbon}
  <rect x="6" y="120" width="${label.length > 2 ? 30 : 22}" height="14" rx="7" fill="${badge}"/>
  <text x="${6 + (label.length > 2 ? 15 : 11)}" y="130.5" font-size="9" fill="#fff" text-anchor="middle" font-weight="bold">${label}</text>
  ${card.pi === 2 ? '<text x="82" y="131" font-size="9" fill="#c0392b" text-anchor="end" font-weight="bold">×2</text>' : ''}
</svg>`;
}

// ── 공개 렌더 API ─────────────────────────
// opts: {w, h, cls, onclick, sel, dim, title}
function hwCardHTML(card, opts) {
  const o = opts || {};
  const w = o.w || 52, h = o.h || Math.round((o.w || 52) * 140 / 90);
  const cls = ['hw-card', o.cls || '', o.sel ? 'sel' : '', o.dim ? 'dim' : ''].filter(Boolean).join(' ');
  const style = `width:${w}px;height:${h}px`;
  const click = o.onclick ? ` onclick="${o.onclick}"` : '';
  const title = ` title="${escHtml(`${card.m}월 ${HW_MONTHS[card.m]} ${hwCardLabel(card)}`)}"`;
  const inner = HW_IMG_READY
    ? `<img src="${HW_IMG_BASE}${card.id}${HW_IMG_EXT}" alt="${escHtml(HW_MONTHS[card.m])}" draggable="false">`
    : hwFallbackSVG(card);
  return `<div class="${cls}" style="${style}"${click}${title} data-cid="${card.id}">${inner}</div>`;
}

function hwBackHTML(opts) {
  const o = opts || {};
  const w = o.w || 52, h = o.h || Math.round((o.w || 52) * 140 / 90);
  return `<div class="hw-card back" style="width:${w}px;height:${h}px">
  <svg viewBox="0 0 90 140" xmlns="http://www.w3.org/2000/svg" class="hw-svg">
    <rect x="1" y="1" width="88" height="138" rx="8" fill="#7b1421" stroke="#4a0d15" stroke-width="2"/>
    <rect x="8" y="8" width="74" height="124" rx="6" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.4"/>
    <circle cx="45" cy="70" r="21" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.4"/>
    <circle cx="45" cy="70" r="9" fill="rgba(255,255,255,.12)"/>
  </svg></div>`;
}

function hwCardsHTML(cards, opts) {
  if (!cards || !cards.length) return `<div class="hw-empty">${(opts && opts.empty) || '없음'}</div>`;
  return cards.map((c, i) => c ? hwCardHTML(c, {
    ...opts,
    sel: opts && opts.selId === c.id,
    onclick: opts && opts.onclick ? opts.onclick.replace('$id', `'${c.id}'`).replace('$i', i) : null,
  }) : hwBackHTML(opts)).join('');
}

// 획득패를 종류별로 묶어 보여준다
function hwCapturedHTML(cap, w) {
  const order = ['gwang', 'yeol', 'tti', 'pi'];
  const groups = order.map(k => cap.filter(c => c.kind === k)).filter(g => g.length);
  if (!groups.length) return '<div class="hw-empty">획득 없음</div>';
  return `<div class="hw-cap-groups">${groups.map(g =>
    `<div class="hw-cap-group">${g.map(c => hwCardHTML(c, { w: w || 26 })).join('')}</div>`).join('')}</div>`;
}
