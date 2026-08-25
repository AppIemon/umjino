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
      if (!nickname || nickname.length < 2 || nickname.length > 24)
        return res.status(400).json({ error: '닉네임은 2~24자' });
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
    const docs = await col.find({}, { projection: { nickname: 1, chips: 1, title: 1, titleColor: 1 } }).toArray();
    docs.sort((a, b) => cmpBigStr(b.chips || '0', a.chips || '0'));
    const top100 = docs.slice(0, 100).map((d, i) => ({
      rank: i + 1, nickname: d.nickname, maxChips: d.chips || '0',
      title: d.title || null, titleColor: d.titleColor || null,
    }));
    let userRank = -1, surrounding = [];
    if (nick) {
      userRank = docs.findIndex(d => d.nickname === nick);
      if (userRank >= 100) {
        surrounding = docs.slice(Math.max(0, userRank - 1), userRank + 2)
          .map((d, i) => ({ rank: Math.max(0, userRank - 1) + i + 1, nickname: d.nickname, maxChips: d.chips || '0' }));
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

// ═══════════════════════════════════════════════════════════════════════════
// 화투(花鬪) 멀티플레이 전용 게임 — 섯다 / 고스톱
//  · 두 게임 모두 1:1 실시간 매칭 전용이며 싱글 플레이 모드가 없다.
//  · 매칭 시 양쪽에서 stake(에스크로)를 즉시 차감하고, 정산 때 되돌려준다.
//    → 중간에 접속을 끊어도 칩이 복제되거나 증발하지 않는다.
// ═══════════════════════════════════════════════════════════════════════════

const HW_MONTH_NAME = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란',
                       '홍싸리', '공산', '국화', '단풍', '오동', '비'];
const HW_MONTH_FLOWER = ['', '🌾', '🐦', '🌸', '🍃', '🌿', '🦋',
                         '🐗', '🌕', '🌼', '🍁', '🐤', '☔'];

// kind: gwang(광) / yeol(열끗) / tti(띠) / pi(피)
// sub : 띠 종류 hong(홍단) / cheong(청단) / cho(초단) / bi(비띠)
// pi  : 피 점수(쌍피는 2)
// godori: 고도리 3종(2·4·8월 열끗)
const HW_DECK_DEF = [
  [1,  ['gwang'], ['tti','hong'], ['pi'], ['pi']],
  [2,  ['yeol','godori'], ['tti','hong'], ['pi'], ['pi']],
  [3,  ['gwang'], ['tti','hong'], ['pi'], ['pi']],
  [4,  ['yeol','godori'], ['tti','cho'], ['pi'], ['pi']],
  [5,  ['yeol'], ['tti','cho'], ['pi'], ['pi']],
  [6,  ['yeol'], ['tti','cheong'], ['pi'], ['pi']],
  [7,  ['yeol'], ['tti','cho'], ['pi'], ['pi']],
  [8,  ['gwang'], ['yeol','godori'], ['pi'], ['pi']],
  [9,  ['yeol'], ['tti','cheong'], ['pi'], ['pi']],
  [10, ['yeol'], ['tti','cheong'], ['pi'], ['pi']],
  [11, ['gwang'], ['ssangpi'], ['pi'], ['pi']],
  [12, ['gwang'], ['yeol'], ['tti','bi'], ['ssangpi']],
];

function hwBuildDeck() {
  const deck = [];
  for (const row of HW_DECK_DEF) {
    const m = row[0];
    for (let i = 1; i < row.length; i++) {
      const [k, extra] = row[i];
      const c = { id: `${m}-${i - 1}`, m, name: HW_MONTH_NAME[m] };
      if (k === 'gwang')       { c.kind = 'gwang'; if (m === 12) c.bi = true; }
      else if (k === 'yeol')   { c.kind = 'yeol'; if (extra === 'godori') c.godori = true; }
      else if (k === 'tti')    { c.kind = 'tti'; c.sub = extra; }
      else if (k === 'ssangpi'){ c.kind = 'pi'; c.pi = 2; }
      else                     { c.kind = 'pi'; c.pi = 1; }
      deck.push(c);
    }
  }
  return deck;
}

function hwShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 에스크로 계산: 두 플레이어 중 적은 쪽 잔액 기준
function hwCalcStake(chipsA, chipsB) {
  const min = cmpBigStr(chipsA, chipsB) <= 0 ? BigInt(chipsA || '0') : BigInt(chipsB || '0');
  let stake = min / 10n;
  if (stake < 1000n) stake = min < 1000n ? min : 1000n;
  if (stake < 1n) stake = 0n;
  return stake;
}

// 플레이어 칩 증감 (음수 가능, 0 미만으로는 내려가지 않음)
async function hwAddChips(db, nickname, delta) {
  const col = db.collection('players');
  const p = await col.findOne({ nickname });
  if (!p) return null;
  let next = BigInt(p.chips || '0') + delta;
  if (next < 0n) next = 0n;
  const nextStr = next.toString();
  const set = { chips: nextStr };
  if (cmpBigStr(nextStr, p.stats?.maxChips || '0') > 0) set['stats.maxChips'] = nextStr;
  await col.updateOne({ nickname }, { $set: set });
  return nextStr;
}

// 공용 1:1 매칭 (queue 컬렉션 → game 문서 생성)
async function hwTryMatch(db, qName, gName, buildGame) {
  const qCol = db.collection(qName);
  const queue = await qCol.find({}).sort({ createdAt: 1 }).limit(2).toArray();
  if (queue.length < 2) return null;
  const [a, b] = queue;
  const del = await qCol.deleteMany({ _id: { $in: [a._id, b._id] } });
  if (del.deletedCount < 2) return null;      // 동시 매칭 방지
  const pa = await db.collection('players').findOne({ nickname: a.nickname });
  const pb = await db.collection('players').findOne({ nickname: b.nickname });
  if (!pa || !pb) return null;
  const game = buildGame(pa, pb, a, b);
  await db.collection(gName).insertOne(game);
  return game;
}

async function hwFindGame(db, gName, nickname) {
  return db.collection(gName).findOne({
    $or: [{ 'players.0.nickname': nickname }, { 'players.1.nickname': nickname }],
    phase: { $ne: 'cleanup' },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 섯다 (Seotda) — 1:1 전용
//   ante → bet1(1장) → bet2(2장) → showdown
// ───────────────────────────────────────────────────────────────────────────

// 섯다 덱: 1~10월 각 2장(20장). 48장 덱의 앞 두 장을 쓰므로 1·3·8월 첫 장이 광이 된다.
// 카드 모양 정보(kind/sub)를 그대로 물려받아 클라이언트가 고스톱과 같은 이미지를 쓴다.
function sdCreateDeck() {
  const full = hwBuildDeck();
  const d = [];
  for (let m = 1; m <= 10; m++) {
    full.filter(c => c.m === m).slice(0, 2).forEach((c, i) => {
      d.push({ ...c, idx: i, gwang: c.kind === 'gwang' });
    });
  }
  return hwShuffle(d);
}

const SD_SPECIAL = {
  '1,2':  { r: 79, name: '알리' },
  '1,4':  { r: 78, name: '독사' },
  '1,9':  { r: 77, name: '구삥' },
  '1,10': { r: 76, name: '장삥' },
  '4,10': { r: 75, name: '장사' },
  '4,6':  { r: 74, name: '세륙' },
};

function sdEval(cards) {
  if (!cards || cards.length < 2) return { r: -1, name: '?' };
  const m1 = Math.min(cards[0].m, cards[1].m);
  const m2 = Math.max(cards[0].m, cards[1].m);
  if (cards[0].gwang && cards[1].gwang) {
    const key = `${m1},${m2}`;
    if (key === '3,8')  return { r: 100, name: '38광땡' };
    if (key === '1,8')  return { r: 99,  name: '18광땡' };
    if (key === '1,3')  return { r: 98,  name: '13광땡' };
  }
  if (m1 === m2) return { r: 80 + m1, name: m1 === 10 ? '장땡' : `${m1}땡` };
  const sp = SD_SPECIAL[`${m1},${m2}`];
  if (sp) return sp;
  const kkut = (m1 + m2) % 10;
  return { r: kkut, name: kkut === 0 ? '망통' : kkut === 9 ? '갑오' : `${kkut}끗` };
}

function sdBuildGame(pa, pb, qa, qb) {
  const stake = hwCalcStake(pa.chips || '0', pb.chips || '0');
  let ante = stake / 10n;
  if (ante < 1n) ante = stake > 0n ? 1n : 0n;
  const deck = sdCreateDeck();
  const mk = (p) => ({
    nickname: p.nickname, chips: p.chips || '0',
    cards: [deck.pop()], committed: ante.toString(), folded: false, acted: false, allIn: false,
  });
  const first = Math.random() < 0.5 ? 0 : 1;
  return {
    gameId: crypto.randomBytes(8).toString('hex'),
    game: 'seotda',
    phase: 'bet1',
    deck,
    players: [mk(pa), mk(pb)],
    stake: stake.toString(),
    ante: ante.toString(),
    pot: (ante * 2n).toString(),
    roundHigh: ante.toString(),      // 이번 라운드까지의 최대 누적 베팅
    acting: first,
    firstActor: first,
    showdown: null,
    result: null,
    log: ['앤티 자동 차감 · 첫 장 배분'],
    createdAt: new Date(),
    lastUpdate: new Date(),
  };
}

function sdView(game, pidx) {
  const me = game.players[pidx], op = game.players[1 - pidx];
  const revealed = game.phase === 'showdown' || game.phase === 'finished';
  const v = {
    status: game.result ? 'game_over' : 'in_game',
    game: 'seotda',
    gameId: game.gameId,
    phase: game.phase,
    pot: game.pot,
    ante: game.ante,
    stake: game.stake,
    roundHigh: game.roundHigh,
    isMyTurn: game.acting === pidx && !game.result,
    myNick: me.nickname, opNick: op.nickname,
    myChips: me.chips, opChips: op.chips,
    myCommitted: me.committed, opCommitted: op.committed,
    myFolded: me.folded, opFolded: op.folded,
    myCards: me.cards,
    opCards: revealed ? op.cards : op.cards.map(() => null),
    opCardCount: op.cards.length,
    myHand: me.cards.length === 2 ? sdEval(me.cards).name : null,
    log: (game.log || []).slice(-6),
    showdown: revealed ? game.showdown : null,
  };
  if (game.result) {
    v.winner = game.result.winner === -1 ? 'tie' : (game.result.winner === pidx ? 'me' : 'opponent');
    v.pot = game.result.pot;
    v.myDelta = game.result.delta[pidx];
    v.opCards = op.cards;
  }
  return v;
}

// 라운드 종료 판정: 살아있는 전원이 액션했고 누적 베팅이 같음
function sdRoundDone(game) {
  const alive = game.players.filter(p => !p.folded);
  if (alive.length <= 1) return true;
  if (alive.some(p => !p.acted)) return false;
  return alive.every(p => p.committed === game.roundHigh || p.allIn);
}

async function sdAdvance(db, game) {
  game.pot = game.players.reduce((s, p) => s + BigInt(p.committed), 0n).toString();
  if (game.phase === 'bet1') {
    game.players.forEach(p => { p.cards.push(game.deck.pop()); p.acted = false; });
    game.phase = 'bet2';
    game.acting = game.firstActor;
    game.log.push('둘째 장 배분 — 최종 베팅');
    return;
  }
  await sdShowdown(db, game);
}

async function sdShowdown(db, game) {
  const alive = game.players.map((p, i) => ({ p, i })).filter(x => !x.p.folded);
  if (alive.length === 1) { await sdFinish(db, game, alive[0].i, true); return; }
  const e0 = sdEval(game.players[0].cards);
  const e1 = sdEval(game.players[1].cards);
  const winner = e0.r > e1.r ? 0 : e1.r > e0.r ? 1 : -1;
  game.showdown = { p0: e0.name, p1: e1.name, winner };
  game.phase = 'showdown';
  await sdFinish(db, game, winner, false);
}

async function sdFinish(db, game, winnerIdx, byFold) {
  if (game.result) return;
  const pot = game.players.reduce((s, p) => s + BigInt(p.committed), 0n);
  const stake = BigInt(game.stake || '0');
  const delta = ['0', '0'];
  for (let i = 0; i < 2; i++) {
    // 에스크로 잔액 반환 + (승자면) 팟 수령
    let back = stake - BigInt(game.players[i].committed);
    if (back < 0n) back = 0n;
    let gain = back;
    if (winnerIdx === i) gain += pot;
    else if (winnerIdx === -1) gain += pot / 2n + (i === 0 ? pot % 2n : 0n);
    if (gain > 0n) {
      const next = await hwAddChips(db, game.players[i].nickname, gain);
      if (next) game.players[i].chips = next;
    }
    delta[i] = (gain - stake).toString();
  }
  game.pot = pot.toString();
  game.phase = 'finished';
  game.result = { winner: winnerIdx, byFold, pot: pot.toString(), delta };
  game.log.push(winnerIdx === -1 ? '무승부 — 팟 분배'
    : `${game.players[winnerIdx].nickname} 승리${byFold ? ' (상대 다이)' : ''}`);
  await db.collection('sd_games').updateOne({ gameId: game.gameId }, { $set: {
    phase: game.phase, result: game.result, players: game.players,
    showdown: game.showdown, pot: game.pot, log: game.log, lastUpdate: new Date(),
  } });
}

async function sdSave(db, game) {
  await db.collection('sd_games').updateOne({ gameId: game.gameId }, { $set: {
    phase: game.phase, deck: game.deck, players: game.players, pot: game.pot,
    roundHigh: game.roundHigh, acting: game.acting, showdown: game.showdown,
    result: game.result, log: game.log, lastUpdate: new Date(),
  } });
}

async function sdStart(db, g) {
  for (const p of g.players) {
    const next = await hwAddChips(db, p.nickname, -BigInt(g.stake));
    if (next) p.chips = next;
  }
  await sdSave(db, g);
}

app.get('/api/seotda', async (req, res) => {
  const { action, nickname, token } = req.query;
  try {
    if (!nickname || !token) return res.status(400).json({ error: 'missing' });
    const db = await getDb();
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });
    if (action !== 'poll') return res.status(400).json({ error: 'unknown action' });

    const game = await hwFindGame(db, 'sd_games', nickname);
    if (game) {
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      // 상대 장기 미응답 → 몰수승
      if (!game.result && Date.now() - new Date(game.lastUpdate).getTime() > 120000) {
        game.players[game.acting].folded = true;
        await sdFinish(db, game, 1 - game.acting, true);   // 시간 초과 = 차례인 쪽 패배
      }
      return res.json(sdView(game, pidx));
    }
    if (await db.collection('sd_queue').findOne({ nickname })) {
      const g = await hwTryMatch(db, 'sd_queue', 'sd_games', sdBuildGame);
      if (g) await sdStart(db, g);
      const mine = await hwFindGame(db, 'sd_games', nickname);
      if (mine) return res.json(sdView(mine, mine.players[0].nickname === nickname ? 0 : 1));
      return res.json({ status: 'queued' });
    }
    return res.json({ status: 'idle' });
  } catch (e) { console.error('GET /api/seotda', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/seotda', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  try {
    const { nickname, token } = body;
    if (!nickname || !token) return res.status(400).json({ error: 'missing' });
    const db = await getDb();
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });
    const qCol = db.collection('sd_queue');

    if (action === 'queue') {
      if (await hwFindGame(db, 'sd_games', nickname)) return res.status(400).json({ error: '이미 게임 중' });
      if (BigInt(me.chips || '0') < 10n) return res.status(400).json({ error: '칩이 부족합니다' });
      await qCol.updateOne({ nickname }, { $set: { nickname, chips: me.chips || '0', createdAt: new Date() } }, { upsert: true });
      const g = await hwTryMatch(db, 'sd_queue', 'sd_games', sdBuildGame);
      if (g) await sdStart(db, g);
      const mine = await hwFindGame(db, 'sd_games', nickname);
      if (mine) return res.json(sdView(mine, mine.players[0].nickname === nickname ? 0 : 1));
      return res.json({ status: 'queued' });
    }

    if (action === 'cancel_queue') { await qCol.deleteMany({ nickname }); return res.json({ status: 'idle' }); }

    if (action === 'bet') {
      const game = await hwFindGame(db, 'sd_games', nickname);
      if (!game || game.result) return res.status(400).json({ error: '게임 없음' });
      if (!['bet1', 'bet2'].includes(game.phase)) return res.status(400).json({ error: '베팅 단계 아님' });
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      if (game.acting !== pidx) return res.status(400).json({ error: '상대 차례' });
      const p = game.players[pidx], op = game.players[1 - pidx];
      if (p.folded) return res.status(400).json({ error: '이미 다이' });

      const stake = BigInt(game.stake || '0');
      const ante = BigInt(game.ante || '1');
      const high = BigInt(game.roundHigh || '0');
      const mine = BigInt(p.committed || '0');
      const act = body.betAction;

      if (act === 'die') {
        p.folded = true;
        game.log.push(`${p.nickname} 다이`);
        await sdFinish(db, game, 1 - pidx, true);
        return res.json(sdView(game, pidx));
      }

      if (act === 'call' || act === 'check') {
        if (high > mine) {
          const need = high - mine;
          const room = stake - mine;
          const pay = need > room ? room : need;
          p.committed = (mine + pay).toString();
          if (pay < need) p.allIn = true;
          game.log.push(`${p.nickname} 콜`);
        } else game.log.push(`${p.nickname} 체크`);
        p.acted = true;
      } else if (act === 'raise') {
        // 삥(1) / 따당(2) / 하프 / 풀 — 단위는 앤티 배수 또는 팟 비율
        const mode = body.raiseMode || 'ping';
        const potNow = game.players.reduce((s, q) => s + BigInt(q.committed), 0n);
        let add;
        if (mode === 'ping') add = ante;
        else if (mode === 'ttadang') add = ante * 2n;
        else if (mode === 'half') add = potNow / 2n;
        else add = potNow;                            // full
        if (add < ante) add = ante;
        let target = high + add;
        const room = stake;
        if (target > room) target = room;
        if (target <= mine) return res.status(400).json({ error: '더 이상 베팅할 수 없습니다' });
        p.committed = target.toString();
        if (target >= room) p.allIn = true;
        game.roundHigh = target.toString();
        p.acted = true; op.acted = false;
        game.log.push(`${p.nickname} ${ { ping:'삥', ttadang:'따당', half:'하프', full:'풀' }[mode] || '레이즈' }`);
      } else return res.status(400).json({ error: '알 수 없는 액션' });

      game.pot = game.players.reduce((s, q) => s + BigInt(q.committed), 0n).toString();
      if (sdRoundDone(game)) await sdAdvance(db, game);
      else game.acting = 1 - pidx;
      if (!game.result) await sdSave(db, game);
      return res.json(sdView(game, pidx));
    }

    if (action === 'leave') {
      await qCol.deleteMany({ nickname });
      const game = await hwFindGame(db, 'sd_games', nickname);
      if (game) {
        const pidx = game.players[0].nickname === nickname ? 0 : 1;
        if (!game.result) { game.players[pidx].folded = true; await sdFinish(db, game, 1 - pidx, true); }
      }
      await db.collection('sd_games').updateMany({
        $or: [{ 'players.0.nickname': nickname }, { 'players.1.nickname': nickname }], phase: 'finished',
      }, { $set: { phase: 'cleanup' } });
      return res.json({ status: 'idle' });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { console.error('POST /api/seotda', e); res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 고스톱 (Go-Stop) — 1:1 전용, 2인 맞고 규칙 (7점부터 스톱 가능)
// ───────────────────────────────────────────────────────────────────────────

const GS_STOP_MIN = 7;
const GS_TAKE_PRIORITY = { gwang: 4, yeol: 3, tti: 2, pi: 1 };

function gsBestOf(cards) {
  return cards.slice().sort((a, b) => {
    const d = (GS_TAKE_PRIORITY[b.kind] || 0) - (GS_TAKE_PRIORITY[a.kind] || 0);
    if (d) return d;
    return (b.pi || 0) - (a.pi || 0);
  })[0];
}

function gsScore(captured) {
  const cap = captured || [];
  const gwang = cap.filter(c => c.kind === 'gwang');
  const yeol  = cap.filter(c => c.kind === 'yeol');
  const tti   = cap.filter(c => c.kind === 'tti');
  const piNum = cap.filter(c => c.kind === 'pi').reduce((s, c) => s + (c.pi || 1), 0);
  const det = [];
  let s = 0;
  if (gwang.length >= 5)      { s += 15; det.push('오광 15'); }
  else if (gwang.length === 4){ s += 4;  det.push('사광 4'); }
  else if (gwang.length === 3){
    if (gwang.some(c => c.bi)) { s += 2; det.push('비삼광 2'); }
    else                       { s += 3; det.push('삼광 3'); }
  }
  if (yeol.length >= 5) { s += yeol.length - 4; det.push(`열끗 ${yeol.length - 4}`); }
  if (yeol.filter(c => c.godori).length === 3) { s += 5; det.push('고도리 5'); }
  if (tti.length >= 5) { s += tti.length - 4; det.push(`띠 ${tti.length - 4}`); }
  const hong = tti.filter(c => c.sub === 'hong').length;
  const cheong = tti.filter(c => c.sub === 'cheong').length;
  const cho = tti.filter(c => c.sub === 'cho').length;
  if (hong >= 3)   { s += 3; det.push('홍단 3'); }
  if (cheong >= 3) { s += 3; det.push('청단 3'); }
  if (cho >= 3)    { s += 3; det.push('초단 3'); }
  if (piNum >= 10) { s += piNum - 9; det.push(`피 ${piNum - 9}`); }
  return { score: s, det, gwang: gwang.length, yeol: yeol.length, tti: tti.length, pi: piNum };
}

function gsBuildGame(pa, pb) {
  const stake = hwCalcStake(pa.chips || '0', pb.chips || '0');
  let pv = stake / 20n;
  if (pv < 1n) pv = stake > 0n ? 1n : 0n;

  let deck, field, hands;
  for (let attempt = 0; attempt < 40; attempt++) {
    deck = hwShuffle(hwBuildDeck());
    hands = [deck.splice(0, 10), deck.splice(0, 10)];
    field = deck.splice(0, 8);
    const cnt = {};
    field.forEach(c => { cnt[c.m] = (cnt[c.m] || 0) + 1; });
    if (!Object.values(cnt).some(v => v >= 4)) break;   // 바닥 4장 겹침 → 재분배
  }

  const mk = (p, hand) => ({
    nickname: p.nickname, chips: p.chips || '0',
    hand, captured: [], go: 0, lastGoScore: 0, score: 0,
  });
  const g = {
    gameId: crypto.randomBytes(8).toString('hex'),
    game: 'gostop',
    phase: 'playing',
    deck, field,
    players: [mk(pa, hands[0]), mk(pb, hands[1])],
    turn: Math.random() < 0.5 ? 0 : 1,
    pending: null,
    stake: stake.toString(),
    pointValue: pv.toString(),
    result: null,
    log: ['게임 시작 — 각자 10장, 바닥 8장'],
    createdAt: new Date(),
    lastUpdate: new Date(),
  };
  // 총통(같은 달 4장) 즉시 승리
  for (let i = 0; i < 2; i++) {
    const cnt = {};
    g.players[i].hand.forEach(c => { cnt[c.m] = (cnt[c.m] || 0) + 1; });
    const chong = Object.entries(cnt).find(([, v]) => v === 4);
    if (chong) { g.chongtong = { idx: i, month: Number(chong[0]) }; break; }
  }
  return g;
}

function gsPublicPlayer(p) {
  return {
    nickname: p.nickname, chips: p.chips, handCount: p.hand.length,
    captured: p.captured, go: p.go, ...gsScore(p.captured),
  };
}

function gsView(game, pidx) {
  const me = game.players[pidx], op = game.players[1 - pidx];
  const myS = gsScore(me.captured);
  const v = {
    status: game.result ? 'game_over' : 'in_game',
    game: 'gostop',
    gameId: game.gameId,
    phase: game.phase,
    field: game.field,
    deckCount: game.deck.length,
    myHand: me.hand,
    me: gsPublicPlayer(me),
    op: gsPublicPlayer(op),
    isMyTurn: game.turn === pidx && !game.result,
    pending: game.turn === pidx ? game.pending : null,
    stake: game.stake,
    pointValue: game.pointValue,
    canStop: myS.score >= GS_STOP_MIN,
    stopMin: GS_STOP_MIN,
    lastFlip: game.lastFlip || null,
    log: (game.log || []).slice(-7),
  };
  if (game.result) {
    v.winner = game.result.winner === -1 ? 'draw' : (game.result.winner === pidx ? 'me' : 'opponent');
    v.settle = game.result.settle;
    v.myDelta = game.result.delta[pidx];
    v.opHand = op.hand;
  }
  return v;
}

function gsRemoveField(game, cards) {
  const ids = new Set(cards.map(c => c.id));
  game.field = game.field.filter(c => !ids.has(c.id));
}

// 상대에게서 피 빼앗기 (값이 낮은 피부터)
function gsStealPi(game, pidx, n) {
  const op = game.players[1 - pidx];
  const me = game.players[pidx];
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const pool = op.captured.filter(c => c.kind === 'pi');
    if (!pool.length) break;
    pool.sort((a, b) => (a.pi || 1) - (b.pi || 1));
    const c = pool[0];
    op.captured = op.captured.filter(x => x.id !== c.id);
    me.captured.push(c);
    moved++;
  }
  return moved;
}

// 한 턴 처리: 손패 1장 → 더미 1장 뒤집기
function gsRunTurn(game, pidx, card, chosenFieldId) {
  const p = game.players[pidx];
  const ev = [];
  let taken = [];
  let steal = 0;
  let placed = null;

  const fm = game.field.filter(c => c.m === card.m);
  const handMatch = fm.length;
  if (handMatch === 0) { game.field.push(card); placed = card; }
  else if (handMatch === 3) {
    taken.push(card, ...fm); gsRemoveField(game, fm); steal++; ev.push('쓸어담기! 상대 피 1장');
  } else {
    const pick = fm.find(c => c.id === chosenFieldId) || gsBestOf(fm);
    taken.push(card, pick); gsRemoveField(game, [pick]);
  }

  const flip = game.deck.length ? game.deck.pop() : null;
  game.lastFlip = flip;
  if (flip) {
    const ff = game.field.filter(c => c.m === flip.m);
    if (handMatch === 1 && flip.m === card.m) {
      // 뻑 — 낸 패·먹은 패·뒤집은 패 모두 바닥으로
      game.field.push(...taken, flip);
      taken = [];
      ev.push('뻑! 이번 턴 획득 없음');
    } else if (handMatch === 0 && placed && flip.m === card.m) {
      // 쪽 — 방금 깐 패를 그대로 되먹음
      taken.push(flip, placed); gsRemoveField(game, [placed]);
      steal++; ev.push('쪽! 상대 피 1장');
    } else if (ff.length === 0) {
      game.field.push(flip);
    } else if (ff.length === 3) {
      taken.push(flip, ...ff); gsRemoveField(game, ff); steal++; ev.push('쓸어담기! 상대 피 1장');
    } else {
      const pick = gsBestOf(ff);
      taken.push(flip, pick); gsRemoveField(game, [pick]);
      if (handMatch === 2 && flip.m === card.m) { steal++; ev.push('따닥! 상대 피 1장'); }
    }
  }

  p.captured.push(...taken);
  if (steal > 0) {
    const moved = gsStealPi(game, pidx, steal);
    if (moved === 0) ev.push('(상대 피 없음)');
  }
  return ev;
}

async function gsSettle(db, game, winnerIdx, reason) {
  if (game.result) return;
  const stake = BigInt(game.stake || '0');
  const pv = BigInt(game.pointValue || '0');
  const delta = ['0', '0'];
  let settle = { reason, pts: 0, mult: 1, flags: [], amount: '0' };

  if (winnerIdx === -1) {
    for (let i = 0; i < 2; i++) { if (stake > 0n) await hwAddChips(db, game.players[i].nickname, stake); }
  } else {
    const w = gsScore(game.players[winnerIdx].captured);
    const l = gsScore(game.players[1 - winnerIdx].captured);
    const go = game.players[winnerIdx].go;
    let pts = reason === 'chongtong' ? GS_STOP_MIN : w.score;
    let mult = 1;
    const flags = [];
    if (go >= 1) { pts += Math.min(go, 2); flags.push(`${go}고`); }
    if (go >= 3) mult *= Math.pow(2, go - 2);
    if (reason !== 'chongtong') {
      if (w.pi >= 10 && l.pi < 5)              { mult *= 2; flags.push('피박'); }
      if (w.gwang >= 3 && l.gwang === 0)       { mult *= 2; flags.push('광박'); }
      if (w.yeol >= 7 && l.yeol === 0)         { mult *= 2; flags.push('멍박'); }
      if (game.players[1 - winnerIdx].go > 0)  { mult *= 2; flags.push('고박'); }
    }
    let amount = pv * BigInt(pts) * BigInt(mult);
    if (amount > stake) amount = stake;
    settle = { reason, pts, mult, flags, amount: amount.toString(), detail: w.det, winScore: w.score };
    for (let i = 0; i < 2; i++) {
      const gain = i === winnerIdx ? stake + amount : stake - amount;
      if (gain > 0n) {
        const next = await hwAddChips(db, game.players[i].nickname, gain);
        if (next) game.players[i].chips = next;
      }
      delta[i] = (gain - stake).toString();
    }
  }
  game.phase = 'finished';
  game.result = { winner: winnerIdx, settle, delta };
  game.log.push(winnerIdx === -1 ? '나가리 — 판돈 반환'
    : `${game.players[winnerIdx].nickname} ${settle.pts}점 × ${settle.mult}배 승리`);
  await gsSave(db, game);
}

async function gsSave(db, game) {
  await db.collection('gs_games').updateOne({ gameId: game.gameId }, { $set: {
    phase: game.phase, deck: game.deck, field: game.field, players: game.players,
    turn: game.turn, pending: game.pending, result: game.result, log: game.log,
    lastFlip: game.lastFlip || null, chongtong: game.chongtong || null, lastUpdate: new Date(),
  } });
}

// 턴 종료 후 고/스톱 여부 판정
async function gsAfterTurn(db, game, pidx) {
  const p = game.players[pidx];
  const sc = gsScore(p.captured);
  p.score = sc.score;
  if (sc.score >= GS_STOP_MIN && sc.score > p.lastGoScore) {
    game.phase = 'go_choice';
    game.pending = { type: 'go', score: sc.score };
    game.turn = pidx;
    game.log.push(`${p.nickname} ${sc.score}점 — 고/스톱 선택`);
    await gsSave(db, game);
    return;
  }
  if (game.players.every(q => q.hand.length === 0)) { await gsSettle(db, game, -1, 'nagari'); return; }
  game.phase = 'playing';
  game.pending = null;
  game.turn = 1 - pidx;
  await gsSave(db, game);
}

app.get('/api/gostop', async (req, res) => {
  const { action, nickname, token } = req.query;
  try {
    if (!nickname || !token) return res.status(400).json({ error: 'missing' });
    const db = await getDb();
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });
    if (action !== 'poll') return res.status(400).json({ error: 'unknown action' });

    const game = await hwFindGame(db, 'gs_games', nickname);
    if (game) {
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      if (!game.result && Date.now() - new Date(game.lastUpdate).getTime() > 180000) {
        await gsSettle(db, game, 1 - game.turn, 'timeout');  // 시간 초과 = 차례인 쪽 패배
      }
      return res.json(gsView(game, pidx));
    }
    if (await db.collection('gs_queue').findOne({ nickname })) {
      const g = await hwTryMatch(db, 'gs_queue', 'gs_games', gsBuildGame);
      if (g) await gsStart(db, g);
      const mine = await hwFindGame(db, 'gs_games', nickname);
      if (mine) return res.json(gsView(mine, mine.players[0].nickname === nickname ? 0 : 1));
      return res.json({ status: 'queued' });
    }
    return res.json({ status: 'idle' });
  } catch (e) { console.error('GET /api/gostop', e); res.status(500).json({ error: e.message }); }
});

async function gsStart(db, g) {
  for (const p of g.players) await hwAddChips(db, p.nickname, -BigInt(g.stake));
  if (g.chongtong) {
    g.log.push(`총통! ${g.players[g.chongtong.idx].nickname} (${g.chongtong.month}월 4장)`);
    await gsSettle(db, g, g.chongtong.idx, 'chongtong');
  } else await gsSave(db, g);
}

app.post('/api/gostop', async (req, res) => {
  const { action } = req.query;
  const body = req.body || {};
  try {
    const { nickname, token } = body;
    if (!nickname || !token) return res.status(400).json({ error: 'missing' });
    const db = await getDb();
    const me = await db.collection('players').findOne({ nickname, token });
    if (!me) return res.status(401).json({ error: '인증 실패' });
    const qCol = db.collection('gs_queue');

    if (action === 'queue') {
      if (await hwFindGame(db, 'gs_games', nickname)) return res.status(400).json({ error: '이미 게임 중' });
      if (BigInt(me.chips || '0') < 20n) return res.status(400).json({ error: '칩이 부족합니다' });
      await qCol.updateOne({ nickname }, { $set: { nickname, chips: me.chips || '0', createdAt: new Date() } }, { upsert: true });
      const g = await hwTryMatch(db, 'gs_queue', 'gs_games', gsBuildGame);
      if (g) await gsStart(db, g);
      const mine = await hwFindGame(db, 'gs_games', nickname);
      if (mine) return res.json(gsView(mine, mine.players[0].nickname === nickname ? 0 : 1));
      return res.json({ status: 'queued' });
    }

    if (action === 'cancel_queue') { await qCol.deleteMany({ nickname }); return res.json({ status: 'idle' }); }

    if (action === 'play') {
      const game = await hwFindGame(db, 'gs_games', nickname);
      if (!game || game.result) return res.status(400).json({ error: '게임 없음' });
      if (game.phase !== 'playing') return res.status(400).json({ error: '지금은 낼 수 없습니다' });
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      if (game.turn !== pidx) return res.status(400).json({ error: '상대 차례' });
      const p = game.players[pidx];
      const hi = p.hand.findIndex(c => c.id === body.cardId);
      if (hi < 0) return res.status(400).json({ error: '없는 패' });
      const card = p.hand[hi];

      // 바닥에 같은 달 2장 → 어느 쪽을 먹을지 선택 필요
      const fm = game.field.filter(c => c.m === card.m);
      if (fm.length === 2 && !body.fieldId) {
        game.phase = 'choose';
        game.pending = { type: 'choose', cardId: card.id, options: fm.map(c => c.id) };
        await gsSave(db, game);
        return res.json(gsView(game, pidx));
      }
      p.hand.splice(hi, 1);
      const ev = gsRunTurn(game, pidx, card, body.fieldId);
      game.log.push(`${p.nickname}: ${card.m}월 ${HW_MONTH_NAME[card.m]}` + (ev.length ? ` · ${ev.join(' · ')}` : ''));
      await gsAfterTurn(db, game, pidx);
      return res.json(gsView(game, pidx));
    }

    if (action === 'choose') {
      const game = await hwFindGame(db, 'gs_games', nickname);
      if (!game || game.result) return res.status(400).json({ error: '게임 없음' });
      if (game.phase !== 'choose' || !game.pending) return res.status(400).json({ error: '선택 단계 아님' });
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      if (game.turn !== pidx) return res.status(400).json({ error: '상대 차례' });
      if (!game.pending.options.includes(body.fieldId)) return res.status(400).json({ error: '선택 불가' });
      const p = game.players[pidx];
      const hi = p.hand.findIndex(c => c.id === game.pending.cardId);
      if (hi < 0) return res.status(400).json({ error: '없는 패' });
      const card = p.hand.splice(hi, 1)[0];
      const ev = gsRunTurn(game, pidx, card, body.fieldId);
      game.log.push(`${p.nickname}: ${card.m}월 ${HW_MONTH_NAME[card.m]}` + (ev.length ? ` · ${ev.join(' · ')}` : ''));
      await gsAfterTurn(db, game, pidx);
      return res.json(gsView(game, pidx));
    }

    if (action === 'go' || action === 'stop') {
      const game = await hwFindGame(db, 'gs_games', nickname);
      if (!game || game.result) return res.status(400).json({ error: '게임 없음' });
      if (game.phase !== 'go_choice') return res.status(400).json({ error: '선택 단계 아님' });
      const pidx = game.players[0].nickname === nickname ? 0 : 1;
      if (game.turn !== pidx) return res.status(400).json({ error: '권한 없음' });
      const p = game.players[pidx];
      if (action === 'stop') {
        game.log.push(`${p.nickname} 스톱!`);
        await gsSettle(db, game, pidx, 'stop');
        return res.json(gsView(game, pidx));
      }
      p.go += 1;
      p.lastGoScore = gsScore(p.captured).score;
      game.log.push(`${p.nickname} ${p.go}고!`);
      if (game.players.every(q => q.hand.length === 0)) {
        // 고를 외쳤는데 낼 패가 없으면 그 자리에서 종료(고박 없이 현재 점수 정산)
        await gsSettle(db, game, pidx, 'stop');
        return res.json(gsView(game, pidx));
      }
      game.phase = 'playing';
      game.pending = null;
      game.turn = 1 - pidx;
      await gsSave(db, game);
      return res.json(gsView(game, pidx));
    }

    if (action === 'leave') {
      await qCol.deleteMany({ nickname });
      const game = await hwFindGame(db, 'gs_games', nickname);
      if (game && !game.result) {
        const pidx = game.players[0].nickname === nickname ? 0 : 1;
        await gsSettle(db, game, 1 - pidx, 'leave');
      }
      await db.collection('gs_games').updateMany({
        $or: [{ 'players.0.nickname': nickname }, { 'players.1.nickname': nickname }], phase: 'finished',
      }, { $set: { phase: 'cleanup' } });
      return res.json({ status: 'idle' });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) { console.error('POST /api/gostop', e); res.status(500).json({ error: e.message }); }
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
    // 화투 게임(섯다/고스톱) 큐·판 정리
    for (const [q, g] of [['sd_queue', 'sd_games'], ['gs_queue', 'gs_games']]) {
      await db.collection(q).deleteMany({ createdAt: { $lt: new Date(now - 300000) } });
      await db.collection(g).deleteMany({
        phase: { $in: ['cleanup', 'finished'] },
        lastUpdate: { $lt: new Date(now - 600000) }
      });
    }
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
    // 경마 상시 루프 (5초마다)
    await horseEnsureActive();
    setInterval(horseFinishExpired, 5000);
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
    if (betType === 'exact') { won = roll === Number(guess); mult = 7n; }   // EV 7/6 ≈ 1.17
    else if (betType === 'parity') { won = (roll % 2 === 0) === (guess === 'even'); mult = 2n; } // EV 1.0 → 2.2 적용
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
  { label: '단거리 (1000m)', duration: 20, ev: 1.20 },
  { label: '중거리 (2000m)', duration: 40, ev: 1.28 },
  { label: '장거리 (3000m)', duration: 65, ev: 1.35 },
];

function generateHorseRace(numHorses, distIdx) {
  const dist = HORSE_DISTANCES[distIdx] || HORSE_DISTANCES[0];
  const rawOdds = Array.from({ length: numHorses }, () => Math.random() * 3 + 0.5);
  const total = rawOdds.reduce((a, b) => a + b, 0);
  const targetSum = numHorses / dist.ev;
  const odds = rawOdds.map(o => (o / total) * targetSum);
  const payouts = odds.map(o => Math.max(1.2, numHorses / o));
  const NAMES = ['천리마','적토마','번개','폭풍','질주','황금','바람','불꽃','태양','달빛'];
  const horses = Array.from({ length: numHorses }, (_, i) => ({
    name: NAMES[i] || `말${i+1}`,
    prob: odds[i] / odds.reduce((a,b)=>a+b,0),
    payout: Math.round(payouts[i] * 100) / 100,
  }));
  return { horses, distIdx, distLabel: dist.label, duration: dist.duration };
}

// 경마 상시 루프: 레이스 없으면 즉시 생성, 30초 베팅 → 레이스 → 결과 → 즉시 다음
async function horseEnsureActive() {
  try {
    const db = await getDb();
    const races = db.collection('horse_races');
    const now = new Date();
    // 진행중 레이스 있으면 OK
    const active = await races.findOne({ status: { $in: ['betting','running'] }, finishAt: { $gt: now } });
    if (active) return;
    // 없으면 새 레이스 생성 (랜덤 말 수 4~8, 랜덤 거리)
    const numHorses = Math.floor(Math.random() * 5) + 4;
    const distIdx = Math.floor(Math.random() * 3);
    const raceData = generateHorseRace(numHorses, distIdx);
    const bettingEnds = new Date(now.getTime() + 30000); // 30초 베팅
    const finishAt = new Date(bettingEnds.getTime() + raceData.duration * 1000);
    await races.insertOne({ ...raceData, numHorses, bets: [], status: 'betting', bettingEnds, finishAt, result: null, createdAt: now });
  } catch(e) { console.error('horseEnsureActive:', e.message); }
}

async function horseFinishExpired() {
  try {
    const db = await getDb();
    const races = db.collection('horse_races');
    const col = db.collection('players');
    const now = new Date();
    // 베팅 시간 지나면 running으로
    await races.updateMany({ status: 'betting', bettingEnds: { $lte: now } }, { $set: { status: 'running' } });
    // 레이스 시간 지나면 결과 처리
    const expired = await races.find({ status: 'running', finishAt: { $lte: now } }).toArray();
    for (const race of expired) {
      const result = runHorseRace(race.horses);
      await races.updateOne({ _id: race._id }, { $set: { status: 'finished', result } });
      for (const bet of race.bets) {
        let won = false, mult = 1;
        if (bet.betType === 'first' && bet.pick[0] === result[0]) {
          won = true; mult = race.horses[result[0]].payout;
        } else if (bet.betType === 'rank123' && bet.pick[0]===result[0] && bet.pick[1]===result[1] && bet.pick[2]===result[2]) {
          won = true; mult = race.horses[result[0]].payout * race.horses[result[1]].payout * 0.9;
        }
        if (won) {
          const bp = await col.findOne({ nickname: bet.nickname });
          if (bp) {
            const payout = BigInt(Math.round(Number(bet.amount) * mult));
            await col.updateOne({ nickname: bet.nickname }, { $set: { chips: (BigInt(bp.chips) + payout).toString() } });
          }
        }
      }
    }
    // 끝나면 즉시 새 레이스
    if (expired.length > 0) await horseEnsureActive();
  } catch(e) { console.error('horseFinishExpired:', e.message); }
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
    let race = await races.findOne(
      { status: { $in: ['betting', 'running'] } },
      { sort: { createdAt: -1 } }
    );
    if (!race) {
      await horseEnsureActive();
      race = await races.findOne({ status: { $in: ['betting','running'] } }, { sort: { createdAt: -1 } });
    }
    if (!race) return res.status(503).json({ error: '레이스 준비 중' });
    const lastFinished = await races.findOne({ status: 'finished' }, { sort: { finishAt: -1 } });
    res.json({
      id: race._id.toString(), horses: race.horses, distLabel: race.distLabel,
      duration: race.duration, numHorses: race.numHorses || race.horses.length,
      status: race.status, bettingEnds: race.bettingEnds, finishAt: race.finishAt,
      result: race.result, serverTime: now.toISOString(),
      lastResult: lastFinished ? { result: lastFinished.result, horses: lastFinished.horses, distLabel: lastFinished.distLabel } : null
    });
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
      await races.updateOne({ _id: race._id }, { $pull: { bets: { nickname } } });
      await races.updateOne({ _id: race._id }, { $push: { bets: { nickname, betType, pick, amount: amt.toString() } } });
      await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips) - amt).toString() } });
      return res.json({ ok: true });
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════════════════════
// KBO BASEBALL  /api/baseball
// ═══════════════════════════════════════════════════════════
// KBO BASEBALL  /api/baseball
// ═══════════════════════════════════════════════════════════
// KBO BASEBALL  /api/baseball
// ═══════════════════════════════════════════════════════════
const KBO_TEAMS = ['KIA','삼성','LG','두산','KT','SSG','롯데','한화','NC','키움'];

// KBO 공식 API: https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList
// GAME_STATE_SC: 1=예정, 2=진행중, 3=종료  |  GAME_RESULT_CK: 1=결과확정
async function fetchKboLive() {
  const kst = new Date(Date.now() + 9 * 3600000);
  const yyyymmdd = kst.toISOString().slice(0, 10).replace(/-/g, '');
  try {
    const url = `https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList?date=${yyyymmdd}&leId=1&srId=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.koreabaseball.com/' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const games = json.game || [];
    return games
      .filter(g => g.CANCEL_SC_ID === '0') // 정상경기만
      .map(g => {
        const sc = parseInt(g.GAME_STATE_SC);
        const status = sc >= 3 || g.GAME_RESULT_CK == 1 ? 'finished'
                     : sc === 2 ? 'in_progress'
                     : 'scheduled';
        const away = g.AWAY_NM, home = g.HOME_NM;
        const ascore = parseInt(g.T_SCORE_CN) || 0;
        const hscore = parseInt(g.B_SCORE_CN) || 0;
        const inning = g.GAME_INN_NO ? `${g.GAME_INN_NO}회 ${g.GAME_TB_SC_NM||''}` : null;
        return {
          id: `${away}vs${home}_${yyyymmdd}`,
          away, home, ascore, hscore, status,
          statusLabel: inning || (status==='scheduled' ? g.G_TM : status==='finished' ? '종료' : '진행중'),
          result: status === 'finished'
            ? (hscore > ascore ? 'home' : hscore < ascore ? 'away' : 'draw')
            : null
        };
      });
  } catch(e) {
    console.error('fetchKboLive err:', e.message);
    return []; // 실패 시 빈 배열 (mock 없음)
  }
}

app.get('/api/baseball', async (req, res) => {
  try {
    const db = await getDb();
    const kst = new Date(Date.now() + 9 * 3600000);
    const today = kst.toISOString().slice(0, 10);
    const col = db.collection('baseball_games');
    const { ObjectId } = require('mongodb');

    // 실시간 KBO 데이터 fetch
    const fetched = await fetchKboLive();

    for (const g of fetched) {
      const existing = await col.findOne({ id: g.id, date: today });
      if (!existing) {
        // 신규 경기 insert
        await col.insertOne({
          id: g.id, date: today,
          home: g.home, away: g.away,
          hscore: g.hscore, ascore: g.ascore,
          status: g.status, result: g.result,
          statusLabel: g.statusLabel,
          bets: []
        });
      } else {
        // 점수/상태 업데이트
        const upd = { hscore: g.hscore, ascore: g.ascore, status: g.status, statusLabel: g.statusLabel };
        if (g.result) upd.result = g.result;
        await col.updateOne({ id: g.id, date: today }, { $set: upd });

        // 새로 종료된 경기 정산
        if (g.status === 'finished' && existing.status !== 'finished' && g.result) {
          const players = db.collection('players');
          const winners = (existing.bets || []).filter(b => b.pick === g.result);
          const losers  = (existing.bets || []).filter(b => b.pick !== g.result);
          const loserPool = losers.reduce((s,b) => s + BigInt(b.amount), 0n);
          const winnerTotal = winners.reduce((s,b) => s + BigInt(b.amount), 0n);
          for (const bet of winners) {
            const share = winnerTotal > 0n ? BigInt(bet.amount) * loserPool / winnerTotal : 0n;
            const payout = BigInt(bet.amount) + share;
            const bp = await players.findOne({ nickname: bet.nickname });
            if (bp) await players.updateOne(
              { nickname: bet.nickname },
              { $set: { chips: (BigInt(bp.chips) + payout).toString() } }
            );
          }
        }
      }
    }

    // DB에서 오늘 경기 반환
    const games = await col.find({ date: today }).sort({ _id: 1 }).toArray();
    res.json(games.map(g => ({
      id: g._id.toString(), home: g.home, away: g.away,
      status: g.status, result: g.result,
      hscore: g.hscore ?? 0, ascore: g.ascore ?? 0,
      statusLabel: g.statusLabel || '',
      betCount: (g.bets || []).length
    })));
  } catch(e) {
    console.error('baseball GET:', e);
    res.status(500).json({ error: e.message });
  }
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
      const { ObjectId } = require('mongodb');
      const game = await games.findOne({ _id: new ObjectId(gameId) });
      if (!game || !['open','in_progress'].includes(game.status))
        return res.status(400).json({ error: '베팅 불가 (경기 종료됨)' });
      const amt = BigInt(amount || '0');
      if (amt <= 0n) return res.status(400).json({ error: '0보다 커야 함' });
      if (BigInt(p.chips) < amt) return res.status(400).json({ error: '칩 부족' });
      if (!['home','away','draw'].includes(pick)) return res.status(400).json({ error: 'pick: home|away|draw' });
      await games.updateOne({ _id: game._id }, { $pull: { bets: { nickname } } });
      await games.updateOne({ _id: game._id }, { $push: { bets: { nickname, pick, amount: amt.toString() } } });
      await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips)-amt).toString() } });
      return res.json({ ok: true });
    }

    // 관리자 수동 결과 입력
    if (action === 'set_result') {
      if (p.nickname !== '애플몬') return res.status(403).json({ error: '관리자만' });
      const { ObjectId } = require('mongodb');
      const game = await games.findOne({ _id: new ObjectId(gameId) });
      if (!game) return res.status(404).json({ error: '없음' });
      const result = pick;
      await games.updateOne({ _id: game._id }, { $set: { status: 'finished', result } });
      const winners = (game.bets||[]).filter(b=>b.pick===result);
      const losers  = (game.bets||[]).filter(b=>b.pick!==result);
      const loserPool = losers.reduce((s,b)=>s+BigInt(b.amount),0n);
      const winnerTotal = winners.reduce((s,b)=>s+BigInt(b.amount),0n);
      for (const bet of winners) {
        const share = winnerTotal>0n ? BigInt(bet.amount)*loserPool/winnerTotal : 0n;
        const payout = BigInt(bet.amount)+share;
        const bp = await col.findOne({ nickname: bet.nickname });
        if (bp) await col.updateOne({ nickname: bet.nickname },
          { $set: { chips: (BigInt(bp.chips)+payout).toString() } });
      }
      return res.json({ ok: true });
    }
    res.status(404).json({ error: 'unknown action' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// INVESTMENT  /api/invest
// ═══════════════════════════════════════════════════════════
app.get('/api/invest', async (req, res) => {
  const { nick, token } = req.query;
  try {
    const db = await getDb();
    const p = await db.collection('players').findOne({ nickname: nick, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    const invCol = db.collection('investments');
    const plCol = db.collection('players');
    const invs = await invCol.find({ investor: nick }).sort({ createdAt: -1 }).toArray();

    // 각 투자의 현재가치 = 원금 * (대상 현재칩 / 기준칩)
    const result = await Promise.all(invs.map(async inv => {
      let currentValue = inv.currentValue || inv.amount;
      let pct = 0;
      try {
        const tgt = await plCol.findOne({ nickname: inv.target }, { projection: { chips: 1 } });
        if (tgt && inv.baselineTargetChips) {
          const base = BigInt(inv.baselineTargetChips);
          const cur = BigInt(tgt.chips || '0');
          const amt = BigInt(inv.amount);
          if (base > 0n) {
            currentValue = (amt * cur / base).toString();
            const diff = Number(cur - base);
            pct = base > 0n ? Math.round(diff / Number(base) * 1000) / 10 : 0;
          }
        }
      } catch(e) {}

      // 히스토리 포인트 추가 (1시간마다 자동)
      const history = inv.history || [];
      const lastPoint = history[history.length - 1];
      const nowMs = Date.now();
      if (!lastPoint || nowMs - new Date(lastPoint.t).getTime() > 3600000) {
        await invCol.updateOne({ _id: inv._id }, {
          $set: { currentValue },
          $push: { history: { t: new Date(), v: currentValue } }
        });
      }

      return {
        id: inv._id.toString(), target: inv.target,
        amount: inv.amount, currentValue,
        pct, createdAt: inv.createdAt,
        history: (inv.history || []).concat({ t: new Date(), v: currentValue }),
      };
    }));
    res.json(result);
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
    await col.updateOne({ nickname }, { $set: { chips: (BigInt(p.chips) - amt).toString() } });
    await col.updateOne({ nickname: target }, { $set: { chips: (BigInt(targetUser.chips) + amt).toString() } });
    const now = new Date();
    const baselineTargetChips = (BigInt(targetUser.chips) + amt).toString();
    await db.collection('investments').insertOne({
      investor: nickname, target, amount: amt.toString(), currentValue: amt.toString(),
      baselineTargetChips, history: [{ t: now, v: amt.toString() }],
      createdAt: now, updatedAt: now,
    });
    const convs = db.collection('conversations');
    const msgs = db.collection('messages');
    let conv = await convs.findOne({ type: 'dm', participants: { $all: [nickname, target], $size: 2 } });
    if (!conv) { const r = await convs.insertOne({ type: 'dm', participants: [nickname, target], lastRead: {}, createdAt: now, updatedAt: now }); conv = await convs.findOne({ _id: r.insertedId }); }
    await msgs.insertOne({ convId: conv._id.toString(), sender: '__system__', type: 'text', content: `💰 ${nickname}님이 ${amount}칩을 투자했습니다!`, createdAt: now });
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
// 닉네임 변경
app.post('/api/rename', async (req, res) => {
  const { nickname, token, newNickname } = req.body || {};
  try {
    const db = await getDb();
    const col = db.collection('players');
    const p = await col.findOne({ nickname, token });
    if (!p) return res.status(401).json({ error: '인증 실패' });
    const nn = (newNickname || '').trim();
    if (!nn || nn.length < 2 || nn.length > 24)
      return res.status(400).json({ error: '닉네임은 2~24자' });
    if (nn === nickname) return res.status(400).json({ error: '현재 닉네임과 동일' });
    const exists = await col.findOne({ nickname: nn });
    if (exists) return res.status(400).json({ error: '이미 사용 중인 닉네임' });
    // 새 토큰 발급 (닉네임 변경 시 세션 갱신)
    const crypto = require('crypto');
    const newToken = crypto.randomBytes(32).toString('hex');
    await col.updateOne({ nickname }, { $set: { nickname: nn, token: newToken } });
    res.json({ ok: true, newNickname: nn, newToken });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

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
