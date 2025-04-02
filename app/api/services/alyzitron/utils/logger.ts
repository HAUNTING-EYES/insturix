import { NextRequest, NextResponse } from 'next/server';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: any;
}

// Environment variable to control debug logging
const ALYZITRON_DEBUG = process.env.ALYZITRON_DEBUG === 'true';

// Only log at or above this level
const LOG_LEVEL: LogLevel = ALYZITRON_DEBUG ? 'debug' : 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatLog(level: LogLevel, message: string, data?: LogData): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'alyzitron',
    message,
    ...data
  }, null, 2);
}

export const logger = {
  debug: (message: string, data?: LogData) => {
    if (shouldLog('debug')) {
      console.log('[DEBUG]', formatLog('debug', message, data));
    }
  },
  
  info: (message: string, data?: LogData) => {
    if (shouldLog('info')) {
      console.log('[INFO]', formatLog('info', message, data));
    }
  },
  
  warn: (message: string, data?: LogData) => {
    if (shouldLog('warn')) {
      console.warn('[WARN]', formatLog('warn', message, data));
    }
  },
  
  error: (message: string, data?: LogData) => {
    if (shouldLog('error')) {
      console.error('[ERROR]', formatLog('error', message, data));
    }
  }
};

// Helper for error logging
export function logError(context: string, error: unknown) {
  logger.error(`Error in ${context}`, {
    data: {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }
  });
}

// Helper for logging callback data
export function logCallback(data: any) {
  if (ALYZITRON_DEBUG) {
    logger.debug('Received callback data', {
      data: {
        taskId: data.task_id,
        status: data.results?.status,
        success: data.results?.success,
        error: data.results?.error,
        ...(data.results?.data && { hasData: true })
      },
      rawData: data // Log full data in debug mode
    });
  } else {
    logger.info('Received callback', {
      data: {
        taskId: data.task_id,
        status: data.results?.status,
        success: data.results?.success
      }
    });
  }
}

type RouteHandler = (req: NextRequest, ...args: any[]) => Promise<NextResponse>;

export function withLogging(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ...args: any[]) => {
    const start = Date.now();
    const method = req.method;
    const url = req.url;

    try {
      logger.debug(`${method} ${url} - Started`);
      const response = await handler(req, ...args);
      const duration = Date.now() - start;
      
      if (!response.ok) {
        logger.warn(`${method} ${url} - Failed`, {
          data: {
            status: response.status,
            duration: `${duration}ms`
          }
        });
      } else {
        logger.debug(`${method} ${url} - Completed`, {
          data: {
            status: response.status,
            duration: `${duration}ms`
          }
        });
      }
      
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`${method} ${url} - Error`, {
        data: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          duration: `${duration}ms`
        }
      });
      throw error;
    }
  };
}