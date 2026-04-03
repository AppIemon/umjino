// ═══════════════════════════════════════════
// utils.js  –  BigInt / chips / audio / cards
// ═══════════════════════════════════════════

// ── BigInt helpers ──────────────────────────
function pow10(n){return BigInt('1'+'0'.repeat(n))}

const CHIP_DEF=[
  [0,'1'],[1,'10'],[2,'100'],[3,'1천'],[4,'1만'],[5,'10만'],[6,'100만'],[7,'1천만'],
  [8,'1억'],[9,'10억'],[10,'100억'],[11,'1천억'],[12,'1조'],[13,'10조'],[14,'100조'],[15,'1천조'],
  [16,'1경'],[17,'10경'],[18,'100경'],[19,'1천경'],[20,'1해'],[21,'10해'],[22,'100해'],[23,'1천해'],
  [24,'1자'],[25,'10자'],[26,'100자'],[27,'1천자'],[28,'1양'],[29,'10양'],[30,'100양'],[31,'1천양'],
  [32,'1구'],[33,'10구'],[34,'100구'],[35,'1천구'],[36,'1간'],[37,'10간'],[38,'100간'],[39,'1천간'],
  [40,'1정'],[41,'10정'],[42,'100정'],[43,'1천정'],[44,'1재'],[45,'10재'],[46,'100재'],[47,'1천재'],
  [48,'1극'],[49,'10극'],[50,'100극'],[51,'1천극'],[52,'1항사'],[53,'10항사'],[54,'100항사'],[55,'1천항사'],
  [56,'1아승기'],[57,'10아승기'],[58,'100아승기'],[59,'1천아승기'],
  [60,'1나유타'],[61,'10나유타'],[62,'100나유타'],[63,'1천나유타'],
  [64,'1불가사의'],[65,'10불가사의'],[66,'100불가사의'],[67,'1천불가사의'],[68,'1무량대수'],
  // + 토큰 (10^72 ~ 10^140, 4씩)
  [72,'1+'],[76,'1만+'],[80,'1억+'],[84,'1조+'],[88,'1경+'],
  [92,'1해+'],[96,'1자+'],[100,'1양+'],[104,'1구+'],[108,'1간+'],
  [112,'1정+'],[116,'1재+'],[120,'1극+'],[124,'1항사+'],[128,'1아승기+'],
  [132,'1나유타+'],[136,'1불가사의+'],[140,'1천불가사의+'],
  // ++ 토큰 (10^144 ~ 10^212, 4씩)
  [144,'1++'],[148,'1만++'],[152,'1억++'],[156,'1조++'],[160,'1경++'],
  [164,'1해++'],[168,'1자++'],[172,'1양++'],[176,'1구++'],[180,'1간++'],
  [184,'1정++'],[188,'1재++'],[192,'1극++'],[196,'1항사++'],[200,'1아승기++'],
  [204,'1나유타++'],[208,'1불가사의++'],[212,'1천불가사의++'],
  // +++ 토큰 (10^216 ~)
  [216,'1+++'],[220,'1만+++'],[228,'1억+++'],[236,'1조+++'],
];
const PALETTE=['#D0CFC8','#CC2222','#2244BB','#1A7A1A','#1A1A1A','#882299','#CC6600','#AA8800','#8B0000','#006868','#BB2277','#334499'];
// + 칩 팔레트: 무지개/홀로그램 느낌
const PLUS1_PALETTE=['#FF2266','#FF6600','#DDAA00','#22BB44','#0088FF','#7722FF','#FF22BB','#00CCAA','#FF4488','#5500FF','#FF8800','#00CC66','#3300CC','#FF0044','#00AAFF','#CC0088','#88FF00','#FF6644'];
// ++ 칩 팔레트: 금/백금 느낌
const PLUS2_PALETTE=['#FFD700','#F0C040','#E8B830','#FFE066','#FFC940','#F4D03F','#FFD740','#E5BE38','#FFC300','#F7D060','#FFB700','#F5C518','#FFD000','#FFCA28','#FFC107','#FFB300','#FFAA00','#FF9800'];
// +++ 이상 팔레트: 백금/다이아몬드
const PLUS3_PALETTE=['#E8E8F8','#D0D8FF','#C8E8FF','#D8F0FF','#E0E0FF','#C0D0FF','#D8E8F8','#E8F0FF'];

