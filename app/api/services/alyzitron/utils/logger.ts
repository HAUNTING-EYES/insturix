import { NextRequest, NextResponse } from 'next/server';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  userId?: string;
  analysisId?: string;
  data?: any;
  code?: string;
  status?: string;
  type?: string;
  hasMetrics?: boolean;
  hasInsights?: boolean;
  _id?: any;
  attemptedUserId?: string;
  actualUserId?: string;
  filename?: string;
  path?: string;
  size?: number;
}

interface AnalysisRequestLog {
  analysisId: string;
  userId: string;
  action: string;
  status: string;
  data?: any;
}

// Only log at or above this level
const LOG_LEVEL: LogLevel = (process.env.NODE_ENV === 'production') ? 'error' : 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

export const logger = {
  debug: (message: string, data?: LogData) => {
    if (shouldLog('debug')) {
      console.log('[DEBUG]', {
        timestamp: new Date().toISOString(),
        message,
        ...data
      });
    }
  },
  
  info: (message: string, data?: LogData) => {
    if (shouldLog('info')) {
      console.log('[INFO]', {
        timestamp: new Date().toISOString(),
        message,
        ...data
      });
    }
  },
  
  warn: (message: string, data?: LogData) => {
    if (shouldLog('warn')) {
      console.warn('[WARN]', {
        timestamp: new Date().toISOString(),
        message,
        ...data
      });
    }
  },
  
  error: (message: string, data?: LogData) => {
    if (shouldLog('error')) {
      console.error('[ERROR]', {
        timestamp: new Date().toISOString(),
        message,
        ...data
      });
    }
  }
};

export function logAnalysisRequest(log: AnalysisRequestLog) {
  logger.debug('Analysis Request', log);
}

export function logError(context: string, error: unknown) {
  logger.error(context, {
    data: {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }
  });
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