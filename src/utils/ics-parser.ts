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
 * Parsed course info extracted from CATEGORIES field.
 * CATEGORIES format from HCMUT Moodle: VIDEO_CO2017_VI, VIDEO_SP1007_VI, etc.
 */
export interface CourseInfo {
  /** Raw course code, e.g. "CO2017" */
  courseCode: string;
  /** Course type prefix, e.g. "VIDEO" */
  courseType: string;
  /** Language/section suffix, e.g. "VI" */
  courseSuffix: string;
  /** Full raw CATEGORIES value */
  raw: string;
}

/**
 * Structured representation of a parsed VEVENT from Moodle ICS.
 */
export interface ParsedMoodleEvent {
  uid: string;
  /** Clean event title, stripped of trailing "kết thúc" and similar suffixes */
  title: string;
  /** Raw SUMMARY value (unmodified) */
  rawSummary: string;
  /** Human-readable plain-text description (line-folding & escape sequences resolved) */
  description: string;
  /** True if description has meaningful content */
  hasDescription: boolean;
  /** Parsed course information from CATEGORIES */
  course: CourseInfo | null;
  /** ISO 8601 start date-time string */
  dtstart: string;
  /** ISO 8601 end date-time string */
  dtend: string;
  /** ISO 8601 stamp date-time string */
  dtstamp: string;
  /** Last modified ISO 8601 string */
  lastModified: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Unfold RFC 5545 line-folded content.
 * Lines that are continued start with a SPACE or TAB after CRLF.
 */
function unfoldLines(raw: string): string {
  // Replace CRLF + (SPACE | TAB) with empty string (join continuation lines)
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/**
 * Resolve ICS-escaped sequences inside a property value.
 * ICS uses backslash escaping: \n → newline, \, → comma, \; → semicolon, \\ → backslash
 */
function resolveEscapes(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse a single property line into { name, value }.
 * Handles parameter syntax (e.g. DTSTART;TZID=...:value) by ignoring parameters.
 */
function parsePropLine(line: string): { name: string; value: string } | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const namePart = line.substring(0, colonIdx);
  const value = line.substring(colonIdx + 1);
  // Strip parameters (e.g. DTSTART;TZID=Asia/Ho_Chi_Minh → DTSTART)
  const name = namePart.split(';')[0].trim().toUpperCase();
  return { name, value };
}

/**
 * Parse CATEGORIES field to extract structured course info.
 * Expected format: VIDEO_CO2017_VI  →  type=VIDEO, code=CO2017, suffix=VI
 * Falls back gracefully for unexpected formats.
 */
function parseCourseInfo(categories: string): CourseInfo | null {
  if (!categories) return null;
  const raw = categories.trim();

  // Pattern: WORD_ALPHANUM_WORD  e.g.  VIDEO_CO2017_VI
  const match = raw.match(/^([A-Z]+)_([A-Z]{2}\d{4,})_([A-Z]+)$/i);
  if (match) {
    return {
      courseType: match[1].toUpperCase(),
      courseCode: match[2].toUpperCase(),
      courseSuffix: match[3].toUpperCase(),
      raw,
    };
  }

  // Fallback: try to extract any code-like segment (letters + digits)
  const codeMatch = raw.match(/([A-Z]{2,}\d{3,})/i);
  return {
    courseType: '',
    courseCode: codeMatch ? codeMatch[1].toUpperCase() : raw,
    courseSuffix: '',
    raw,
  };
}

/**
 * Clean a SUMMARY value:
 * - Remove common Moodle suffixes like " kết thúc", " closes", " ends"
 * - Trim whitespace
 */
function cleanSummary(summary: string): string {
  return summary
    .replace(/\s+kết thúc\s*$/i, '')
    .replace(/\s+closes\s*$/i, '')
    .replace(/\s+ends\s*$/i, '')
    .trim();
}

/**
 * Clean and normalise a DESCRIPTION value:
 * - Resolve ICS escape sequences (\n, \, etc.)
 * - Collapse excessive blank lines (max 1 blank line in a row)
 * - Strip tabs and leading/trailing whitespace from each line
 * - Return empty string if description has no meaningful content
 */
function cleanDescription(raw: string): string {
  const resolved = resolveEscapes(raw);
  const lines = resolved.split('\n').map((l) => l.replace(/^\t+/, '').trimEnd());
  // Remove leading/trailing blank lines; collapse multiple blank lines to one
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun++;
      if (blankRun <= 1) collapsed.push('');
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }
  return collapsed.join('\n').trim();
}

/**
 * Extract course name from description or summary (original heuristic — kept for compatibility).
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

// ---------------------------------------------------------------------------
// Public API — original function signatures preserved
// ---------------------------------------------------------------------------

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
 * Parse ICS content and extract raw event blocks.
 * Returns array of event lines grouped by BEGIN:VEVENT...END:VEVENT.
 */
export function parseICSContent(icsContent: string): {
  header: string;
  events: string[];
  footer: string;
} {
  // Unfold continuation lines first (RFC 5545 §3.1)
  const unfolded = unfoldLines(icsContent);
  const lines = unfolded.split('\n');

  const header: string[] = [];
  const events: string[] = [];
  const footer: string[] = [];

  let currentEvent: string[] = [];
  let inEvent = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.includes('BEGIN:VEVENT')) {
      inEvent = true;
      currentEvent = [trimmed];
    } else if (trimmed.includes('END:VEVENT')) {
      currentEvent.push(trimmed);
      events.push(currentEvent.join('\n'));
      currentEvent = [];
      inEvent = false;
    } else if (inEvent) {
      currentEvent.push(trimmed);
    } else if (events.length === 0) {
      header.push(trimmed);
    } else {
      footer.push(trimmed);
    }
  }

  return {
    header: header.join('\n'),
    events,
    footer: footer.join('\n'),
  };
}

