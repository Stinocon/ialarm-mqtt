import { MeianConnection } from 'ialarm'
import { configHandler } from './config-handler.js'

/**
 * In memory health counters for the bridge: panel link, polling and errors.
 * They are published as a single retained MQTT payload and exposed to Home
 * Assistant as diagnostic entities, so answering "is the bridge still talking
 * to the panel?" does not require reading the add-on log.
 *
 * Nothing here talks to MQTT: index.js feeds the events and decides when to
 * publish the payload.
 */
export const Diagnostics = function (config) {
  const startedAt = new Date()

  // evaluated once: isFeatureEnabled logs a warning on every miss and the
  // payload is built on a timer
  const pollingEnabled = configHandler.isFeatureEnabled(config, ['armDisarm', 'sensors'])

  const state = {
    lastPollAt: undefined,
    lastPollOkAt: undefined,
    pollOkCount: 0,
    errorCount: 0,
    lastError: undefined,
    lastErrorAt: undefined,
    connections: 0,
    disconnections: 0,
    reconnectAttempts: 0,
    nextReconnectAt: undefined,
    lastConnectedAt: undefined,
    lastDisconnectedAt: undefined,
    lastDiscoveryAt: undefined,
    zonesLoaded: 0,
    mqttConnected: false
  }

  const _iso = function (date) {
    return date ? date.toISOString() : undefined
  }

  /**
   * Raw connection status of the ialarm library (DISCONNECTED, CONNECTING,
   * CONNECTED_AUTHENTICATING, CONNECTED_READY, CONNECTED_BUSY, ...)
   */
  const _panelStatus = function () {
    try {
      return MeianConnection.status.text() || 'UNKNOWN'
    } catch (error) {
      return 'UNKNOWN'
    }
  }

  const _isDisconnected = function () {
    try {
      return MeianConnection.status.isDisconnected()
    } catch (error) {
      return false
    }
  }

  /**
   * Single stable value summarizing the link, so the entity does not flicker
   * between READY and BUSY on every poll:
   * - offline:  the TCP connection to the panel is down
   * - starting: connected, but no successful read yet
   * - degraded: connected, but the last successful read is too old
   * - ok:       connected and reading
   * @param {Date} now
   */
  const _health = function (now) {
    if (_isDisconnected()) {
      return 'offline'
    }
    // with both armDisarm and sensors disabled nothing is polled: the link
    // state is all we can report
    if (!pollingEnabled) {
      return 'ok'
    }
    if (!state.lastPollOkAt) {
      return 'starting'
    }
    // tolerate a few missed cycles before crying wolf
    const staleAfter = Math.max((config.server.polling_status || 5000) * 3, 30000)
    return (now - state.lastPollOkAt) > staleAfter ? 'degraded' : 'ok'
  }

  /**
   * A status read (GetByWay/GetAlarmStatus) has been requested
   */
  this.onPollAttempt = function () {
    state.lastPollAt = new Date()
  }

  /**
   * The panel answered with a usable status + sensors payload
   */
  this.onPollSuccess = function () {
    state.lastPollOkAt = new Date()
    state.pollOkCount++
  }

  this.onError = function (error) {
    state.errorCount++
    state.lastError = (typeof error === 'string' ? error : (error && error.message)) || 'Generic error'
    state.lastErrorAt = new Date()
  }

  this.onPanelConnected = function () {
    state.connections++
    state.lastConnectedAt = new Date()
    state.nextReconnectAt = undefined
  }

  /**
   * A reconnection attempt has been queued (the panel is unreachable)
   * @param {*} delayMs how long until the attempt
   */
  this.onReconnectScheduled = function (delayMs) {
    state.reconnectAttempts++
    state.nextReconnectAt = new Date(Date.now() + (delayMs || 0))
  }

  this.onPanelDisconnected = function () {
    state.disconnections++
    state.lastDisconnectedAt = new Date()
  }

  this.onDiscovery = function () {
    state.lastDiscoveryAt = new Date()
  }

  this.onMqttConnected = function (connected) {
    state.mqttConnected = connected
  }

  this.setZonesLoaded = function (count) {
    state.zonesLoaded = count || 0
  }

  /**
   * Flat payload: undefined keys are dropped by JSON.stringify, so the HA
   * templates guard on "is defined" instead of rendering nulls.
   */
  this.payload = function () {
    const now = new Date()
    return {
      health: _health(now),
      startedAt: _iso(startedAt),
      uptime: Math.round((now - startedAt) / 1000),
      panelStatus: _panelStatus(),
      panelHost: `${config.server.host}:${config.server.port}`,
      connections: state.connections,
      disconnections: state.disconnections,
      reconnectAttempts: state.reconnectAttempts,
      nextReconnectAt: _iso(state.nextReconnectAt),
      lastConnectedAt: _iso(state.lastConnectedAt),
      lastDisconnectedAt: _iso(state.lastDisconnectedAt),
      pollingEnabled,
      pollIntervalMs: config.server.polling_status,
      lastPollAt: _iso(state.lastPollAt),
      lastPollOkAt: _iso(state.lastPollOkAt),
      pollOkCount: state.pollOkCount,
      secondsSinceLastPollOk: state.lastPollOkAt ? Math.round((now - state.lastPollOkAt) / 1000) : undefined,
      errorCount: state.errorCount,
      lastError: state.lastError,
      lastErrorAt: _iso(state.lastErrorAt),
      zonesLoaded: state.zonesLoaded,
      mqttConnected: state.mqttConnected,
      mqttBroker: `${config.mqtt.host}:${config.mqtt.port}`,
      lastDiscoveryAt: _iso(state.lastDiscoveryAt),
      lastUpdated: _iso(now)
    }
  }
}
