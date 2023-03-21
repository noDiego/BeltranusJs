import *  as  winston from 'winston';
import 'winston-daily-rotate-file';
import {getCLStringDate} from "./utils";

const dailyRotateFile = new (winston.transports.DailyRotateFile)({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

const logFormat = winston.format.printf(function(info) {
  return `${getCLStringDate()}-${info.level}: ${JSON.stringify(info.message, null, 4)}`;
});

const logger = winston.createLogger({
  level: 'debug',
  transports: [
    dailyRotateFile,
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat)
    })
  ]
});

export function setLogLevel(level: 'error' | 'warn' | 'info' | 'debug' | 'silly'){
  logger.level = level.toLocaleLowerCase();
}

export default logger;
