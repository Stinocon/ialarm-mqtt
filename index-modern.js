/**
 * Modernized iAlarm MQTT Bridge
 * Enhanced with web interface, health monitoring, and improved error handling
 */

import { MeianSocket, MeianConnection } from 'ialarm'
import { MqttPublisher } from './utils/mqtt-publisher.js'
import { configHandler } from './utils/config-handler.js'
import { logger } from './utils/logger.js'
import { healthMonitor } from './utils/health-monitor.js'
import { WebServer } from './web/server.js'

class IAlarmMQTTBridge {
  constructor (config) {
    this.config = config
    this.logger = logger
    this.healthMonitor = healthMonitor
    this.webServer = null

    // State management
    this.status = {
      armed: false,
      mode: 'disarmed',
      zones: {},
      events: [],
      lastUpdate: null
    }

    this.errorCount = 0
    this.discovered = false
    this.publisher = new MqttPublisher(config)

    // Connection management
    this.socket = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 5000

    // Initialize
    this.initialize()
  }

  initialize () {
    try {
      this.validateConfig()
      this.setupSocket()
      this.setupHealthChecks()
      this.startWebServer()
      this.connectToAlarm()
    } catch (error) {
      this.logger.error('Initialization failed', { error: error.message })
      process.exit(1)
    }
  }

  validateConfig () {
    if (!this.config) {
      throw new Error('Configuration is required')
    }

    if (!this.config.server?.host || !this.config.server?.port) {
      throw new Error('Server host and port are required')
    }

    if (!this.config.mqtt?.host) {
      throw new Error('MQTT host is required')
    }
  }

  setupSocket () {
    const maxZone = Math.max(...this.config.server.zones)
    const commandsLimits = {
      GetZone: maxZone,
      GetByWay: maxZone,
      GetLog: 10
    }

    this.socket = new MeianSocket(
      this.config.server.host,
      this.config.server.port,
      this.config.server.username,
      this.config.server.password,
      this.config.verbose ? 'debug' : 'info',
      commandsLimits
    )

    this.setupSocketEventHandlers()
  }

  setupSocketEventHandlers () {
    // Connection established
    this.socket.onConnected(async connectionResponse => {
      this.logger.info('TCP connection established', {
        response: connectionResponse
      })
      this.healthMonitor.updateMetric('tcpConnected', true)
      this.reconnectAttempts = 0

      // Initial setup
      await this.performInitialSetup()
    })

    // Command responses
    this.socket.onResponse(async commandResponse => {
      try {
        const startTime = Date.now()
        await this.handleCommandResponse(commandResponse)
        this.healthMonitor.recordResponseTime(Date.now() - startTime)
        this.healthMonitor.updateMetric(
          'messageCount',
          this.healthMonitor.metrics.messageCount + 1
        )
      } catch (error) {
        this.handleError(error)
      }
    })

    // Connection errors
    this.socket.onError(error => {
      this.logger.error('Socket error', { error: error.message })
      this.healthMonitor.updateMetric('tcpConnected', false)
      this.healthMonitor.recordError(error)
      this.scheduleReconnect()
    })

    // Connection closed
    this.socket.onClose(() => {
      this.logger.warn('TCP connection closed')
      this.healthMonitor.updateMetric('tcpConnected', false)
      this.scheduleReconnect()
    })
  }

  async performInitialSetup () {
    try {
      this.logger.info('Performing initial setup...')

      // Get network information
      await this.executeCommand('GetNet')

      // Get zone information if enabled
      if (configHandler.isFeatureEnabled(this.config, 'zoneNames')) {
        await this.executeCommand('GetZone')
      }

      // Publish availability
      this.publisher.publishAvailable(true)
      this.healthMonitor.updateMetric('mqttConnected', true)

      // Start polling
      this.startPolling()

      this.logger.info('Initial setup completed successfully')
    } catch (error) {
      this.logger.error('Initial setup failed', { error: error.message })
      throw error
    }
  }

