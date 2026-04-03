// ═══════════════════════════════════════════
// core.js  –  state, network, auth, bank, ranking
// ═══════════════════════════════════════════

// ── Global state ────────────────────────────
let deck=[],playerHand=[],selectedCards=[];
let chips=10n,currentBet=0n,betTokens=[],chipDist={};
let gamePhase='betting',animationTimeout,isAnimating=false,isMusicPlaying=false;
let stats={maxChips:'10',maxWin:'0',bestHand:'-',bestHandPayout:0,totalGames:0,totalWins:0};
let nickname=null,cancelTickets=0,preGameChips=0n,bankData=null;
let pendingWin=0n,doubleBaseDeck=[],doubleBaseCard=null;
const PLAYER_API='/api/player';
let sessionNickname=null,sessionToken=null;

// ── Tab music map ────────────────────────────
const TAB_MUSIC={
  poker:'bgMusic',roulette:'bgMusicRoulette',slot:'bgMusicSlot',
  pvp:'bgMusicPvp',toto:'bgMusicToto',dice:'bgMusicDice'
};

// ── Network ──────────────────────────────────
async function fetchT(url,opts,ms){
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(),ms||8000);
  try{return await fetch(url,{...(opts||{}),signal:ctrl.signal})}
  finally{clearTimeout(tid)}
}

// ── Session ──────────────────────────────────
function loadSession(){
  const raw=localStorage.getItem('pkSession');if(!raw)return false;
  try{const s=JSON.parse(raw);sessionNickname=s.n;sessionToken=s.t;return!!(s.n&&s.t)}catch{return false}
}
function saveSession(nick,tok){sessionNickname=nick;sessionToken=tok;localStorage.setItem('pkSession',JSON.stringify({n:nick,t:tok}));nickname=nick}
function clearSession(){sessionNickname=null;sessionToken=null;localStorage.removeItem('pkSession');nickname=null}

