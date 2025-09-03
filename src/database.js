import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import logger from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function initDatabase() {
  if (db) return db;
  
  const dbPath = path.join(__dirname, '..', 'alarmageddon.db');
  
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    logger.info({ dbPath }, 'Database connection established');
    
    await createTables();
    await setupCleanupJob();
    
    return db;
  } catch (error) {
    logger.error({ error: error.message, dbPath }, 'Failed to initialize database');
    throw error;
  }
}

async function createTables() {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        silenced INTEGER DEFAULT 0,
        silenced_by TEXT,
        acknowledged INTEGER DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        message_id TEXT,
        channel_id TEXT,
        routing_decision TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
      CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS silences (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        duration TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER DEFAULT 1
      );
      
      CREATE INDEX IF NOT EXISTS idx_silences_active ON silences(active);
      CREATE INDEX IF NOT EXISTS idx_silences_expires_at ON silences(expires_at);
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS routing_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT NOT NULL,
        action TEXT NOT NULL,
        destination TEXT,
        reason TEXT,
        timestamp TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alert_id) REFERENCES alerts(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_routing_alert_id ON routing_decisions(alert_id);
      CREATE INDEX IF NOT EXISTS idx_routing_created_at ON routing_decisions(created_at);
    `);
    
    logger.info('Database tables created/verified');
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create database tables');
    throw error;
  }
}

async function setupCleanupJob() {
  const cleanupInterval = 60 * 60 * 1000;
  
  setInterval(async () => {
    await cleanupOldData();
  }, cleanupInterval);
  
  await cleanupOldData();
}

async function cleanupOldData() {
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '30');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTimestamp = cutoffDate.toISOString();
  
  try {
    const alertResult = await db.run(
      'DELETE FROM alerts WHERE created_at < ?',
      cutoffTimestamp
    );
    
    const routingResult = await db.run(
      'DELETE FROM routing_decisions WHERE created_at < ?',
      cutoffTimestamp
    );
    
    const expiredSilences = await db.run(
      'UPDATE silences SET active = 0 WHERE active = 1 AND expires_at < ?',
      new Date().toISOString()
    );
    
    if (alertResult.changes > 0 || routingResult.changes > 0 || expiredSilences.changes > 0) {
      logger.info({
        alertsDeleted: alertResult.changes,
        routingDeleted: routingResult.changes,
        silencesExpired: expiredSilences.changes,
        retentionDays
      }, 'Database cleanup completed');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Database cleanup failed');
  }
}

export async function saveAlert(alert) {
  const payload = typeof alert.payload === 'string' ? alert.payload : JSON.stringify(alert.payload);
  const routingDecision = alert.routingDecision ? JSON.stringify(alert.routingDecision) : null;
  
  try {
    await db.run(
      `INSERT INTO alerts (
        id, timestamp, received_at, payload, silenced, silenced_by,
        acknowledged, acknowledged_by, acknowledged_at,
        message_id, channel_id, routing_decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        alert.id,
        alert.timestamp,
        alert.receivedAt,
        payload,
        alert.silenced ? 1 : 0,
        alert.silencedBy || null,
        alert.acknowledged ? 1 : 0,
        alert.acknowledgedBy || null,
        alert.acknowledgedAt || null,
        alert.messageId || null,
        alert.channelId || null,
        routingDecision
      ]
    );
    
    logger.debug({ alertId: alert.id }, 'Alert saved to database');
  } catch (error) {
    logger.error({ error: error.message, alertId: alert.id }, 'Failed to save alert');
    throw error;
  }
}

export async function updateAlert(alertId, updates) {
  const setClauses = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    setClauses.push(`${columnName} = ?`);
    values.push(value);
  }
  
  values.push(alertId);
  
  try {
    const result = await db.run(
      `UPDATE alerts SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.changes > 0) {
      logger.debug({ alertId, updates }, 'Alert updated in database');
    }
    
    return result.changes > 0;
  } catch (error) {
    logger.error({ error: error.message, alertId }, 'Failed to update alert');
    throw error;
  }
}

export async function getAlert(alertId) {
  try {
    const alert = await db.get(
      'SELECT * FROM alerts WHERE id = ?',
      alertId
    );
    
    if (alert) {
      alert.payload = JSON.parse(alert.payload);
      if (alert.routing_decision) {
        alert.routingDecision = JSON.parse(alert.routing_decision);
      }
      alert.silenced = alert.silenced === 1;
      alert.acknowledged = alert.acknowledged === 1;
    }
    
    return alert;
  } catch (error) {
    logger.error({ error: error.message, alertId }, 'Failed to get alert');
    throw error;
  }
}

export async function getRecentAlerts(limit = 100, includeAcknowledged = false) {
  try {
    const whereClause = includeAcknowledged ? '' : 'WHERE acknowledged = 0';
    const alerts = await db.all(
      `SELECT * FROM alerts ${whereClause} ORDER BY timestamp DESC LIMIT ?`,
      limit
    );
    
    return alerts.map(alert => {
      alert.payload = JSON.parse(alert.payload);
      if (alert.routing_decision) {
        alert.routingDecision = JSON.parse(alert.routing_decision);
      }
      alert.silenced = alert.silenced === 1;
      alert.acknowledged = alert.acknowledged === 1;
      return alert;
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get recent alerts');
    throw error;
  }
}

export async function saveSilence(silence) {
  try {
    await db.run(
      `INSERT INTO silences (id, pattern, duration, expires_at, created_by, created_at, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        silence.id,
        silence.pattern,
        silence.duration,
        silence.expiresAt,
        silence.createdBy,
        silence.createdAt,
        1
      ]
    );
    
    logger.debug({ silenceId: silence.id }, 'Silence saved to database');
  } catch (error) {
    logger.error({ error: error.message, silenceId: silence.id }, 'Failed to save silence');
    throw error;
  }
}

export async function getActiveSilences() {
  try {
    const now = new Date().toISOString();
    const silences = await db.all(
      'SELECT * FROM silences WHERE active = 1 AND expires_at > ? ORDER BY created_at DESC',
      now
    );
    
    return silences.map(s => ({
      ...s,
      regex: new RegExp(s.pattern, 'i')
    }));
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get active silences');
    throw error;
  }
}

export async function deleteSilence(silenceId) {
  try {
    const result = await db.run(
      'UPDATE silences SET active = 0 WHERE id = ?',
      silenceId
    );
    
    return result.changes > 0;
  } catch (error) {
    logger.error({ error: error.message, silenceId }, 'Failed to delete silence');
    throw error;
  }
}

export async function saveRoutingDecision(decision) {
  try {
    await db.run(
      `INSERT INTO routing_decisions (alert_id, action, destination, reason, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [
        decision.alertId,
        decision.action,
        decision.destination || null,
        decision.reason,
        decision.timestamp
      ]
    );
    
    logger.debug({ alertId: decision.alertId }, 'Routing decision saved to database');
  } catch (error) {
    logger.error({ error: error.message, decision }, 'Failed to save routing decision');
    throw error;
  }
}

export async function getRoutingDecisions(limit = 100) {
  try {
    const decisions = await db.all(
      'SELECT * FROM routing_decisions ORDER BY created_at DESC LIMIT ?',
      limit
    );
    
    return decisions;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get routing decisions');
    throw error;
  }
}

export function getDatabase() {
  return db;
}