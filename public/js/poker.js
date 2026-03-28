// ═══════════════════════════════════════════
// poker.js  –  betting, game flow, double-up
// ═══════════════════════════════════════════

// ── Betting ──────────────────────────────────
function throwChip(chip,e){
  if(gamePhase!=='betting'||chips<chip.value||isAnimating)return;
  const key=chip.value.toString();
  if((chipDist[key]||0n)===0n){if(!makeChange(chip.idx))return;}
  chipDist[key]=(chipDist[key]||0n)-1n;chips-=chip.value;currentBet+=chip.value;betTokens.push(chip.idx);
  sfxChip();saveState();
  // Support both mouse and touch events
  const clientX=(e&&(e.clientX||(e.touches&&e.touches[0]&&e.touches[0].clientX)))||400;
  const clientY=(e&&(e.clientY||(e.touches&&e.touches[0]&&e.touches[0].clientY)))||300;
  const bz=document.getElementById('bettingZone'),bRect=bz.getBoundingClientRect();
  const fly=document.createElement('div');fly.className='flying-token';fly.innerHTML=createChipSVG(chip);
  fly.style.cssText=`width:54px;height:54px;left:${clientX-27}px;top:${clientY-27}px`;
  document.body.appendChild(fly);
  const ex=bRect.left+bRect.width/2-27+(Math.random()-.5)*80;
  const ey=bRect.top+bRect.height/2-27+(Math.random()-.5)*52;
  setTimeout(()=>{fly.style.cssText+=`;left:${ex}px;top:${ey}px;transform:rotate(${Math.random()*720}deg)`},10);
  setTimeout(()=>{
    fly.remove();
    const bt=document.createElement('div');bt.className='bet-token';bt.innerHTML=createChipSVG(chip);
    bt.style.cssText=`width:44px;height:44px;left:${ex-bRect.left}px;top:${ey-bRect.top}px`;
    bz.appendChild(bt);
  },800);
  updateChipsDisplay();updateBetDisplay();
}
function clearBet(){
  if(gamePhase!=='betting'||isAnimating)return;
  chips+=currentBet;currentBet=0n;betTokens=[];chipDist=computeGreedyDist(chips);
  document.getElementById('bettingZone').querySelectorAll('.bet-token').forEach(t=>t.remove());
  updateChipsDisplay();updateBetDisplay();saveState();
}

// ── God blessing (0 chips) ───────────────────
async function showGodBlessing(){
  isAnimating=true;document.getElementById('godOverlay').classList.add('show');
  let ga=10n;
  if(BigInt(stats.maxChips||'0')>=10000n){
    try{const res=await fetchT('/api/ranking',null,5000);const data=await res.json();const top=(data.top100&&data.top100[0])||data[0];if(top&&top.maxChips){const pct=BigInt(top.maxChips)/1000n;if(pct>0n)ga=pct;}}catch(e){}
  }
  document.getElementById('godMsgAmount').textContent='+'+formatBig(ga)+' 토큰';
  setTimeout(()=>{chips=ga;chipDist=computeGreedyDist(chips);saveState();document.getElementById('godOverlay').classList.remove('show');isAnimating=false;updateChipsDisplay();},3000);
}

// ── Card helpers ─────────────────────────────
function createDeck(){deck=[];for(const s of suits)for(const r of ranks)deck.push({suit:s,rank:r})}
function shuffleDeck(){for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}}
function displayCards(){
  const ca=document.getElementById('cardsArea');ca.innerHTML='';
  playerHand.forEach((card,idx)=>{
    const d=document.createElement('div');d.className='card'+(selectedCards.includes(idx)?' selected':'');
    d.innerHTML=createCardSVG(card);
    d.onclick=()=>toggleCard(idx);
    d.addEventListener('touchend',e=>{e.preventDefault();toggleCard(idx)},{passive:false});
    ca.appendChild(d);
  });
}
function toggleCard(idx){if(gamePhase!=='dealt')return;const i=selectedCards.indexOf(idx);if(i>-1)selectedCards.splice(i,1);else selectedCards.push(idx);displayCards()}

