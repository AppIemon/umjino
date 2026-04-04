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
  const tid=setTimeout(()=>ctrl.abort(),ms||5000);
  try{return await fetch(url,{...(opts||{}),signal:ctrl.signal})}
  finally{clearTimeout(tid)}
}

// ── Session ──────────────────────────────────
function loadSession(){
  const raw=localStorage.getItem('pkSession');if(!raw)return false;
  try{const s=JSON.parse(raw);sessionNickname=s.n;sessionToken=s.t;return!!(s.n&&s.t)}catch{return false}
}
function saveSession(nick,tok){
  sessionNickname=nick;sessionToken=tok;
  localStorage.setItem('pkSession',JSON.stringify({n:nick,t:tok}));
  nickname=nick;
  const el=document.getElementById('navNickName');
  if(el) el.textContent=nick.length>8?nick.slice(0,8)+'…':nick;
}
function clearSession(){sessionNickname=null;sessionToken=null;localStorage.removeItem('pkSession');nickname=null;const el=document.getElementById('navNickName');if(el)el.textContent='-';}

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
    const tabId = group==='community' ? 'tabCommunity' : group==='admin' ? 'tabAdmin' : 'tabOther';
    document.getElementById(tabId)?.classList.add('active');
    setTimeout(() => {
      if(group==='community') loadCommunityTab();
      if(group==='admin') renderAdminTab();
      if(group==='other') renderOtherTab();
    }, 30);
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
      return `<tr class="rank-${row.rank}${isMe?' me-row':''}"><td>${medal}${row.rank}</td><td><span style="cursor:pointer;text-decoration:underline dotted" onclick="showProfile('${escHtml(row.nickname)}')">${escHtml(row.nickname)}</span>${isMe?' 👈':''}</td><td>${rankChipHTML(BigInt(row.maxChips||'0'))}</td></tr>`;
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
  el.innerHTML = '<div class="toto-loading">투자 내역 로딩...</div>';
  try {
    const res = await fetchT(`/api/invest?nick=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 8000);
    const invs = await res.json();
    if (!invs.length) { el.innerHTML = '<div class="toto-empty">투자 내역 없음<br><small style="color:#555">프로필에서 투자 가능</small></div>'; return; }
    el.innerHTML = invs.map(inv => {
      const amt = BigInt(inv.amount || '0');
      const cur = BigInt(inv.currentValue || '0');
      const pct = inv.pct || 0;
      const isUp = pct >= 0;
      const pctStr = (isUp ? '+' : '') + pct.toFixed(1) + '%';
      const chartId = 'investChart_' + inv.id.slice(-6);
      return `<div class="invest-card">
<div class="invest-header">
  <div>
    <div class="invest-target">📈 ${escHtml(inv.target)}</div>
    <div class="invest-date">${new Date(inv.createdAt).toLocaleDateString('ko-KR')} 투자</div>
  </div>
  <div style="text-align:right">
    <div class="invest-pct ${isUp?'up':'down'}">${pctStr}</div>
    <div class="invest-cur">${shortFmt(cur)}칩</div>
    <div class="invest-org">원금 ${shortFmt(amt)}</div>
  </div>
</div>
<canvas class="invest-chart" id="${chartId}" height="70"></canvas>
</div>`;
    }).join('');
    // 차트 그리기 (DOM 업데이트 후)
    setTimeout(() => {
      invs.forEach(inv => {
        const canvas = document.getElementById('investChart_' + inv.id.slice(-6));
        if (canvas && inv.history?.length >= 2) drawInvestChart(canvas, inv.history);
        else if (canvas) {
          canvas.width = canvas.offsetWidth || 300; canvas.height = 70;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#333'; ctx.fillRect(0,0,canvas.width,70);
          ctx.fillStyle='#555';ctx.font='11px Arial';ctx.textAlign='center';
          ctx.fillText('데이터 수집 중...',canvas.width/2,38);
        }
      });
    }, 50);
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

function drawInvestChart(canvas, history) {
  const W = canvas.offsetWidth || 300;
  canvas.width = W; canvas.height = 70;
  const ctx = canvas.getContext('2d');
  const vals = history.map(h => { try { return Number(BigInt(h.v||'0')); } catch(e){ return 0; } });
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pad = { t:6, b:18, l:6, r:6 };
  const W2 = W-pad.l-pad.r, H2 = 70-pad.t-pad.b;
  const isUp = vals[vals.length-1] >= vals[0];
  const lineColor = isUp ? '#2ecc71' : '#e74c3c';
  const fillColor = isUp ? 'rgba(46,204,113,0.18)' : 'rgba(231,76,60,0.18)';
  const pts = vals.map((v,i) => ({
    x: pad.l + (vals.length>1 ? i/(vals.length-1) : 0.5)*W2,
    y: pad.t + H2 - ((v-minV)/range)*H2
  }));
  ctx.clearRect(0,0,W,70);
  // grid
  ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=1;
  [0.33,0.66].forEach(r=>{const y=pad.t+H2*r;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();});
  // fill
  ctx.beginPath();ctx.moveTo(pts[0].x,pad.t+H2);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,pad.t+H2);ctx.closePath();
  ctx.fillStyle=fillColor;ctx.fill();
  // line
  ctx.beginPath();ctx.strokeStyle=lineColor;ctx.lineWidth=2;ctx.lineJoin='round';
  pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.stroke();
  // dot
  const last=pts[pts.length-1];
  ctx.beginPath();ctx.arc(last.x,last.y,3.5,0,Math.PI*2);ctx.fillStyle=lineColor;ctx.fill();
  // labels
  ctx.fillStyle='#555';ctx.font='9px Arial';
  ctx.textAlign='left';ctx.fillText(new Date(history[0].t).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}),pad.l,68);
  ctx.textAlign='right';ctx.fillText(new Date(history[history.length-1].t).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'}),W-pad.r,68);
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
// 표시용 칩: 1, 10, 100, 1천 4종만. 1천 이상은 1천 묶음으로.
function computeGreedyDist(total) {
  let rem = total, dist = {};
  for (let i = chipTypes.length - 1; i >= 0; i--) {
    const cv = chipTypes[i].value, k = cv.toString();
    dist[k] = rem / cv; rem = rem % cv;
  }
  return dist;
}
function makeChange(ti) {
  const tk = chipTypes[ti].value.toString();
  if ((chipDist[tk] || 0n) > 0n) return true;
  for (let j = ti + 1; j < chipTypes.length; j++) {
    const jk = chipTypes[j].value.toString();
    if ((chipDist[jk] || 0n) > 0n) {
      chipDist[jk] -= 1n;
      chipDist[chipTypes[j-1].value.toString()] = (chipDist[chipTypes[j-1].value.toString()] || 0n) + 10n;
      return makeChange(ti);
    }
  }
  return false;
}
function getDisplayChips() {
  const have = [];
  for (let i = chipTypes.length - 1; i >= 0; i--) {
    const chip = chipTypes[i], cnt = chipDist[chip.value.toString()] || 0n;
    if (cnt > 0n) have.push({ chip, cnt });
  }
  return have.slice(0, 12);
}

function _makeChipStack(chip, cnt, onClickFn) {
  const tier = chip.tier || 0;
  const s = document.createElement('div');
  s.className = 'chip-stack' + (tier >= 3 ? ' tier3' : tier === 2 ? ' tier2' : '');
  s.innerHTML = createChipSVG(chip);
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
    const rr=row=>{const isMe=nickname&&row.nickname===nickname,medal=row.rank<=3?medals[row.rank-1]:'';return`<tr class="rank-${row.rank}${isMe?' me-row':''}"><td>${medal}${row.rank}</td><td><span style="cursor:pointer;text-decoration:underline dotted" onclick="closeRanking();showProfile('${escHtml(row.nickname)}')">${escHtml(row.nickname)}</span>${isMe?' 👈':''}</td><td>${rankChipHTML(BigInt(row.maxChips||'0'))}</td></tr>`};
    let html='<table class="ranking-table"><thead><tr><th>순위</th><th>닉네임</th><th>최고 칩</th></tr></thead><tbody>';
    rows.forEach(row=>html+=rr(row));
    if(surrounding.length&&userRank>100){html+=`<tr><td colspan="3" style="text-align:center;color:#444;font-size:.78rem">・・・</td></tr>`;surrounding.forEach(row=>html+=rr(row));}
    html+='</tbody></table>';
    if(userRank>0)html+=`<div style="margin-top:.55rem;font-size:.78rem;color:#aaa">내 순위: ${userRank}위</div>`;
    document.getElementById('rankingContent').innerHTML=html;
  }catch(e){document.getElementById('rankingContent').innerHTML='<div class="ranking-empty">불러올 수 없음</div>'}
}
function closeRanking(){document.getElementById('rankingModal').classList.remove('show')}

// ── 기타 탭 ──────────────────────────────────
let sfxEnabled = true;
let sfxVol = 0.7;
let bgmVol = 0.5;

function renderOtherTab() {
  // 볼륨 슬라이더 현재값 반영
  const bgmSlider = document.getElementById('bgmVolume');
  const sfxSlider = document.getElementById('sfxVolume');
  if (bgmSlider) { bgmSlider.value = Math.round(bgmVol * 100); document.getElementById('bgmVolVal').textContent = bgmSlider.value + '%'; }
  if (sfxSlider) { sfxSlider.value = Math.round(sfxVol * 100); document.getElementById('sfxVolVal').textContent = sfxSlider.value + '%'; }
  const sfxBtn = document.getElementById('sfxToggle');
  if (sfxBtn) { sfxBtn.textContent = sfxEnabled ? 'ON' : 'OFF'; sfxBtn.classList.toggle('active', sfxEnabled); }
  renderExchangeChips();
}

function setBgmVolume(v) {
  bgmVol = v / 100;
  document.querySelectorAll('audio').forEach(a => { if (!a.paused) a.volume = bgmVol; });
  document.getElementById('bgmVolVal').textContent = v + '%';
  localStorage.setItem('bgmVol', v);
}
function toggleSfx(btn) {
  sfxEnabled = !sfxEnabled;
  btn.textContent = sfxEnabled ? 'ON' : 'OFF';
  btn.classList.toggle('active', sfxEnabled);
  localStorage.setItem('sfxEnabled', sfxEnabled ? '1' : '0');
}
function setSfxVolume(v) {
  sfxVol = v / 100;
  document.getElementById('sfxVolVal').textContent = v + '%';
  localStorage.setItem('sfxVol', v);
}

// 기존 sfxChip 등에서 sfxEnabled 체크 — utils.js의 _tone을 래핑
const _origTone = window._tone || (() => {});
function sfxPlay(fn) { if (sfxEnabled) fn(); }

// 환전소 렌더
function renderExchangeChips() {
  const el = document.getElementById('exchangeChips');
  if (!el) return;
  el.innerHTML = '';
  const have = getDisplayChips();
  if (!have.length) { el.innerHTML = '<div class="toto-empty">보유 칩 없음</div>'; return; }
  have.forEach(({ chip, cnt }) => {
    if (chip.idx === 0) return; // 1짜리는 쪼갤 수 없음
    const lower = chipTypes[chip.idx - 1];
    const wrap = document.createElement('div');
    wrap.className = 'exchange-item';
    wrap.innerHTML = `
<div class="exchange-chip-svg">${createChipSVG(chip)}</div>
<div class="exchange-info">
  <div class="exchange-chip-name">${chip.label} <span style="color:#888">× ${cnt > 9999n ? '많음' : cnt}</span></div>
  <div class="exchange-arrow">→ ${lower.label} × 10</div>
</div>
<button class="pvp-btn primary" style="font-size:.8rem;padding:.35rem .75rem" onclick="doExchange(${chip.idx})">환전</button>`;
    el.appendChild(wrap);
  });
}

function doExchange(chipIdx) {
  const chip = chipTypes[chipIdx];
  if (!chip) return;
  if (chip.idx === 0) { alert('1짜리는 더 이하로 쪼갤 수 없습니다'); return; }
  const k = chip.value.toString();
  if ((chipDist[k] || 0n) <= 0n) { alert('해당 토큰이 없습니다'); return; }
  const lower = chipTypes[chip.idx - 1];
  const lk = lower.value.toString();
  chipDist[k] -= 1n;
  chipDist[lk] = (chipDist[lk] || 0n) + 10n;
  // chips 총량은 변하지 않음
  sfxChip();
  const result = document.getElementById('exchangeResult');
  if (result) {
    result.textContent = `${chip.label} 1개 → ${lower.label} 10개`;
    result.style.opacity = '1';
    setTimeout(() => { result.style.opacity = '0'; }, 2000);
  }
  updateChipsDisplay(); updateSlotChipsDisplay();
  if (typeof updateAllChipInputs === 'function') updateAllChipInputs();
  renderExchangeChips();
}

// ── 계정 메뉴 (닉네임 변경 / 로그아웃) ──────
function showAccountMenu() {
  const existing = document.getElementById('accountMenu');
  if (existing) { existing.remove(); return; }
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }

  const btn = document.getElementById('navNickBtn');
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'accountMenu';
  menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;right:${window.innerWidth-rect.right}px;
    background:#1a2a1a;border:1.5px solid rgba(241,196,15,.35);border-radius:12px;
    padding:.4rem 0;z-index:8000;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.6);
    animation:modalSlideUp .2s ease`;

  menu.innerHTML = `
<div style="padding:.4rem .9rem .2rem;color:#888;font-size:.72rem">@${escHtml(sessionNickname)}</div>
<div class="acct-menu-item" onclick="closeAccountMenu();showRenameModal()">✏️ 닉네임 변경</div>
<div class="acct-menu-sep"></div>
<div class="acct-menu-item danger" onclick="closeAccountMenu();doLogout()">🚪 로그아웃</div>`;

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeAccountMenu, { once: true }), 10);
}

