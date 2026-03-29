const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  name: String,
  background: String,
  expectations: String,
  study_plan: String
});

module.exports = mongoose.model('UserProfile', userProfileSchema);