function _chipTier(label) {
  const p3 = (label.match(/\+/g)||[]).length >= 3;
  const p2 = !p3 && (label.match(/\+/g)||[]).length === 2;
  const p1 = !p3 && !p2 && label.includes('+');
  return p3 ? 3 : p2 ? 2 : p1 ? 1 : 0;
}

const chipTypes = CHIP_DEF.map(([exp, label], idx) => {
  const tier = _chipTier(label);
  let color;
  if (tier === 3) color = PLUS3_PALETTE[idx % PLUS3_PALETTE.length];
  else if (tier === 2) color = PLUS2_PALETTE[idx % PLUS2_PALETTE.length];
  else if (tier === 1) color = PLUS1_PALETTE[idx % PLUS1_PALETTE.length];
  else color = PALETTE[idx % PALETTE.length];
  return { value: pow10(exp), label, color, idx, tier };
});
const FMT_UNITS=[
  [pow10(68),'무량대수'],[pow10(64),'불가사의'],[pow10(60),'나유타'],[pow10(56),'아승기'],
  [pow10(52),'항하사'],[pow10(48),'극'],[pow10(44),'재'],[pow10(40),'정'],[pow10(36),'간'],
  [pow10(32),'구'],[pow10(28),'양'],[pow10(24),'자'],[pow10(20),'해'],[pow10(16),'경'],
  [pow10(12),'조'],[pow10(8),'억'],[pow10(4),'만'],[pow10(3),'천'],
];

// 무량대수 단위 (10^68)
const MURYANGDAESU = pow10(68);
// 1+ = 10000무량대수 = 10^72
const PLUS1 = pow10(72);
// MAX = 1000무량대수++ = (10^72)^2 * 10^71 — 사실상 무한대 취급

// + 표기 시스템
// 1+  = 10^72  (1만 무량대수)
// 1++ = 10^144 (1만 무량대수의 1만 무량대수배)
// 등 등...

function _countPlus(n) {
  // n이 몇 번 PLUS1로 나눠지는지 (정수 로그)
  let count = 0, v = n;
  while (v >= PLUS1) { v = v / PLUS1; count++; }
  return { count, remainder: v };
}

function _plusStr(count) {
  return count <= 3 ? '+'.repeat(count) : ('+'.repeat(3) + String(count));
}
function plusNotation(n) {
  if (n < PLUS1) return formatBigBelow(n);
  const { count, remainder } = _countPlus(n);
  return formatBigBelow(remainder) + _plusStr(count);
}

// 무량대수 이하 포맷 (재귀 방지용)
function formatBigBelow(n) {
  if (n === 0n) return '0';
  if (n < 10000n) return n.toString();
  let r = n, p = [];
  for (const [v, nm] of FMT_UNITS) if (r >= v) { p.push(r/v + nm); r = r % v; }
  if (r > 0n) p.push(r.toString());
  return p.join(' ');
}

function formatBig(n) {
  if (n < 0n) return '-' + formatBig(-n);
  if (n >= PLUS1) return plusNotation(n);
  return formatBigBelow(n);
}
function shortFmt(n) {
  if (n < 0n) return '-' + shortFmt(-n);
  if (n >= PLUS1) {
    const { count, remainder } = _countPlus(n);
    const plusStr = '+'.repeat(count);
    // remainder를 단위로 표시
    if (remainder < 10000n) return remainder.toString() + plusStr;
    for (const [v, nm] of FMT_UNITS) if (remainder >= v) {
      const q = remainder / v;
      return (remainder % v > 0n ? '약 ' : '') + q + nm + plusStr;
    }
    return remainder.toString() + plusStr;
  }
  if (n < 10000n) return n.toString();
  for (const [v, nm] of FMT_UNITS) if (n >= v) {
    const q = n / v;
    return (n % v > 0n ? '약 ' : '') + q + nm;
  }
  return n.toString();
}
function lightenHex(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'#'+[Math.max(0,Math.min(255,r+a)),Math.max(0,Math.min(255,g+a)),Math.max(0,Math.min(255,b+a))].map(v=>v.toString(16).padStart(2,'0')).join('')}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function cmpBigStr(a,b){const sa=(a||'0').replace(/^0+/,'')||'0',sb=(b||'0').replace(/^0+/,'')||'0';if(sa.length!==sb.length)return sa.length-sb.length;return sa.localeCompare(sb)}

