// scripts/bridges.cjs
const path = require('node:path');

const BRIDGES = {
  acp: 'texlyre-acp-bridge.cjs',
  storage: 'bridge.cjs',
};

module.exports = Object.fromEntries(
  Object.entries(BRIDGES).map(([type, file]) => [
    type,
    { file, source: path.join('bridges', type, '1', file) },
  ]),
);
