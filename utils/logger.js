/**
 * Modern structured logging system for ialarm-mqtt
 * Supports different log levels, JSON formatting, and production-ready logging
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
}

class Logger {
  constructor (level = 'info', options = {}) {
    this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO
    this.json = options.json !== false
    this.prefix = options.prefix || 'ialarm-mqtt'
    this.timestamp = options.timestamp !== false
  }

  _formatMessage (level, message, meta = {}) {
    const logEntry = {
      timestamp: this.timestamp ? new Date().toISOString() : undefined,
      level: level.toUpperCase(),
      message,
      prefix: this.prefix,
      ...meta
    }

    // Remove undefined values
    Object.keys(logEntry).forEach(key => {
      if (logEntry[key] === undefined) {
        delete logEntry[key]
      }
    })

    return this.json ? JSON.stringify(logEntry) : `${logEntry.timestamp} [${logEntry.level}] ${logEntry.message}`
  }

  _log (level, message, meta = {}) {
    if (LOG_LEVELS[level.toUpperCase()] <= this.level) {
      const formattedMessage = this._formatMessage(level, message, meta)
      const output = level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'debug' ? console.log : console.info
      output(formattedMessage)
    }
  }

  error (message, meta = {}) {
    this._log('error', message, meta)
  }

  warn (message, meta = {}) {
    this._log('warn', message, meta)
  }

  info (message, meta = {}) {
    this._log('info', message, meta)
  }

  debug (message, meta = {}) {
    this._log('debug', message, meta)
  }

  // Specialized logging methods
  alarm (message, meta = {}) {
    this.info(`[ALARM] ${message}`, { ...meta, category: 'alarm' })
  }

  mqtt (message, meta = {}) {
    this.debug(`[MQTT] ${message}`, { ...meta, category: 'mqtt' })
  }

  tcp (message, meta = {}) {
    this.debug(`[TCP] ${message}`, { ...meta, category: 'tcp' })
  }

  web (message, meta = {}) {
    this.info(`[WEB] ${message}`, { ...meta, category: 'web' })
  }

  health (message, meta = {}) {
    this.info(`[HEALTH] ${message}`, { ...meta, category: 'health' })
  }
}

// Create default logger instance
export const logger = new Logger(process.env.LOG_LEVEL || 'info', {
  json: process.env.NODE_ENV === 'production',
  timestamp: true
})

// Export the Logger class for custom instances
export { Logger }
