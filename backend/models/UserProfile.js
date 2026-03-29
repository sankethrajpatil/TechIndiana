const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: String,
  persona_type: String, // e.g., student, adult, employer
  background: String,
  expectations: String,
  study_plan: String
});

module.exports = mongoose.model('UserProfile', userProfileSchema);
