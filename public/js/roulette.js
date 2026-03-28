// ═══════════════════════════════════════════
// roulette.js  –  3D wheel, table, polling
// ═══════════════════════════════════════════

const RL_NUMS=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RL_RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const RL_COLOR_NAME={red:'🔴 레드',black:'⚫ 블랙',green:'🟢 그린(0)',odd:'홀수',even:'짝수',low:'1–18',high:'19–36',dozen1:'1–12',dozen2:'13–24',dozen3:'25–36',number:'번호지정'};
function rlNumColor(n){if(n===0)return'green';return RL_RED.has(n)?'red':'black'}

let rlJoined=false,rlPollTimer=null,rlMyColor=null;
let rlPendingBets={},rlSelectedChip=null,rlTotalPending=0n;
let _rlLastPhase=null;

// ── Canvas wheel ─────────────────────────────
let rlAnimating=false,rlWheelAngle=0,rlBallAngle=0,rlBallR=110;
let rlWheelSpd=0.012,rlBallSpd=0.008;

function drawRlWheel(angle){
  const canvas=document.getElementById('rlCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d'),N=RL_NUMS.length,R=canvas.width/2,sliceA=(Math.PI*2)/N;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Outer dark bg
  ctx.save();ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=20;
  ctx.beginPath();ctx.arc(R,R,R-2,0,Math.PI*2);ctx.fillStyle='#110500';ctx.fill();ctx.restore();
  // Number slots
  for(let i=0;i<N;i++){
    const startA=angle+i*sliceA-Math.PI/2,endA=startA+sliceA,n=RL_NUMS[i];
    const col=n===0?'#1c6c2c':RL_RED.has(n)?'#8b0000':'#111';
    ctx.beginPath();ctx.moveTo(R,R);ctx.arc(R,R,R-2,startA,endA);ctx.closePath();
    ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='rgba(220,180,50,.3)';ctx.lineWidth=.7;ctx.stroke();
    // Number label
    ctx.save();
    ctx.translate(R+Math.cos(startA+sliceA/2)*(R-18),R+Math.sin(startA+sliceA/2)*(R-18));
    ctx.rotate(startA+sliceA/2+Math.PI/2);
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.font=`bold ${R>130?11:9}px Arial`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.toString(),0,0);ctx.restore();
  }
  // Inner hub
  const grad=ctx.createRadialGradient(R,R,R*.06,R,R,R*.22);
  grad.addColorStop(0,'#c8960a');grad.addColorStop(1,'#6b4a00');
  ctx.beginPath();ctx.arc(R,R,R*.22,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();
  ctx.strokeStyle='rgba(255,220,80,.45)';ctx.lineWidth=1.8;ctx.stroke();
  // Diamond frets on rim
  for(let i=0;i<16;i++){
    const a=angle+(i/16)*Math.PI*2;
    ctx.save();ctx.translate(R+Math.cos(a)*(R-3),R+Math.sin(a)*(R-3));ctx.rotate(a);
    ctx.fillStyle='rgba(255,230,100,.75)';
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(3,0);ctx.lineTo(0,5);ctx.lineTo(-3,0);ctx.closePath();ctx.fill();ctx.restore();
  }
}
function drawRlBall(){
  const orbit=document.getElementById('rlBallOrbit'),ball=document.getElementById('rlBall');if(!orbit||!ball)return;
  const R=orbit.offsetWidth/2;
  ball.style.left=(R+Math.cos(rlBallAngle)*rlBallR)+'px';
  ball.style.top=(R+Math.sin(rlBallAngle)*rlBallR)+'px';
}
function rlAnimLoop(){
  drawRlWheel(rlWheelAngle);drawRlBall();
  rlWheelAngle+=rlWheelSpd;rlBallAngle-=rlBallSpd;
  if(rlAnimating)requestAnimationFrame(rlAnimLoop);
}
function rlStartSpin(){rlWheelSpd=.06;rlBallSpd=.15;rlBallR=115;if(!rlAnimating){rlAnimating=true;rlAnimLoop()}}
function rlStopSpin(){rlWheelSpd=.008;rlBallSpd=0;rlBallR=108}
function rlIdleAnim(){rlWheelSpd=.012;rlBallSpd=.008;rlBallR=110;if(!rlAnimating){rlAnimating=true;rlAnimLoop()}}

