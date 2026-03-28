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
];
const PALETTE=['#D0CFC8','#CC2222','#2244BB','#1A7A1A','#1A1A1A','#882299','#CC6600','#AA8800','#8B0000','#006868','#BB2277','#334499'];
const chipTypes=CHIP_DEF.map(([exp,label],idx)=>({value:pow10(exp),label,color:PALETTE[idx%PALETTE.length],idx}));
const FMT_UNITS=[
  [pow10(68),'무량대수'],[pow10(64),'불가사의'],[pow10(60),'나유타'],[pow10(56),'아승기'],
  [pow10(52),'항하사'],[pow10(48),'극'],[pow10(44),'재'],[pow10(40),'정'],[pow10(36),'간'],
  [pow10(32),'구'],[pow10(28),'양'],[pow10(24),'자'],[pow10(20),'해'],[pow10(16),'경'],
  [pow10(12),'조'],[pow10(8),'억'],[pow10(4),'만'],[pow10(3),'천'],
];
function formatBig(n){if(n===0n)return'0';if(n<10000n)return n.toString();let r=n,p=[];for(const[v,nm]of FMT_UNITS)if(r>=v){p.push(r/v+nm);r=r%v;}if(r>0n)p.push(r.toString());return p.join(' ')}
function shortFmt(n){if(n<10000n)return n.toString();for(const[v,nm]of FMT_UNITS)if(n>=v)return(n/v)+''+nm+((n%v>0n)?'+':'');return n.toString()}
function lightenHex(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'#'+[Math.min(255,r+a),Math.min(255,g+a),Math.min(255,b+a)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function cmpBigStr(a,b){const sa=(a||'0').replace(/^0+/,'')||'0',sb=(b||'0').replace(/^0+/,'')||'0';if(sa.length!==sb.length)return sa.length-sb.length;return sa.localeCompare(sb)}

// ── Chip SVG ────────────────────────────────
function createChipSVG(chip){
  const{color,label,idx}=chip,gid='cg'+idx,sid='cs'+idx,light=lightenHex(color,55);
  const inlays=[0,45,90,135,180,225,270,315].map(a=>{
    const rad=a*Math.PI/180,cx=(60+Math.cos(rad)*46).toFixed(1),cy=(60+Math.sin(rad)*46).toFixed(1);
    return`<rect x="-4" y="-7" width="8" height="14" rx="2" fill="white" opacity="0.88" transform="translate(${cx},${cy}) rotate(${a+90})"/>`;
  }).join('');
  const len=label.length,fs=len>=8?7.5:len>=6?9:len>=5?10.5:len>=4?12:len>=3?14:17,ty=len>=5?64:65;
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
