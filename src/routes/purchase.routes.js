const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const { validatePurchase } = require('../middleware/validateInput');
const { requireIdempotencyKey } = require('../middleware/idempotencyKey');

router.post('/:playerId/purchase', requireIdempotencyKey, validatePurchase, purchaseController.purchase);

module.exports = router;