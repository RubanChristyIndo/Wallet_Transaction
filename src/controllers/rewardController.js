const rewardService = require('../services/rewardService');

async function claim(req, res, next) {
  try {
    const { rewardId } = req.params;
    const { playerId } = req.body;
    const result = await rewardService.claimReward({ rewardId, playerId });
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
}

module.exports = { claim };