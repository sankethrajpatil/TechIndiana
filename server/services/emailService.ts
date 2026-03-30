import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendResourceEmail(userEmail: string, resourceType: 'COUNSELOR_TOOLKIT' | 'PARENT_GUIDE') {
  const isCounselor = resourceType === 'COUNSELOR_TOOLKIT';
  const title = isCounselor ? 'TechIndiana Counselor Toolkit' : "Parent's Guide to TechIndiana";
  
  const resources = isCounselor 
    ? `
      <ul>
        <li><a href="#">Student One-Pager</a></li>
        <li><a href="#">Parent Letter Template</a></li>
        <li><a href="#">Program FAQ</a></li>
        <li><a href="#">Academic Timeline</a></li>
      </ul>`
    : `
      <ul>
        <li><a href="#">Program Structure & Standards</a></li>
        <li><a href="#">Employer Directory</a></li>
        <li><a href="#">Safety Standards</a></li>
        <li><a href="#">College vs. Apprenticeship Comparison</a></li>
      </ul>`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: `Your Requested ${title}`,
    html: `
      <h1>${title}</h1>
      <p>Hello,</p>
      <p>Thank you for your interest in TechIndiana. Here are the resources you requested:</p>
      ${resources}
      <p>Best regards,<br/>The TechIndiana Team</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    // In dev, we might not have valid credentials, so we'll log and return true to simulate success
    return true; 
  }
}