// ── Table builder ────────────────────────────
function buildRlTable(){
  const grid=document.getElementById('rlTableGrid');if(!grid)return;
  let html=`<div style="display:flex;gap:2px;margin-bottom:2px">
<div class="rl-cell green-c" style="width:28px;height:86px;writing-mode:vertical-rl;font-size:.75rem" onclick="rlClickOutside('green')">0</div>
<div style="flex:1;display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:repeat(3,28px);gap:2px">`;
  for(let row=3;row>=1;row--){
    for(let col=1;col<=12;col++){
      const n=(col-1)*3+row;const c=RL_RED.has(n)?'red':'black';
      html+=`<div class="rl-cell ${c}" id="rlCell${n}" onclick="rlClickNum(${n})">${n}</div>`;
    }
  }
  html+=`</div></div>`;
  // Outside: 6-col row
  html+=`<div class="rl-outside-row" style="grid-template-columns:repeat(6,1fr)">`;
  [['low','1–18'],['even','짝수'],['red-bg','🔴 레드','red'],['black-bg','⚫ 블랙','black'],['odd','홀수'],['high','19–36']].forEach(([cls,label,key])=>{
    const k=key||cls;html+=`<div class="rl-outside-cell ${cls}" id="rlOut_${k}" onclick="rlClickOutside('${k}')">${label}</div>`;
  });
  html+=`</div>`;
  // Dozens
  html+=`<div class="rl-outside-row" style="grid-template-columns:repeat(3,1fr);margin-top:2px">`;
  [['dozen1','1–12 ×3'],['dozen2','13–24 ×3'],['dozen3','25–36 ×3']].forEach(([k,l])=>{
    html+=`<div class="rl-outside-cell" id="rlOut_${k}" onclick="rlClickOutside('${k}')">${l}</div>`;
  });
  html+=`</div>`;
  grid.innerHTML=html;
  // Re-apply chip overlays for pending bets
  Object.entries(rlPendingBets).forEach(([k,v])=>{if(v.amount>0n)rlUpdateCellChip(k,v.amount)});
}

// ── Cell-first UX: click cell → then chip throws to it ──────────────────────
let rlTargetCell = null; // key of currently selected cell

function rlSelectCell(key, label) {
  if (!rlJoined) return;
  // Deselect previous
  document.querySelectorAll('.rl-cell.target-selected,.rl-outside-cell.target-selected').forEach(el=>{
    el.classList.remove('target-selected');
    el.style.animation='';
  });
  rlTargetCell = key;
  // Highlight selected cell
  const el = rlGetCellEl(key);
  if (el) {
    el.classList.add('target-selected');
    el.style.animation='rl-cell-pulse .6s ease-in-out infinite alternate';
  }
  document.getElementById('rlSelDisplay').textContent='칩을 클릭해서 베팅 → '+label;
  // Auto-find cheapest chip if none selected
  if (!rlSelectedChip) {
    const c=chipTypes.find(c=>c.value<=chips&&(chipDist[c.value.toString()]||0n)>0n);
    if (c) rlSelectedChip=c;
  }
}

function rlGetCellEl(key) {
  if (key.startsWith('number_')) return document.getElementById('rlCell'+key.split('_')[1]);
  return document.getElementById('rlOut_'+key);
}

function rlClickNum(n){
  if(!rlJoined)return;
  const lm = {red:'🔴 레드',black:'⚫ 블랙',green:'🟢 그린(0)'};
  rlSelectCell('number_'+n, '번호 '+n);
}
function rlClickOutside(type){
  if(!rlJoined)return;
  const lm={red:'🔴 레드 ×2',black:'⚫ 블랙 ×2',green:'🟢 그린(0) ×35',odd:'홀수 ×2',even:'짝수 ×2',low:'1–18 ×2',high:'19–36 ×2',dozen1:'1–12 ×3',dozen2:'13–24 ×3',dozen3:'25–36 ×3'};
  rlSelectCell(type, lm[type]||type);
}

