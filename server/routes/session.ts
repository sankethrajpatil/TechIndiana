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
  service: 'gmail',
  auth: {
    user: "sanketh.r.p@campusuvce.in",
    pass: "bqoa bvut gtli cbxu",
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
    const rawName = profile.name || userRecord.displayName || 'Student';
    // Fix ALL-CAPS names: "PRAGATHI RAO" → "Pragathi Rao"
    const userName = rawName.replace(/\b\w+/g, (w: string) =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );

    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found in Firebase' });
    }

    // 3. Build conversation summary from history if not saved
    let conversationSummary = profile.conversation_summary || '';
    if (!conversationSummary && profile.conversation_history?.length) {
      const recent = profile.conversation_history.slice(-6);
      conversationSummary = recent
        .map(m => `<strong>${m.role === 'user' ? userName : 'Advisor'}:</strong> ${m.content}`)
        .join('<br/>');
    }

    // 4. Format Study Plan
    let formattedPlan = 'No study plan generated yet.';
    if (profile.study_plan) {
      try {
        const plan = JSON.parse(profile.study_plan);
        const titleHtml = plan.plan_title
          ? `<h4 style="color: #ea580c; margin: 0 0 10px;">${plan.plan_title}</h4>`
          : '';

        const skillsHtml = plan.missing_skills?.length
          ? `<p style="margin: 8px 0;"><strong>Skills to Develop:</strong></p>
             <ul style="margin: 4px 0;">${plan.missing_skills.map((s: string) => `<li>${s}</li>`).join('')}</ul>`
          : '';

        const milestonesHtml = plan.milestones?.length
          ? plan.milestones.map((m: any) => `
              <div style="background: #fff; padding: 10px; border-radius: 5px; margin: 8px 0; border-left: 3px solid #ea580c;">
                <strong>${m.topic}</strong> <span style="color: #888; font-size: 12px;">— ${m.date}</span>
                <ul style="margin: 4px 0;">${m.action_items?.map((a: string) => `<li>${a}</li>`).join('') || ''}</ul>
              </div>`).join('')
          : '';

        const videosHtml = plan.videos?.length
          ? `<p style="margin: 12px 0 8px;"><strong>Recommended Videos:</strong></p>
             ${plan.videos.map((v: any) => `
               <div style="display: flex; align-items: center; gap: 10px; margin: 6px 0;">
                 <img src="${v.thumbnail}" alt="" style="width: 60px; height: 45px; border-radius: 4px;" />
                 <a href="${v.url}" style="color: #ea580c; text-decoration: none;">${v.title}</a>
               </div>`).join('')}`
          : '';

        formattedPlan = titleHtml + skillsHtml + milestonesHtml + videosHtml;
      } catch (e) {
        formattedPlan = `<p>${profile.study_plan}</p>`;
      }
    }

    // 5. Format Email Content
    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #ea580c;">TechIndiana Session Summary</h2>
        <p>Hello ${userName},</p>
        <p>Thank you for your session with the TechIndiana AI Academic Advisor today. Here is a summary of your conversation and your personalized study plan.</p>
        
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        
        ${conversationSummary ? `
        <h3 style="color: #333;">Conversation Summary</h3>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; color: #555;">
          ${conversationSummary}
        </div>` : ''}
        
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