// ── Chip SVG ────────────────────────────────
function createChipSVG(chip){
  const{color,label,idx,tier=0}=chip;
  const gid='cg'+idx,sid='cs'+idx;
  const light=lightenHex(color,50);
  const len=label.length,fs=len>=8?6.5:len>=6?8:len>=5?9.5:len>=4?11:len>=3?13:16,ty=len>=5?64:65;

  // ── tier 0: 일반 칩 ──────────────────────────────────────────────────────
  if(tier===0){
    const inlays=[0,45,90,135,180,225,270,315].map(a=>{
      const rad=a*Math.PI/180,cx=(60+Math.cos(rad)*46).toFixed(1),cy=(60+Math.sin(rad)*46).toFixed(1);
      return`<rect x="-4" y="-7" width="8" height="14" rx="2" fill="white" opacity="0.88" transform="translate(${cx},${cy}) rotate(${a+90})"/>`;
    }).join('');
    return`<svg class="chip-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="${gid}" cx="38%" cy="32%" r="62%"><stop offset="0%" stop-color="${light}"/><stop offset="100%" stop-color="${color}"/></radialGradient>
<filter id="${sid}"><feDropShadow dx="1" dy="2" stdDeviation="3" flood-opacity="0.5"/></filter></defs>
<circle cx="60" cy="61" r="54" fill="${color}" opacity="0.25" filter="url(#${sid})"/>
<circle cx="60" cy="60" r="54" fill="url(#${gid})" stroke="#111" stroke-width="2.5"/>
<circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
${inlays}
<circle cx="60" cy="60" r="39" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
<circle cx="60" cy="60" r="33" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
<circle cx="60" cy="60" r="33" fill="rgba(255,255,255,0.08)"/>
<text x="60" y="${ty}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="white" stroke="rgba(0,0,0,0.6)" stroke-width="0.8" paint-order="stroke">${label}</text>
</svg>`;
  }

  // ── tier 1: + 칩 (홀로그램/무지개) ────────────────────────────────────────
  if(tier===1){
    // 다이아몬드 엣지 인레이 + 무지개 테두리
    const rainbowStops=['#FF2266','#FF8800','#FFDD00','#22CC44','#0088FF','#8822FF','#FF2266'];
    const diamonds=[0,45,90,135,180,225,270,315].map(a=>{
      const rad=a*Math.PI/180,cx=(60+Math.cos(rad)*46).toFixed(1),cy=(60+Math.sin(rad)*46).toFixed(1);
      return`<polygon points="-5,0 0,-8 5,0 0,8" fill="white" opacity="0.92" transform="translate(${cx},${cy}) rotate(${a})"/>`;
    }).join('');
    return`<svg class="chip-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="${gid}" cx="40%" cy="35%" r="65%">
    <stop offset="0%" stop-color="${lightenHex(color,70)}"/>
    <stop offset="60%" stop-color="${color}"/>
    <stop offset="100%" stop-color="${lightenHex(color,-20)||color}"/>
  </radialGradient>
  <linearGradient id="${gid}r" x1="0%" y1="0%" x2="100%" y2="100%">
    ${rainbowStops.map((c,i)=>`<stop offset="${Math.round(i/6*100)}%" stop-color="${c}" stop-opacity="0.7"/>`).join('')}
  </linearGradient>
  <filter id="${sid}"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="${color}" flood-opacity="0.7"/></filter>
</defs>
<circle cx="60" cy="61" r="55" fill="${color}" opacity="0.3" filter="url(#${sid})"/>
<circle cx="60" cy="60" r="54" fill="url(#${gid})" stroke="#222" stroke-width="2"/>
<circle cx="60" cy="60" r="54" fill="url(#${gid}r)" opacity="0.25"/>
<circle cx="60" cy="60" r="54" fill="none" stroke="url(#${gid}r)" stroke-width="3" opacity="0.9"/>
${diamonds}
<circle cx="60" cy="60" r="40" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
<circle cx="60" cy="60" r="34" fill="${color}" opacity="0.8"/>
<circle cx="60" cy="60" r="34" fill="rgba(255,255,255,0.12)"/>
<text x="60" y="${ty}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="white" stroke="rgba(0,0,0,0.7)" stroke-width="1" paint-order="stroke">${label}</text>
</svg>`;
  }

  // ── tier 2: ++ 칩 (황금/프리미엄) ─────────────────────────────────────────
  if(tier===2){
    const stars=[0,60,120,180,240,300].map(a=>{
      const rad=a*Math.PI/180,cx=(60+Math.cos(rad)*44).toFixed(1),cy=(60+Math.sin(rad)*44).toFixed(1);
      return`<text x="${cx}" y="${(parseFloat(cy)+4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#FFD700" opacity="0.9">★</text>`;
    }).join('');
    return`<svg class="chip-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="${gid}" cx="38%" cy="30%" r="65%">
    <stop offset="0%" stop-color="#FFF8DC"/>
    <stop offset="40%" stop-color="${color}"/>
    <stop offset="100%" stop-color="#B8860B"/>
  </radialGradient>
  <linearGradient id="${gid}g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#FFD700"/><stop offset="50%" stop-color="#FFF0A0"/>
    <stop offset="100%" stop-color="#B8860B"/>
  </linearGradient>
  <filter id="${sid}"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#FFD700" flood-opacity="0.8"/></filter>
</defs>
<circle cx="60" cy="62" r="55" fill="#B8860B" opacity="0.35" filter="url(#${sid})"/>
<circle cx="60" cy="60" r="54" fill="url(#${gid})" stroke="#8B6914" stroke-width="3"/>
<circle cx="60" cy="60" r="54" fill="none" stroke="url(#${gid}g)" stroke-width="4" opacity="0.8"/>
<circle cx="60" cy="60" r="47" fill="none" stroke="#FFD700" stroke-width="1" opacity="0.5"/>
${stars}
<circle cx="60" cy="60" r="37" fill="none" stroke="#FFD700" stroke-width="2" opacity="0.7"/>
<circle cx="60" cy="60" r="32" fill="#B8860B" opacity="0.5"/>
<circle cx="60" cy="60" r="32" fill="url(#${gid})" opacity="0.6"/>
<text x="60" y="${ty}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="#FFF8DC" stroke="#7B5800" stroke-width="1" paint-order="stroke">${label}</text>
</svg>`;
  }

  // ── tier 3+: +++ 칩 (백금/다이아몬드) ────────────────────────────────────
  const sparkles=[0,40,80,120,160,200,240,280,320].map(a=>{
    const rad=a*Math.PI/180,r=38+12*(a%80===0?1:0);
    const cx=(60+Math.cos(rad)*r).toFixed(1),cy=(60+Math.sin(rad)*r).toFixed(1);
    return`<text x="${cx}" y="${(parseFloat(cy)+3).toFixed(1)}" text-anchor="middle" font-size="${a%80===0?10:7}" fill="white" opacity="${a%80===0?'0.95':'0.6'}">✦</text>`;
  }).join('');
  return`<svg class="chip-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
<defs>
  <radialGradient id="${gid}" cx="38%" cy="30%" r="68%">
    <stop offset="0%" stop-color="#FFFFFF"/><stop offset="30%" stop-color="#D0E8FF"/>
    <stop offset="70%" stop-color="${color}"/><stop offset="100%" stop-color="#8090C0"/>
  </radialGradient>
  <linearGradient id="${gid}p" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#E8F0FF"/><stop offset="33%" stop-color="#C0D0FF"/>
    <stop offset="66%" stop-color="#E0F0FF"/><stop offset="100%" stop-color="#D0E8FF"/>
  </linearGradient>
  <filter id="${sid}"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#8090FF" flood-opacity="0.9"/></filter>
</defs>
<circle cx="60" cy="62" r="55" fill="#8090C0" opacity="0.35" filter="url(#${sid})"/>
<circle cx="60" cy="60" r="54" fill="url(#${gid})" stroke="#A0B0D0" stroke-width="3"/>
<circle cx="60" cy="60" r="54" fill="none" stroke="url(#${gid}p)" stroke-width="4" opacity="0.9"/>
<circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
${sparkles}
<circle cx="60" cy="60" r="35" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
<circle cx="60" cy="60" r="30" fill="rgba(255,255,255,0.15)"/>
<text x="60" y="${ty}" text-anchor="middle" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="white" stroke="rgba(80,100,180,0.8)" stroke-width="1" paint-order="stroke">${label}</text>
</svg>`;
}

