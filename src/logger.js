import pino from 'pino';
import { createWriteStream } from 'fs';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Get log file path from environment or use default
const logFilePath = process.env.AMGN_LOGFILE || 'alarmageddon.log';

// Base logger configuration
const baseConfig = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'alarmageddon',
    version: '0.1.0',
    env: process.env.NODE_ENV || 'development'
  }
};

// Create streams array with proper level configuration
const streams = [
  // Always log to file in JSON format
  {
    level: baseConfig.level,
    stream: createWriteStream(logFilePath, { flags: 'a' })
  }
];

// Add console output in development
if (isDevelopment) {
  streams.push({
    level: baseConfig.level,
    stream: pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: true
      }
    })
  });
}

// Create logger with multistream
const logger = pino(baseConfig, pino.multistream(streams));

export default logger;