// ── Persist state ────────────────────────────
let _saveTimer=null;
function saveState(){
  localStorage.setItem('pkBet',currentBet.toString());
  localStorage.setItem('pkBetTokens',JSON.stringify(betTokens));
  localStorage.setItem('pkPhase',gamePhase);
  if(playerHand.length)localStorage.setItem('pkHand',JSON.stringify(playerHand));
  else localStorage.removeItem('pkHand');
  if(!sessionNickname||!sessionToken)return;
  clearTimeout(_saveTimer);_saveTimer=setTimeout(_saveToAPI,800);
}
async function _saveToAPI(){
  if(!sessionNickname||!sessionToken)return;
  try{await fetchT(PLAYER_API+'?action=save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:sessionNickname,token:sessionToken,chips:chips.toString(),stats,cancelTickets})})}catch(e){}
}
function saveStats(){
  // Always update maxChips before saving
  const total=chips+currentBet;
  if(cmpBigStr(total.toString(),stats.maxChips||'0')>0) stats.maxChips=total.toString();
  updateStatsDisplay();saveState();
}

// ── Loading overlay ──────────────────────────
function showLoading(m){document.getElementById('loadingMsg').textContent=m||'...';document.getElementById('loadingOverlay').style.display='flex'}
function hideLoading(){document.getElementById('loadingOverlay').style.display='none'}
function showTaxToast(){}

// ── Tab switching ────────────────────────────
let currentTab='poker';
// 탭 그룹 (플레이/커뮤니티/관리자)
const TAB_GROUPS = {
  play: ['poker','roulette','slot','pvp','toto','dice'],
  community: ['community'],
  admin: ['admin'],
};
const PLAY_TABS = ['poker','roulette','slot','pvp','toto','dice'];

function switchTabGroup(group) {
  document.querySelectorAll('.nav-group-btn').forEach(el=>el.classList.toggle('active',el.dataset.group===group));
  const subRow = document.getElementById('navSubTabs');
  if (group === 'play') {
    subRow.style.display = '';
    document.querySelectorAll('.tab-page').forEach(el=>el.classList.remove('active'));
    const t = currentTab && PLAY_TABS.includes(currentTab) ? currentTab : 'poker';
    _activateTab(t);
  } else {
    subRow.style.display = 'none';
    document.querySelectorAll('.tab-page').forEach(el=>el.classList.remove('active'));
    const tabId = group==='community' ? 'tabCommunity' : 'tabAdmin';
    document.getElementById(tabId)?.classList.add('active');
    if(group==='community') loadCommunityTab();
    if(group==='admin') renderAdminTab();
  }
}

function _activateTab(name){
  const tabEl=document.getElementById('tab'+name[0].toUpperCase()+name.slice(1));
  if(tabEl)tabEl.classList.add('active');
  document.querySelectorAll('.nav-sub-btn').forEach(el=>el.classList.toggle('active',el.dataset.tab===name));
}

function switchTab(name){
  if(currentTab===name)return;sfxTabSwitch();
  if(isMusicPlaying){
    const old=document.getElementById(TAB_MUSIC[currentTab]||'bgMusic');
    old?.pause();
    const nm=document.getElementById(TAB_MUSIC[name]||'bgMusic');
    if(nm){nm.volume=0.5;nm.play().catch(()=>{});}
  }
  document.querySelectorAll('.tab-page').forEach(el=>el.classList.remove('active'));
  _activateTab(name);
  currentTab=name;
  if(name==='roulette'){buildRlTable();updateRlChipRow();if(rlJoined)rlStartPolling();}
  if(name==='slot'){updateSlotChipsDisplay();if(typeof renderSlotChipStacks==='function')renderSlotChipStacks();}
  if(name==='toto')renderHorseTab();
  if(name==='dice')renderDiceUI();
}

function switchTotoSub(sub, btn) {
  document.querySelectorAll('#tabToto .toto-sub-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('horseSub').style.display = sub === 'horse' ? '' : 'none';
  document.getElementById('baseballSub').style.display = sub === 'baseball' ? '' : 'none';
  if (sub === 'horse') renderHorseTab();
  if (sub === 'baseball') loadBaseballGames();
}

let _communitySub = 'ranking';
function switchCommunitySub(sub, btn) {
  document.querySelectorAll('.community-sub-tabs .toto-sub-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('communityRanking').style.display = sub === 'ranking' ? '' : 'none';
  document.getElementById('communityDM').style.display = sub === 'dm' ? '' : 'none';
  document.getElementById('communityInvest').style.display = sub === 'invest' ? '' : 'none';
  _communitySub = sub;
  if (sub === 'ranking') loadCommunityRanking();
  if (sub === 'dm') loadInlineDM();
  if (sub === 'invest') loadInvestments();
}

async function loadCommunityTab() {
  if (_communitySub === 'ranking') loadCommunityRanking();
  else if (_communitySub === 'dm') loadInlineDM();
  else if (_communitySub === 'invest') loadInvestments();
}

async function loadCommunityRanking() {
  const el = document.getElementById('communityRankingContent');
  if (!el) return;
  try {
    const res = await fetch('/api/ranking'+(nickname?'?nick='+encodeURIComponent(nickname):''));
    const data = await res.json();
    const rows = data.top100||data, surrounding = data.surrounding||[], userRank = data.userRank||0;
    if (!Array.isArray(rows)||!rows.length) { el.innerHTML='<div class="toto-empty">랭킹 없음</div>'; return; }
    const medals = ['🥇','🥈','🥉'];
    const rr = row => {
      const isMe = nickname && row.nickname === nickname;
      const medal = row.rank<=3 ? medals[row.rank-1] : '';
      return `<tr class="rank-${row.rank}${isMe?' me-row':''}"><td>${medal}${row.rank}</td><td><span style="cursor:pointer;text-decoration:underline dotted" onclick="showProfile('${escHtml(row.nickname)}')">${escHtml(row.nickname)}</span>${isMe?' 👈':''}</td><td>${shortFmt(BigInt(row.maxChips||'0'))}</td></tr>`;
    };
    let html = '<table class="ranking-table"><thead><tr><th>순위</th><th>닉네임</th><th>최고 칩</th></tr></thead><tbody>';
    rows.forEach(row => html += rr(row));
    if (surrounding.length&&userRank>100) { html+=`<tr><td colspan="3" style="text-align:center;color:#444">・・・</td></tr>`; surrounding.forEach(row=>html+=rr(row)); }
    html += '</tbody></table>';
    if (userRank>0) html += `<div style="margin-top:.5rem;font-size:.78rem;color:#aaa">내 순위: ${userRank}위</div>`;
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

function loadInlineDM() {
  const panel = document.getElementById('dmPanelInline');
  if (!panel) return;
  if (!sessionNickname) { panel.innerHTML = '<div class="toto-empty">로그인 후 이용 가능</div>'; return; }
  // DM 패널을 인라인으로 렌더 (showDM와 같은 로직)
  dmCurrentConv = null;
  dmLoadInboxInline();
}

async function dmLoadInboxInline() {
  const panel = document.getElementById('dmPanelInline');
  if (!panel) return;
  panel.innerHTML = `<div class="dm-header" style="border-radius:10px 10px 0 0"><span>💬 메시지</span><button class="dm-new-btn" onclick="dmNewGroup()">+ 그룹</button></div><div class="dm-list" id="dmListInline"><div class="dm-loading">불러오는 중...</div></div>`;
  try {
    const res = await dmGet({ action: 'inbox' });
    const convs = await res.json();
    const list = document.getElementById('dmListInline');
    if (!list) return;
    if (!convs.length) { list.innerHTML = '<div class="dm-empty">대화가 없습니다</div>'; return; }
    list.innerHTML = convs.map(c => `<div class="dm-conv-item" onclick="showDM();dmOpenConv(${JSON.stringify(JSON.stringify(c))})">
      <div class="dm-conv-icon">${c.type==='group'?'👥':'💬'}</div>
      <div class="dm-conv-info"><div class="dm-conv-name">${escHtml(c.name)}${c.unread>0?`<span class="dm-unread-dot">${c.unread}</span>`:''}</div>
      <div class="dm-conv-last">${c.lastMsg?escHtml(c.lastMsg.content.slice(0,40)):'메시지 없음'}</div></div>
    </div>`).join('');
  } catch(e) { document.getElementById('dmListInline').innerHTML = '<div class="dm-empty">로드 실패</div>'; }
}

async function loadInvestments() {
  const el = document.getElementById('investContent');
  if (!el) return;
  if (!sessionNickname) { el.innerHTML = '<div class="toto-empty">로그인 필요</div>'; return; }
  try {
    const res = await fetchT(`/api/invest?nick=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 5000);
    const invs = await res.json();
    if (!invs.length) { el.innerHTML = '<div class="toto-empty">투자 내역 없음</div>'; return; }
    el.innerHTML = `<table class="ranking-table"><thead><tr><th>대상</th><th>원금</th><th>현재가치</th><th>날짜</th></tr></thead><tbody>
      ${invs.map(i=>`<tr><td>${escHtml(i.target)}</td><td>${shortFmt(BigInt(i.amount||'0'))}</td><td>${shortFmt(BigInt(i.currentValue||'0'))}</td><td>${new Date(i.createdAt).toLocaleDateString('ko-KR')}</td></tr>`).join('')}
    </tbody></table>`;
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

// ── Music ────────────────────────────────────
function toggleMusic(){
  const btn=document.getElementById('musicButton');
  if(isMusicPlaying){
    document.querySelectorAll('audio').forEach(a=>a.pause());
    btn.textContent='🔇';isMusicPlaying=false;localStorage.setItem('musicEnabled','false');
  }else{
    const m=document.getElementById(TAB_MUSIC[currentTab]||'bgMusic');
    m.volume=0.5;m.play().catch(()=>{});
    btn.textContent='🔊';isMusicPlaying=true;localStorage.setItem('musicEnabled','true');
  }
}

// ── Chip distribution ────────────────────────
function computeGreedyDist(total){let rem=total,dist={};for(let i=chipTypes.length-1;i>=0;i--){const cv=chipTypes[i].value,k=cv.toString();dist[k]=rem/cv;rem=rem%cv;}return dist}
function makeChange(ti){
  const tk=chipTypes[ti].value.toString();if((chipDist[tk]||0n)>0n)return true;
  for(let j=ti+1;j<chipTypes.length;j++){const jk=chipTypes[j].value.toString();if((chipDist[jk]||0n)>0n){chipDist[jk]-=1n;chipDist[chipTypes[j-1].value.toString()]=(chipDist[chipTypes[j-1].value.toString()]||0n)+10n;return makeChange(ti);}}
  return false;
}
// 보유 칩 중 표시할 슬롯 목록 반환 (상위 10개, + / ++ 우선)
function getDisplayChips() {
  // 보유한 칩 종류 전부 (값 내림차순)
  const have = [];
  for (let i = chipTypes.length - 1; i >= 0; i--) {
    const chip = chipTypes[i], cnt = chipDist[chip.value.toString()] || 0n;
    if (cnt > 0n) have.push({ chip, cnt });
  }
  if (have.length <= 10) return have;

  // 상위 10개만 (이미 내림차순)
  return have.slice(0, 10);
}

function _makeChipStack(chip, cnt, onClickFn) {
  const s = document.createElement('div'); s.className = 'chip-stack'; s.innerHTML = createChipSVG(chip);
  s.title = formatBig(chip.value) + ' × ' + cnt;
  if (cnt > 1n) { const b = document.createElement('div'); b.className = 'chip-count'; b.textContent = cnt > 99n ? '99+' : cnt.toString(); s.appendChild(b); }
  s.onclick = e => onClickFn(chip, e);
  s.addEventListener('touchend', e => { e.preventDefault(); onClickFn(chip, e.changedTouches?.[0] || e); }, { passive: false });
  return s;
}

function updateChipsDisplay(){
  const cont=document.getElementById('chipsContainer');cont.innerHTML='';
  const hasPendingAnywhere=currentBet>0n
    ||(typeof rlTotalPending!=='undefined'&&rlTotalPending>0n)
    ||(typeof slotMachines!=='undefined'&&slotMachines.some&&slotMachines.some(m=>m.busy));
  const onPokerTab=(typeof currentTab==='undefined')||currentTab==='poker';
  if(chips===0n&&!isAnimating&&!hasPendingAnywhere&&gamePhase==='betting'&&onPokerTab){
    if(!document.getElementById('authModal').classList.contains('show'))showGodBlessing();return;
  }
  getDisplayChips().forEach(({chip, cnt}) => {
    cont.appendChild(_makeChipStack(chip, cnt, throwChip));
  });
}

function updateBetDisplay(){document.getElementById('betAmount').textContent=shortFmt(currentBet)}
function updateSlotChipsDisplay(){
  const el=document.getElementById('slotMyChips');if(el)el.textContent=shortFmt(chips)+' 칩';
  const el2=document.getElementById('slotMyChips2');if(el2)el2.textContent=shortFmt(chips)+' 칩';
  if(typeof renderSlotChipStacks==='function')renderSlotChipStacks();
}
function updateRlChipRow(){
  const row=document.getElementById('rlChipRow');if(!row)return;row.innerHTML='';
  getDisplayChips().forEach(({chip,cnt})=>{
    const s=_makeChipStack(chip,cnt,(c,e)=>rlSelectChip(c,e?.currentTarget||row));
    row.appendChild(s);
  });
}
function updateStatsDisplay(){
  document.getElementById('maxChips').textContent=shortFmt(BigInt(stats.maxChips||'0'));
  document.getElementById('maxWin').textContent=shortFmt(BigInt(stats.maxWin||'0'));
  document.getElementById('bestHand').textContent=stats.bestHand||'-';
  const tg=Number(stats.totalGames)||0,tw=Number(stats.totalWins)||0;
  document.getElementById('totalGames').textContent=tg;
  document.getElementById('totalWins').textContent=tw;
  document.getElementById('winRate').textContent=(tg>0?((tw/tg)*100).toFixed(1):'0')+'%';
}

// ── Auth ─────────────────────────────────────
async function authSubmit(mode){
  const nick=document.getElementById('authNick').value.trim(),pass=document.getElementById('authPass').value;
  const errEl=document.getElementById('authError');errEl.textContent='';
  if(!nick){errEl.textContent='닉네임을 입력하세요';return}
  if(!pass||pass.length<4){errEl.textContent='비밀번호 4자 이상';return}
  document.getElementById('authLoginBtn').disabled=true;
  showLoading(mode==='login'?'로그인 중...':'계정 생성 중...');
  try{
    const res=await fetchT(PLAYER_API+'?action='+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:nick,password:pass})});
    const data=await res.json();
    if(!res.ok){errEl.textContent=data.error||'오류';document.getElementById('authLoginBtn').disabled=false;return}
    saveSession(nick,data.token);
    document.getElementById('authModal').classList.remove('show');
    applyServerState(data);
  }catch(e){errEl.textContent=e.name==='AbortError'?'응답 없음':'서버 연결 실패';document.getElementById('authLoginBtn').disabled=false}
  finally{hideLoading()}
}

function applyServerState(data){
  chips=BigInt(data.chips||'10');
  if(data.stats){const s=data.stats;stats={maxChips:s.maxChips||chips.toString(),maxWin:s.maxWin||'0',bestHand:s.bestHand||'-',bestHandPayout:s.bestHandPayout||0,totalGames:s.totalGames||0,totalWins:s.totalWins||0}}
  bankData=data.bank||null;
  if(typeof data.cancelTickets==='number')cancelTickets=data.cancelTickets;
  currentBet=BigInt(localStorage.getItem('pkBet')||'0');
  betTokens=JSON.parse(localStorage.getItem('pkBetTokens')||'[]');
  gamePhase=localStorage.getItem('pkPhase')||'betting';
  playerHand=JSON.parse(localStorage.getItem('pkHand')||'null')||[];
  chipDist=computeGreedyDist(chips);
  updateChipsDisplay();updateBetDisplay();updateStatsDisplay();updateTicketUI();updateSlotChipsDisplay();updateRlChipRow();
  restoreGameUI();restoreBetDisplay();
  startPresence();
  if(typeof dmStartPoll==='function')dmStartPoll();
  if(typeof dmRefreshBadge==='function')dmRefreshBadge();
}

function restoreGameUI(){
  if(gamePhase==='dealt'){
    document.getElementById('dealButton').disabled=true;
    document.getElementById('drawButton').disabled=false;
    displayCards();updateGameTicketBtn();
  }else if(gamePhase==='drawn'){
    // drawn but page refreshed - reset to betting since we can't continue without deck state
    gamePhase='betting';currentBet=0n;betTokens=[];
    chips=BigInt(localStorage.getItem('pkChipsBeforeDeal')||chips.toString());
    chipDist=computeGreedyDist(chips);
    localStorage.removeItem('pkHand');playerHand=[];
    document.getElementById('dealButton').disabled=false;
    document.getElementById('drawButton').disabled=true;
    displayCards();saveState();
  }else{
    gamePhase='betting';
    // If betTokens exist but no hand, restore chips from pre-bet state
    if(betTokens.length>0&&playerHand.length===0){
      chips+=currentBet;currentBet=0n;betTokens=[];
      chipDist=computeGreedyDist(chips);
      document.getElementById('bettingZone').querySelectorAll('.bet-token').forEach(t=>t.remove());
      saveState();
    }
    document.getElementById('dealButton').disabled=false;
    document.getElementById('drawButton').disabled=true;
    displayCards();
  }
}
function restoreBetDisplay(){
  if(!betTokens.length)return;
  const bz=document.getElementById('bettingZone'),bRect=bz.getBoundingClientRect();
  betTokens.forEach((chipIdx,i)=>{
    const chip=chipTypes[chipIdx];if(!chip)return;
    const bt=document.createElement('div');bt.className='bet-token';bt.innerHTML=createChipSVG(chip);
    const angle=(i/Math.max(betTokens.length,1))*Math.PI*2;
    const rx=bRect.width/2-22+Math.cos(angle)*Math.min(36,betTokens.length*3);
    const ry=bRect.height/2-22+Math.sin(angle)*Math.min(22,betTokens.length*2);
    bt.style.cssText=`width:44px;height:44px;left:${rx}px;top:${ry}px`;
    bz.appendChild(bt);
  });
}

async function reloadMyChips(){
  if(!sessionNickname||!sessionToken)return;
  try{
    const res=await fetchT(`${PLAYER_API}?action=load&nick=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`);
    if(res.ok){const data=await res.json();chips=BigInt(data.chips||'10');chipDist=computeGreedyDist(chips);updateChipsDisplay();updateBetDisplay();updateSlotChipsDisplay();updateRlChipRow();}
  }catch(e){}
}

// ── Bank (removed) ──────────────────────────
function showBank(){}
function closeBank(){}
function refreshBankUI(){}
async function bankDeposit(){}
async function bankWithdraw(){}

// ── Ranking ──────────────────────────────────
async function showRanking(){
  document.getElementById('rankingModal').classList.add('show');
  document.getElementById('rankingContent').innerHTML='<div class="ranking-empty">불러오는 중...</div>';
  try{
    const res=await fetch('/api/ranking'+(nickname?'?nick='+encodeURIComponent(nickname):''));
    const data=await res.json();
    const rows=data.top100||data,surrounding=data.surrounding||[],userRank=data.userRank||0;
    if(!Array.isArray(rows)||!rows.length){document.getElementById('rankingContent').innerHTML='<div class="ranking-empty">아직 랭킹 없음</div>';return}
    const medals=['🥇','🥈','🥉'];
    const rr=row=>{const isMe=nickname&&row.nickname===nickname,medal=row.rank<=3?medals[row.rank-1]:'';return`<tr class="rank-${row.rank}${isMe?' me-row':''}"><td>${medal}${row.rank}</td><td><span style="cursor:pointer;text-decoration:underline dotted" onclick="closeRanking();showProfile('${escHtml(row.nickname)}')">${escHtml(row.nickname)}</span>${isMe?' 👈':''}</td><td>${shortFmt(BigInt(row.maxChips||'0'))}</td></tr>`};
    let html='<table class="ranking-table"><thead><tr><th>순위</th><th>닉네임</th><th>최고 칩</th></tr></thead><tbody>';
    rows.forEach(row=>html+=rr(row));
    if(surrounding.length&&userRank>100){html+=`<tr><td colspan="3" style="text-align:center;color:#444;font-size:.78rem">・・・</td></tr>`;surrounding.forEach(row=>html+=rr(row));}
    html+='</tbody></table>';
    if(userRank>0)html+=`<div style="margin-top:.55rem;font-size:.78rem;color:#aaa">내 순위: ${userRank}위</div>`;
    document.getElementById('rankingContent').innerHTML=html;
  }catch(e){document.getElementById('rankingContent').innerHTML='<div class="ranking-empty">불러올 수 없음</div>'}
}
function closeRanking(){document.getElementById('rankingModal').classList.remove('show')}
