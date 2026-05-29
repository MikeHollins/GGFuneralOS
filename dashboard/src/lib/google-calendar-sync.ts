import { getGoogleAccessToken, googleFetch } from './google-service-account';

export type FuneralCalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
  source: 'google-calendar';
};

type CalendarEventResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    start?: { date?: string; dateTime?: string; timeZone?: string };
    end?: { date?: string; dateTime?: string; timeZone?: string };
  }>;
};

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

function calendarConfigs() {
  const rawIds =
    process.env.GGFC_GOOGLE_CALENDAR_IDS ||
    process.env.GOOGLE_CALENDAR_IDS ||
    process.env.GGFC_GOOGLE_CALENDAR_ID ||
    process.env.GOOGLE_CALENDAR_ID ||
    '';

  return rawIds
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, label] = entry.split('|').map((part) => part.trim());
      return { id, label: label || 'Golden Gate Calendar' };
    });
}

export function googleCalendarUrl() {
  return process.env.GGFC_GOOGLE_CALENDAR_URL || process.env.GOOGLE_CALENDAR_URL || '';
}

export function hasGoogleCalendarConfig() {
  return calendarConfigs().length > 0;
}

function eventTime(value?: { date?: string; dateTime?: string }) {
  return value?.dateTime || (value?.date ? `${value.date}T00:00:00` : '');
}

function clampTimeRange(value: string | null, fallback: Date) {
  const parsed = value ? new Date(value) : fallback;
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export async function listGoogleCalendarEvents(startParam: string | null, endParam: string | null) {
  const calendars = calendarConfigs();
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
  const start = clampTimeRange(startParam, defaultStart);
  const end = clampTimeRange(endParam, defaultEnd);
  if (end <= start) throw new Error('Calendar end must be after start');

  if (!calendars.length) {
    return {
      configured: false,
      calendar_url: googleCalendarUrl(),
      events: [] as FuneralCalendarEvent[],
    };
  }

  const token = await getGoogleAccessToken(CALENDAR_SCOPE);
  const eventGroups = await Promise.all(calendars.map(async (calendar) => {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`);
    url.searchParams.set('timeMin', start.toISOString());
    url.searchParams.set('timeMax', end.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '2500');

    const response = await googleFetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    }, `Google Calendar read for ${calendar.label}`);

    if (!response.ok) {
      throw new Error(`Google Calendar read failed for ${calendar.label} with HTTP ${response.status}`);
    }

    const data = (await response.json()) as CalendarEventResponse;
    return (data.items ?? [])
      .map((event): FuneralCalendarEvent | null => {
        const startValue = eventTime(event.start);
        const endValue = eventTime(event.end);
        if (!event.id || !startValue) return null;
        return {
          id: `${calendar.id}:${event.id}`,
          calendarId: calendar.id,
          calendarName: calendar.label,
          title: event.summary || '(No title)',
          description: event.description || '',
          location: event.location || '',
          start: startValue,
          end: endValue,
          allDay: Boolean(event.start?.date && !event.start.dateTime),
          htmlLink: event.htmlLink || '',
          source: 'google-calendar',
        };
      })
      .filter((event): event is FuneralCalendarEvent => Boolean(event));
  }));

  return {
    configured: true,
    calendar_url: googleCalendarUrl(),
    events: eventGroups.flat().sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)),
  };
}