// Called when player clicks a chip in the chip row — throws chip to selected cell
function rlSelectChip(chip, chipEl){
  if (!rlTargetCell) {
    // No cell selected yet — just highlight chip as selected
    rlSelectedChip=chip;
    document.querySelectorAll('.rl-chip-row .chip-stack').forEach(el=>el.style.outline='none');
    if(chipEl) chipEl.style.outline='2px solid #f1c40f';
    document.getElementById('rlSelDisplay').textContent='배팅할 칸을 클릭하세요';
    return;
  }
  rlSelectedChip=chip;
  // Throw animation: chip flies from chipEl to target cell
  const targetEl = rlGetCellEl(rlTargetCell);
  if (!targetEl || chips < chip.value) {
    document.getElementById('rlResultMsg').textContent = chips < chip.value ? '칩 부족' : '';
    return;
  }
  const srcRect = chipEl ? chipEl.getBoundingClientRect() : {left:window.innerWidth/2, top:window.innerHeight/2, width:40, height:40};
  const dstRect = targetEl.getBoundingClientRect();
  // Create flying chip
  const fly = document.createElement('div');
  fly.innerHTML = createChipSVG(chip);
  fly.style.cssText = 'position:fixed;z-index:2000;width:36px;height:36px;pointer-events:none;transition:all .5s cubic-bezier(.25,.46,.45,.94);transform-origin:center;'+
    'left:'+(srcRect.left+srcRect.width/2-18)+'px;top:'+(srcRect.top+srcRect.height/2-18)+'px;';
  document.body.appendChild(fly);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    fly.style.left=(dstRect.left+dstRect.width/2-12)+'px';
    fly.style.top=(dstRect.top+dstRect.height/2-12)+'px';
    fly.style.width='24px';fly.style.height='24px';
    fly.style.transform='rotate('+Math.round(Math.random()*360)+'deg)';
    fly.style.opacity='0.9';
  }));
  setTimeout(()=>{
    fly.remove();
    const lm={red:'🔴 레드 ×2',black:'⚫ 블랙 ×2',green:'🟢 그린(0) ×35',odd:'홀수 ×2',even:'짝수 ×2',low:'1–18 ×2',high:'19–36 ×2',dozen1:'1–12 ×3',dozen2:'13–24 ×3',dozen3:'25–36 ×3'};
    const label = rlTargetCell.startsWith('number_') ? '번호 '+rlTargetCell.split('_')[1] : (lm[rlTargetCell]||rlTargetCell);
    addRlPendingBet(rlTargetCell, chip.value, label);
    sfxChip();
  }, 520);
}

function addRlPendingBet(key,amount,label){
  if(chips<amount){document.getElementById('rlResultMsg').textContent='칩 부족';return}
  const amtIdx=chipTypes.findIndex(c=>c.value===amount);
  if((chipDist[amount.toString()]||0n)===0n){if(!makeChange(amtIdx>=0?amtIdx:0)){document.getElementById('rlResultMsg').textContent='칩 부족';return}}
  chipDist[amount.toString()]-=1n;chips-=amount;rlTotalPending+=amount;
  rlPendingBets[key]={amount:(rlPendingBets[key]?rlPendingBets[key].amount:0n)+amount,label};
  rlUpdateCellChip(key,rlPendingBets[key].amount);updateRlSelDisplay();updateChipsDisplay();updateRlChipRow();
  document.getElementById('rlBetBtns').style.display='flex';
  document.getElementById('rlConfirmBtn').style.display='';
}
function rlClearPending(){
  Object.values(rlPendingBets).forEach(b=>{chips+=b.amount});
  chipDist=computeGreedyDist(chips);rlPendingBets={};rlTotalPending=0n;
  document.querySelectorAll('.rl-chip-on').forEach(el=>el.remove());
  document.querySelectorAll('.rl-cell.active-bet,.rl-outside-cell.active-bet').forEach(el=>el.classList.remove('active-bet'));
  document.getElementById('rlBetBtns').style.display='none';
  document.getElementById('rlSelDisplay').textContent='배팅 칸을 클릭하세요';
  updateChipsDisplay();updateRlChipRow();
}
function rlUpdateCellChip(key,amount){
  let el=key.startsWith('number_')?document.getElementById('rlCell'+key.split('_')[1]):document.getElementById('rlOut_'+key);
  if(!el)return;el.classList.add('active-bet');
  let chip=el.querySelector('.rl-chip-on');
  if(!chip){chip=document.createElement('div');chip.className='rl-chip-on';el.appendChild(chip)}
  chip.textContent=shortFmt(amount);
}
function updateRlSelDisplay(){
  const keys=Object.keys(rlPendingBets);
  if(!keys.length){document.getElementById('rlSelDisplay').textContent='배팅 칸을 클릭하세요';return}
  const parts=keys.slice(-4).map(k=>rlPendingBets[k].label+' '+shortFmt(rlPendingBets[k].amount));
  document.getElementById('rlSelDisplay').textContent=parts.join(' | ')+(keys.length>4?'...':'')+' (총 '+shortFmt(rlTotalPending)+'칩)';
}