// ── Audio ────────────────────────────────────
let _sctx=null;
function sctx(){if(!_sctx)_sctx=new(window.AudioContext||window.webkitAudioContext)();if(_sctx.state==='suspended')_sctx.resume().catch(()=>{});return _sctx}
function _tone(freq,type,vol,dur,t0){try{const c=sctx(),t=c.currentTime+(t0||0),o=c.createOscillator(),g=c.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.01)}catch(e){}}
function sfxChip(){try{const c=sctx(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(1400,t);o.frequency.exponentialRampToValueAtTime(600,t+.07);g.gain.setValueAtTime(.22,t);g.gain.exponentialRampToValueAtTime(.001,t+.13);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.14)}catch(e){}}
function sfxCardFlip(){try{const c=sctx(),t=c.currentTime,buf=c.createBuffer(1,c.sampleRate*.09,c.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.5);const s=c.createBufferSource(),g=c.createGain();s.buffer=buf;s.connect(g);g.connect(c.destination);g.gain.setValueAtTime(.18,t);s.start(t)}catch(e){}}
function sfxWin(){try{const c=sctx(),t=c.currentTime;[[0,.52],[.12,.65],[.24,.78],[.38,.98],[.52,1.04]].forEach(([dt,f])=>{const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=f*1000;g.gain.setValueAtTime(.32,t+dt);g.gain.exponentialRampToValueAtTime(.001,t+dt+.38);o.connect(g);g.connect(c.destination);o.start(t+dt);o.stop(t+dt+.4)})}catch(e){}}
function sfxLose(){try{const c=sctx(),t=c.currentTime;[[0,300],[.18,220],[.36,160]].forEach(([dt,f])=>{const o=c.createOscillator(),g=c.createGain();o.type='sawtooth';o.frequency.value=f;g.gain.setValueAtTime(.3,t+dt);g.gain.exponentialRampToValueAtTime(.001,t+dt+.35);o.connect(g);g.connect(c.destination);o.start(t+dt);o.stop(t+dt+.4)})}catch(e){}}
function sfxDoubleWin(){_tone(880,'triangle',.4,.08);_tone(1100,'triangle',.35,.1,.1);_tone(1320,'triangle',.3,.15,.22)}
function sfxDoubleLose(){_tone(250,'sawtooth',.3,.3)}
function sfxSlotWin(n){try{const c=sctx(),t=c.currentTime,freqs=n>=5?[523,659,784,1047,1319]:n>=4?[523,659,784,1047]:[523,659,784];freqs.forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.3,t+i*.12);g.gain.exponentialRampToValueAtTime(.001,t+i*.12+.38);o.connect(g);g.connect(c.destination);o.start(t+i*.12);o.stop(t+i*.12+.42)})}catch(e){}}
function sfxSlotStop(){_tone(200,'square',.18,.09)}
function sfxRouletteSpin(){try{const c=sctx(),t=c.currentTime;for(let i=0;i<6;i++){const o=c.createOscillator(),g=c.createGain();o.type='square';o.frequency.value=900+Math.random()*500;g.gain.setValueAtTime(.12,t+i*.04);g.gain.exponentialRampToValueAtTime(.001,t+i*.04+.03);o.connect(g);g.connect(c.destination);o.start(t+i*.04);o.stop(t+i*.04+.04)}}catch(e){}}
function sfxRouletteWin(){sfxWin();setTimeout(sfxWin,420)}
function sfxTabSwitch(){_tone(680,'sine',.1,.07)}