function closeAccountMenu() {
  document.getElementById('accountMenu')?.remove();
}

function showRenameModal() {
  const overlay = document.createElement('div');
  overlay.id = 'renameOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:7500;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
<div style="background:linear-gradient(145deg,#1e3d2a,#0d2018);border:2px solid rgba(241,196,15,.45);
  border-radius:18px;padding:1.6rem;width:min(340px,92vw);color:white;animation:modalSlideUp .25s ease">
  <h3 style="color:#f1c40f;margin-bottom:1rem;font-size:1.1rem">✏️ 닉네임 변경</h3>
  <p style="color:#888;font-size:.8rem;margin-bottom:.8rem">현재: <b style="color:#aaa">${escHtml(sessionNickname)}</b></p>
  <input id="renameInput" class="modal-input" type="text" placeholder="새 닉네임 (2~24자)" maxlength="24" style="margin-bottom:.6rem">
  <div id="renameError" style="color:#e74c3c;font-size:.8rem;min-height:1.2rem;margin-bottom:.6rem"></div>
  <div style="display:flex;gap:.6rem">
    <button class="btn-primary" onclick="doRename()" style="flex:1">변경</button>
    <button class="btn-secondary" onclick="document.getElementById('renameOverlay').remove()">취소</button>
  </div>
</div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('renameInput')?.focus(), 50);
  document.getElementById('renameInput').onkeydown = e => { if (e.key === 'Enter') doRename(); };
}

