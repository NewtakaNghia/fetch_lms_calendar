import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { transformMoodleCalendar } from './utils/ics-parser';

const app = express();
const PORT = process.env.PORT || 3000;

// Moodle calendar export URL (from environment variable)
const MOODLE_CALENDAR_URL =
  process.env.MOODLE_CALENDAR_URL ||
  'https://lms.hcmut.edu.vn/calendar/export.php';

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Main proxy endpoint: Fetch Moodle calendar and return with transformed events
 */
app.get('/calendar.ics', async (req: Request, res: Response) => {
  try {
    console.log(
      `[${new Date().toISOString()}] Fetching calendar from: ${MOODLE_CALENDAR_URL}`
    );

    // Fetch and transform the calendar
    const transformedICS = await transformMoodleCalendar(MOODLE_CALENDAR_URL);

    // Set appropriate headers
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send the transformed calendar
    res.send(transformedICS);

    console.log(
      `[${new Date().toISOString()}] Calendar sent successfully (${transformedICS.length} bytes)`
    );
  } catch (error) {
    console.error('Error in /calendar.ics:', error);

    // Return error response
    res.status(500).json({
      error: 'Failed to fetch or transform calendar',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    message: 'Use GET /calendar.ics to fetch the transformed calendar',
  });
});

/**
 * Error handler middleware
 */
app.use(
  (err: Error, req: Request, res: Response, next: NextFunction): void => {
    console.error('Unhandled error:', err);

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
);

// Start server
// app.listen(PORT, () => {
//   console.log(`🚀 Moodle ICS Proxy Server running on port ${PORT}`);
//   console.log(`📅 Calendar endpoint: http://localhost:${PORT}/calendar.ics`);
//   console.log(`🏥 Health check: http://localhost:${PORT}/health`);
//   console.log(`📖 Moodle URL: ${MOODLE_CALENDAR_URL}`);
// });

export default app;
