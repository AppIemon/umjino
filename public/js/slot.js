// ═══════════════════════════════════════════
// slot.js  –  5×3 parallel slot machines
// ═══════════════════════════════════════════

const SLOT_SYMS=['🍒','🍋','🍇','🔔','⭐','💎','7️⃣'];
const SLOT_PAY={
  3:{'🍒':3,'🍋':5,'🍇':8,'🔔':12,'⭐':20,'💎':40,'7️⃣':80},
  4:{'🍒':10,'🍋':18,'🍇':28,'🔔':45,'⭐':80,'💎':160,'7️⃣':320},
  5:{'🍒':28,'🍋':50,'🍇':80,'🔔':130,'⭐':220,'💎':440,'7️⃣':880},
};
// 2배 모드: 4개=20회, 5개=40회 (3개 일치는 미발동)
const DBL_TURNS={4:20,5:40};

// Win lines: ROWS ONLY (3 horizontal lines)
// col0=[0,1,2] col1=[3,4,5] col2=[6,7,8] col3=[9,10,11] col4=[12,13,14]
const SLOT_WIN_LINES=[
  [0,3,6,9,12],   // top row
  [1,4,7,10,13],  // middle row
  [2,5,8,11,14],  // bottom row
];

let slotMachines=[],_slotId=0;

function createSlotMachineData(){
  return{id:_slotId++,busy:false,doubleMode:false,doubleTurns:0,grid:Array(15).fill('🍒')};
}
function addSlotMachine(){
  if(slotMachines.length>=4){alert('최대 4대까지 추가 가능');return}
  if(!sessionNickname){document.getElementById('authModal').classList.add('show');return}
  slotMachines.push(createSlotMachineData());renderSlotMachines();
}
function removeSlotMachine(id){
  const i=slotMachines.findIndex(m=>m.id===id);if(i>-1)slotMachines.splice(i,1);renderSlotMachines();
}

function renderSlotMachines(){
  const area=document.getElementById('slotMachinesArea');area.innerHTML='';
  slotMachines.forEach(m=>{
    const div=document.createElement('div');div.className='slot-machine'+(m.doubleMode?' double-mode':'');div.id='sm'+m.id;
    const gridHTML=Array(15).fill(0).map((_,i)=>`<div class="slot-cell" id="smCell${m.id}_${i}">${m.grid[i]}</div>`).join('');
    div.innerHTML=`
<div class="slot-machine-hdr">
  <span class="slot-machine-name">🎰 슬롯 #${m.id+1}</span>
  <div class="slot-hdr-right">
    <span class="slot-dbl-badge">2배 모드</span>
    <span class="slot-dbl-turns" id="smDT${m.id}">남은 ${m.doubleTurns}회</span>
    <button class="slot-close-btn" onclick="removeSlotMachine(${m.id})">✕</button>
  </div>
</div>
<div class="slot-grid" id="smGrid${m.id}">${gridHTML}</div>
<div class="slot-winlines" id="smWL${m.id}"></div>
<div class="slot-controls">
  <input class="slot-bet-inp" id="smBet${m.id}" type="text" placeholder="베팅액">
  <button class="slot-spin-btn" id="smSpinBtn${m.id}" onclick="spinSlot(${m.id})">스핀!</button>
</div>
<div class="slot-dbl-info" id="smDI${m.id}"></div>
<div class="slot-result-msg" id="smResult${m.id}"></div>
<div class="slot-paytable-mini">
  <div class="spm-sym">7️⃣ ×3/4/5</div><div class="spm-val">×100/300/750</div>
  <div class="spm-sym">💎 ×3/4/5</div><div class="spm-val">×50/150/380</div>
  <div class="spm-sym">⭐ ×3/4/5</div><div class="spm-val">×25/70/175</div>
  <div class="spm-sym">🔔 ×3/4/5</div><div class="spm-val">×15/42/105</div>
  <div class="spm-sym">🍇 ×3/4/5</div><div class="spm-val">×10/28/70</div>
  <div class="spm-sym">🍋 ×3/4/5</div><div class="spm-val">×8/22/55</div>
  <div class="spm-sym">🍒 ×3/4/5</div><div class="spm-val">×5/12/30</div>
  <div class="spm-sym">🍒 두 개 (파셜)</div><div class="spm-val">×1.5</div>
</div>`;
    area.appendChild(div);
  });
  // Add machine card
  const add=document.createElement('div');add.className='add-machine-card';
  add.innerHTML='<span>➕</span><span>슬롯머신 추가</span>';add.onclick=addSlotMachine;area.appendChild(add);
  updateSlotChipsDisplay();
}

// ── Grid evaluation ──────────────────────────
function evalSlotGrid(grid){
  const lines=[],winCells=new Set();
  for(const line of SLOT_WIN_LINES){
    const syms=line.map(i=>grid[i]),first=syms[0];
    let count=1;for(let i=1;i<5;i++){if(syms[i]===first)count++;else break}
    if(count>=3){const mult=(SLOT_PAY[count]&&SLOT_PAY[count][first])||0;if(mult>0){lines.push({sym:first,count,cells:line.slice(0,count),mult});line.slice(0,count).forEach(i=>winCells.add(i))}}
  }
  const cherries=[];for(let i=0;i<15;i++)if(grid[i]==='🍒')cherries.push(i);
  const hasCherryPartial=cherries.length>=2&&!lines.length;
  const totalMult=lines.reduce((s,l)=>s+l.mult,0)+(hasCherryPartial?1.5:0);
  return{lines,totalMult,winCells,hasCherryPartial};
}

