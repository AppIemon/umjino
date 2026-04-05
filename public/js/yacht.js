// ═══════════════════════════════════════════
// yacht.js – 요트 주사위 게임 (5주사위)
// 카테고리: Ones~Sixes, 3OAK, 4OAK, FH, SS, LS, Yacht, Choice
// ═══════════════════════════════════════════

const YACHT_CATS = [
  { id:'ones',   label:'⚀ 에이스',    desc:'1의 합계', upper:true },
  { id:'twos',   label:'⚁ 투',        desc:'2의 합계', upper:true },
  { id:'threes', label:'⚂ 쓰리',      desc:'3의 합계', upper:true },
  { id:'fours',  label:'⚃ 포',        desc:'4의 합계', upper:true },
  { id:'fives',  label:'⚄ 파이브',    desc:'5의 합계', upper:true },
  { id:'sixes',  label:'⚅ 식스',      desc:'6의 합계', upper:true },
  { id:'choice', label:'🎯 초이스',    desc:'5개 합계' },
  { id:'foak',   label:'🎳 4오브어카인드', desc:'같은 눈 4개 이상 → 합계' },
  { id:'fh',     label:'🏠 풀하우스',  desc:'3+2 → 25점' },
  { id:'ss',     label:'📏 스몰 스트레이트', desc:'4연속 → 30점' },
  { id:'ls',     label:'📐 라지 스트레이트', desc:'5연속 → 40점' },
  { id:'yacht',  label:'⛵ 요트!',     desc:'5개 동일 → 50점' },
];

let yachtDice = [0,0,0,0,0];
let yachtHeld = [false,false,false,false,false];
let yachtRolls = 0;
let yachtScores = {};
let yachtGameOver = false;
let yachtBetAmt = 0n;

