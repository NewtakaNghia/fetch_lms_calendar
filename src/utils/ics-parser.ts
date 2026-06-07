import axios from 'axios';

export interface MoodleEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtend: string;
  dtstamp: string;
  [key: string]: any;
}

/**
 * Extract course name from description or summary
 * Common patterns:
 * - First line of description
 * - Text before dash or colon
 * - Bracketed text like [Course Name]
 */
function extractCourseName(description: string, summary: string): string | null {
  if (!description && !summary) return null;

  const text = description || summary;

  // Try pattern: [Course Name]
  const bracketMatch = text.match(/\[([^\]]+)\]/);
  if (bracketMatch) return bracketMatch[1].trim();

  // Try pattern: Course Name - or Course Name :
  const dashMatch = text.match(/^([^-:\n]+)[\s]*[-:]/);
  if (dashMatch) return dashMatch[1].trim();

  // Try first line
  const firstLine = text.split('\n')[0].trim();
  if (firstLine && firstLine.length < 100) {
    return firstLine;
  }

  return null;
}

/**
 * Fetch raw ICS content from Moodle
 */
export async function fetchMoodleICS(calendarUrl: string): Promise<string> {
  try {
    const response = await axios.get(calendarUrl, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching Moodle ICS:', error);
    throw new Error('Failed to fetch Moodle calendar');
  }
}

/**
 * Parse ICS content and extract events
 * Returns array of event lines grouped by BEGIN:VEVENT...END:VEVENT
 */
export function parseICSContent(icsContent: string): {
  header: string;
  events: string[];
  footer: string;
} {
  const lines = icsContent.split('\n');

  const header: string[] = [];
  const events: string[] = [];
  const footer: string[] = [];

  let currentEvent: string[] = [];
  let inEvent = false;

  for (const line of lines) {
    if (line.includes('BEGIN:VEVENT')) {
      inEvent = true;
      currentEvent = [line];
    } else if (line.includes('END:VEVENT')) {
      currentEvent.push(line);
      events.push(currentEvent.join('\n'));
      currentEvent = [];
      inEvent = false;
    } else if (inEvent) {
      currentEvent.push(line);
    } else if (events.length === 0) {
      header.push(line);
    } else {
      footer.push(line);
    }
  }

  return {
    header: header.join('\n'),
    events,
    footer: footer.join('\n'),
  };
}

/**
 * Process a single event: extract course name and prepend to SUMMARY
 */
export function processEvent(eventICS: string): string {
  let lines = eventICS.split('\n');
  let summaryLine = -1;
  let descriptionLine = -1;
  let description = '';
  let summary = '';

  // Find SUMMARY and DESCRIPTION lines
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('SUMMARY:')) {
      summaryLine = i;
      summary = lines[i].substring('SUMMARY:'.length);
    }
    if (lines[i].startsWith('DESCRIPTION:')) {
      descriptionLine = i;
      description = lines[i].substring('DESCRIPTION:'.length);
    }
  }

  // Extract course name
  const courseName = extractCourseName(description, summary);

  // Prepend course name to SUMMARY if found
  if (courseName && summaryLine !== -1 && !summary.startsWith(courseName)) {
    lines[summaryLine] = `SUMMARY:${courseName} - ${summary}`;
  }

  return lines.join('\n');
}

/**
 * Process all events in ICS content
 */
export function processAllEvents(icsContent: string): string {
  const { header, events, footer } = parseICSContent(icsContent);

  const processedEvents = events.map((event) => processEvent(event));

  return [header, ...processedEvents, footer].join('\n');
}

/**
 * Main function: Fetch Moodle ICS, process it, and return modified content
 */
export async function transformMoodleCalendar(
  moodleCalendarUrl: string
): Promise<string> {
  try {
    const rawICS = await fetchMoodleICS(moodleCalendarUrl);
    const processedICS = processAllEvents(rawICS);
    return processedICS;
  } catch (error) {
    console.error('Error transforming Moodle calendar:', error);
    throw error;
  }
}