  async handleCommandResponse (commandResponse) {
    const payload = commandResponse.payloads?.data

    if (payload.GetNet) {
      this.parseNet(payload.GetNet)
    }

    if (payload.GetZone) {
      this.parseZones(payload.GetZone)
    }

    if (payload.GetByWay) {
      this.parseByWay(payload.GetByWay)
    }

    if (payload.GetLog) {
      this.parseLog(payload.GetLog)
    }

    // Update status timestamp
    this.status.lastUpdate = new Date().toISOString()

    // Broadcast to web clients
    if (this.webServer) {
      this.webServer.broadcast({
        type: 'status',
        data: this.getStatus()
      })
    }
  }

  async executeCommand (commands, args) {
    return new Promise((resolve, reject) => {
      try {
        const delay = MeianConnection.status.isReady() ? 0 : 200
        const requestTime = Date.now()

        const commandInterval = setInterval(async () => {
          const executionTime = Date.now()

          if (
            MeianConnection.status.isReady() ||
            executionTime - requestTime > 10000
          ) {
            clearInterval(commandInterval)
            try {
              await this.socket.executeCommand(commands, args)
              resolve()
            } catch (error) {
              reject(error)
            }
          } else {
            this.logger.debug('Waiting for connection to be ready', {
              command: commands,
              elapsed: executionTime - requestTime
            })
          }
        }, delay)
      } catch (error) {
        reject(error)
      }
    })
  }

  parseNet (netData) {
    try {
      this.logger.info('Network information received', { netData })
      // Update device info if needed
      if (this.config.deviceInfo) {
        this.config.deviceInfo = { ...this.config.deviceInfo, ...netData }
      }
    } catch (error) {
      this.logger.error('Error parsing network data', { error: error.message })
    }
  }

  parseZones (zoneData) {
    try {
      this.logger.info('Zone information received', {
        zoneCount: Object.keys(zoneData).length
      })

      // Update zones in status
      Object.keys(zoneData).forEach(zoneId => {
        const zone = zoneData[zoneId]
        this.status.zones[zoneId] = {
          id: zoneId,
          name: zone.name || `Zone ${zoneId}`,
          status: zone.status || 'unknown',
          type: zone.type || 'unknown'
        }
      })

      // Publish zone updates
      this.publisher.publishZones(this.status.zones)

      // Broadcast to web clients
      if (this.webServer) {
        this.webServer.broadcast({
          type: 'zones',
          data: Object.values(this.status.zones)
        })
      }
    } catch (error) {
      this.logger.error('Error parsing zone data', { error: error.message })
    }
  }

  parseByWay (byWayData) {
    try {
      this.logger.info('ByWay information received', { byWayData })

      // Update alarm status
      if (byWayData.armed !== undefined) {
        this.status.armed = byWayData.armed
        this.status.mode =
          byWayData.mode || (byWayData.armed ? 'away' : 'disarmed')

        // Publish status update
        this.publisher.publishStatus(this.status)

        // Add to events
        this.addEvent(
          `Alarm ${this.status.armed ? 'armed' : 'disarmed'} in ${this.status.mode} mode`
        )
      }
    } catch (error) {
      this.logger.error('Error parsing ByWay data', { error: error.message })
    }
  }

  parseLog (logData) {
    try {
      this.logger.info('Log information received', {
        logCount: logData.length
      })

      // Process log entries
      logData.forEach(entry => {
        this.addEvent(entry.message || 'Log entry', entry)
      })
    } catch (error) {
      this.logger.error('Error parsing log data', { error: error.message })
    }
  }

  addEvent (message, data = {}) {
    const event = {
      id: Date.now().toString(),
      message,
      timestamp: new Date().toISOString(),
      data
    }

    this.status.events.unshift(event)

    // Keep only last 100 events
    if (this.status.events.length > 100) {
      this.status.events = this.status.events.slice(0, 100)
    }

    // Broadcast to web clients
    if (this.webServer) {
      this.webServer.broadcast({
        type: 'events',
        data: this.status.events
      })
    }
  }