// ── Spin ─────────────────────────────────────
async function spinSlot(id){
  const m=slotMachines.find(m=>m.id===id);if(!m||m.busy)return;
  if(!sessionNickname){document.getElementById('authModal').classList.add('show');return}
  const betStr=document.getElementById('smBet'+id).value.replace(/,/g,'').trim();
  let betAmt;try{betAmt=BigInt(betStr)}catch(e){setSlotResult(id,'숫자를 입력하세요','#e74c3c');return}
  if(betAmt<=0n){setSlotResult(id,'1 이상 입력','#e74c3c');return}
  if(betAmt>chips){setSlotResult(id,'칩 부족','#e74c3c');return}

  m.busy=true;chips-=betAmt;chipDist=computeGreedyDist(chips);
  updateChipsDisplay();updateSlotChipsDisplay();updateRlChipRow();
  const spinBtn=document.getElementById('smSpinBtn'+id);spinBtn.disabled=true;
  setSlotResult(id,'🎰 스피닝...','#aaa');
  document.getElementById('smWL'+id).innerHTML='';

  // Clear win highlights, add spinning animation
  for(let i=0;i<15;i++){const cell=document.getElementById(`smCell${id}_${i}`);if(cell){cell.className='slot-cell';cell.classList.add('spinning')}}

  // Randomize symbols while spinning
  const iv=setInterval(()=>{for(let i=0;i<15;i++){const cell=document.getElementById(`smCell${id}_${i}`);if(cell)cell.textContent=SLOT_SYMS[Math.floor(Math.random()*SLOT_SYMS.length)]}},100);
  const finalGrid=Array(15).fill(0).map(()=>SLOT_SYMS[Math.floor(Math.random()*SLOT_SYMS.length)]);

  await new Promise(r=>setTimeout(r,900));clearInterval(iv);

  // Stop reels column by column
  for(let col=0;col<5;col++){
    await new Promise(r=>setTimeout(r,110));sfxSlotStop();
    for(let row=0;row<3;row++){
      const idx=col*3+row;const cell=document.getElementById(`smCell${id}_${idx}`);
      if(cell){cell.classList.remove('spinning');cell.textContent=finalGrid[idx]}
    }
  }
  m.grid=finalGrid;await new Promise(r=>setTimeout(r,200));

  const ev=evalSlotGrid(finalGrid);
  // Apply win highlights
  ev.winCells.forEach(idx=>{
    const cell=document.getElementById(`smCell${id}_${idx}`);if(cell){
      const cnt=ev.lines.find(l=>l.cells.includes(idx));cell.classList.add('win'+(cnt?cnt.count:3))
    }
  });

  // Double mode multiplier
  let effectiveMult=ev.totalMult,dblMsg='';
  if(m.doubleMode&&effectiveMult>0){
    effectiveMult*=2;m.doubleTurns--;dblMsg=`2배 적용! 남은: ${m.doubleTurns}회`;
    if(m.doubleTurns<=0){m.doubleMode=false;m.doubleTurns=0;dblMsg+=' (종료)';const el=document.getElementById('sm'+id);if(el)el.classList.remove('double-mode')}
    const dtEl=document.getElementById('smDT'+id);if(dtEl)dtEl.textContent='남은 '+m.doubleTurns+'회';
  }
  document.getElementById('smDI'+id).textContent=dblMsg;

  // Win lines display
  const wlEl=document.getElementById('smWL'+id);
  if(ev.lines.length)wlEl.innerHTML=ev.lines.map(l=>`<span class="slot-win-tag">${l.sym}×${l.count} ×${l.mult}</span>`).join('');
  else if(ev.hasCherryPartial)wlEl.innerHTML='<span class="slot-win-tag">🍒×2 ×1.5</span>';

  // Payout
  let payout=0n,resultMsg='',rc='#f1c40f';
  if(effectiveMult>0){
    const mp=BigInt(Math.round(effectiveMult*1000));payout=(betAmt*mp)/1000n;
    chips+=payout;chipDist=computeGreedyDist(chips);
    resultMsg=`🎉 +${shortFmt(payout)}칩`;rc='#2ecc71';
    sfxSlotWin(ev.lines[0]?ev.lines[0].count:3);
    // Activate double mode
    if(ev.lines.length&&!m.doubleMode){
      const best=ev.lines.reduce((a,b)=>a.count>b.count?a:b);
      const dt=DBL_TURNS[best.count];
      if(dt){m.doubleMode=true;m.doubleTurns=dt;const el=document.getElementById('sm'+id);if(el)el.classList.add('double-mode');const dtEl=document.getElementById('smDT'+id);if(dtEl)dtEl.textContent='남은 '+dt+'회';resultMsg+=` | 2배 모드 ${dt}회!`}
    }
  }else if(ev.hasCherryPartial){
    payout=betAmt*3n/2n;chips+=payout;chipDist=computeGreedyDist(chips);
    resultMsg=`✨ 체리×2 +${shortFmt(payout)}`;rc='#2ecc71';sfxSlotWin(3);
  }else{resultMsg='꽝! 🍀';rc='#e74c3c'}

  setSlotResult(id,resultMsg,rc);
  updateChipsDisplay();updateSlotChipsDisplay();updateRlChipRow();saveState();
  m.busy=false;spinBtn.disabled=false;
}

function setSlotResult(id,msg,color){
  const el=document.getElementById('smResult'+id);if(!el)return;el.textContent=msg;el.style.color=color||'#f1c40f';
}
