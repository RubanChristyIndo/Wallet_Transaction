const express = require('express');
const router = express.Router();
const rewardController = require('../controllers/rewardController');
const { validateClaim } = require('../middleware/validateInput');

router.post('/:rewardId/claim', validateClaim, rewardController.claim);

module.exports = router;