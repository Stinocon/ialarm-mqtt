/**
 * Web server for ialarm-mqtt dashboard
 * Provides REST API and WebSocket for real-time updates
 */

import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'
import { healthMonitor } from '../utils/health-monitor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class WebServer {
  constructor (ialarmInstance, config) {
    this.ialarmInstance = ialarmInstance
    this.config = config
    this.app = express()
    this.server = createServer(this.app)
    this.wss = new WebSocketServer({ server: this.server })
    this.clients = new Set()

    this.setupMiddleware()
    this.setupRoutes()
    this.setupWebSocket()
    this.setupErrorHandling()
  }

  setupMiddleware () {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:']
        }
      }
    }))

    // CORS for development
    if (process.env.NODE_ENV !== 'production') {
      this.app.use(cors())
    }

    // Compression
    this.app.use(compression())

    // Logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message) => logger.web(message.trim())
      }
    }))

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))

    // Static files
    this.app.use(express.static(path.join(__dirname, 'public')))
  }

  setupRoutes () {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      const health = healthMonitor.getHealthStatus()
      res.json(health)
    })

    // Prometheus metrics endpoint
    this.app.get('/api/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain')
      res.send(healthMonitor.getPrometheusMetrics())
    })

    // System status endpoint
    this.app.get('/api/status', (req, res) => {
      try {
        const status = this.ialarmInstance.getStatus()
        res.json(status)
      } catch (error) {
        logger.error('Error getting status', { error: error.message })
        res.status(500).json({ error: 'Failed to get status' })
      }
    })

    // Zones information endpoint
    this.app.get('/api/zones', (req, res) => {
      try {
        const zones = this.ialarmInstance.getZones()
        res.json(zones)
      } catch (error) {
        logger.error('Error getting zones', { error: error.message })
        res.status(500).json({ error: 'Failed to get zones' })
      }
    })

    // Events log endpoint
    this.app.get('/api/events', (req, res) => {
      try {
        const events = this.ialarmInstance.getEvents()
        res.json(events)
      } catch (error) {
        logger.error('Error getting events', { error: error.message })
        res.status(500).json({ error: 'Failed to get events' })
      }
    })

    // Configuration endpoint
    this.app.get('/api/config', (req, res) => {
      try {
        // Return safe configuration (without passwords)
        const safeConfig = { ...this.config }
        if (safeConfig.server) {
          safeConfig.server.password = '***'
        }
        if (safeConfig.mqtt) {
          safeConfig.mqtt.password = '***'
        }
        res.json(safeConfig)
      } catch (error) {
        logger.error('Error getting config', { error: error.message })
        res.status(500).json({ error: 'Failed to get config' })
      }
    })

    // Alarm control endpoints
    this.app.post('/api/alarm/arm', async (req, res) => {
      try {
        const { mode = 'away' } = req.body
        await this.ialarmInstance.armAlarm(mode)
        res.json({ success: true, message: `Alarm armed in ${mode} mode` })
      } catch (error) {
        logger.error('Error arming alarm', { error: error.message })
        res.status(500).json({ error: 'Failed to arm alarm' })
      }
    })

    this.app.post('/api/alarm/disarm', async (req, res) => {
      try {
        const { code } = req.body
        await this.ialarmInstance.disarmAlarm(code)
        res.json({ success: true, message: 'Alarm disarmed' })
      } catch (error) {
        logger.error('Error disarming alarm', { error: error.message })
        res.status(500).json({ error: 'Failed to disarm alarm' })
      }
    })

    // System control endpoints
    this.app.post('/api/system/restart', (req, res) => {
      logger.info('System restart requested via web interface')
      res.json({ success: true, message: 'Restart initiated' })
      // Graceful shutdown
      setTimeout(() => {
        process.exit(0)
      }, 1000)
    })

    // Serve the main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'))
    })

    // Catch-all for SPA routing
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'))
    })
  }

  setupWebSocket () {
    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected', {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      })

      this.clients.add(ws)

      // Send initial status
      ws.send(JSON.stringify({
        type: 'status',
        data: this.ialarmInstance.getStatus()
      }))

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message)
          this.handleWebSocketMessage(ws, data)
        } catch (error) {
          logger.error('Invalid WebSocket message', { error: error.message })
        }
      })

      ws.on('close', () => {
        this.clients.delete(ws)
        logger.info('WebSocket client disconnected')
      })

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message })
        this.clients.delete(ws)
      })
    })
  }

  handleWebSocketMessage (ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
        break
      case 'subscribe':
        // Handle subscription to specific events
        ws.subscriptions = data.events || []
        break
      default:
        logger.warn('Unknown WebSocket message type', { type: data.type })
    }
  }

  setupErrorHandling () {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' })
    })

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      })

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      })
    })
  }

  // Broadcast to all connected WebSocket clients
  broadcast (data) {
    const message = JSON.stringify(data)
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message)
        } catch (error) {
          logger.error('Error broadcasting to WebSocket client', { error: error.message })
          this.clients.delete(client)
        }
      }
    })
  }

  // Start the server
  start (port = 3000) {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        logger.info(`Web server started on port ${port}`)
        resolve()
      })

      this.server.on('error', (error) => {
        logger.error('Web server error', { error: error.message })
        reject(error)
      })
    })
  }

  // Stop the server
  stop () {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          logger.info('Web server stopped')
          resolve()
        })
      })
    })
  }
}

export { WebServer }