// ── Confirm bet (send to server) ─────────────
async function confirmRouletteBet(){
  if(!Object.keys(rlPendingBets).length)return;
  document.getElementById('rlConfirmBtn').disabled=true;
  try{
    for(const[key,bet]of Object.entries(rlPendingBets)){
      let betType,targetNum=null;
      if(key.startsWith('number_')){betType='number';targetNum=parseInt(key.split('_')[1])}else betType=key;
      const res=await rlFetch('bet',{betType,amount:bet.amount.toString(),targetNum});
      if(!res.ok){const d=await res.json();document.getElementById('rlResultMsg').textContent=d.error||'베팅 실패';break}
      const d=await res.json();chips=BigInt(d.chips||chips.toString());
    }
    chipDist=computeGreedyDist(chips);rlPendingBets={};rlTotalPending=0n;
    document.querySelectorAll('.rl-chip-on').forEach(el=>el.remove());
    document.querySelectorAll('.rl-cell.active-bet,.rl-outside-cell.active-bet').forEach(el=>el.classList.remove('active-bet'));
    // Hide confirm+clear but keep skip visible (rlRenderState will manage)
    document.getElementById('rlConfirmBtn').style.display='none';
    document.getElementById('rlResultMsg').textContent='✅ 베팅 완료!';document.getElementById('rlResultMsg').style.color='#2ecc71';
    updateRlSelDisplay();updateChipsDisplay();updateRlChipRow();updateSlotChipsDisplay();
  }catch(e){document.getElementById('rlResultMsg').textContent='서버 오류'}
  document.getElementById('rlConfirmBtn').disabled=false;
}