async function doRename() {
  const input = document.getElementById('renameInput');
  const errEl = document.getElementById('renameError');
  const nn = input?.value?.trim();
  if (!nn || nn.length < 2) { errEl.textContent = '2자 이상 입력'; return; }
  errEl.textContent = '';
  input.disabled = true;
  try {
    const res = await fetchT('/api/rename', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, newNickname: nn })
    }, 8000);
    const d = await res.json();
    if (!res.ok) { errEl.textContent = d.error || '오류'; input.disabled = false; return; }
    saveSession(d.newNickname, d.newToken);
    nickname = d.newNickname;
    document.getElementById('renameOverlay')?.remove();
    // 화면에 표시된 닉네임 갱신
    updateChipsDisplay(); updateBetDisplay();
  } catch(e) { errEl.textContent = '서버 오류'; input.disabled = false; }
}

function doLogout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  clearSession();
  // 게임 상태 초기화
  chips = 10n; currentBet = 0n; betTokens = []; gamePhase = 'betting'; playerHand = [];
  chipDist = computeGreedyDist(chips);
  localStorage.removeItem('pkBet'); localStorage.removeItem('pkBetTokens');
  localStorage.removeItem('pkPhase'); localStorage.removeItem('pkHand');
  updateChipsDisplay(); updateBetDisplay(); updateStatsDisplay();
  document.getElementById('authModal').classList.add('show');
  setTimeout(() => document.getElementById('authNick')?.focus(), 100);
}
