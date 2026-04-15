import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock is available during vi.mock hoisting
const { sendMailMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: sendMailMock,
    }),
  },
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

import { sendResourceEmail } from '../../server/services/emailService';

describe('emailService - sendResourceEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send a counselor toolkit email with correct subject and resources', async () => {
    sendMailMock.mockResolvedValue({ response: '250 OK' });

    const result = await sendResourceEmail('counselor@school.edu', 'COUNSELOR_TOOLKIT');

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();

    const mailOptions = sendMailMock.mock.calls[0][0];
    expect(mailOptions.to).toBe('counselor@school.edu');
    expect(mailOptions.subject).toContain('Counselor Toolkit');
    expect(mailOptions.html).toContain('Student One-Pager');
    expect(mailOptions.html).toContain('Parent Letter Template');
    expect(mailOptions.html).toContain('Program FAQ');
    expect(mailOptions.html).toContain('Academic Timeline');
  });

  it('should send a parent guide email with correct subject and resources', async () => {
    sendMailMock.mockResolvedValue({ response: '250 OK' });

    const result = await sendResourceEmail('parent@email.com', 'PARENT_GUIDE');

    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();

    const mailOptions = sendMailMock.mock.calls[0][0];
    expect(mailOptions.to).toBe('parent@email.com');
    expect(mailOptions.subject).toContain("Parent's Guide");
    expect(mailOptions.html).toContain('Program Structure & Standards');
    expect(mailOptions.html).toContain('Employer Directory');
    expect(mailOptions.html).toContain('Safety Standards');
    expect(mailOptions.html).toContain('College vs. Apprenticeship Comparison');
  });

  it('should return true even when sendMail fails (dev fallback)', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection failed'));

    const result = await sendResourceEmail('test@test.com', 'COUNSELOR_TOOLKIT');
    expect(result).toBe(true);
  });

  it('should include greeting and TechIndiana branding in all emails', async () => {
    sendMailMock.mockResolvedValue({ response: '250 OK' });

    await sendResourceEmail('user@test.com', 'PARENT_GUIDE');

    const mailOptions = sendMailMock.mock.calls[0][0];
    expect(mailOptions.html).toContain('Hello');
    expect(mailOptions.html).toContain('TechIndiana');
    expect(mailOptions.html).toContain('Best regards');
  });
});