// ── Server polling ───────────────────────────
function rlFetch(action,extra){return fetchT('/api/roulette?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:sessionNickname,token:sessionToken,...(extra||{})})},6000)}
function rlStartPolling(){rlStopPolling();rlPollTimer=setInterval(rlPoll,1600);rlPoll()}
function rlStopPolling(){if(rlPollTimer){clearInterval(rlPollTimer);rlPollTimer=null}}
async function rlPoll(){
  if(!sessionNickname||!sessionToken)return;
  try{const res=await fetchT(`/api/roulette?nick=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`,null,5000);if(!res.ok)return;const d=await res.json();rlRenderState(d)}catch(e){}
}
async function rlToggleJoin(){
  if(!sessionNickname){document.getElementById('authModal').classList.add('show');return}
  const btn=document.getElementById('rlJoinBtn');
  if(rlJoined){
    rlStopPolling();rlJoined=false;rlMyColor=null;
    btn.textContent='🎡 룰렛 참가';btn.classList.remove('joined');
    rlStopSpin();rlAnimating=false;
    try{await rlFetch('leave')}catch(e){}reloadMyChips();return;
  }
  btn.disabled=true;btn.textContent='참가 중...';
  try{
    const res=await rlFetch('join');
    if(res.ok){const d=await res.json();rlMyColor=d.color;rlJoined=true;btn.textContent='🚪 룰렛 나가기';btn.classList.add('joined');buildRlTable();updateRlChipRow();rlStartPolling();rlIdleAnim()}
  }catch(e){document.getElementById('rlPhaseBar').textContent='연결 실패'}
  btn.disabled=false;
}
async function rlVoteSkip(){
  try{const res=await rlFetch('vote_skip');if(res.ok){document.getElementById('rlSkipBtn').disabled=true;document.getElementById('rlSkipBtn').textContent='✅ 스킵함'}}catch(e){}
}

function rlRenderState(d){
  const phase=d.phase;
  // Players row
  document.getElementById('rlPlayersRow').innerHTML=d.players.map(p=>`<div class="rl-player-badge" style="background:${p.color}20;border-color:${p.color}60"><span style="width:7px;height:7px;border-radius:50%;background:${p.color};display:inline-block"></span>${escHtml(p.nick)}</div>`).join('');
  // Phase bar
  const rem=Math.ceil((d.remainingMs||0)/1000),pn={betting:'베팅 중',spinning:'스피닝',result:'결과'}[phase]||phase;
  document.getElementById('rlPhaseBar').textContent=`[${pn}] ${rem}초 남음`;
  // Wheel animation
  if(phase==='spinning'){if(_rlLastPhase!=='spinning'){rlStartSpin();sfxRouletteSpin()}}
  else if(phase==='result'&&_rlLastPhase==='spinning'){rlStopSpin();if(d.spinResult!=null)sfxRouletteWin()}
  else if(!rlAnimating)rlIdleAnim();
  _rlLastPhase=phase;
  // Result message
  const rm=document.getElementById('rlResultMsg');
  if(phase==='result'&&d.spinResult!=null){
    const col=rlNumColor(d.spinResult),kor=col==='red'?'레드':col==='black'?'블랙':'그린';
    let msg=`🎡 ${d.spinResult} (${kor})`;
    const myP=d.payouts&&d.payouts.find(p=>p.nick===sessionNickname);
    if(myP){msg+=myP.won?` 🎉 +${shortFmt(BigInt(myP.winAmount)-BigInt(myP.betAmount))}`:` 😢 -${shortFmt(BigInt(myP.betAmount))}`;rm.style.color=myP.won?'#2ecc71':'#e74c3c'}
    else rm.style.color='#f1c40f';rm.textContent=msg;
  }else if(phase==='spinning'){rm.textContent='🎡 스피닝...';rm.style.color='#aaa'}
  else{rm.textContent='';if(d.myChips){chips=BigInt(d.myChips);chipDist=computeGreedyDist(chips);updateChipsDisplay();updateRlChipRow();updateSlotChipsDisplay()}}
  // Bets list
  const bl=document.getElementById('rlBetsList');
  if(d.bets&&d.bets.length){
    bl.innerHTML=d.bets.map(b=>{const pc=d.players.find(p=>p.nick===b.nick),col=pc?pc.color:'#aaa';return`<div class="rl-bet-item"><span style="width:7px;height:7px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span><span style="color:${col};font-weight:bold">${escHtml(b.nick)}</span> — ${RL_COLOR_NAME[b.type]||b.type} | ${shortFmt(BigInt(b.amount))}</div>`}).join('');
  }else bl.innerHTML='<span style="color:#333">베팅 내역 없음</span>';
  // Bet controls: show skip always during betting, confirm/clear only if pending
  if(phase==='betting'){
    const hasPending=Object.keys(rlPendingBets).length>0;
    document.getElementById('rlConfirmBtn').style.display=hasPending?'':'none';
    document.getElementById('rlClearBtn') && (document.getElementById('rlClearBtn').style.display=hasPending?'':'none');
    document.getElementById('rlBetBtns').style.display='flex';  // always show during betting (skip is here)
    const alSkip=(d.skipVotes||[]).includes(sessionNickname);
    document.getElementById('rlSkipBtn').disabled=alSkip;document.getElementById('rlSkipBtn').textContent=alSkip?'✅ 스킵됨':'⏩ 스킵';
    const sc=(d.skipVotes||[]).length,sn=Math.max(1,Math.ceil(d.players.length*.66));
    document.getElementById('rlSkipInfo').textContent=`스킵: ${sc}/${sn} (66% 필요)`;
  }else document.getElementById('rlBetBtns').style.display='none';
}