// ── Card SVG ─────────────────────────────────
const suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suitColors={'♠':'#111','♣':'#111','♥':'#d32f2f','♦':'#d32f2f'};
function createCardSVG(card){const c=suitColors[card.suit];return`<svg viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="168" rx="8" fill="white" stroke="#ccc" stroke-width="1.5"/><text x="10" y="30" font-size="22" font-weight="bold" fill="${c}">${card.rank}</text><text x="10" y="53" font-size="26" fill="${c}">${card.suit}</text><text x="60" y="95" font-size="44" fill="${c}" text-anchor="middle">${card.suit}</text><text x="110" y="163" font-size="22" font-weight="bold" fill="${c}" text-anchor="end" transform="rotate(180 110 148)">${card.rank}</text><text x="110" y="138" font-size="26" fill="${c}" text-anchor="end" transform="rotate(180 110 123)">${card.suit}</text></svg>`}
function cardBackSVG(){return`<svg viewBox="0 0 120 168" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="168" rx="8" fill="#1a237e" stroke="#333" stroke-width="2"/><rect x="8" y="8" width="104" height="152" rx="6" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/><text x="60" y="97" text-anchor="middle" font-size="50" fill="rgba(255,255,255,.12)">🂠</text><line x1="14" y1="14" x2="106" y2="154" stroke="rgba(255,255,255,.07)" stroke-width="1"/><line x1="106" y1="14" x2="14" y2="154" stroke="rgba(255,255,255,.07)" stroke-width="1"/></svg>`}
function cardBackSmallSVG(){return cardBackSVG()}

