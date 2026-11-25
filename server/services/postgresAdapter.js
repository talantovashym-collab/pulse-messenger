const { Pool } = require('pg');

class PostgresAdapter {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect(connectionString) {
    if (!connectionString) {
      return false;
    }

    try {
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000
      });

      const client = await this.pool.connect();
      const res = await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      console.log('🐘 PostgreSQL connected successfully:', res.rows[0].now);
      return true;
    } catch (err) {
      console.warn('PostgreSQL connection failed, continuing with embedded ACID store:', err.message);
      this.isConnected = false;
      return false;
    }
  }

  async query(text, params) {
    if (!this.isConnected || !this.pool) {
      throw new Error('PostgreSQL is not connected');
    }
    const start = Date.now();
    const res = await this.pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 50) {
      console.log(`[PG Slow Query ${duration}ms]: ${text}`);
    }
    return res;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}

module.exports = new PostgresAdapter();
