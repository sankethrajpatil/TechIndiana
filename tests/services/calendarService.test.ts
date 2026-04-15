import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock references are available during vi.mock hoisting
const { insertFn } = vi.hoisted(() => ({
  insertFn: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: function() { return {}; },
    },
    calendar: vi.fn().mockReturnValue({
      events: { insert: insertFn },
    }),
  },
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

import { createCalendarEvent } from '../../server/services/calendarService';

describe('calendarService - createCalendarEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an event and return the HTML link', async () => {
    insertFn.mockResolvedValue({
      data: { htmlLink: 'https://calendar.google.com/calendar/event?id=abc' },
    });

    const link = await createCalendarEvent(
      'Test Meeting',
      'Discussion about apprenticeships',
      '2026-04-15',
      '10:00 AM',
      'test@example.com'
    );

    expect(link).toBe('https://calendar.google.com/calendar/event?id=abc');
    expect(insertFn).toHaveBeenCalledOnce();

    const callArgs = insertFn.mock.calls[0][0];
    expect(callArgs.calendarId).toBe('primary');
    expect(callArgs.requestBody.summary).toBe('Test Meeting');
    expect(callArgs.requestBody.description).toBe('Discussion about apprenticeships');
    expect(callArgs.requestBody.attendees).toEqual([{ email: 'test@example.com' }]);
  });

  it('should create event without attendees when no email is provided', async () => {
    insertFn.mockResolvedValue({
      data: { htmlLink: 'https://calendar.google.com/calendar/event?id=xyz' },
    });

    const link = await createCalendarEvent(
      'Solo Meeting',
      'Just me',
      '2026-04-20',
      '2:00 PM'
    );

    expect(link).toBe('https://calendar.google.com/calendar/event?id=xyz');
    const callArgs = insertFn.mock.calls[0][0];
    expect(callArgs.requestBody.attendees).toEqual([]);
  });

  it('should set end time to 30 minutes after start time', async () => {
    insertFn.mockResolvedValue({
      data: { htmlLink: 'https://calendar.google.com' },
    });

    await createCalendarEvent('Test', 'Desc', '2026-04-15', '10:00 AM');

    const callArgs = insertFn.mock.calls[0][0];
    const start = new Date(callArgs.requestBody.start.dateTime);
    const end = new Date(callArgs.requestBody.end.dateTime);
    expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000);
  });

  it('should set timezone to America/New_York (Indiana)', async () => {
    insertFn.mockResolvedValue({
      data: { htmlLink: 'https://calendar.google.com' },
    });

    await createCalendarEvent('Test', 'Desc', '2026-04-15', '10:00 AM');

    const callArgs = insertFn.mock.calls[0][0];
    expect(callArgs.requestBody.start.timeZone).toBe('America/New_York');
    expect(callArgs.requestBody.end.timeZone).toBe('America/New_York');
  });

  it('should return a mock fallback link on error', async () => {
    insertFn.mockRejectedValue(new Error('Auth failed'));

    const link = await createCalendarEvent(
      'Failed Meeting',
      'This will fail',
      '2026-04-15',
      '10:00 AM'
    );

    expect(link).toContain('https://calendar.google.com/calendar/r/eventedit');
    expect(link).toContain(encodeURIComponent('Failed Meeting'));
  });
});
