import logger from './logger.js';
import { saveSilence, getActiveSilences as getActiveSilencesFromDB, deleteSilence as deleteSilenceFromDB } from './database.js';

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
export async function createSilence(pattern, duration, user) {
  const durationMs = typeof duration === 'string' ? parseDuration(duration) : duration;
  
  if (!durationMs || durationMs <= 0) {
    logger.warn({ duration }, 'Invalid silence duration');
    return null;
  }
  
  const silence = {
    id: `silence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    pattern: pattern || '.*',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + durationMs).toISOString(),
    createdBy: user?.username || 'Unknown',
    duration: duration
  };
  
  // Save to database
  await saveSilence(silence);
  
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
export async function isAlertSilenced(alert) {
  const activeSilences = await getActiveSilencesFromDB();
  
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
export async function getActiveSilences() {
  return await getActiveSilencesFromDB();
}

/**
 * Delete a silence by ID
 */
export async function deleteSilence(id) {
  const success = await deleteSilenceFromDB(id);
  
  if (success) {
    logger.info({ 
      silenceId: id
    }, 'Silence deleted');
  } else {
    logger.warn({ silenceId: id }, 'Silence not found for deletion');
  }
  
  return success;
}

/**
 * Clean up expired silences (handled by database now)
 */
export function cleanupExpiredSilences() {
  // This is now handled by the database cleanup job
  return [];
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
  // Cleanup is now handled by the database module
  logger.info('Silence cleanup handled by database');
}