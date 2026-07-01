const path = require('path');
const dotenv = require('dotenv');

// Loads .env.test and OVERRIDES any already-loaded .env values —
// this guarantees tests always hit wallet_test_db, never your dev DB,
// regardless of what else required dotenv first.
dotenv.config({
  path: path.resolve(__dirname, '../.env.test'),
  override: true,
});