function renderYachtUI() {
  const el = document.getElementById('yachtContent');
  if (!el) return;

  if (yachtGameOver || Object.keys(yachtScores).length === YACHT_CATS.length) {
    renderYachtResult(el); return;
  }

  const totalScore = Object.values(yachtScores).reduce((a,b)=>a+b, 0);
  const upperScore = YACHT_CATS.filter(c=>c.upper).reduce((a,c)=>a+(yachtScores[c.id]||0),0);
  const bonus = upperScore >= 63 ? 35 : 0;
  const remaining = YACHT_CATS.length - Object.keys(yachtScores).length;

  el.innerHTML = `
<div class="yacht-panel">
  <!-- 헤더 -->
  <div class="yacht-header">
    <div class="yacht-stat"><span class="yacht-stat-val">${totalScore + bonus}</span><span class="yacht-stat-lbl">현재 점수</span></div>
    <div class="yacht-stat"><span class="yacht-stat-val" style="color:${upperScore>=63?'#2ecc71':'#f1c40f'}">${upperScore}/63</span><span class="yacht-stat-lbl">상단${upperScore>=63?' +35보너스':` (${63-upperScore}점 부족)`}</span></div>
    <div class="yacht-stat"><span class="yacht-stat-val">${remaining}</span><span class="yacht-stat-lbl">남은 칸</span></div>
  </div>

  <!-- 주사위 -->
  <div class="yacht-dice-area">
    <div class="yacht-dice-row" id="yachtDiceRow">
      ${yachtDice.map((d,i)=>`
      <div class="yacht-die${yachtHeld[i]?' held':''}${yachtRolls===0?' unrolled':''}"
           onclick="${yachtRolls>0&&yachtRolls<3?`yachtToggleHold(${i})`:''}">
        <div class="yacht-die-face">${d>0?['','⚀','⚁','⚂','⚃','⚄','⚅'][d]:'?'}</div>
        ${yachtHeld[i]?'<div class="yacht-held-tag">고정</div>':''}
      </div>`).join('')}
    </div>
    <div class="yacht-roll-row">
      <button class="yacht-roll-btn${yachtRolls>=3?' disabled':''}" onclick="yachtRoll()" ${yachtRolls>=3?'disabled':''}>
        ${yachtRolls===0?'🎲 굴리기':yachtRolls===1?'🎲 다시 굴리기 (2/3)':yachtRolls===2?'🎲 마지막 굴리기 (3/3)':'굴리기 완료'}
      </button>
      ${yachtRolls>0?`<button class="yacht-reset-btn" onclick="yachtClearHeld()">고정 해제</button>`:''}
    </div>
  </div>

  <!-- 점수판 -->
  <div class="yacht-scores">
    <div class="yacht-score-header">점수 선택 ${yachtRolls===0?'<span style="color:#e74c3c">(먼저 굴리세요)</span>':''}</div>
    <div class="yacht-score-grid">
      ${YACHT_CATS.map(cat => {
        const already = yachtScores.hasOwnProperty(cat.id);
        const preview = yachtRolls > 0 && !already ? yachtCalc(cat.id, yachtDice) : null;
        const display = already ? yachtScores[cat.id] : preview;
        return `<div class="yacht-score-row${already?' scored':''}${preview!==null&&!already?' selectable':''}"
          onclick="${!already&&yachtRolls>0?`yachtSelect('${cat.id}')`:''}" >
          <div class="yacht-cat-label">${cat.label}</div>
          <div class="yacht-cat-desc">${cat.desc}</div>
          <div class="yacht-cat-score${already?'':preview!==null?' preview':''}">${display!==null&&display!==undefined?display:'-'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- 베팅 (게임 시작 전) -->
  ${Object.keys(yachtScores).length===0&&yachtRolls===0?`
  <div class="yacht-bet-area">
    <div id="yachtBetInput"></div>
    <button class="btn-primary" onclick="yachtStartGame()">게임 시작</button>
  </div>`:''}
</div>`;

  // 베팅 위젯 초기화
  if (Object.keys(yachtScores).length === 0 && yachtRolls === 0) {
    setTimeout(() => {
      if (document.getElementById('yachtBetInput') && !document.getElementById('cipChips_yachtBetInput')) {
        renderChipInput('yachtBetInput', { label: '게임 베팅', spinBtn: false });
      }
    }, 20);
  }
}

function yachtStartGame() {
  const bet = chipInputGet('yachtBetInput');
  if (bet <= 0n) { alert('베팅 토큰을 선택하세요'); return; }
  yachtBetAmt = bet;
  // 베팅은 chipInput에서 이미 차감됨
  yachtDice = [0,0,0,0,0];
  yachtHeld = [false,false,false,false,false];
  yachtRolls = 0;
  yachtScores = {};
  yachtGameOver = false;
  renderYachtUI();
}

function yachtRoll() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  if (yachtRolls >= 3) return;
  if (yachtRolls === 0 && yachtBetAmt <= 0n) { alert('먼저 게임을 시작하세요'); return; }
  // 주사위 굴리기
  for (let i = 0; i < 5; i++) {
    if (!yachtHeld[i]) yachtDice[i] = Math.floor(Math.random()*6)+1;
  }
  yachtRolls++;
  sfxChip();
  // 주사위 애니메이션
  const dice = document.querySelectorAll('.yacht-die:not(.held)');
  dice.forEach(d => { d.style.animation='yachtRoll .3s ease'; setTimeout(()=>d.style.animation='',300); });
  renderYachtUI();
}

function yachtToggleHold(i) {
  if (yachtRolls === 0 || yachtRolls >= 3) return;
  yachtHeld[i] = !yachtHeld[i];
  renderYachtUI();
}
function yachtClearHeld() { yachtHeld = [false,false,false,false,false]; renderYachtUI(); }

function yachtSelect(catId) {
  if (yachtRolls === 0) { alert('먼저 주사위를 굴리세요'); return; }
  if (yachtScores.hasOwnProperty(catId)) return;
  yachtScores[catId] = yachtCalc(catId, yachtDice);
  yachtHeld = [false,false,false,false,false];
  yachtRolls = 0;
  sfxWin();
  if (Object.keys(yachtScores).length === YACHT_CATS.length) {
    yachtGameOver = true;
    setTimeout(() => renderYachtResult(document.getElementById('yachtContent')), 300);
  } else {
    renderYachtUI();
  }
}

// ── 점수 계산 ─────────────────────────────
function yachtCalc(cat, dice) {
  const counts = [0,0,0,0,0,0,0];
  dice.forEach(d => counts[d]++);
  const sum = dice.reduce((a,b)=>a+b,0);
  const vals = [...new Set(dice)].sort((a,b)=>a-b);

  switch(cat) {
    case 'ones':   return counts[1]*1;
    case 'twos':   return counts[2]*2;
    case 'threes': return counts[3]*3;
    case 'fours':  return counts[4]*4;
    case 'fives':  return counts[5]*5;
    case 'sixes':  return counts[6]*6;
    case 'choice': return sum;
    case 'foak':   return counts.some(c=>c>=4) ? sum : 0;
    case 'fh': {
      const hasPair = counts.some(c=>c===2), hasTrip = counts.some(c=>c===3);
      return (hasPair&&hasTrip) ? 25 : 0;
    }
    case 'ss': {
      const s = new Set(dice);
      const seqs4 = [[1,2,3,4],[2,3,4,5],[3,4,5,6]];
      return seqs4.some(seq=>seq.every(n=>s.has(n))) ? 30 : 0;
    }
    case 'ls': {
      const s = new Set(dice);
      return ([1,2,3,4,5].every(n=>s.has(n))||[2,3,4,5,6].every(n=>s.has(n))) ? 40 : 0;
    }
    case 'yacht': return counts.some(c=>c===5) ? 50 : 0;
    default: return 0;
  }
}

// ── 결과 화면 ─────────────────────────────
function renderYachtResult(el) {
  const scoreSum = Object.values(yachtScores).reduce((a,b)=>a+b, 0);
  const upperScore = YACHT_CATS.filter(c=>c.upper).reduce((a,c)=>a+(yachtScores[c.id]||0),0);
  const bonus = upperScore >= 63 ? 35 : 0;
  const total = scoreSum + bonus;

  // 배당 계산: 점수 / 100 배율 (최소 0, 최대 3배)
  const mult = Math.min(3, total / 100);
  const payout = BigInt(Math.round(Number(yachtBetAmt) * mult));
  const profit = payout - yachtBetAmt;

  // 칩 지급
  if (payout > 0n) {
    chips += payout; chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay();
    saveState();
  }
  if (typeof saveRecentPlay === 'function') {
    saveRecentPlay({ type:'🎳 요트', desc:`총 ${total}점 (×${mult.toFixed(2)}) ${profit>=0n?'+':''}${formatBig(profit)}칩`, result: profit>=0n?'win':'lose' });
  }

  el.innerHTML = `
<div class="yacht-result">
  <div class="yacht-result-title" style="color:${total>=200?'#2ecc71':total>=100?'#f1c40f':'#e74c3c'}">
    ${total>=200?'🎉 훌륭해요!':total>=100?'👍 좋아요!':'😢 다음에!'}
  </div>
  <div class="yacht-result-score">${total}점</div>
  ${bonus>0?`<div class="yacht-result-bonus">상단 보너스 +35점 포함</div>`:''}
  <div class="yacht-result-detail">
    <div>베팅 ${formatBig(yachtBetAmt)}칩 × ${mult.toFixed(2)} = <b style="color:${profit>=0n?'#2ecc71':'#e74c3c'}">${formatBig(payout)}칩</b></div>
  </div>
  <div class="yacht-result-scores">
    ${YACHT_CATS.map(c=>`<div class="yacht-res-row"><span>${c.label}</span><span>${yachtScores[c.id]??0}</span></div>`).join('')}
    ${bonus>0?`<div class="yacht-res-row bonus"><span>상단 보너스</span><span>+35</span></div>`:''}
    <div class="yacht-res-row total"><span>합계</span><span>${total}</span></div>
  </div>
  <button class="btn-primary" style="margin-top:1rem;width:100%" onclick="yachtNewGame()">다시 하기</button>
</div>`;
  (total >= 200 ? sfxWin : sfxLose)();
}

function yachtNewGame() {
  yachtDice=[0,0,0,0,0]; yachtHeld=[false,false,false,false,false];
  yachtRolls=0; yachtScores={}; yachtGameOver=false; yachtBetAmt=0n;
  renderYachtUI();
}
