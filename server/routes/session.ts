import express from 'express';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import UserProfile from '../../src/models/UserProfile';
import { firebaseAuthMiddleware } from '../../src/middleware/auth';

const router = express.Router();

// --- Nodemailer Setup ---
// NOTE: For production, use environment variables for credentials.
// For testing, you can use Ethereal or a Gmail App Password.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Test transporter connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('NODEMAILER ERROR: Transporter verification failed:', error);
    console.error('DEBUG: EMAIL_USER check:', process.env.EMAIL_USER ? 'Present' : 'Missing');
    // Don't log the actual pass for security, just presence
    console.error('DEBUG: EMAIL_PASS check:', process.env.EMAIL_PASS ? 'Present' : 'Missing');
  } else {
    console.log('NODEMAILER SUCCESS: Email server is ready');
  }
});

router.post('/end', firebaseAuthMiddleware, async (req: any, res) => {
  const firebaseUid = req.uid;
  if (!firebaseUid) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Fetch user profile from MongoDB
    const profile = await UserProfile.findOne({ firebaseUid });
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // 2. Get user email from Firebase Auth (if not in DB)
    const userRecord = await admin.auth().getUser(firebaseUid);
    const userEmail = userRecord.email;
    const userName = profile.name || userRecord.displayName || 'Student';

    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found in Firebase' });
    }

    // 3. Format Study Plan
    let formattedPlan = 'No study plan generated yet.';
    if (profile.study_plan) {
      try {
        const plan = JSON.parse(profile.study_plan);
        formattedPlan = `
          <h3>${plan.plan_title}</h3>
          <ul>
            ${plan.action_items.map((item: string) => `<li>${item}</li>`).join('')}
          </ul>
        `;
      } catch (e) {
        formattedPlan = `<p>${profile.study_plan}</p>`;
      }
    }

    // 4. Format Email Content
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #ea580c;">TechIndiana Session Summary</h2>
        <p>Hello ${userName},</p>
        <p>Thank you for your session with the TechIndiana AI Academic Advisor today. Here is a summary of your conversation and your personalized study plan.</p>
        
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        
        <h3 style="color: #333;">Conversation Summary</h3>
        <p style="background: #f9f9f9; padding: 15px; border-radius: 5px; color: #555;">
          ${profile.conversation_summary || 'No summary available for this session.'}
        </p>
        
        <h3 style="color: #333;">Your TechIndiana Study Plan</h3>
        <div style="background: #fff7ed; padding: 15px; border: 1px solid #fed7aa; border-radius: 5px;">
          ${formattedPlan}
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          This is an automated summary from your TechIndiana AI Advisor. Good luck with your studies!
        </p>
      </div>
    `;

    // 5. Send Emails
    const mailOptions = {
      from: `"TechIndiana Advisor" <${process.env.EMAIL_USER}>`,
      to: [userEmail, 'patil232@purdue.edu'],
      subject: `Your TechIndiana Study Plan & Session Summary`,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, message: 'Session ended and summary emailed.' });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Failed to end session and send email.' });
  }
});

export default router;
