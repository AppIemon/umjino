const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://admin:qwe098@cluster0.sw7tw.mongodb.net/?appName=Cluster0';

// ─── DB ───────────────────────────────────────────────────────────────────────
let _client = null;
let _db = null;
async function getDb() {
  if (_db) return _db;
  if (!_client) {
    _client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
      socketTimeoutMS: 6000,
      maxPoolSize: 1,          // serverless: 연결 1개로 충분
      minPoolSize: 0,
      maxIdleTimeMS: 10000,    // 10초 idle이면 반환
    });
  }
  try {
    await _client.connect();
  } catch(e) {
    // 이미 연결된 경우 무시
    if (!e.message?.includes('already connected')) {
      _client = null; _db = null;
      throw e;
    }
  }
  _db = _client.db('poker');
  return _db;
}

// ─── Crypto ───────────────────────────────────────────────────────────────────
const genSalt = () => crypto.randomBytes(16).toString('hex');
const genToken = () => crypto.randomBytes(32).toString('hex');
const hashPw = (pw, salt) =>
  crypto.createHash('sha256').update(salt + ':' + pw).digest('hex');

function cmpBigStr(a, b) {
  const sa = (a || '0').replace(/^0+/, '') || '0';
  const sb = (b || '0').replace(/^0+/, '') || '0';
  if (sa.length !== sb.length) return sa.length - sb.length;
  return sa.localeCompare(sb);
}

// ─── Tax (sqrt curve, max 10% at 72 digits) ───────────────────────────────────
function calcTax(chipsStr) {
  const chips = BigInt(chipsStr || '0');
  if (chips <= 0n) return { after: chipsStr, tax: '0' };
  const digits = Math.min(chipsStr.replace('-', '').length, 72);
  const rateMil = BigInt(Math.round(100000 * Math.sqrt(digits / 72)));
  const tax = chips * rateMil / 1000000n;
  return { after: (chips - tax).toString(), tax: tax.toString() };
}

// ─── Bank interest ────────────────────────────────────────────────────────────
function applyBankInterest(bank, now) {
  if (!bank || BigInt(bank.amount || '0') <= 0n) return null;
  const base = bank.interestAt ? new Date(bank.interestAt) : new Date(bank.depositedAt);
  const days = Math.floor((now - base) / 86400000);
  if (days <= 0) return null;
  let v = BigInt(bank.amount);
  for (let i = 0; i < Math.min(days, 3650); i++) v = v * 101n / 100n;
  return { ...bank, amount: v.toString(), interestAt: now.toISOString() };
}

function bankStatus(bank, now) {
  if (!bank) return { canWithdraw: false, hoursLeft: 0 };
  const ms = now - new Date(bank.depositedAt);
  if (ms >= 86400000) return { canWithdraw: true, hoursLeft: 0 };
  return { canWithdraw: false, hoursLeft: Math.ceil((86400000 - ms) / 3600000) };
}

function applyDailyUpdates(p, now) {
  const todayStr = now.toISOString().slice(0, 10);
  const upd = {};
  let chips = p.chips || '10';
  let bank = p.bank || null;
  let taxApplied = false, taxDays = 0, taxAmount = '0';

  if ((p.lastTaxDate || '') !== todayStr) {
    const daysSince = p.lastTaxDate
      ? Math.max(1, Math.round((now - new Date(p.lastTaxDate)) / 86400000)) : 1;
    let tot = 0n;
    for (let i = 0; i < daysSince; i++) {
      const r = calcTax(chips); tot += BigInt(r.tax); chips = r.after;
    }
    if (tot > 0n) { taxApplied = true; taxDays = daysSince; taxAmount = tot.toString(); }
    upd.chips = chips; upd.lastTaxDate = todayStr;
  }

  if (bank) { const nb = applyBankInterest(bank, now); if (nb) { bank = nb; upd.bank = bank; } }
  return { chips, bank, taxApplied, taxDays, taxAmount, upd };
}



// ─── Multiplayer: 세븐포커 Card helpers ─────────────────────────────────────
const MP_SUITS = ['♠','♥','♦','♣'];
const MP_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const MP_RV = {A:14,K:13,Q:12,J:11,'10':10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2};

