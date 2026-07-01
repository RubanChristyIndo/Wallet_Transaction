const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { validateCredit } = require('../middleware/validateInput');
const { requireIdempotencyKey } = require('../middleware/idempotencyKey');

router.post('/:playerId/credit', requireIdempotencyKey, validateCredit, walletController.credit);
router.get('/:playerId', walletController.getWallet);

module.exports = router;