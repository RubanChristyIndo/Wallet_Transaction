const walletService = require('../services/walletService');

async function credit(req, res, next) {
  try {
    const { playerId } = req.params;
    const { amount, reason } = req.body;
    const result = await walletService.creditWallet({
      playerId, amount, reason, idempotencyKey: req.idempotencyKey,
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
}

async function getWallet(req, res, next) {
  try {
    const state = await walletService.getWalletState(req.params.playerId);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
}

module.exports = { credit, getWallet };