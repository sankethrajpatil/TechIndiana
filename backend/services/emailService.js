const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const RESOURCES = {
  counselor_toolkit: {
    subject: 'Your TechIndiana Counselor Toolkit',
    html: `
      <h2>TechIndiana Counselor Toolkit</h2>
      <ul>
        <li><a href="https://example.com/student-one-pager.pdf">Student One-Pager (PDF)</a></li>
        <li><a href="https://example.com/parent-letter.pdf">Parent Letter (PDF)</a></li>
        <li><a href="https://example.com/program-faq.pdf">Program FAQ (PDF)</a></li>
        <li><a href="https://example.com/academic-timeline.pdf">Academic Timeline (PDF)</a></li>
      </ul>
      <p>Thank you for supporting your students with TechIndiana!</p>
    `
  },
  parent_guide: {
    subject: "Your Parent's Guide to TechIndiana",
    html: `
      <h2>Parent's Guide to TechIndiana</h2>
      <ul>
        <li><a href="https://example.com/program-structure.pdf">Program Structure (PDF)</a></li>
        <li><a href="https://example.com/employer-directory.pdf">Employer Directory (PDF)</a></li>
        <li><a href="https://example.com/safety-standards.pdf">Safety Standards (PDF)</a></li>
        <li><a href="https://example.com/college-comparison.pdf">College Comparison (PDF)</a></li>
      </ul>
      <p>We look forward to partnering with your family!</p>
    `
  }
};

async function sendResourceEmail(userEmail, resourceType) {
  const resource = RESOURCES[resourceType];
  if (!resource) throw new Error('Invalid resource type');
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: resource.subject,
    html: resource.html
  });
}

module.exports = { sendResourceEmail };