// ── Hand evaluation ──────────────────────────
const rankValue={A:14,K:13,Q:12,J:11,'10':10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2};
function getHandRank(hand){
  const rv=rankValue,vals=hand.map(c=>rv[c.rank]).sort((a,b)=>b-a),ss=hand.map(c=>c.suit);
  const isFlush=ss.every(s=>s===ss[0]);
  const isStraight=vals.every((v,i)=>i===0||vals[i-1]-v===1)||(vals[0]===14&&vals[1]===5&&vals[2]===4&&vals[3]===3&&vals[4]===2);
  const cnts={};vals.forEach(v=>cnts[v]=(cnts[v]||0)+1);
  const cv=Object.values(cnts).sort((a,b)=>b-a);
  const p=(name,n,d)=>({name,pnum:n,pden:d||1,payoutF:n/(d||1)});
  if(isFlush&&isStraight&&vals[0]===14&&vals[1]===13)return p('로얄 스트레이트 플러시',1000);
  if(isFlush&&isStraight)return p('스트레이트 플러시',250);
  if(cv[0]===4)return p('포카드',50);
  if(cv[0]===3&&cv[1]===2)return p('풀하우스',25);
  if(isFlush)return p('플러시',15);
  if(isStraight)return p('스트레이트',10);
  if(cv[0]===3)return p('트리플',5);
  if(cv[0]===2&&cv[1]===2)return p('투페어',3);
  if(cv[0]===2)return p('원페어',3,2);
  return p('노페어',0);
}

// ++ 개수 기반 HTML span (빛남 효과)
function shortFmtHTML(n) {
  const s = shortFmt(n);
  const plusCount = (s.match(/\+/g) || []).length;
  if (plusCount === 0) return s;
  const cls = plusCount >= 4 ? 'plus4' : plusCount === 3 ? 'plus3' : plusCount === 2 ? 'plus2' : 'plus1';
  return `<span class="${cls}">${s}</span>`;
}

// 랭킹 테이블용 (배경 안 깨지게)
function rankChipHTML(n) {
  const s = shortFmt(n);
  const plusCount = (s.match(/\+/g) || []).length;
  if (plusCount === 0) return s;
  const cls = `rank-val-plus${Math.min(plusCount, 3)}`;
  return `<span class="${cls}">${s}</span>`;
}
