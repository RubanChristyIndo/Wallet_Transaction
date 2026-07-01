require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`wallet service listening on :${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully');
  server.close(() => process.exit(0));
});

module.exports = server;