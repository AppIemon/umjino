'use strict';
const { gostopScore } = require('./korean-cards');

function commonView(game, pidx) {
  const myP = game.players[pidx];
  const opP = game.players[1 - pidx];
  return {
    status: 'in_game',
    gameType: game.gameType || 'poker',
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
    myFolded: !!myP.folded,
    opFolded: !!opP.folded,
    myRoundPaid: myP.roundPaid || 0,
    opRoundPaid: opP.roundPaid || 0,
    myActed: !!myP.acted,
    opActed: !!opP.acted,
    showdownResult: game.showdownResult || null,
    lastEvents: game.lastEvents || [],
  };
}

function attachResult(view, game, pidx) {
  if (!game.result) return view;
  view.status = 'game_over';
  view.winner = game.result.winner === -1 ? 'tie'
    : (game.result.winner === pidx ? 'me' : 'opponent');
  view.winnerNick = game.result.winner === -1 ? null : game.players[game.result.winner].nickname;
  view.stakeAmount = game.result.stakeAmount || '0';
  return view;
}

function publicCard(c, faceUp) {
  if (!c) return null;
  if (!faceUp) return { faceUp: false, img: 'back' };
  return { ...c, faceUp: true };
}

function sutdaView(game, pidx) {
  const view = commonView(game, pidx);
  const isShow = game.phase === 'showdown' || game.phase === 'finished';
  view.myCards = (game.players[pidx].cards || []).map(c => publicCard(c, true));
  view.opCards = (game.players[1 - pidx].cards || []).map(c => publicCard(c, isShow));
  if (game.showdownResult) {
    const sr = game.showdownResult;
    view.myHandName = pidx === 0 ? sr.p0HandName : sr.p1HandName;
    view.opHandName = pidx === 0 ? sr.p1HandName : sr.p0HandName;
  }
  return attachResult(view, game, pidx);
}

function capturedPublic(list) {
  return (list || []).map(c => publicCard(c, true));
}

function gostopView(game, pidx) {
  const view = commonView(game, pidx);
  const me = game.players[pidx];
  const op = game.players[1 - pidx];
  const isShow = game.phase === 'finished' || game.phase === 'showdown';
  view.field = (game.field || []).map(c => publicCard(c, true));
  view.myHand = (me.hand || []).map(c => publicCard(c, true));
  view.opHandCount = (op.hand || []).length;
  view.opHand = isShow ? (op.hand || []).map(c => publicCard(c, true)) : null;
  view.myCaptured = capturedPublic(me.captured);
  view.opCaptured = capturedPublic(op.captured);
  view.deckCount = (game.deck || []).length;
  view.myScore = gostopScore(me.captured || []).score;
  view.opScore = gostopScore(op.captured || []).score;
  view.myScoreParts = gostopScore(me.captured || []).parts;
  view.opScoreParts = gostopScore(op.captured || []).parts;
  view.myGo = me.goCount || 0;
  view.opGo = op.goCount || 0;
  view.myShook = !!me.shook;
  view.opShook = !!op.shook;
  view.isGoStop = game.phase === 'go_stop' && game.goStopPlayer === pidx;
  view.waitingGoStop = game.phase === 'go_stop' && game.goStopPlayer !== pidx;
  view.peokMonths = game.peokMonths || [];
  if (game.pending && game.pending.pidx === pidx) {
    view.pending = {
      played: publicCard(game.pending.played, true),
      drawn: publicCard(game.pending.drawn, true),
      playOptions: (game.pending.playOptions || []).map(id => {
        const c = (game.field || []).find(x => x.id === id) || (id === game.pending.played.id ? game.pending.played : null);
        return publicCard(c, true);
      }).filter(Boolean),
      drawOptions: (game.pending.drawOptions || []).map(id => {
        const c = (game.field || []).find(x => x.id === id);
        return publicCard(c, true);
      }).filter(Boolean),
    };
  } else {
    view.pending = null;
  }
  view.lastPlay = game.lastPlay ? {
    nick: game.players[game.lastPlay.pidx]?.nickname,
    played: publicCard(game.lastPlay.played, true),
    drawn: publicCard(game.lastPlay.drawn, true),
    events: game.lastEvents || [],
  } : null;
  return attachResult(view, game, pidx);
}

function pokerViewExtra(view, game, pidx) {
  view.gameType = game.gameType || 'poker';
  if (game.showdownResult) {
    const sr = game.showdownResult;
    view.myHandName = pidx === 0 ? sr.p0HandName : sr.p1HandName;
    view.opHandName = pidx === 0 ? sr.p1HandName : sr.p0HandName;
  }
  return view;
}

module.exports = { sutdaView, gostopView, pokerViewExtra, publicCard };
