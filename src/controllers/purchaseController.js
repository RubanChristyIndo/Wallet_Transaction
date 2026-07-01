const purchaseService = require('../services/purchaseService');

async function purchase(req, res, next) {
  try {
    const { playerId } = req.params;
    const { itemId, price } = req.body;
    const result = await purchaseService.purchase({
      playerId, itemId, price, idempotencyKey: req.idempotencyKey,
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
}

module.exports = { purchase };