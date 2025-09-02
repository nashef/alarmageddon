import logger from './logger.js';

// In-memory storage for silences (will move to database in Iteration 9)
const activeSilences = [];
let silenceIdCounter = 1;

/**
 * Parse duration string to milliseconds
 * Supports formats: 30s, 5m, 2h, 1d
 */
export function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    return null;
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const multipliers = {
    's': 1000,           // seconds
    'm': 60 * 1000,      // minutes
    'h': 60 * 60 * 1000, // hours
    'd': 24 * 60 * 60 * 1000 // days
  };
  
  return value * multipliers[unit];
}

/**
 * Create a new silence
 */
export function createSilence(pattern, duration, user) {
  const durationMs = typeof duration === 'string' ? parseDuration(duration) : duration;
  
  if (!durationMs || durationMs <= 0) {
    logger.warn({ duration }, 'Invalid silence duration');
    return null;
  }
  
  const silence = {
    id: `silence_${silenceIdCounter++}`,
    pattern: pattern || '.*',
    regex: new RegExp(pattern || '.*', 'i'),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + durationMs).toISOString(),
    createdBy: user?.username || 'Unknown',
    createdById: user?.id,
    duration: duration,
    durationMs: durationMs
  };
  
  activeSilences.push(silence);
  
  logger.info({ 
    silenceId: silence.id,
    pattern: silence.pattern,
    duration: duration,
    expiresAt: silence.expiresAt,
    createdBy: silence.createdBy
  }, 'Silence created');
  
  return silence;
}

/**
 * Check if an alert matches any active silence
 */
export function isAlertSilenced(alert) {
  // Clean up expired silences first
  cleanupExpiredSilences();
  
  const payload = alert.payload || alert;
  const title = payload.title || payload.subject || '';
  const description = payload.description || payload.message || payload.body || '';
  const severity = payload.severity || payload.level || '';
  const service = payload.service || '';
  const hostname = payload.hostname || payload.host || '';
  const source = payload.source || '';
  
  // Combine all fields for matching
  const searchText = `${title} ${description} ${severity} ${service} ${hostname} ${source}`;
  
  for (const silence of activeSilences) {
    if (silence.regex.test(searchText)) {
      logger.debug({ 
        alertTitle: title,
        silenceId: silence.id,
        pattern: silence.pattern
      }, 'Alert matched silence');
      return silence;
    }
  }
  
  return null;
}

/**
 * Get all active silences
 */
export function getActiveSilences() {
  // Clean up expired silences first
  cleanupExpiredSilences();
  return [...activeSilences];
}

/**
 * Delete a silence by ID
 */
export function deleteSilence(id) {
  const index = activeSilences.findIndex(s => s.id === id);
  
  if (index === -1) {
    logger.warn({ silenceId: id }, 'Silence not found for deletion');
    return false;
  }
  
  const silence = activeSilences[index];
  activeSilences.splice(index, 1);
  
  logger.info({ 
    silenceId: id,
    pattern: silence.pattern
  }, 'Silence deleted');
  
  return true;
}

/**
 * Clean up expired silences
 */
export function cleanupExpiredSilences() {
  const now = new Date();
  const expired = [];
  
  for (let i = activeSilences.length - 1; i >= 0; i--) {
    const silence = activeSilences[i];
    if (new Date(silence.expiresAt) <= now) {
      expired.push(silence);
      activeSilences.splice(i, 1);
    }
  }
  
  if (expired.length > 0) {
    logger.info({ 
      count: expired.length,
      silenceIds: expired.map(s => s.id)
    }, 'Expired silences cleaned up');
  }
  
  return expired;
}

/**
 * Format silence list for Discord
 */
export function formatSilenceList(silences) {
  if (!silences || silences.length === 0) {
    return {
      content: 'No active silences.',
      ephemeral: true
    };
  }
  
  const silenceList = silences.map((silence, index) => {
    const expiresIn = new Date(silence.expiresAt) - new Date();
    const expiresInMinutes = Math.round(expiresIn / 1000 / 60);
    const expiresInHours = Math.round(expiresIn / 1000 / 60 / 60);
    
    let expiresText;
    if (expiresInMinutes < 60) {
      expiresText = `${expiresInMinutes}m`;
    } else if (expiresInHours < 24) {
      expiresText = `${expiresInHours}h`;
    } else {
      expiresText = `${Math.round(expiresInHours / 24)}d`;
    }
    
    return `**${index + 1}.** ID: \`${silence.id}\` | Pattern: \`${silence.pattern}\` | Expires in ${expiresText} | By ${silence.createdBy}`;
  }).join('\n');
  
  return {
    embeds: [{
      title: 'Active Silences',
      description: silenceList,
      color: 0xFFA500, // Orange
      footer: {
        text: `${silences.length} active silence(s)`
      }
    }],
    ephemeral: true
  };
}

/**
 * Set up periodic cleanup (call this once on startup)
 */
export function setupSilenceCleanup() {
  // Run cleanup every minute
  setInterval(() => {
    cleanupExpiredSilences();
  }, 60 * 1000);
  
  logger.info('Silence cleanup scheduled');
}