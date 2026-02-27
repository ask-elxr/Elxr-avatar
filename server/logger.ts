import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  },
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

export function logExternalCall(
  service: string,
  operation: string,
  metadata?: Record<string, any>
) {
  return logger.child({
    service,
    operation,
    ...metadata,
  });
}
