// Vercel 진입점 — Express app을 직접 export (serverless-http 불필요)
process.env.VERCEL = '1';
const app = require('../server');
module.exports = app;