// ── Game flow ────────────────────────────────
function deal(){
  if(currentBet<1n){alert('최소 1칩 이상 베팅!');return}if(isAnimating)return;
  preGameChips=chips+currentBet;createDeck();shuffleDeck();playerHand=[];selectedCards=[];
  for(let i=0;i<5;i++)playerHand.push(deck.pop());
  displayCards();gamePhase='dealt';
  document.getElementById('dealButton').disabled=true;document.getElementById('drawButton').disabled=false;
  updateGameTicketBtn();saveState();
}
function draw(){
  const ex=[...selectedCards].sort((a,b)=>a-b);
  for(const idx of ex)playerHand[idx]=deck.pop();
  const ca=document.getElementById('cardsArea');
  [...ca.children].forEach((el,idx)=>{el.classList.remove('selected');if(ex.includes(idx))el.innerHTML=cardBackSmallSVG()});
  selectedCards=[];gamePhase='drawn';document.getElementById('drawButton').disabled=true;
  saveState();

  // If no cards exchanged, or kept cards already form a decent hand → skip animation
  const keptIndices=[0,1,2,3,4].filter(i=>!ex.includes(i));
  const keptCards=keptIndices.map(i=>playerHand[i]);
  const keptRank=keptCards.length>=5?getHandRank(keptCards):
    keptCards.length>=2?_checkPartialHand(keptCards):null;
  const alreadyGood=keptRank&&keptRank.pnum>0; // already has some combo in kept cards

  if(ex.length===0||(alreadyGood&&ex.length<=2)){
    // Instant reveal
    [...ca.children].forEach((el,idx)=>{
      if(ex.includes(idx)){el.innerHTML=createCardSVG(playerHand[idx]);el.style.transform='';}
    });
    displayCards();
    setTimeout(()=>evaluateHand(),100);
  }else{
    revealCards(ca,ex,0);
  }
}

