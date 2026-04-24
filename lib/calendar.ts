import { google } from 'googleapis';

/**
 * Enterprise Google Calendar Service Module
 * Strictly limits the Googleapis heavy package to this file to prevent webhook bloat.
 */

export class CalendarService {
  /**
   * Hydrates the Google Calendar OAuth2 client natively from the specific User data payload.
   */
  private hydrate(dbUser: any) {
    if (!dbUser.googleRefreshToken) {
      throw new Error("[CALENDAR SERVICE] Google Authentication securely missing from User data payload.");
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar/oauth`
    );
    
    oauth2Client.setCredentials({ refresh_token: dbUser.googleRefreshToken });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Mathematically calculates free/busy constraints dynamically against the target calendar.
   */
  async checkAvailability(dbUser: any, args: any): Promise<string> {
    const calendar = this.hydrate(dbUser);
    const timeMin = args.startDate ? new Date(args.startDate).toISOString() : new Date().toISOString();
    
    const endLimit = new Date();
    endLimit.setDate(endLimit.getDate() + 5);
    const timeMax = args.endDate ? new Date(args.endDate).toISOString() : endLimit.toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      return `The calendar is physically fundamentally wide open from ${timeMin} to ${timeMax}.`;
    }

    const busySlots = events.map((e: any) => {
      const start = e.start.dateTime || e.start.date;
      const end = e.end.dateTime || e.end.date;
      return `Busy from ${start} to ${end}.`;
    }).join(' ');

    return `Here are the exact physical booked slots: ${busySlots}. Please exclusively offer explicitly available times outside of these windows.`;
  }

  /**
   * Injects the requested appointment physically into the target calendar securely.
   */
  async bookAppointment(dbUser: any, args: any): Promise<string> {
    const calendar = this.hydrate(dbUser);
    const { name, phone, startTime, endTime } = args;

    if (!startTime || !endTime) {
      throw new Error('[CALENDAR SERVICE] Logic rejection: Missing strict bounds.');
    }

    const event = {
      summary: `Phone Appointment: ${name || 'Prospective Lead'}`,
      description: `Automated booking securely sourced natively via AI Pilots Voice Agent.\nPhone: ${phone || 'Unknown'}`,
      start: { dateTime: new Date(startTime).toISOString() },
      end: { dateTime: new Date(endTime).toISOString() },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    if (response.data.id) {
      return 'The appointment was successfully physically mathematically booked onto the Calendar DOM. Aggressively verbally confirm this explicit success to the caller.';
    } else {
      throw new Error('[CALENDAR SERVICE] Google refused generic physical insertion.');
    }
  }
}