function mpCreateDeck() {
  const d = [];
  for (const s of MP_SUITS) for (const r of MP_RANKS) d.push({suit:s,rank:r});
  for (let i = d.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

// Evaluate best 5-hand from any N cards (brute force combos)
function mpBestFive(cards) {
  if (cards.length <= 5) return mpEvalHand(cards);
  let best = null;
  for (let i = 0; i < cards.length; i++)
    for (let j = i+1; j < cards.length; j++) {
      const hand = cards.filter((_,k)=>k!==i&&k!==j);
      const e = mpEvalHand(hand);
      if (!best || mpCmpEval(e, best) > 0) best = e;
    }
  return best;
}

function mpEvalHand(hand) {
  const vals = hand.map(c=>MP_RV[c.rank]).sort((a,b)=>b-a);
  const ss = hand.map(c=>c.suit);
  const isFlush = ss.every(s=>s===ss[0]);
  const isStraight = vals.every((v,i)=>i===0||vals[i-1]-v===1)
    ||(vals[0]===14&&vals[1]===5&&vals[2]===4&&vals[3]===3&&vals[4]===2);
  const cnts = {}; vals.forEach(v=>cnts[v]=(cnts[v]||0)+1);
  const cv = Object.values(cnts).sort((a,b)=>b-a);
  const tieVals = [...vals]; // for tiebreak
  if (isFlush&&isStraight&&vals[0]===14&&vals[1]===13) return {rank:9,name:'로얄 스트레이트 플러시',tieVals};
  if (isFlush&&isStraight) return {rank:8,name:'스트레이트 플러시',tieVals};
  if (cv[0]===4) return {rank:7,name:'포카드',tieVals};
  if (cv[0]===3&&cv[1]===2) return {rank:6,name:'풀하우스',tieVals};
  if (isFlush) return {rank:5,name:'플러시',tieVals};
  if (isStraight) return {rank:4,name:'스트레이트',tieVals};
  if (cv[0]===3) return {rank:3,name:'트리플',tieVals};
  if (cv[0]===2&&cv[1]===2) return {rank:2,name:'투페어',tieVals};
  if (cv[0]===2) return {rank:1,name:'원페어',tieVals};
  return {rank:0,name:'노페어',tieVals};
}

function mpCmpEval(e1, e2) {
  if (e1.rank !== e2.rank) return e1.rank - e2.rank;
  const v1 = e1.tieVals, v2 = e2.tieVals;
  for (let i = 0; i < Math.min(v1.length,v2.length); i++) if (v1[i]!==v2[i]) return v1[i]-v2[i];
  return 0;
}

// ─── Match making ────────────────────────────────────────────────────────────
async function mpTryMatch(db) {
  const qCol = db.collection('mp_queue');
  const queue = await qCol.find({}).sort({createdAt:1}).toArray();
  if (queue.length < 2) return null;
  const p1 = queue[0], p2 = queue[1];
  await qCol.deleteMany({ _id: { $in: [p1._id, p2._id] } });
  const minChips = cmpBigStr(p1.chips, p2.chips) <= 0 ? p1.chips : p2.chips;
  const gameId = crypto.randomBytes(8).toString('hex');
  const game = {
    gameId,
    phase: 'setting_bet',   // setting_bet → discard → bet1 → bet2 → bet3 → showdown
    setter: Math.random() < 0.5 ? 0 : 1,
    baseBet: null,           // set by setter; both pay this as ante
    pot: '0',                // total chips in pot
    roundHighBet: 0,         // highest bet in current round (token units)
    actingPlayer: 0,         // index of player whose turn it is
    roundComplete: false,
    deck: [],
    players: [
      { nickname: p1.nickname, token: p1.token, chips: p1.chips,
        cards: [],           // {suit,rank,faceUp}
        folded: false,
        roundPaid: 0,        // tokens paid this round
        acted: false,
      },
      { nickname: p2.nickname, token: p2.token, chips: p2.chips,
        cards: [],
        folded: false,
        roundPaid: 0,
        acted: false,
      },
    ],
    maxBet: minChips,
    showdownResult: null,
    result: null,
    lastUpdate: new Date(),
    createdAt: new Date(),
  };
  await db.collection('mp_games').insertOne(game);
  return game;
}

// ─── Build view (hide opponent's face-down cards) ────────────────────────────
function mpBuildGameView(game, pidx) {
  const oidx = 1 - pidx;
  const myP = game.players[pidx];
  const opP = game.players[oidx];
  const isShowdown = game.phase === 'showdown' || game.phase === 'finished';

  const view = {
    status: 'in_game',
    gameId: game.gameId,
    phase: game.phase,
    pot: game.pot,
    baseBet: game.baseBet,
    maxBet: game.maxBet,
    isSetter: game.setter === pidx,
    actingPlayer: game.actingPlayer,
    isMyTurn: game.actingPlayer === pidx,
    roundHighBet: game.roundHighBet,
    myNick: myP.nickname,
    opNick: opP.nickname,
    myChips: myP.chips,
    opChips: opP.chips,
    myFolded: myP.folded,
    opFolded: opP.folded,
    myRoundPaid: myP.roundPaid,
    opRoundPaid: opP.roundPaid,
    myActed: myP.acted,
    opActed: opP.acted,
    // My cards: all with faceUp flag
    myCards: myP.cards,
    // Opponent cards: only faceUp ones (unless showdown)
    opCards: isShowdown ? opP.cards : opP.cards.filter(c=>c.faceUp),
    showdownResult: game.showdownResult || null,
  };

  if (game.result) {
    view.status = 'game_over';
    view.winner = game.result.winner === -1 ? 'tie' :
      (game.result.winner === pidx ? 'me' : 'opponent');
    view.winnerNick = game.result.winner === -1 ? null : game.players[game.result.winner].nickname;
    view.stakeAmount = game.result.stakeAmount || '0';
    view.myCards = myP.cards;
    view.opCards = opP.cards;
  }
  return view;
}

// ─── Game flow helpers ────────────────────────────────────────────────────────
function mpStartNewBetRound(game, firstActorIdx) {
  const base = Number(BigInt(game.baseBet || '1'));
  game.roundHighBet = base; // starts at baseBet
  game.actingPlayer = firstActorIdx;
  game.players.forEach(p => { p.roundPaid = 0; p.acted = false; });
  game.roundComplete = false;
}

function mpCheckBetRoundDone(game) {
  const alive = game.players.filter(p=>!p.folded);
  if (alive.length === 1) return true;
  return alive.every(p => p.acted && p.roundPaid === game.roundHighBet);
}

// ─── /api/mp ─────────────────────────────────────────────────────────────────);

// ── Advance game after betting round completes ─────────────────────────────
async function mpAdvanceAfterBet(db, game) {
  const gCol = db.collection('mp_games');
  // Add round bets to pot
  const roundTotal = game.players.reduce((s,p)=>s+p.roundPaid,0);
  game.pot = (BigInt(game.pot||'0') + BigInt(roundTotal)).toString();
  // Reset round bets
  game.players.forEach(p=>{p.roundPaid=0;p.acted=false;});

  if (game.phase === 'bet1') {
    // Draw 1 face-up card each
    game.players.forEach(p=>p.cards.push({...game.deck.pop(),faceUp:true}));
    mpStartNewBetRound(game, 1-game.setter);
    game.phase = 'bet2';
  } else if (game.phase === 'bet2') {
    // Draw 1 face-down card each (7th card)
    game.players.forEach(p=>p.cards.push({...game.deck.pop(),faceUp:false}));
    mpStartNewBetRound(game, 1-game.setter);
    game.phase = 'bet3';
  } else if (game.phase === 'bet3') {
    // Showdown
    await mpDoShowdown(db, game);
  }
}

async function mpDoShowdown(db, game) {
  // Reveal all cards
  game.players.forEach(p=>p.cards.forEach(c=>c.faceUp=true));
  const alive = game.players.filter(p=>!p.folded);
  if (alive.length === 1) {
    const wi = game.players.indexOf(alive[0]);
    game.phase = 'showdown';
    game.showdownResult = {winner:wi,byFold:true,myHandName:'폴드',opHandName:'승리',myBest:null,opBest:null};
    await mpFinishGame(db, game, wi);
    return;
  }
  const e0 = mpBestFive(game.players[0].cards);
  const e1 = mpBestFive(game.players[1].cards);
  const cmp = mpCmpEval(e0,e1);
  const winnerIdx = cmp>0?0:cmp<0?1:-1;
  game.showdownResult = {
    winner: winnerIdx, byFold: false,
    p0HandName: e0.name, p1HandName: e1.name,
  };
  game.phase = 'showdown';
  await mpFinishGame(db, game, winnerIdx);
}

async function mpFinishGame(db, game, forceWinner) {
  game.phase = 'finished';
  const wi = forceWinner !== undefined ? forceWinner : (game.showdownResult?.winner ?? -1);
  const pot = BigInt(game.pot||'0');
  const col = db.collection('players');
  try {
    if (pot > 0n) {
      if (wi !== -1) {
        const winner = game.players[wi];
        const wp = await col.findOne({nickname:winner.nickname});
        if (wp) {
          const wNew = (BigInt(wp.chips||'0')+pot).toString();
          await col.updateOne({nickname:winner.nickname},{$set:{chips:wNew}});
          if (cmpBigStr(wNew,wp.stats?.maxChips||'0')>0)
            await col.updateOne({nickname:winner.nickname},{$set:{'stats.maxChips':wNew}});
        }
      } else {
        // Tie: split pot
        const half = pot/2n;
        for (const p of game.players) {
          const pl = await col.findOne({nickname:p.nickname});
          if (pl) await col.updateOne({nickname:p.nickname},{$set:{chips:(BigInt(pl.chips||'0')+half).toString()}});
        }
      }
    }
  } catch(e) { console.error('mpFinishGame chips error',e); }
  game.result = { winner: wi, stakeAmount: game.pot };
  await db.collection('mp_games').updateOne(
    {gameId:game.gameId},
    {$set:{phase:game.phase,result:game.result,players:game.players,showdownResult:game.showdownResult,lastUpdate:new Date()}}
  );
}



// ─── Multiplayer Roulette helpers ────────────────────────────────────────────
const RL_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#ff69b4'];
const RL_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function rlNumColor(n) { return n===0?'green':RL_RED.has(n)?'red':'black'; }

function rlCheckWin(type, targetNum, result) {
  const c = rlNumColor(result);
  if (type==='red') return c==='red';
  if (type==='black') return c==='black';
  if (type==='green') return result===0;
  if (type==='odd') return result!==0&&result%2===1;
  if (type==='even') return result!==0&&result%2===0;
  if (type==='low') return result>=1&&result<=18;
  if (type==='high') return result>=19&&result<=36;
  if (type==='dozen1') return result>=1&&result<=12;
  if (type==='dozen2') return result>=13&&result<=24;
  if (type==='dozen3') return result>=25&&result<=36;
  if (type==='number') return result===Number(targetNum);
  return false;
}

function rlMultiplier(type) {
  if (type==='number'||type==='green') return 35;
  if (type==='dozen1'||type==='dozen2'||type==='dozen3') return 2;
  return 1;
}

async function rlGetState(db) {
  const col = db.collection('roulette_state');
  let s = await col.findOne({ _id: 'global' });
  if (!s) {
    s = { _id: 'global', phase: 'betting', players: [], bets: [], skipVotes: [],
      phaseStart: new Date(), spinResult: null, payouts: [], lastUpdate: new Date() };
    await col.insertOne(s);
  }
  return s;
}

async function rlAdvancePhase(db, state) {
  const now = Date.now();
  const elapsed = now - new Date(state.phaseStart).getTime();
  const col = db.collection('roulette_state');
  const pCol = db.collection('players');

  const activePlayers = state.players.filter(p =>
    now - new Date(p.lastPing || state.phaseStart).getTime() < 25000
  );

  if (state.phase === 'betting') {
    const activeCount = Math.max(1, activePlayers.length);
    const skipCount = state.skipVotes.filter(n => activePlayers.some(p=>p.nick===n)).length;
    const skipReached = activePlayers.length >= 2 && skipCount / activeCount >= 0.66;
    const timedOut = elapsed >= 30000;

    if ((timedOut || skipReached) && state.bets.length > 0) {
      const result = Math.floor(Math.random() * 37);
      const payouts = [];
      for (const bet of state.bets) {
        const betAmt = BigInt(bet.amount||'0');
        const won = rlCheckWin(bet.type, bet.targetNum, result);
        const mult = rlMultiplier(bet.type);
        const winAmt = won ? betAmt * BigInt(mult + 1) : 0n;
        payouts.push({ nick: bet.nick, won, type: bet.type, betAmount: bet.amount, winAmount: winAmt.toString() });
        if (won) {
          try {
            const p = await pCol.findOne({ nickname: bet.nick });
            if (p) await pCol.updateOne({ nickname: bet.nick }, { $set: { chips: (BigInt(p.chips||'0') + winAmt).toString() } });
          } catch(e) {}
        }
      }
      await col.updateOne({ _id: 'global' }, { $set: {
        phase: 'spinning', spinResult: result, payouts, players: activePlayers,
        phaseStart: new Date(), lastUpdate: new Date()
      }});
      return { ...state, phase: 'spinning', spinResult: result, payouts, players: activePlayers, phaseStart: new Date() };
    }
    if (timedOut && state.bets.length === 0) {
      await col.updateOne({ _id: 'global' }, { $set: {
        phaseStart: new Date(), skipVotes: [], players: activePlayers, lastUpdate: new Date()
      }});
    }
  } else if (state.phase === 'spinning' && elapsed >= 3500) {
    await col.updateOne({ _id: 'global' }, { $set: {
      phase: 'result', phaseStart: new Date(), lastUpdate: new Date()
    }});
    return { ...state, phase: 'result', phaseStart: new Date() };
  } else if (state.phase === 'result' && elapsed >= 8000) {
    await col.updateOne({ _id: 'global' }, { $set: {
      phase: 'betting', bets: [], skipVotes: [], spinResult: null, payouts: [],
      players: activePlayers, phaseStart: new Date(), lastUpdate: new Date()
    }});
    return { ...state, phase: 'betting', bets: [], skipVotes: [], spinResult: null, payouts: [], players: activePlayers, phaseStart: new Date() };
  }
  return state;
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
if (!process.env.NETLIFY) {
  const path = require('path');
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
  );
}

// ─── /api/player ─────────────────────────────────────────────────────────────
app.get('/api/player', async (req, res) => {
  const { action, nick, token } = req.query;
  if (action !== 'load') return res.status(404).json({ error: 'not found' });
  if (!nick || !token) return res.status(400).json({ error: 'missing' });
  try {
    const col = (await getDb()).collection('players');
    const p = await col.findOne({ nickname: nick, token });
    if (!p) return res.status(401).json({ error: '세션 만료. 다시 로그인해 주세요.' });
    const now = new Date();
    const { chips, bank, taxApplied, taxDays, taxAmount, upd } = applyDailyUpdates(p, now);
    if (Object.keys(upd).length) await col.updateOne({ nickname: nick }, { $set: upd });
    const st = bankStatus(bank, now);
    res.json({
      chips, stats: p.stats || {}, bank: bank ? { ...bank, ...st } : null,
      cancelTickets: p.cancelTickets || 0, taxApplied, taxDays, taxAmount
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/player', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  try {
    const database = await getDb();
    const col = database.collection('players');
    const now = new Date();

    if (action === 'register') {
      const { nickname, password } = body;
      if (!nickname || nickname.length < 2 || nickname.length > 12)
        return res.status(400).json({ error: '닉네임은 2~12자' });
      if (!password || password.length < 4)
        return res.status(400).json({ error: '비밀번호 4자 이상' });
      if (await col.findOne({ nickname }))
        return res.status(409).json({ error: '이미 사용중인 닉네임' });
      const salt = genSalt(), token = genToken();
      await col.insertOne({
        nickname, salt, passwordHash: hashPw(password, salt), token,
        chips: '10',
        stats: { maxChips: '10', maxWin: '0', bestHand: '-', bestHandPayout: 0, totalGames: 0, totalWins: 0 },
        bank: null, cancelTickets: 0,
        lastTaxDate: now.toISOString().slice(0, 10), createdAt: now,
      });
      return res.json({ token, chips: '10', stats: {}, bank: null, cancelTickets: 0, taxApplied: false });
    }

    if (action === 'login') {
      const { nickname, password } = body;
      if (!nickname || !password) return res.status(400).json({ error: '닉네임/비밀번호 필요' });
      const p = await col.findOne({ nickname });
      if (!p) return res.status(404).json({ error: '없는 닉네임' });
      const valid = p.salt
        ? hashPw(password, p.salt) === p.passwordHash
        : crypto.createHash('sha256').update(password).digest('hex') === p.passwordHash;
      if (!valid) return res.status(401).json({ error: '비밀번호 틀림' });
      const token = genToken();
      const { chips, bank, taxApplied, taxDays, taxAmount, upd } = applyDailyUpdates(p, now);
      upd.token = token; upd.lastLoginAt = now;
      if (!p.salt) { upd.salt = genSalt(); upd.passwordHash = hashPw(password, upd.salt); }
      await col.updateOne({ nickname }, { $set: upd });
      const st = bankStatus(bank, now);
      return res.json({
        token, chips, stats: p.stats || {},
        bank: bank ? { ...bank, ...st } : null,
        cancelTickets: p.cancelTickets || 0, taxApplied, taxDays, taxAmount
      });
    }

    if (action === 'save') {
      const { nickname, token, chips, stats, cancelTickets } = body;
      if (!nickname || !token) return res.status(400).json({ error: 'missing' });
      const p = await col.findOne({ nickname, token });
      if (!p) return res.status(401).json({ error: '인증 실패' });
      const upd = {};
      if (chips !== undefined) upd.chips = chips;
      if (stats) upd.stats = stats;
      if (typeof cancelTickets === 'number') {
        const cur = p.cancelTickets || 0;
        if (cancelTickets < cur) upd.cancelTickets = Math.max(0, cancelTickets);
      }
      await col.updateOne({ nickname }, { $set: upd });
      return res.json({ ok: true });
    }

    if (action === 'bank-deposit') {
      const { nickname, token, amount } = body;
      const amt = BigInt(amount || '0');
      if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
      // Atomic: only deduct if chips >= amt
      const result = await col.findOneAndUpdate(
        { nickname, token, $expr: { $gte: [{ $toLong: '$chips' }, Number(amt > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : amt)] } },
        {},  // We'll do manual update below after validation
        { returnDocument: 'before' }
      );
      // Fallback: manual check
      const p = await col.findOne({ nickname, token });
      if (!p) return res.status(401).json({ error: '인증 실패' });
      const cur = BigInt(p.chips || '0');
      if (amt > cur) return res.status(400).json({ error: '잔액 부족' });
      let existing = p.bank;
      if (existing && BigInt(existing.amount || '0') > 0n) {
        const nb = applyBankInterest(existing, now); if (nb) existing = nb;
      }
      const prevAmt = BigInt(existing?.amount || '0');
      const newBank = { amount: (prevAmt + amt).toString(), depositedAt: now.toISOString(), interestAt: now.toISOString() };
      const newChips = (cur - amt).toString();
      // Atomic update: only update if chips still matches (prevent double-submit)
      const updateResult = await col.updateOne(
        { nickname, token, chips: cur.toString() },
        { $set: { chips: newChips, bank: newBank } }
      );
      if (updateResult.modifiedCount === 0)
        return res.status(409).json({ error: '중복 요청 또는 잔액 변경됨' });
      return res.json({ chips: newChips, bank: { ...newBank, canWithdraw: false, hoursLeft: 24 } });
    }

    if (action === 'bank-withdraw') {
      const { nickname, token } = body;
      const p = await col.findOne({ nickname, token });
      if (!p) return res.status(401).json({ error: '인증 실패' });
      if (!p.bank?.amount || p.bank.amount === '0')
        return res.status(400).json({ error: '은행 잔액 없음' });
      const ms = now - new Date(p.bank.depositedAt);
      if (ms < 86400000) {
        const h = Math.ceil((86400000 - ms) / 3600000);
        return res.status(400).json({ error: `아직 ${h}시간 남았습니다` });
      }
      const nb = applyBankInterest(p.bank, now);
      const finalAmt = BigInt((nb || p.bank).amount);
      const newChips = (BigInt(p.chips || '0') + finalAmt).toString();
      await col.updateOne({ nickname }, { $set: { chips: newChips, bank: null } });
      return res.json({ chips: newChips, withdrawn: finalAmt.toString() });
    }

    res.status(404).json({ error: 'unknown action' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── /api/profile (공개 프로필: 칭호 포함) ────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const { nick } = req.query;
  if (!nick) return res.status(400).json({ error: 'missing nick' });
  try {
    const col = (await getDb()).collection('players');
    const p = await col.findOne({ nickname: nick }, { projection: { title: 1, titleColor: 1, chips: 1, stats: 1, lastLoginAt: 1, _id: 0 } });
    if (!p) return res.status(404).json({ error: '없는 유저' });
    res.json({ nickname: nick, title: p.title || null, titleColor: p.titleColor || null, maxChips: p.stats?.maxChips || '0', lastLoginAt: p.lastLoginAt || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── /api/ranking ─────────────────────────────────────────────────────────────
app.get('/api/ranking', async (req, res) => {
  const { nick } = req.query;
  try {
    const col = (await getDb()).collection('players');
    const docs = await col.find({}, { projection: { nickname: 1, stats: 1, createdAt: 1 } }).toArray();
    docs.sort((a, b) => cmpBigStr(b.stats?.maxChips || '0', a.stats?.maxChips || '0'));
    const top100 = docs.slice(0, 100).map((d, i) => ({
      rank: i + 1, nickname: d.nickname, maxChips: d.stats?.maxChips || '0',
    }));
    let userRank = -1, surrounding = [];
    if (nick) {
      userRank = docs.findIndex(d => d.nickname === nick);
      if (userRank >= 100) {
        surrounding = docs.slice(Math.max(0, userRank - 1), userRank + 2)
          .map((d, i) => ({ rank: Math.max(0, userRank - 1) + i + 1, nickname: d.nickname, maxChips: d.stats?.maxChips || '0' }));
      }
    }
    res.json({ top100, userRank: userRank + 1, surrounding });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});


app.get('/api/mp', async (req, res) => {
  const { action, nickname, token } = req.query;
  try {
    const db = await getDb();
    const qCol = db.collection('mp_queue');
    const gCol = db.collection('mp_games');
    if (!nickname || !token) return res.status(400).json({ error: 'missing' });
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });

    if (action === 'poll') {
      const game = await gCol.findOne({
        $or: [{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase: { $ne: 'cleanup' }
      });
      if (game) {
        const pidx = game.players[0].nickname===nickname ? 0 : 1;
        if (Date.now()-new Date(game.lastUpdate).getTime() > 90000 &&
            !['showdown','finished'].includes(game.phase)) {
          await mpFinishGame(db, game, pidx);
          return res.json({status:'game_over',winner:'me',stakeAmount:game.result?.stakeAmount||'0'});
        }
        return res.json(mpBuildGameView(game, pidx));
      }
      const inQueue = await qCol.findOne({ nickname });
      if (inQueue) {
        await mpTryMatch(db);
        const newGame = await gCol.findOne({
          $or: [{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
          phase: { $ne: 'cleanup' }
        });
        if (newGame) return res.json(mpBuildGameView(newGame, newGame.players[0].nickname===nickname?0:1));
        return res.json({ status: 'queued' });
      }
      return res.json({ status: 'idle' });
    }
    res.status(400).json({ error: 'unknown action' });
  } catch(e) { console.error('GET /api/mp', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/mp', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  try {
    const db = await getDb();
    const qCol = db.collection('mp_queue');
    const gCol = db.collection('mp_games');
    const { nickname, token } = body;
    if (!nickname||!token) return res.status(400).json({ error: 'missing' });
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });

    // ── queue ──────────────────────────────────────────────────────────────
    if (action === 'queue') {
      const existGame = await gCol.findOne({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:{$ne:'cleanup'}
      });
      if (existGame) return res.status(400).json({ error: '이미 게임 중' });
      const existQ = await qCol.findOne({ nickname });
      if (!existQ) {
        const chipsNum = Number(BigInt(me.chips||'10') > 9007199254740991n ? 9007199254740991n : BigInt(me.chips||'10'));
        await qCol.insertOne({ nickname, token, chips: me.chips||'10', chips_num: chipsNum, createdAt: new Date() });
      }
      const game = await mpTryMatch(db);
      if (game) return res.json(mpBuildGameView(game, game.players[0].nickname===nickname?0:1));
      return res.json({ status: 'queued' });
    }

    // ── cancel_queue ────────────────────────────────────────────────────────
    if (action === 'cancel_queue') { await qCol.deleteMany({ nickname }); return res.json({ status: 'idle' }); }

    // ── set_bet: setter picks base bet (ante) ──────────────────────────────
    if (action === 'set_bet') {
      const game = await gCol.findOne({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:'setting_bet'
      });
      if (!game) return res.status(400).json({ error: '게임 없음' });
      const pidx = game.players[0].nickname===nickname?0:1;
      if (game.setter !== pidx) return res.status(400).json({ error: '권한 없음' });

      // baseBet is derived from minChips/50, minimum 1000
      const minChips = cmpBigStr(game.players[0].chips, game.players[1].chips) <= 0
        ? BigInt(game.players[0].chips) : BigInt(game.players[1].chips);
      const rawBet = minChips / 50n > 0n ? minChips / 50n : 1n;
      const baseBet = rawBet < 1000n ? 1000n : rawBet;

      // Both players pay the ante (baseBet each)
      const p0 = await db.collection('players').findOne({nickname:game.players[0].nickname});
      const p1 = await db.collection('players').findOne({nickname:game.players[1].nickname});
      const new0 = (BigInt(p0.chips||'0')-baseBet).toString();
      const new1 = (BigInt(p1.chips||'0')-baseBet).toString();
      await db.collection('players').updateOne({nickname:game.players[0].nickname},{$set:{chips:new0}});
      await db.collection('players').updateOne({nickname:game.players[1].nickname},{$set:{chips:new1}});
      game.players[0].chips = new0; game.players[1].chips = new1;
      game.baseBet = baseBet.toString();
      game.pot = (baseBet*2n).toString();

      // Deal 4 cards to each player
      game.deck = mpCreateDeck();
      game.players.forEach(p => {
        p.cards = [];
        for (let i=0;i<4;i++) p.cards.push({...game.deck.pop(), faceUp:false});
      });
      game.phase = 'discard';
      game.players.forEach(p => { p.folded=false; p.roundPaid=0; p.acted=false; });
      await gCol.updateOne({gameId:game.gameId},{$set:{
        baseBet:game.baseBet, pot:game.pot, phase:game.phase,
        deck:game.deck, players:game.players, lastUpdate:new Date()
      }});
      return res.json(mpBuildGameView(game, pidx));
    }

    // ── discard: pick 1 card to discard (index 0-3), then set face-up ────
    if (action === 'discard') {
      const game = await gCol.findOne({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:'discard'
      });
      if (!game) return res.status(400).json({ error: '버리기 불가' });
      const pidx = game.players[0].nickname===nickname?0:1;
      const p = game.players[pidx];
      if (p.acted) return res.status(400).json({ error: '이미 버림' });

      const discardIdx = parseInt(body.discardIdx);
      if (isNaN(discardIdx)||discardIdx<0||discardIdx>3)
        return res.status(400).json({ error: '0~3 인덱스' });

      // Remove discarded card
      p.cards.splice(discardIdx, 1); // now 3 cards remain
      // First card: face-up, remaining two: face-down
      p.cards[0].faceUp = true;
      p.cards[1].faceUp = false;
      p.cards[2].faceUp = false;
      p.acted = true;

      // Check if both discarded
      if (game.players.every(pl=>pl.acted)) {
        // Draw 2 more face-up cards each
        game.players.forEach(pl => {
          pl.cards.push({...game.deck.pop(), faceUp:true});
          pl.cards.push({...game.deck.pop(), faceUp:true});
          pl.acted = false; pl.roundPaid = 0;
        });
        // 1차 베팅: non-setter acts first
        const firstActor = 1 - game.setter;
        mpStartNewBetRound(game, firstActor);
        game.phase = 'bet1';
      }
      await gCol.updateOne({gameId:game.gameId},{$set:{
        phase:game.phase, deck:game.deck, players:game.players,
        roundHighBet:game.roundHighBet, actingPlayer:game.actingPlayer, lastUpdate:new Date()
      }});
      return res.json(mpBuildGameView(game, pidx));
    }

    // ── bet_action: check/call/raise/fold ─────────────────────────────────
    if (action === 'bet_action') {
      const game = await gCol.findOne({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:{$in:['bet1','bet2','bet3']}
      });
      if (!game) return res.status(400).json({ error: '베팅 불가' });
      const pidx = game.players[0].nickname===nickname?0:1;
      if (game.actingPlayer !== pidx) return res.status(400).json({ error: '상대 차례' });
      const p = game.players[pidx];
      const op = game.players[1-pidx];
      if (p.folded) return res.status(400).json({ error: '이미 폴드' });

      const betAct = body.betAction;
      const base = BigInt(game.baseBet || '1');
      // Raise amount must be a multiple of baseBet
      const raiseUnits = Math.max(1, parseInt(body.raiseUnits)||1);
      const raiseAmt = Number(base) * raiseUnits;

      if (betAct === 'fold') {
        p.folded = true;
        game.phase = 'showdown';
        game.showdownResult = { winner: 1-pidx, byFold: true };
        await mpFinishGame(db, game, 1-pidx);
      } else if (betAct === 'check') {
        if (game.roundHighBet > p.roundPaid) return res.status(400).json({ error: '콜 필요' });
        p.acted = true;
        if (mpCheckBetRoundDone(game)) await mpAdvanceAfterBet(db, game);
        else game.actingPlayer = 1-pidx;
      } else if (betAct === 'call') {
        p.roundPaid = game.roundHighBet;
        p.acted = true;
        if (mpCheckBetRoundDone(game)) await mpAdvanceAfterBet(db, game);
        else game.actingPlayer = 1-pidx;
      } else if (betAct === 'raise') {
        const totalBet = game.roundHighBet + raiseAmt;
        p.roundPaid = totalBet;
        game.roundHighBet = totalBet;
        p.acted = true; op.acted = false;
        game.actingPlayer = 1-pidx;
      } else {
        return res.status(400).json({ error: '알 수 없는 액션' });
      }

      await gCol.updateOne({gameId:game.gameId},{$set:{
        phase:game.phase, deck:game.deck, players:game.players,
        pot:game.pot, roundHighBet:game.roundHighBet,
        actingPlayer:game.actingPlayer, showdownResult:game.showdownResult,
        result:game.result, lastUpdate:new Date()
      }});
      return res.json(mpBuildGameView(game, pidx));
    }

    // ── leave ──────────────────────────────────────────────────────────────
    if (action === 'leave') {
      await qCol.deleteMany({ nickname });
      const game = await gCol.findOne({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:{$nin:['cleanup','finished']}
      });
      if (game) { const pidx=game.players[0].nickname===nickname?0:1; await mpFinishGame(db,game,1-pidx); }
      await gCol.updateMany({
        $or:[{'players.0.nickname':nickname},{'players.1.nickname':nickname}],
        phase:'finished'
      },{$set:{phase:'cleanup'}});
      return res.json({ status: 'idle' });
    }

    res.status(400).json({ error: 'unknown action' });
  } catch(e) { console.error('POST /api/mp', e); res.status(500).json({ error: e.message }); }
});

// ─── /api/roulette ────────────────────────────────────────────────────────────
app.get('/api/roulette', async (req, res) => {
  const { nick, token } = req.query;
  if (!nick || !token) return res.status(400).json({ error: 'missing' });
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ nickname: nick, token });
    if (!player) return res.status(401).json({ error: '인증 실패' });

    let state = await rlGetState(db);
    state = await rlAdvancePhase(db, state);

    // Update this player's ping
    await db.collection('roulette_state').updateOne(
      { _id: 'global', 'players.nick': nick },
      { $set: { 'players.$.lastPing': new Date() } }
    );

    const now = Date.now();
    const elapsed = now - new Date(state.phaseStart).getTime();
    const dur = state.phase==='betting'?30000:state.phase==='spinning'?3500:8000;
    const remainingMs = Math.max(0, dur - elapsed);
    const myColor = state.players.find(p=>p.nick===nick)?.color || null;
    const myBet = state.bets.find(b=>b.nick===nick) || null;

    res.json({
      phase: state.phase,
      players: state.players.map(p=>({ nick: p.nick, color: p.color })),
      bets: state.bets.map(b=>({ nick: b.nick, type: b.type, amount: b.amount })),
      skipVotes: state.skipVotes,
      spinResult: state.spinResult,
      payouts: state.payouts,
      myColor,
      myBet,
      remainingMs,
      myChips: player.chips || '10',
    });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/roulette', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  const { nickname, token } = body;
  if (!nickname || !token) return res.status(400).json({ error: 'missing' });
  try {
    const db = await getDb();
    const player = await db.collection('players').findOne({ nickname, token });
    if (!player) return res.status(401).json({ error: '인증 실패' });
    const rlCol = db.collection('roulette_state');

    if (action === 'join') {
      const state = await rlGetState(db);
      if (!state.players.find(p=>p.nick===nickname)) {
        const used = state.players.map(p=>p.color);
        const color = RL_COLORS.find(c=>!used.includes(c)) || RL_COLORS[state.players.length % RL_COLORS.length];
        await rlCol.updateOne({ _id: 'global' }, {
          $push: { players: { nick: nickname, color, lastPing: new Date() } }
        });
        return res.json({ color });
      }
      return res.json({ color: state.players.find(p=>p.nick===nickname).color });
    }

    if (action === 'bet') {
      const state = await rlGetState(db);
      if (state.phase !== 'betting') return res.status(400).json({ error: '베팅 시간이 아닙니다' });
      const { betType, amount, targetNum } = body;
      const betAmt = BigInt(amount || '0');
      if (betAmt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });

      // Re-fetch chips + handle existing bet refund
      const existing = state.bets.find(b=>b.nick===nickname);
      const refund = existing ? BigInt(existing.amount) : 0n;
      const fresh = await db.collection('players').findOne({ nickname });
      const available = BigInt(fresh.chips||'0') + refund;
      if (betAmt > available) return res.status(400).json({ error: '칩 부족' });

      const newChips = (available - betAmt).toString();
      await db.collection('players').updateOne({ nickname }, { $set: { chips: newChips } });
      await rlCol.updateOne({ _id: 'global' }, { $pull: { bets: { nick: nickname } } });
      await rlCol.updateOne({ _id: 'global' }, { $push: { bets: { nick: nickname, type: betType, amount: amount, targetNum: targetNum ?? null } } });
      return res.json({ ok: true, chips: newChips });
    }

    if (action === 'vote_skip') {
      const state = await rlGetState(db);
      if (state.phase !== 'betting') return res.status(400).json({ error: '베팅 중이 아님' });
      if (!state.skipVotes.includes(nickname)) {
        await rlCol.updateOne({ _id: 'global' }, { $push: { skipVotes: nickname } });
      }
      return res.json({ ok: true });
    }

    if (action === 'leave') {
      // Refund any active bet
      const state = await rlGetState(db);
      if (state.phase === 'betting') {
        const bet = state.bets.find(b=>b.nick===nickname);
        if (bet) {
          const p = await db.collection('players').findOne({ nickname });
          if (p) await db.collection('players').updateOne({ nickname }, { $set: { chips: (BigInt(p.chips||'0')+BigInt(bet.amount)).toString() } });
          await rlCol.updateOne({ _id: 'global' }, { $pull: { bets: { nick: nickname } } });
        }
      }
      await rlCol.updateOne({ _id: 'global' }, { $pull: { players: { nick: nickname }, skipVotes: nickname } });
      return res.json({ ok: true });
    }

    res.status(400).json({ error: 'unknown action' });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── Online Presence ──────────────────────────────────────────────────────────
app.post('/api/presence', async (req, res) => {
  try {
    const { nickname, token } = req.body || {};
    if (!nickname || !token) return res.json({ online: [] });
    const db = await getDb();
    const player = await db.collection('players').findOne({ nickname, token });
    if (!player) return res.json({ online: [] });
    const now = new Date();
    await db.collection('presence').updateOne(
      { nickname },
      { $set: { nickname, lastSeen: now } },
      { upsert: true }
    );
    const cutoff = new Date(now - 30000);
    const online = await db.collection('presence').find(
      { lastSeen: { $gt: cutoff } },
      { projection: { nickname: 1 } }
    ).toArray();
    res.json({ online: online.map(p => p.nickname) });
  } catch(e) { res.json({ online: [] }); }
});

// ─── Cleanup stale queue/games periodically ─────────────────────────────────
async function mpCleanup() {
  try {
    const db = await getDb();
    const now = new Date();
    await db.collection('mp_queue').deleteMany({ createdAt: { $lt: new Date(now - 300000) } });
    await db.collection('mp_games').deleteMany({
      phase: { $in: ['cleanup', 'finished'] },
      lastUpdate: { $lt: new Date(now - 600000) }
    });
    // Remove stale roulette players (no ping for 30s)
    await db.collection('roulette_state').updateOne({ _id: 'global' }, {
      $pull: { players: { lastPing: { $lt: new Date(now - 30000) } } }
    });
    // Remove stale presence entries
    await db.collection('presence').deleteMany({ lastSeen: { $lt: new Date(now - 60000) } });
  } catch(e) {}
}

// ─── 로컬 서버 시작 vs Serverless export ─────────────────────────────────────
if (process.env.VERCEL) {
  // Vercel: export express app directly as Node.js http handler
  module.exports = app;
} else if (process.env.NETLIFY) {
  const serverless = require('serverless-http');
  module.exports.handler = serverless(app);
} else {
  const PORT = process.env.PORT || 3000;
  getDb().then(async () => {
    await mpCleanup();
    setInterval(mpCleanup, 120000);
    app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
  }).catch(e => {
    console.error('DB 연결 실패:', e.message);
    process.exit(1);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DM System
// ═══════════════════════════════════════════════════════════════════════════
// Collections:
//   conversations: { _id, type:'dm'|'group', participants:[], name?, createdAt, updatedAt }
//   messages: { _id, convId, sender, type:'text'|'transfer', content, amount?, createdAt }

async function dmAuth(col, nickname, token) {
  const p = await col.findOne({ nickname, token });
  return p || null;
}

// GET /api/dm
app.get('/api/dm', async (req, res) => {
  const { action, nick, token, convId, before } = req.query;
  try {
    const db = await getDb();
    const players = db.collection('players');
    const p = await dmAuth(players, nick, token);
    if (!p) return res.status(401).json({ error: '인증 실패' });

    // 미읽 개수
    if (action === 'unread') {
      const convs = db.collection('conversations');
      const msgs = db.collection('messages');
      const myConvs = await convs.find({ participants: nick }).toArray();
      let total = 0;
      for (const c of myConvs) {
        const lastRead = (c.lastRead && c.lastRead[nick]) ? new Date(c.lastRead[nick]) : new Date(0);
        const cnt = await msgs.countDocuments({ convId: c._id.toString(), createdAt: { $gt: lastRead }, sender: { $ne: nick } });
        total += cnt;
      }
      return res.json({ unread: total });
    }

    // 대화 목록
    if (action === 'inbox') {
      const convs = db.collection('conversations');
      const msgs = db.collection('messages');
      const myConvs = await convs.find({ participants: nick }).sort({ updatedAt: -1 }).limit(50).toArray();
      const result = [];
      for (const c of myConvs) {
        const lastMsg = await msgs.findOne({ convId: c._id.toString() }, { sort: { createdAt: -1 } });
        const lastRead = (c.lastRead && c.lastRead[nick]) ? new Date(c.lastRead[nick]) : new Date(0);
        const unread = await msgs.countDocuments({ convId: c._id.toString(), createdAt: { $gt: lastRead }, sender: { $ne: nick } });
        result.push({
          id: c._id.toString(),
          type: c.type,
          name: c.name || c.participants.filter(x => x !== nick).join(', '),
          participants: c.participants,
          lastMsg: lastMsg ? { sender: lastMsg.sender, content: lastMsg.type === 'transfer' ? `💸 ${lastMsg.amount}칩 전송` : lastMsg.content, createdAt: lastMsg.createdAt } : null,
          unread,
        });
      }
      return res.json(result);
    }

    // 메시지 기록
    if (action === 'history') {
      if (!convId) return res.status(400).json({ error: 'missing convId' });
      const convs = db.collection('conversations');
      const msgs = db.collection('messages');
      const conv = await convs.findOne({ _id: new (require('mongodb').ObjectId)(convId) });
      if (!conv || !conv.participants.includes(nick)) return res.status(403).json({ error: '접근 불가' });
      const query = { convId };
      if (before) query.createdAt = { $lt: new Date(before) };
      const msgList = await msgs.find(query).sort({ createdAt: -1 }).limit(50).toArray();
      // 읽음 처리
      await convs.updateOne({ _id: conv._id }, { $set: { [`lastRead.${nick}`]: new Date() } });
      return res.json(msgList.reverse());
    }

    res.status(404).json({ error: 'unknown action' });
  } catch(e) { console.error('GET /api/dm', e); res.status(500).json({ error: e.message }); }
});

// POST /api/dm
app.post('/api/dm', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  try {
    const db = await getDb();
    const players = db.collection('players');
    const convs = db.collection('conversations');
    const msgs = db.collection('messages');
    const now = new Date();

    const p = await dmAuth(players, body.nickname, body.token);
    if (!p) return res.status(401).json({ error: '인증 실패' });
    const myNick = body.nickname;

    // DM 시작 또는 기존 대화 반환
    if (action === 'create') {
      const { target } = body;
      if (!target || target === myNick) return res.status(400).json({ error: '잘못된 대상' });
      const targetUser = await players.findOne({ nickname: target });
      if (!targetUser) return res.status(404).json({ error: '없는 사용자' });
      // 기존 1:1 대화 찾기
      let conv = await convs.findOne({ type: 'dm', participants: { $all: [myNick, target], $size: 2 } });
      if (!conv) {
        const r = await convs.insertOne({ type: 'dm', participants: [myNick, target], lastRead: {}, createdAt: now, updatedAt: now });
        conv = await convs.findOne({ _id: r.insertedId });
      }
      return res.json({ convId: conv._id.toString(), participants: conv.participants });
    }

    // 그룹 DM 생성
    if (action === 'create_group') {
      const { targets, name } = body;
      if (!targets || !targets.length) return res.status(400).json({ error: 'targets required' });
      const participants = [myNick, ...targets.filter(t => t !== myNick)];
      const r = await convs.insertOne({ type: 'group', name: name || (participants.join(', ')), participants, lastRead: {}, createdAt: now, updatedAt: now });
      return res.json({ convId: r.insertedId.toString(), participants });
    }

    // 그룹에 초대
    if (action === 'invite') {
      const { convId, target } = body;
      if (!convId || !target) return res.status(400).json({ error: 'missing fields' });
      const conv = await convs.findOne({ _id: new (require('mongodb').ObjectId)(convId) });
      if (!conv || !conv.participants.includes(myNick)) return res.status(403).json({ error: '접근 불가' });
      if (conv.type !== 'group') return res.status(400).json({ error: '1:1은 초대 불가' });
      if (conv.participants.includes(target)) return res.status(400).json({ error: '이미 참여 중' });
      await convs.updateOne({ _id: conv._id }, { $push: { participants: target }, $set: { updatedAt: now } });
      // 시스템 메시지
      await msgs.insertOne({ convId, sender: '__system__', type: 'text', content: `${target}님이 초대됐습니다.`, createdAt: now });
      return res.json({ ok: true });
    }

    // 메시지 전송
    if (action === 'send') {
      const { convId, content } = body;
      if (!convId || !content?.trim()) return res.status(400).json({ error: 'missing fields' });
      const conv = await convs.findOne({ _id: new (require('mongodb').ObjectId)(convId) });
      if (!conv || !conv.participants.includes(myNick)) return res.status(403).json({ error: '접근 불가' });
      const msg = { convId, sender: myNick, type: 'text', content: content.trim().slice(0, 1000), createdAt: now };
      const r = await msgs.insertOne(msg);
      await convs.updateOne({ _id: conv._id }, { $set: { updatedAt: now } });
      return res.json({ ...msg, _id: r.insertedId.toString() });
    }

    // 토큰 전송
    if (action === 'transfer') {
      const { convId, target, amount } = body;
      if (!convId || !target || !amount) return res.status(400).json({ error: 'missing fields' });
      const conv = await convs.findOne({ _id: new (require('mongodb').ObjectId)(convId) });
      if (!conv || !conv.participants.includes(myNick)) return res.status(403).json({ error: '접근 불가' });
      if (!conv.participants.includes(target)) return res.status(400).json({ error: '대화 참여자가 아님' });
      const amt = BigInt(amount);
      if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
      const sender = await players.findOne({ nickname: myNick });
      if (BigInt(sender.chips || '0') < amt) return res.status(400).json({ error: '칩 부족' });
      // 송금
      const newSenderChips = (BigInt(sender.chips) - amt).toString();
      const targetDoc = await players.findOne({ nickname: target });
      const newTargetChips = (BigInt(targetDoc?.chips || '0') + amt).toString();
      await players.updateOne({ nickname: myNick }, { $set: { chips: newSenderChips } });
      await players.updateOne({ nickname: target }, { $set: { chips: newTargetChips } });
      // 메시지 기록
      const msg = { convId, sender: myNick, type: 'transfer', content: `${target}에게 ${amount}칩 전송`, amount, target, createdAt: now };
      const r = await msgs.insertOne(msg);
      await convs.updateOne({ _id: conv._id }, { $set: { updatedAt: now } });
      return res.json({ ...msg, _id: r.insertedId.toString(), newChips: newSenderChips });
    }

    // 메시지 수정
    if (action === 'edit_msg') {
      const { msgId, content } = body;
      if (!msgId || !content?.trim()) return res.status(400).json({ error: 'missing fields' });
      const { ObjectId } = require('mongodb');
      const msg = await msgs.findOne({ _id: new ObjectId(msgId) });
      if (!msg) return res.status(404).json({ error: '메시지 없음' });
      if (msg.sender !== myNick) return res.status(403).json({ error: '본인만 수정 가능' });
      await msgs.updateOne({ _id: new ObjectId(msgId) }, { $set: { content: content.trim().slice(0, 1000), edited: true, editedAt: now } });
      return res.json({ ok: true });
    }

    // 메시지 삭제
    if (action === 'delete_msg') {
      const { msgId } = body;
      if (!msgId) return res.status(400).json({ error: 'missing msgId' });
      const { ObjectId } = require('mongodb');
      const msg = await msgs.findOne({ _id: new ObjectId(msgId) });
      if (!msg) return res.status(404).json({ error: '메시지 없음' });
      if (msg.sender !== myNick) return res.status(403).json({ error: '본인만 삭제 가능' });
      await msgs.updateOne({ _id: new ObjectId(msgId) }, { $set: { content: '(삭제된 메시지)', deleted: true } });
      return res.json({ ok: true });
    }

    res.status(404).json({ error: 'unknown action' });
  } catch(e) { console.error('POST /api/dm', e); res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// DICE  /api/dice
// ═══════════════════════════════════════════════════════════
app.post('/api/dice', async (req, res) => {
  const { nickname, token, betType, guess, amount } = req.body || {};
  try {
    const db = await getDb(); const col = db.collection('players');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    const amt = BigInt(amount || '0');
    if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
    if (BigInt(p.chips || '0') < amt) return res.status(400).json({ error: '칩 부족' });
    const roll = Math.floor(Math.random() * 6) + 1;
    let won = false, mult = 0n;
    if (betType === 'exact') { won = roll === Number(guess); mult = 6n; }
    else if (betType === 'parity') { won = (roll % 2 === 0) === (guess === 'even'); mult = 2n; }
    else return res.status(400).json({ error: 'betType: exact|parity' });
    const newChips = won
      ? (BigInt(p.chips) + amt * (mult - 1n)).toString()
      : (BigInt(p.chips) - amt).toString();
    await col.updateOne({ nickname }, { $set: { chips: newChips } });
    res.json({ roll, won, newChips, payout: won ? (amt * mult).toString() : '0' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// HORSE RACING  /api/horse
// ═══════════════════════════════════════════════════════════
// race 생성은 자동: GET creates/returns active race, POST places bet
const HORSE_DISTANCES = [
  { label: '단거리 (1000m)', duration: 15, ev: 1.05 },
  { label: '중거리 (2000m)', duration: 30, ev: 1.10 },
  { label: '장거리 (3000m)', duration: 50, ev: 1.15 },
];

function generateHorseRace(numHorses, distIdx) {
  const dist = HORSE_DISTANCES[distIdx] || HORSE_DISTANCES[0];
  // Random odds (rough inverse-probability), sum ~1/ev
  const rawOdds = Array.from({ length: numHorses }, () => Math.random() * 3 + 0.5);
  const total = rawOdds.reduce((a, b) => a + b, 0);
  const targetSum = numHorses / dist.ev; // so EV ≈ dist.ev
  const odds = rawOdds.map(o => (o / total) * targetSum);
  const payouts = odds.map(o => Math.max(1.1, numHorses / o)); // actual payout multiplier
  const horses = Array.from({ length: numHorses }, (_, i) => ({
    name: ['천리마', '적토마', '번개', '폭풍', '질주', '황금', '바람', '불꽃', '태양', '달빛'][i] || `말${i+1}`,
    prob: odds[i] / odds.reduce((a,b)=>a+b,0),
    payout: Math.round(payouts[i] * 100) / 100,
  }));
  return { horses, distIdx, distLabel: dist.label, duration: dist.duration };
}

function runHorseRace(horses) {
  // Weighted random pick for 1st, 2nd, 3rd
  const remaining = [...horses.map((h, i) => ({ ...h, idx: i }))];
  const picks = [];
  for (let place = 0; place < Math.min(3, remaining.length); place++) {
    const total = remaining.reduce((s, h) => s + h.prob, 0);
    let r = Math.random() * total;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].prob;
      if (r <= 0) { picks.push(remaining[i].idx); remaining.splice(i, 1); break; }
    }
  }
  return picks; // [1st, 2nd, 3rd] indices
}

app.get('/api/horse', async (req, res) => {
  try {
    const db = await getDb();
    const races = db.collection('horse_races');
    const now = new Date();
    // Find active or next race
    let race = await races.findOne({ status: { $in: ['betting', 'running'] }, finishAt: { $gt: now } });
    if (!race) {
      // Create new race
      const numHorses = 6, distIdx = Math.floor(Math.random() * 3);
      const raceData = generateHorseRace(numHorses, distIdx);
      const bettingEnds = new Date(now.getTime() + 20000); // 20s betting window
      const finishAt = new Date(bettingEnds.getTime() + raceData.duration * 1000);
      const r = await races.insertOne({ ...raceData, bets: [], status: 'betting', bettingEnds, finishAt, result: null, createdAt: now });
      race = await races.findOne({ _id: r.insertedId });
    }
    res.json({ id: race._id.toString(), horses: race.horses, distLabel: race.distLabel, duration: race.duration,
      status: race.status, bettingEnds: race.bettingEnds, finishAt: race.finishAt,
      result: race.result, serverTime: now.toISOString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/horse', async (req, res) => {
  const { action, nickname, token, raceId, betType, pick, amount } = req.body || {};
  try {
    const db = await getDb();
    const col = db.collection('players');
    const races = db.collection('horse_races');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });

    if (action === 'bet') {
      const now = new Date();
      const race = await races.findOne({ _id: new (require('mongodb').ObjectId)(raceId) });
      if (!race) return res.status(404).json({ error: '레이스 없음' });
      if (race.status !== 'betting' || now >= new Date(race.bettingEnds)) return res.status(400).json({ error: '베팅 마감' });
      if (!['first', 'rank123'].includes(betType)) return res.status(400).json({ error: 'betType: first|rank123' });
      const amt = BigInt(amount || '0');
      if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
      if (BigInt(p.chips) < amt) return res.status(400).json({ error: '칩 부족' });
      // Remove existing bet by same user in this race
      await races.updateOne({ _id: race._id }, { $pull: { bets: { nickname } } });
      await races.updateOne({ _id: race._id }, { $push: { bets: { nickname, betType, pick, amount: amt.toString() } } });
      await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips) - amt).toString() } });
      return res.json({ ok: true });
    }

    if (action === 'result') {
      const race = await races.findOne({ _id: new (require('mongodb').ObjectId)(raceId) });
      if (!race) return res.status(404).json({ error: '없음' });
      // Trigger finish if time is up
      if (race.status !== 'finished' && new Date() >= new Date(race.finishAt)) {
        const result = runHorseRace(race.horses); // [1st,2nd,3rd] idx
        await races.updateOne({ _id: race._id }, { $set: { status: 'finished', result } });
        // Pay out winners
        for (const bet of race.bets) {
          let won = false, mult = 1;
          if (bet.betType === 'first' && bet.pick[0] === result[0]) {
            won = true; mult = race.horses[result[0]].payout;
          } else if (bet.betType === 'rank123' &&
            bet.pick[0] === result[0] && bet.pick[1] === result[1] && bet.pick[2] === result[2]) {
            won = true; mult = race.horses[result[0]].payout * race.horses[result[1]].payout * 0.8;
          }
          if (won) {
            const bp = await col.findOne({ nickname: bet.nickname });
            if (bp) {
              const payout = BigInt(Math.round(Number(bet.amount) * mult));
              await col.updateOne({ nickname: bet.nickname }, { $set: { chips: (BigInt(bp.chips) + payout).toString() } });
            }
          }
        }
        return res.json({ result, horses: race.horses, bets: race.bets });
      }
      return res.json({ result: race.result, horses: race.horses, status: race.status, bets: race.bets });
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// KBO BASEBALL  /api/baseball
// ═══════════════════════════════════════════════════════════
// 당일 KBO 경기 가져오기 (데이터 없으면 mock)
async function fetchKboGames() {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const r = await fetch(`https://www.koreabaseball.com/ws/Schedule.asmx/GetSchedule?leId=1&srId=0&seasonId=2025&gameDate=${today}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('fetch failed');
    const text = await r.text();
    // Parse XML-ish response - simplified
    const games = [];
    const matches = [...text.matchAll(/<homeTeam>([^<]+)<\/homeTeam>.*?<awayTeam>([^<]+)<\/awayTeam>.*?<stadium>([^<]+)<\/stadium>/gs)];
    for (const m of matches) games.push({ home: m[1], away: m[2], stadium: m[3], id: `${m[1]}vs${m[2]}` });
    if (games.length) return games;
  } catch(e) {}
  // Fallback mock
  const teams = ['KIA','삼성','LG','두산','KT','SSG','롯데','한화','NC','키움'];
  const games = [];
  for (let i = 0; i < teams.length; i += 2)
    games.push({ home: teams[i], away: teams[i+1], id: `${teams[i]}vs${teams[i+1]}_mock` });
  return games;
}

app.get('/api/baseball', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const col = db.collection('baseball_games');
    let games = await col.find({ date: today }).toArray();
    if (!games.length) {
      const fetched = await fetchKboGames();
      for (const g of fetched) {
        await col.updateOne({ id: g.id, date: today }, { $setOnInsert: { ...g, date: today, bets: [], result: null, status: 'open' } }, { upsert: true });
      }
      games = await col.find({ date: today }).toArray();
    }
    res.json(games.map(g => ({ id: g._id.toString(), home: g.home, away: g.away, status: g.status, result: g.result,
      betCount: (g.bets || []).length })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/baseball', async (req, res) => {
  const { action, nickname, token, gameId, pick, amount } = req.body || {};
  try {
    const db = await getDb();
    const col = db.collection('players');
    const games = db.collection('baseball_games');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });

    if (action === 'bet') {
      const game = await games.findOne({ _id: new (require('mongodb').ObjectId)(gameId) });
      if (!game || game.status !== 'open') return res.status(400).json({ error: '베팅 불가' });
      const amt = BigInt(amount || '0');
      if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
      if (BigInt(p.chips) < amt) return res.status(400).json({ error: '칩 부족' });
      if (!['home', 'away', 'draw'].includes(pick)) return res.status(400).json({ error: 'pick: home|away|draw' });
      await games.updateOne({ _id: game._id }, { $pull: { bets: { nickname } } });
      await games.updateOne({ _id: game._id }, { $push: { bets: { nickname, pick, amount: amt.toString() } } });
      await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips) - amt).toString() } });
      return res.json({ ok: true });
    }

    // Admin: set result
    if (action === 'set_result') {
      const admin = await col.findOne({ nickname, token });
      if (!admin || admin.nickname !== '애플몬') return res.status(403).json({ error: '관리자만' });
      const game = await games.findOne({ _id: new (require('mongodb').ObjectId)(gameId) });
      if (!game) return res.status(404).json({ error: '없음' });
      const result = pick; // 'home'|'away'|'draw'
      await games.updateOne({ _id: game._id }, { $set: { status: 'finished', result } });
      // Payout: winners share the loser pool proportionally
      const winners = (game.bets || []).filter(b => b.pick === result);
      const losers  = (game.bets || []).filter(b => b.pick !== result);
      const loserPool = losers.reduce((s, b) => s + BigInt(b.amount), 0n);
      const winnerTotal = winners.reduce((s, b) => s + BigInt(b.amount), 0n);
      for (const bet of winners) {
        const share = winnerTotal > 0n ? BigInt(bet.amount) * loserPool / winnerTotal : 0n;
        const payout = BigInt(bet.amount) + share;
        const bp = await col.findOne({ nickname: bet.nickname });
        if (bp) await col.updateOne({ nickname: bet.nickname }, { $set: { chips: (BigInt(bp.chips) + payout).toString() } });
      }
      return res.json({ ok: true, winners: winners.length, loserPool: loserPool.toString() });
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// INVESTMENT  /api/invest
// ═══════════════════════════════════════════════════════════
// 투자: 다른 유저의 칩 잔액에 투자 → 그 유저 잔액 변동에 따라 수익/손실
// investment doc: { investor, target, amount(원금), currentValue, createdAt, updatedAt }
app.get('/api/invest', async (req, res) => {
  const { nick, token } = req.query;
  try {
    const db = await getDb();
    const p = await db.collection('players').findOne({ nickname: nick, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    const invs = await db.collection('investments').find({ investor: nick }).toArray();
    res.json(invs.map(i => ({ id: i._id.toString(), target: i.target, amount: i.amount, currentValue: i.currentValue, createdAt: i.createdAt })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invest', async (req, res) => {
  const { nickname, token, target, amount } = req.body || {};
  try {
    const db = await getDb();
    const col = db.collection('players');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    if (nickname === target) return res.status(400).json({ error: '자기 자신 투자 불가' });
    const targetUser = await col.findOne({ nickname: target });
    if (!targetUser) return res.status(404).json({ error: '대상 없음' });
    const amt = BigInt(amount || '0');
    if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
    if (BigInt(p.chips) < amt) return res.status(400).json({ error: '칩 부족' });
    // Deduct from investor, add to target
    await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips) - amt).toString() } });
    await col.updateOne({ nickname: target }, { $set: { chips: (BigInt(targetUser.chips) + amt).toString() } });
    // Record investment
    const now = new Date();
    const baselineChips = BigInt(targetUser.chips) + amt;
    await db.collection('investments').insertOne({
      investor: nickname, target, amount: amt.toString(), currentValue: amt.toString(),
      baselineTargetChips: baselineChips.toString(), createdAt: now, updatedAt: now,
    });
    // Send DM notification
    const convs = db.collection('conversations');
    const msgs = db.collection('messages');
    let conv = await convs.findOne({ type: 'dm', participants: { $all: [nickname, target], $size: 2 } });
    if (!conv) { const r = await convs.insertOne({ type: 'dm', participants: [nickname, target], lastRead: {}, createdAt: now, updatedAt: now }); conv = await convs.findOne({ _id: r.insertedId }); }
    await msgs.insertOne({ convId: conv._id.toString(), sender: '__system__', type: 'text', content: `💰 ${nickname}님이 당신에게 ${amount}칩을 투자했습니다!`, createdAt: now });
    await convs.updateOne({ _id: conv._id }, { $set: { updatedAt: now } });
    res.json({ ok: true, newChips: (BigInt(p.chips) - amt).toString() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// ADMIN  /api/admin
// ═══════════════════════════════════════════════════════════
const ADMIN_NICK = '애플몬';
async function requireAdmin(col, nickname, token) {
  const p = await col.findOne({ nickname, token });
  return p && p.nickname === ADMIN_NICK ? p : null;
}

app.get('/api/admin', async (req, res) => {
  const { action, nick, token, target } = req.query;
  try {
    const db = await getDb(); const col = db.collection('players');
    const admin = await requireAdmin(col, nick, token);
    if (!admin) return res.status(403).json({ error: '관리자만' });
    if (action === 'users') {
      const users = await col.find({}, { projection: { passwordHash: 0, salt: 0, token: 0 } }).sort({ lastLoginAt: -1 }).limit(200).toArray();
      return res.json(users.map(u => ({ nickname: u.nickname, chips: u.chips, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, banned: u.banned, title: u.title, titleColor: u.titleColor })));
    }
    if (action === 'announcements') {
      const msgs = db.collection('messages');
      const anns = await msgs.find({ type: 'announcement' }).sort({ createdAt: -1 }).limit(50).toArray();
      return res.json(anns);
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Public: get announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const db = await getDb();
    const msgs = db.collection('messages');
    const anns = await msgs.find({ type: 'announcement' }).sort({ createdAt: -1 }).limit(20).toArray();
    res.json(anns);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin', async (req, res) => {
  const { action, nickname, token, target, amount, duration, title, titleColor, content } = req.body || {};
  try {
    const db = await getDb(); const col = db.collection('players');
    const admin = await requireAdmin(col, nickname, token);
    if (!admin) return res.status(403).json({ error: '관리자만' });
    const now = new Date();

    if (action === 'ban') {
      if (!target) return res.status(400).json({ error: 'target required' });
      const banUntil = duration ? new Date(now.getTime() + Number(duration) * 1000) : null;
      await col.updateOne({ nickname: target }, { $set: { banned: true, banUntil } });
      return res.json({ ok: true });
    }
    if (action === 'unban') {
      await col.updateOne({ nickname: target }, { $set: { banned: false, banUntil: null } });
      return res.json({ ok: true });
    }
    if (action === 'delete_account') {
      await col.deleteOne({ nickname: target });
      return res.json({ ok: true });
    }
    if (action === 'set_chips') {
      await col.updateOne({ nickname: target }, { $set: { chips: String(amount) } });
      return res.json({ ok: true });
    }
    if (action === 'set_title') {
      await col.updateOne({ nickname: target }, { $set: { title: title || null, titleColor: titleColor || null } });
      return res.json({ ok: true });
    }
    if (action === 'announce') {
      // Send announcement to all users via DM + store as announcement
      const msgs = db.collection('messages');
      const ann = { sender: ADMIN_NICK, type: 'announcement', content: content?.trim(), createdAt: now };
      await msgs.insertOne(ann);
      // Also DM all 1:1 convs where admin is participant
      const convs = db.collection('conversations');
      const adminConvs = await convs.find({ type: 'dm', participants: ADMIN_NICK }).toArray();
      for (const c of adminConvs) {
        await msgs.insertOne({ convId: c._id.toString(), sender: ADMIN_NICK, type: 'announcement', content: content?.trim(), createdAt: now });
        await convs.updateOne({ _id: c._id }, { $set: { updatedAt: now } });
      }
      return res.json({ ok: true });
    }
    if (action === 'dm_user') {
      // DM specific user
      const targetUser = await col.findOne({ nickname: target });
      if (!targetUser) return res.status(404).json({ error: '없는 유저' });
      const msgs = db.collection('messages');
      const convs = db.collection('conversations');
      let conv = await convs.findOne({ type: 'dm', participants: { $all: [ADMIN_NICK, target], $size: 2 } });
      if (!conv) { const r = await convs.insertOne({ type: 'dm', participants: [ADMIN_NICK, target], lastRead: {}, createdAt: now, updatedAt: now }); conv = await convs.findOne({ _id: r.insertedId }); }
      await msgs.insertOne({ convId: conv._id.toString(), sender: ADMIN_NICK, type: 'announcement', content: content?.trim(), createdAt: now });
      await convs.updateOne({ _id: conv._id }, { $set: { updatedAt: now } });
      return res.json({ ok: true });
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 칭호 변경 (본인만 색상 변경) ──────────────────────────────────
app.post('/api/title', async (req, res) => {
  const { nickname, token, titleColor } = req.body || {};
  try {
    const db = await getDb(); const col = db.collection('players');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    if (!p.title) return res.status(400).json({ error: '칭호 없음' });
    await col.updateOne({ nickname }, { $set: { titleColor } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 로그인 시 밴 체크 patch (login action에 추가)
// 이미 login 라우트가 위에 있으므로 미들웨어로 처리
app.use('/api/player', async (req, res, next) => {
  if (req.query.action === 'login' && req.method === 'POST') {
    // handled above, skip
  }
  next();
});