// Check if partial hand (2-4 cards) already has a pair or better
function _checkPartialHand(cards){
  if(cards.length<2)return null;
  const cnts={};cards.forEach(c=>{const v=rankValue[c.rank];cnts[v]=(cnts[v]||0)+1;});
  const cv=Object.values(cnts).sort((a,b)=>b-a);
  if(cv[0]>=4)return{pnum:50};
  if(cv[0]===3&&cv[1]>=2)return{pnum:25};
  if(cv[0]===3)return{pnum:5};
  if(cv[0]===2&&cv[1]===2)return{pnum:3};
  if(cv[0]===2)return{pnum:1};
  return{pnum:0};
}
function revealCards(ca,indices,i){
  if(i>=indices.length){setTimeout(()=>evaluateHand(),620);return}
  const idx=indices[i],el=ca.children[idx];
  el.style.transform='rotateY(90deg) scaleX(0.1)';sfxCardFlip();
  setTimeout(()=>{el.innerHTML=createCardSVG(playerHand[idx]);el.style.transform='';setTimeout(()=>revealCards(ca,indices,i+1),360)},215);
}
function evaluateHand(){
  isAnimating=true;
  const result=getHandRank(playerHand);
  const ov=document.getElementById('resultOverlay'),titleEl=document.getElementById('resultTitle'),amountEl=document.getElementById('resultAmount');
  stats.totalGames++;
  if(result.pnum>0){
    const win=currentBet*BigInt(result.pnum)/BigInt(result.pden);
    stats.totalWins++;
    if(cmpBigStr(win.toString(),stats.maxWin)>0)stats.maxWin=win.toString();
    if(result.payoutF>(stats.bestHandPayout||0)){stats.bestHand=result.name;stats.bestHandPayout=result.payoutF}
    saveStats();sfxWin();
    titleEl.textContent=result.name;titleEl.className='result-title win';amountEl.textContent='+'+formatBig(win)+' 칩';
    pendingWin=win;
    document.getElementById('resultButtons').innerHTML=`<button class="btn-primary" onclick="clearTimeout(animationTimeout);startDoubleUp(pendingWin)">더블업 🎰</button><button class="skip-button" onclick="clearTimeout(animationTimeout);collectPending()">그냥 받기</button>`;
    ov.classList.add('show');animationTimeout=setTimeout(()=>collectPending(),8000);
  }else{
    pendingWin=0n;saveStats();sfxLose();
    titleEl.textContent='패배';titleEl.className='result-title lose';amountEl.textContent='-'+formatBig(currentBet)+' 칩';
    document.getElementById('resultButtons').innerHTML='<button class="skip-button" onclick="skipAnimation()">스킵 (Enter)</button>';
    ov.classList.add('show');animationTimeout=setTimeout(()=>{isAnimating=false;resetGame()},2000);
  }
}
function skipAnimation(){clearTimeout(animationTimeout);collectPending()}
function collectPending(){if(pendingWin>0n){chips+=pendingWin;chipDist=computeGreedyDist(chips);saveState();pendingWin=0n}isAnimating=false;resetGame()}
function resetGame(){
  document.getElementById('resultOverlay').classList.remove('show');document.getElementById('doubleOverlay').classList.remove('show');
  document.getElementById('resultButtons').innerHTML='<button class="skip-button" onclick="skipAnimation()">스킵 (Enter)</button>';
  isAnimating=false;gamePhase='betting';currentBet=0n;betTokens=[];playerHand=[];
  document.getElementById('bettingZone').querySelectorAll('.bet-token').forEach(t=>t.remove());
  document.getElementById('dealButton').disabled=false;document.getElementById('drawButton').disabled=true;
  updateGameTicketBtn();saveState();updateChipsDisplay();updateBetDisplay();displayCards();updateSlotChipsDisplay();updateRlChipRow();
}
function collectWinnings(winAmount){
  const cRect=document.getElementById('chipsContainer').getBoundingClientRect();
  const n=Math.min(14,Number(winAmount/(chipTypes[2]?chipTypes[2].value:100n))+4);
  for(let i=0;i<n;i++){
    setTimeout(()=>{
      const token=document.createElement('div');token.className='flying-token';
      const c=chipTypes[Math.min(Math.floor(Math.random()*4),3)];token.innerHTML=createChipSVG(c);
      token.style.cssText=`width:44px;height:44px;left:${window.innerWidth/2-22+(Math.random()-.5)*110}px;top:${window.innerHeight/2-22+(Math.random()-.5)*72}px`;
      document.body.appendChild(token);
      setTimeout(()=>{token.style.cssText+=`;left:${cRect.left+cRect.width/2-22+(Math.random()-.5)*110}px;top:${cRect.top+cRect.height/2-22+(Math.random()-.5)*36}px;transform:rotate(${Math.random()*720}deg) scale(.8);opacity:.8`},10);
      setTimeout(()=>token.remove(),800);
    },i*35);
  }
  setTimeout(()=>{isAnimating=false;resetGame()},n*35+500);
}

