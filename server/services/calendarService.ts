import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Creates a Google Calendar event.
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable 
 * to point to a valid service account JSON file.
 */
export async function createCalendarEvent(
  title: string,
  description: string,
  date: string, // YYYY-MM-DD
  time: string, // "10:00 AM" (flexible format)
  attendeeEmail?: string
) {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    
    // Simple date/time parsing
    // In a production app, use a more robust library like luxon or date-fns
    const startDateTime = new Date(`${date} ${time}`);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000); // 30 minutes later

    const event = {
      summary: title,
      description: description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/New_York', // Default to Indiana time
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return response.data.htmlLink;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    // For local dev without actual credentials, return a mock link
    return `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(title)}`;
  }
}