  startPolling () {
    this.logger.info('Starting alarm polling')

    const pollInterval = setInterval(() => {
      if (!this.healthMonitor.metrics.tcpConnected) {
        this.logger.warn('Skipping poll - TCP not connected')
        return
      }

      try {
        this.executeCommand('GetByWay')
        this.healthMonitor.updateMetric('lastSuccessfulPoll', Date.now())
      } catch (error) {
        this.handleError(error)
      }
    }, this.config.pollingInterval || 30000)

    // Store interval for cleanup
    this.pollInterval = pollInterval
  }

  connectToAlarm () {
    this.logger.info('Connecting to alarm system', {
      host: this.config.server.host,
      port: this.config.server.port
    })
    this.socket.connect()
  }

  scheduleReconnect () {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * this.reconnectAttempts

      this.logger.info('Scheduling reconnect', {
        attempt: this.reconnectAttempts,
        delay
      })

      setTimeout(() => {
        this.connectToAlarm()
      }, delay)
    } else {
      this.logger.error('Max reconnect attempts reached')
      this.healthMonitor.updateMetric('tcpConnected', false)
    }
  }

  handleError (error) {
    this.errorCount++
    this.logger.error('Operation failed', {
      error: error.message,
      errorCount: this.errorCount
    })

    this.healthMonitor.recordError(error)
    this.addEvent(`Error: ${error.message}`)
  }

  setupHealthChecks () {
    // Register health checks
    this.healthMonitor.registerHealthCheck('tcp_connection', () => {
      return this.healthMonitor.metrics.tcpConnected
    })

    this.healthMonitor.registerHealthCheck('mqtt_connection', () => {
      return this.healthMonitor.metrics.mqttConnected
    })

    this.healthMonitor.registerHealthCheck('polling_health', () => {
      const timeSinceLastPoll =
        Date.now() - this.healthMonitor.metrics.lastSuccessfulPoll
      return timeSinceLastPoll < 60000 // 1 minute
    })
  }

  async startWebServer () {
    try {
      this.webServer = new WebServer(this, this.config)
      await this.webServer.start(this.config.webPort || 3000)
      this.logger.info('Web server started successfully')
    } catch (error) {
      this.logger.error('Failed to start web server', { error: error.message })
    }
  }

  // Public API methods for web interface
  getStatus () {
    return {
      armed: this.status.armed,
      mode: this.status.mode,
      lastUpdate: this.status.lastUpdate,
      tcpConnected: this.healthMonitor.metrics.tcpConnected,
      mqttConnected: this.healthMonitor.metrics.mqttConnected
    }
  }

  getZones () {
    return Object.values(this.status.zones)
  }

  getEvents () {
    return this.status.events
  }

  async armAlarm (mode) {
    try {
      this.logger.info('Arming alarm', { mode })
      await this.executeCommand('Arm', { mode })
      this.addEvent(`Alarm armed in ${mode} mode`)
      return { success: true }
    } catch (error) {
      this.logger.error('Failed to arm alarm', { error: error.message })
      throw error
    }
  }

  async disarmAlarm (code) {
    try {
      this.logger.info('Disarming alarm')
      await this.executeCommand('Disarm', { code })
      this.addEvent('Alarm disarmed')
      return { success: true }
    } catch (error) {
      this.logger.error('Failed to disarm alarm', { error: error.message })
      throw error
    }
  }

  // Cleanup method
  async shutdown () {
    this.logger.info('Shutting down iAlarm MQTT bridge')

    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }

    if (this.webServer) {
      await this.webServer.stop()
    }

    if (this.socket) {
      this.socket.disconnect()
    }

    this.logger.info('Shutdown completed')
  }
}

// Export the main function
export const ialarmMqtt = config => {
  return new IAlarmMQTTBridge(config)
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully')
  process.exit(0)
})