/**
 * Fold a long ICS property value to comply with RFC 5545 §3.1 (max 75 octets per line).
 * Continuation lines start with a single SPACE.
 */
function foldLine(line: string): string {
  // Work in bytes to respect the 75-octet limit
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const result: string[] = [];
  let offset = 0;
  let first = true;

  while (offset < bytes.length) {
    const limit = first ? 75 : 74; // continuation lines lose 1 byte for the leading SPACE
    let end = offset + limit;
    if (end >= bytes.length) {
      result.push((first ? '' : ' ') + decoder.decode(bytes.slice(offset)));
      break;
    }
    // Don't split in the middle of a multi-byte UTF-8 sequence
    while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
    result.push((first ? '' : ' ') + decoder.decode(bytes.slice(offset, end)));
    offset = end;
    first = false;
  }

  return result.join('\r\n');
}

/**
 * Escape a plain-text string for use as an ICS property value.
 * Per RFC 5545: backslash, semicolon, comma must be escaped; newlines become \n.
 */
function escapeICSValue(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Build the DESCRIPTION block that Google Calendar will show in the event detail.
 *
 * Layout (all sections are optional — only emitted when data exists):
 *
 *   📚 Môn học: CO2017
 *   ──────────────────
 *   <original description content>
 *   ──────────────────
 *   🏷️ Danh mục: VIDEO_CO2017_VI
 */
function buildEnrichedDescription(
  course: CourseInfo | null,
  cleanDesc: string,
): string {
  const sections: string[] = [];

  // --- Header block: course metadata ---
  if (course?.courseCode) {
    const meta: string[] = [];
    meta.push(`📚 Môn học: ${course.courseCode}`);
    sections.push(meta.join('\n'));
  }

  // --- Separator + original description ---
  if (cleanDesc) {
    if (sections.length > 0) sections.push('──────────────────');
    sections.push(cleanDesc);
  }

  // --- Footer: raw category tag ---
  if (course?.raw) {
    sections.push('──────────────────');
    sections.push(`🏷️ Danh mục: ${course.raw}`);
  }

  return sections.join('\n');
}

/**
 * Process a single raw event block:
 * - Extracts course code from CATEGORIES (e.g. VIDEO_CO2017_VI → CO2017)
 * - Cleans SUMMARY: removes trailing "kết thúc" / "closes" / "ends",
 *   then prepends [COURSE_CODE] so Google Calendar shows it in the title
 * - Rewrites DESCRIPTION with a structured block containing course code,
 *   the original description text, and the raw category — all visible in
 *   Google Calendar's event detail popup
 * - Keeps X- custom properties for any downstream client that reads them
 */
export function processEvent(eventICS: string): string {
  const lines = eventICS.split('\n');
  const props: Record<string, string> = {};
  const lineMap: Record<string, number> = {};

  // Parse all property lines, recording the first occurrence of each name
  for (let i = 0; i < lines.length; i++) {
    const parsed = parsePropLine(lines[i]);
    if (parsed && lineMap[parsed.name] === undefined) {
      props[parsed.name] = parsed.value;
      lineMap[parsed.name] = i;
    }
  }

  const rawSummary    = props['SUMMARY']     || '';
  const rawDescription = props['DESCRIPTION'] || '';
  const rawCategories  = props['CATEGORIES']  || '';

  const course     = parseCourseInfo(rawCategories);
  const cleanTitle = cleanSummary(rawSummary);
  const cleanDesc  = cleanDescription(rawDescription);

  const result = [...lines];

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  // Format: "[CO2017] Quiz 9.1"  — visible as the event title in Google Cal
  const summaryIdx = lineMap['SUMMARY'];
  if (summaryIdx !== undefined) {
    const prefix    = course?.courseCode ? `[${course.courseCode}] ` : '';
    const newSummary = prefix + cleanTitle;
    result[summaryIdx] = foldLine(`SUMMARY:${newSummary}`);
  }

  // ── DESCRIPTION ──────────────────────────────────────────────────────────
  // Build a human-readable block; embed it as the ICS DESCRIPTION value so
  // Google Calendar displays it in the event detail panel.
  const descIdx = lineMap['DESCRIPTION'];
  const enrichedDesc = buildEnrichedDescription(course, cleanDesc);

  if (descIdx !== undefined) {
    // Replace the existing DESCRIPTION line (already unfolded) with the
    // new enriched content, properly escaped and re-folded.
    if (enrichedDesc) {
      result[descIdx] = foldLine(`DESCRIPTION:${escapeICSValue(enrichedDesc)}`);
    } else {
      result[descIdx] = 'DESCRIPTION:';
    }
  } else if (enrichedDesc) {
    // No DESCRIPTION line existed — insert one before END:VEVENT
    const endIdx = result.findIndex((l) => l.trim() === 'END:VEVENT');
    if (endIdx !== -1) {
      result.splice(endIdx, 0, foldLine(`DESCRIPTION:${escapeICSValue(enrichedDesc)}`));
    }
  }

  // ── X- properties ────────────────────────────────────────────────────────
  // Kept for clients that understand custom ICS properties (e.g. custom apps).
  const customProps: string[] = [];
  if (course?.courseCode)  customProps.push(`X-COURSE-CODE:${course.courseCode}`);
  if (course?.raw)         customProps.push(`X-COURSE-CATEGORY:${course.raw}`);
  if (cleanTitle !== rawSummary.replace(/\s+kết thúc\s*$/i, '').trim())
    customProps.push(`X-EVENT-TITLE:${cleanTitle}`);
  customProps.push(`X-HAS-DESCRIPTION:${cleanDesc ? 'TRUE' : 'FALSE'}`);

  const endIdx = result.findIndex((l) => l.trim() === 'END:VEVENT');
  if (endIdx !== -1 && customProps.length > 0) {
    result.splice(endIdx, 0, ...customProps);
  }

  return result.join('\r\n');
}

/**
 * Process all events in ICS content.
 * Applies line-unfolding, course-code extraction, summary cleaning,
 * and description normalisation to every VEVENT.
 */
export function processAllEvents(icsContent: string): string {
  const { header, events, footer } = parseICSContent(icsContent);

  const processedEvents = events.map((event) => processEvent(event));

  return [header, ...processedEvents, footer].join('\n');
}

/**
 * Parse a single VEVENT block into a strongly-typed ParsedMoodleEvent.
 * Useful for consuming event data in application code without regex juggling.
 */
export function parseSingleEvent(eventICS: string): ParsedMoodleEvent {
  const unfolded = unfoldLines(eventICS);
  const lines = unfolded.split('\n');
  const props: Record<string, string> = {};

  for (const line of lines) {
    const parsed = parsePropLine(line);
    if (parsed && props[parsed.name] === undefined) {
      props[parsed.name] = parsed.value;
    }
  }

  const rawSummary = props['SUMMARY'] || '';
  const rawDescription = props['DESCRIPTION'] || '';
  const rawCategories = props['CATEGORIES'] || '';

  const course = parseCourseInfo(rawCategories);
  const description = cleanDescription(rawDescription);

  return {
    uid: props['UID'] || '',
    title: cleanSummary(rawSummary),
    rawSummary,
    description,
    hasDescription: description.length > 0,
    course,
    dtstart: props['DTSTART'] || '',
    dtend: props['DTEND'] || '',
    dtstamp: props['DTSTAMP'] || '',
    lastModified: props['LAST-MODIFIED'] || '',
  };
}

/**
 * Parse all events in ICS content into structured ParsedMoodleEvent objects.
 * Convenient for building UI, filtering by course, sorting by date, etc.
 */
export function parseAllEvents(icsContent: string): ParsedMoodleEvent[] {
  const { events } = parseICSContent(icsContent);
  return events.map((e) => parseSingleEvent(e));
}

/**
 * Main function: Fetch Moodle ICS, process it, and return modified ICS content.
 * (Original behaviour preserved — cleans summaries and adds X- properties.)
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