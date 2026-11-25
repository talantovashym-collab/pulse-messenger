const net = require('net');
const EventEmitter = require('events');

const CLUSTER_PORT = process.env.CLUSTER_PORT || 6380;
const CLUSTER_HOST = '127.0.0.1';

class ClusterBus extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isMaster = false;
    this.server = null;
    this.connections = new Set();
    this.subscriptions = new Map(); // channel -> Set of callback functions
    this.instanceId = `node_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  }

  async init() {
    return new Promise((resolve) => {
      // 1. Try to connect as a client to an existing cluster broker
      const testClient = new net.Socket();

      testClient.once('connect', () => {
        testClient.destroy();
        this.connectAsClient().then(resolve);
      });

      testClient.once('error', (err) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
          // No broker is running yet; this instance becomes the master broker
          this.startBroker().then(() => {
            this.connectAsClient().then(resolve);
          });
        } else {
          console.warn('Cluster broker check warning:', err.message);
          this.connectAsClient().then(resolve);
        }
      });

      testClient.connect(CLUSTER_PORT, CLUSTER_HOST);
    });
  }

  startBroker() {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        this.connections.add(socket);
        let buffer = '';

        socket.on('data', (chunk) => {
          buffer += chunk.toString();
          let boundary = buffer.indexOf('\n');
          while (boundary !== -1) {
            const rawMessage = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 1);
            if (rawMessage) {
              // Fan out message to all other connected instances
              for (const conn of this.connections) {
                if (conn !== socket && !conn.destroyed) {
                  conn.write(rawMessage + '\n');
                }
              }
            }
            boundary = buffer.indexOf('\n');
          }
        });

        socket.on('close', () => this.connections.delete(socket));
        socket.on('error', () => this.connections.delete(socket));
      });

      this.server.listen(CLUSTER_PORT, CLUSTER_HOST, () => {
        this.isMaster = true;
        console.log(`📡 Cluster Pub/Sub Broker active on ${CLUSTER_HOST}:${CLUSTER_PORT} (Master: ${this.instanceId})`);
        resolve();
      });

      this.server.on('error', (err) => {
        console.warn('Cluster server error (falling back to client):', err.message);
        resolve();
      });
    });
  }

  connectAsClient() {
    return new Promise((resolve) => {
      this.client = new net.Socket();
      let buffer = '';

      this.client.connect(CLUSTER_PORT, CLUSTER_HOST, () => {
        console.log(`🔗 Instance [${this.instanceId}] connected to Cluster Pub/Sub Bus`);
        resolve();
      });

      this.client.on('data', (chunk) => {
        buffer += chunk.toString();
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const rawMessage = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (rawMessage) {
            try {
              const { channel, payload, senderId } = JSON.parse(rawMessage);
              // Ignore messages emitted by ourselves
              if (senderId !== this.instanceId) {
                this.emit(channel, payload);
                const handlers = this.subscriptions.get(channel);
                if (handlers) {
                  for (const handler of handlers) {
                    handler(payload);
                  }
                }
              }
            } catch (e) {
              console.warn('Invalid cluster payload:', e.message);
            }
          }
          boundary = buffer.indexOf('\n');
        }
      });

      this.client.on('error', (err) => {
        console.warn(`Cluster client error on ${this.instanceId}:`, err.message);
      });
    });
  }

  publish(channel, payload) {
    if (this.client && !this.client.destroyed) {
      const message = JSON.stringify({
        channel,
        payload,
        senderId: this.instanceId,
        timestamp: Date.now()
      }) + '\n';
      this.client.write(message);
    }
    // Also trigger local event
    this.emit(channel, payload);
  }

  subscribe(channel, handler) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(handler);
    this.on(channel, handler);
  }

  unsubscribe(channel, handler) {
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel).delete(handler);
    }
    this.off(channel, handler);
  }

  close() {
    if (this.client) this.client.destroy();
    if (this.server) this.server.close();
  }
}

module.exports = new ClusterBus();
