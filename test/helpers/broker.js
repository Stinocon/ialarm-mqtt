import { Aedes } from 'aedes'
import net from 'net'
import mqtt from 'mqtt'

/**
 * A throwaway MQTT broker on a free port. One per scenario: retained messages
 * from a previous run would otherwise be delivered on subscribe and counted as
 * if the code under test had just published them.
 */
export const startBroker = async function () {
  const aedes = await Aedes.createBroker()
  // keep the accepted sockets: server.close() waits for every live connection,
  // and the client under test has no reason to hang up on its own
  const sockets = new Set()
  const server = net.createServer(stream => {
    sockets.add(stream)
    stream.on('close', () => sockets.delete(stream))
    aedes.handle(stream)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const watcher = mqtt.connect(`mqtt://127.0.0.1:${port}`)
  await new Promise(resolve => watcher.on('connect', () => watcher.subscribe('#', resolve)))

  const messages = []
  watcher.on('message', (topic, payload, packet) => {
    messages.push({ topic, payload: payload.toString(), retained: !!(packet && packet.retain), at: Date.now() })
  })

  return {
    port,
    messages,
    /**
     * @param {*} filter substring or predicate on the topic
     */
    topics: (filter) => messages
      .map(m => m.topic)
      .filter(t => !filter || (typeof filter === 'function' ? filter(t) : t.includes(filter))),
    payloadOf: (topic) => {
      const found = messages.filter(m => m.topic === topic).pop()
      return found && found.payload
    },
    publish: (topic, payload) => watcher.publish(topic, payload),
    clear: () => { messages.length = 0 },
    /**
     * Only safe when nothing under test reacts to losing the broker: the bridge
     * exits the process when its MQTT connection drops, so suites that start
     * ialarmMqtt leave the broker up and let the runner exit instead.
     */
    stop: async () => {
      watcher.end(true)
      sockets.forEach(socket => socket.destroy())
      sockets.clear()
      await new Promise(resolve => aedes.close(resolve))
      await new Promise(resolve => server.close(resolve))
    }
  }
}