// ── Double-up ────────────────────────────────
function startDoubleUp(winAmount){pendingWin=winAmount;setupDoubleRound();document.getElementById('doubleOverlay').classList.add('show');document.getElementById('resultOverlay').classList.remove('show')}
function setupDoubleRound(){
  doubleBaseDeck=[];for(const s of suits)for(const r of ranks)doubleBaseDeck.push({suit:s,rank:r});
  for(let i=doubleBaseDeck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[doubleBaseDeck[i],doubleBaseDeck[j]]=[doubleBaseDeck[j],doubleBaseDeck[i]]}
  doubleBaseCard=doubleBaseDeck.pop();const nextCard=doubleBaseDeck.pop();
  document.getElementById('doubleBaseCard').innerHTML=createCardSVG(doubleBaseCard);
  document.getElementById('doubleNextFront').innerHTML=createCardSVG(nextCard);
  document.getElementById('doubleNextBack').innerHTML=cardBackSVG();
  const inner=document.getElementById('doubleNextCardInner');inner.style.transition='none';inner.style.transform='';
  setTimeout(()=>{inner.style.transition='transform .65s ease-in-out'},20);
  document.getElementById('doubleResultMsg').textContent='';document.getElementById('doublePot').textContent='팟: '+formatBig(pendingWin)+' 칩';
  const btns=document.getElementById('doubleButtons');
  const tb=cancelTickets>0?`<button class="ticket-btn" onclick="useTicketDouble()">🎫 되돌리기 (${cancelTickets}장)</button>`:'';
  const flipBtn=document.createElement('button');flipBtn.className='btn-primary';flipBtn.textContent='뒤집기 🎴';flipBtn.onclick=()=>revealDoubleCard(nextCard);
  btns.innerHTML='';btns.appendChild(flipBtn);if(tb)btns.innerHTML+=tb;
}
function revealDoubleCard(nextCard){
  document.getElementById('doubleButtons').innerHTML='';
  document.getElementById('doubleNextCardInner').style.transform='rotateY(180deg)';
  setTimeout(()=>{
    const bRv=rankValue[doubleBaseCard.rank],nRv=rankValue[nextCard.rank],win=nRv>=bRv;
    const msgEl=document.getElementById('doubleResultMsg'),potEl=document.getElementById('doublePot'),btns=document.getElementById('doubleButtons');
    if(win){
      sfxDoubleWin();pendingWin*=2n;
      msgEl.textContent=formatBig(pendingWin)+' 토큰! 🎉';msgEl.style.color='#2ecc71';msgEl.style.textShadow='0 0 16px #2ecc71';
      potEl.textContent='팟: '+formatBig(pendingWin)+' 칩';
      const pw=pendingWin;
      btns.innerHTML='<button class="btn-primary" onclick="setupDoubleRound()">한 번 더! 🎴</button>';
      const rcvBtn=document.createElement('button');rcvBtn.className='btn-secondary';rcvBtn.style.color='white';
      rcvBtn.textContent='받기 ('+formatBig(pw)+')';rcvBtn.onclick=collectAndClose;btns.appendChild(rcvBtn);
    }else{
      sfxDoubleLose();pendingWin=0n;
      msgEl.textContent='패배... 😢';msgEl.style.color='#e74c3c';msgEl.style.textShadow='0 0 16px #e74c3c';
      potEl.textContent='베팅 잃음';
      btns.innerHTML='<button class="btn-secondary" style="color:white" onclick="closeDoubleOverlay()">닫기</button>';
    }
  },700);
}
function collectAndClose(){
  if(pendingWin>0n){chips+=pendingWin;chipDist=computeGreedyDist(chips);if(cmpBigStr(pendingWin.toString(),stats.maxWin)>0){stats.maxWin=pendingWin.toString();saveStats()}saveState();collectWinnings(pendingWin);}
  document.getElementById('doubleOverlay').classList.remove('show');
}
function closeDoubleOverlay(){document.getElementById('doubleOverlay').classList.remove('show');isAnimating=false;resetGame()}

// ── Tickets ──────────────────────────────────
function updateTicketUI(){const el=document.getElementById('ticketCount');document.getElementById('ticketNum').textContent=cancelTickets;el.classList.toggle('has-tickets',cancelTickets>0);updateGameTicketBtn()}
function updateGameTicketBtn(){
  const ex=document.getElementById('gameTicketBtn');if(ex)ex.remove();
  if(cancelTickets>0&&(gamePhase==='dealt'||gamePhase==='drawn')){
    const btn=document.createElement('button');btn.id='gameTicketBtn';btn.className='ticket-btn';btn.textContent='🎫 베팅 취소';btn.onclick=useTicketGame;
    document.querySelector('.action-buttons').appendChild(btn);
  }
}
function useTicketGame(){
  if(cancelTickets<=0)return;if(!confirm('취소권 사용 → 베팅 전 복원?\n남은: '+cancelTickets+'장'))return;
  cancelTickets--;chips=preGameChips;chipDist=computeGreedyDist(chips);
  currentBet=0n;betTokens=[];playerHand=[];selectedCards=[];gamePhase='betting';
  document.getElementById('bettingZone').querySelectorAll('.bet-token').forEach(t=>t.remove());
  document.getElementById('dealButton').disabled=false;document.getElementById('drawButton').disabled=true;
  document.getElementById('resultOverlay').classList.remove('show');
  updateTicketUI();updateChipsDisplay();updateBetDisplay();displayCards();saveState();
}
function useTicketDouble(){
  if(cancelTickets<=0)return;if(!confirm('취소권 사용 → '+formatBig(pendingWin)+'칩 수령?\n남은: '+cancelTickets+'장'))return;
  cancelTickets--;document.getElementById('doubleOverlay').classList.remove('show');updateTicketUI();collectAndClose();
}
