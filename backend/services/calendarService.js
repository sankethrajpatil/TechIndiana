const { google } = require('googleapis');
const path = require('path');

// Set up Google Calendar API client
const calendar = google.calendar('v3');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID; // Set this in your .env

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: SCOPES,
});

async function createCalendarEvent(title, description, date, time, attendeeEmail) {
  const authClient = await auth.getClient();
  const eventStart = new Date(`${date}T${convertTo24Hour(time)}:00`);
  const eventEnd = new Date(eventStart.getTime() + 30 * 60000); // 30 min duration

  const event = {
    summary: title,
    description,
    start: { dateTime: eventStart.toISOString() },
    end: { dateTime: eventEnd.toISOString() },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
  };

  const response = await calendar.events.insert({
    auth: authClient,
    calendarId: CALENDAR_ID,
    resource: event,
  });
  return response.data.htmlLink;
}

// Helper to convert '10:00 AM' to '10:00' 24-hour format
function convertTo24Hour(timeStr) {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (modifier === 'PM' && hours !== '12') hours = String(Number(hours) + 12);
  if (modifier === 'AM' && hours === '12') hours = '00';
  return `${hours.padStart(2, '0')}:${minutes}`;
}

module.exports = { createCalendarEvent };
