const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const UserProfile = require('../models/UserProfile');
const firebaseAuthMiddleware = require('../firebaseAdmin').firebaseAuthMiddleware;

// Nodemailer transporter setup (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Set in env
    pass: process.env.EMAIL_PASS  // Set in env
  }
});

// POST /api/session/end
router.post('/end', firebaseAuthMiddleware, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    // Get user profile from MongoDB
    const userProfile = await UserProfile.findOne({ firebaseUid });
    if (!userProfile) return res.status(404).json({ error: 'User profile not found' });

    // Get user email from Firebase Auth if not in DB
    let userEmail = userProfile.email;
    let userName = userProfile.name || 'User';
    if (!userEmail) {
      const userRecord = await admin.auth().getUser(firebaseUid);
      userEmail = userRecord.email;
    }

    // Compose email
    const html = `
      <h2>Thank you, ${userName}!</h2>
      <p>Here is a summary of your recent session with TechIndiana:</p>
      <h3>Conversation Summary</h3>
      <p>${userProfile.conversation_summary || 'No summary available.'}</p>
      <h3>Your Study Plan</h3>
      <p>${userProfile.study_plan || 'No study plan available.'}</p>
      <p>Best wishes,<br/>TechIndiana Team</p>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: [userEmail, 'patil232@purdue.edu'],
      subject: 'Your TechIndiana Session Summary & Study Plan',
      html
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ message: 'Summary emailed successfully.' });
  } catch (err) {
    console.error('Error in /api/session/end:', err);
    return res.status(500).json({ error: 'Failed to send summary email.' });
  }
});

module.exports = router;
