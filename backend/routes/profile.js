const express = require('express');
const router = express.Router();
const UserProfile = require('../models/UserProfile');
const firebaseAuthMiddleware = require('../firebaseAdmin').firebaseAuthMiddleware;

// PUT /api/profile/plan
router.put('/plan', firebaseAuthMiddleware, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const { study_plan } = req.body;
    if (!study_plan) return res.status(400).json({ error: 'Missing study_plan' });
    const updated = await UserProfile.findOneAndUpdate(
      { firebaseUid },
      { $set: { study_plan } },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, study_plan: updated.study_plan });
  } catch (err) {
    console.error('Error saving study plan:', err);
    res.status(500).json({ error: 'Failed to save study plan' });
  }
});

module.exports = router;
