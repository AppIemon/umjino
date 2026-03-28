// Vercel 진입점 — server.js를 serverless 모드로 실행
process.env.VERCEL = '1';
module.exports = require('../server');
