/**
 * Health monitoring system for ialarm-mqtt
 * Tracks system health, connection status, and performance metrics
 */

import { logger } from './logger.js'

class HealthMonitor {
  constructor () {
    this.metrics = {
      startTime: Date.now(),
      uptime: 0,
      mqttConnected: false,
      tcpConnected: false,
      lastSuccessfulPoll: 0,
      lastError: null,
      errorCount: 0,
      messageCount: 0,
      memoryUsage: {},
      cpuUsage: 0,
      responseTimes: [],
      healthScore: 100
    }

    this.thresholds = {
      maxResponseTime: 10000, // 10 seconds
      maxErrorRate: 0.1, // 10% error rate
      maxMemoryUsage: 0.9, // 90% memory usage
      maxPollingInterval: 60000 // 1 minute
    }

    this.healthChecks = new Map()
    this.startMonitoring()
  }

  // Register health check functions
  registerHealthCheck (name, checkFunction, interval = 30000) {
    this.healthChecks.set(name, {
      function: checkFunction,
      interval,
      lastCheck: 0,
      status: 'unknown'
    })
  }

  // Update metrics
  updateMetric (key, value) {
    this.metrics[key] = value
    this.updateHealthScore()
  }

  // Record response time
  recordResponseTime (time) {
    this.metrics.responseTimes.push(time)
    // Keep only last 100 response times
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift()
    }
  }

  // Record error
  recordError (error) {
    this.metrics.errorCount++
    this.metrics.lastError = {
      message: error.message,
      timestamp: Date.now(),
      stack: error.stack
    }
    this.updateHealthScore()
  }

  // Update health score based on metrics
  updateHealthScore () {
    let score = 100

    // Check response times
    if (this.metrics.responseTimes.length > 0) {
      const avgResponseTime =
        this.metrics.responseTimes.reduce((a, b) => a + b, 0) /
        this.metrics.responseTimes.length
      if (avgResponseTime > this.thresholds.maxResponseTime) {
        score -= 20
      }
    }

    // Check error rate
    if (this.metrics.messageCount > 0) {
      const errorRate = this.metrics.errorCount / this.metrics.messageCount
      if (errorRate > this.thresholds.maxErrorRate) {
        score -= 30
      }
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage()
    const memoryRatio = memoryUsage.heapUsed / memoryUsage.heapTotal
    if (memoryRatio > this.thresholds.maxMemoryUsage) {
      score -= 15
    }

    // Check connection status
    if (!this.metrics.mqttConnected) {
      score -= 25
    }
    if (!this.metrics.tcpConnected) {
      score -= 20
    }

    // Check polling health
    const timeSinceLastPoll = Date.now() - this.metrics.lastSuccessfulPoll
    if (timeSinceLastPoll > this.thresholds.maxPollingInterval) {
      score -= 10
    }

    this.metrics.healthScore = Math.max(0, score)
  }

  // Get current health status
  getHealthStatus () {
    const status = {
      status:
        this.metrics.healthScore > 70
          ? 'healthy'
          : this.metrics.healthScore > 30
            ? 'degraded'
            : 'unhealthy',
      score: this.metrics.healthScore,
      uptime: Date.now() - this.metrics.startTime,
      metrics: { ...this.metrics },
      checks: {}
    }

    // Run health checks
    for (const [name, check] of this.healthChecks) {
      try {
        const result = check.function()
        status.checks[name] = {
          status: result ? 'healthy' : 'unhealthy',
          lastCheck: Date.now()
        }
      } catch (error) {
        status.checks[name] = {
          status: 'error',
          error: error.message,
          lastCheck: Date.now()
        }
      }
    }

    return status
  }

  // Start monitoring loop
  startMonitoring () {
    setInterval(() => {
      this.updateMetric('uptime', Date.now() - this.metrics.startTime)
      this.updateMetric('memoryUsage', process.memoryUsage())

      // Log health status if degraded
      if (this.metrics.healthScore < 70) {
        logger.warn('System health degraded', {
          healthScore: this.metrics.healthScore,
          metrics: this.metrics
        })
      }

      // Log periodic health status
      if (this.metrics.healthScore === 100) {
        logger.debug('System health check passed', {
          healthScore: this.metrics.healthScore
        })
      }
    }, 30000) // Check every 30 seconds
  }

  // Get Prometheus metrics format
  getPrometheusMetrics () {
    const metrics = []

    metrics.push('# HELP ialarm_mqtt_health_score System health score (0-100)')
    metrics.push('# TYPE ialarm_mqtt_health_score gauge')
    metrics.push(`ialarm_mqtt_health_score ${this.metrics.healthScore}`)

    metrics.push('# HELP ialarm_mqtt_uptime_seconds System uptime in seconds')
    metrics.push('# TYPE ialarm_mqtt_uptime_seconds counter')
    metrics.push(
      `ialarm_mqtt_uptime_seconds ${Math.floor(this.metrics.uptime / 1000)}`
    )

    metrics.push('# HELP ialarm_mqtt_mqtt_connected MQTT connection status')
    metrics.push('# TYPE ialarm_mqtt_mqtt_connected gauge')
    metrics.push(
      `ialarm_mqtt_mqtt_connected ${this.metrics.mqttConnected ? 1 : 0}`
    )

    metrics.push('# HELP ialarm_mqtt_tcp_connected TCP connection status')
    metrics.push('# TYPE ialarm_mqtt_tcp_connected gauge')
    metrics.push(
      `ialarm_mqtt_tcp_connected ${this.metrics.tcpConnected ? 1 : 0}`
    )

    metrics.push('# HELP ialarm_mqtt_message_count Total message count')
    metrics.push('# TYPE ialarm_mqtt_message_count counter')
    metrics.push(`ialarm_mqtt_message_count ${this.metrics.messageCount}`)

    metrics.push('# HELP ialarm_mqtt_error_count Total error count')
    metrics.push('# TYPE ialarm_mqtt_error_count counter')
    metrics.push(`ialarm_mqtt_error_count ${this.metrics.errorCount}`)

    if (this.metrics.responseTimes.length > 0) {
      const avgResponseTime =
        this.metrics.responseTimes.reduce((a, b) => a + b, 0) /
        this.metrics.responseTimes.length
      metrics.push(
        '# HELP ialarm_mqtt_avg_response_time_ms Average response time in milliseconds'
      )
      metrics.push('# TYPE ialarm_mqtt_avg_response_time_ms gauge')
      metrics.push(`ialarm_mqtt_avg_response_time_ms ${avgResponseTime}`)
    }

    return metrics.join('\n')
  }
}

// Create singleton instance
export const healthMonitor = new HealthMonitor()
