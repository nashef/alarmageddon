import logger from './logger.js';
import { sendAlertToDiscord } from './alerts.js';
import { isAlertSilenced } from './silences.js';

// In-memory storage for recent webhooks (for debugging)
const recentWebhooks = [];
const MAX_WEBHOOKS = 10;

/**
 * Validates the token from the Authorization header or query parameter
 */
export function validateBearerToken(req) {
  const bearerToken = process.env.WEBHOOK_TOKEN;
  const urlToken = process.env.WEBHOOK_URL_TOKEN;
  
  if (!bearerToken && !urlToken) {
    logger.warn('No WEBHOOK_TOKEN or WEBHOOK_URL_TOKEN configured in environment');
    return false;
  }
  
  // First, try Authorization header (preferred - uses WEBHOOK_TOKEN)
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ') && bearerToken) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    if (token === bearerToken) {
      logger.debug('Token validated via Authorization header');
      return true;
    }
  }
  
  // Fallback to query parameter (for services that don't support custom headers - uses WEBHOOK_URL_TOKEN)
  const queryToken = req.query.token;
  if (queryToken && urlToken && queryToken === urlToken) {
    logger.debug('Token validated via query parameter (URL token)');
    return true;
  }
  
  return false;
}

/**
 * Stores a webhook in memory for debugging and sends to Discord
 */
export async function storeWebhook(webhook) {
  const timestampedWebhook = {
    ...webhook,
    receivedAt: new Date().toISOString(),
    id: Date.now(),
    timestamp: Date.now(),
    payload: webhook
  };
  
  // Check if alert is silenced
  const silence = isAlertSilenced(timestampedWebhook);
  if (silence) {
    timestampedWebhook.silenced = true;
    timestampedWebhook.silencedBy = silence.id;
    
    logger.info({ 
      webhookId: timestampedWebhook.id,
      silenceId: silence.id,
      pattern: silence.pattern
    }, 'Alert silenced, not sending to Discord');
  } else {
    // Send to Discord if channel is configured and not silenced
    const channelId = process.env.DEFAULT_CHANNEL_ID;
    if (channelId) {
      const message = await sendAlertToDiscord(timestampedWebhook, channelId);
      if (message) {
        timestampedWebhook.messageId = message.id;
        timestampedWebhook.channelId = message.channel_id;
      }
    }
  }
  
  recentWebhooks.unshift(timestampedWebhook);
  
  // Keep only the most recent webhooks
  if (recentWebhooks.length > MAX_WEBHOOKS) {
    recentWebhooks.pop();
  }
  
  logger.debug({ 
    webhookId: timestampedWebhook.id,
    totalStored: recentWebhooks.length,
    silenced: timestampedWebhook.silenced || false
  }, 'Webhook stored');
  
  return timestampedWebhook;
}

/**
 * Gets recent webhooks for debugging
 */
export function getRecentWebhooks() {
  return recentWebhooks;
}

/**
 * Clears all stored webhooks
 */
export function clearWebhooks() {
  recentWebhooks.length = 0;
  logger.info('Cleared all stored webhooks');
}

/**
 * Gets a webhook by ID
 */
export function getWebhookById(id) {
  return recentWebhooks.find(w => w.id === id);
}

/**
 * Acknowledges a webhook
 */
export function acknowledgeWebhook(id, user) {
  const webhook = getWebhookById(id);
  
  if (!webhook) {
    logger.warn({ webhookId: id }, 'Webhook not found for acknowledgment');
    return null;
  }
  
  if (webhook.acknowledged) {
    logger.warn({ webhookId: id }, 'Webhook already acknowledged');
    return null;
  }
  
  webhook.acknowledged = true;
  webhook.acknowledgedBy = user?.username || 'Unknown';
  webhook.acknowledgedById = user?.id;
  webhook.acknowledgedAt = new Date().toISOString();
  
  logger.info({ 
    webhookId: id,
    acknowledgedBy: webhook.acknowledgedBy
  }, 'Webhook acknowledged');
  
  return webhook;
}

/**
 * Acknowledges multiple webhooks matching a pattern
 */
export function acknowledgeWebhooksByPattern(pattern, user) {
  const regex = new RegExp(pattern, 'i'); // Case-insensitive matching
  const acknowledged = [];
  const alreadyAcked = [];
  
  for (const webhook of recentWebhooks) {
    if (webhook.acknowledged) {
      continue; // Skip already acknowledged
    }
    
    // Check if pattern matches any relevant field
    const payload = webhook.payload || {};
    const title = payload.title || payload.subject || '';
    const description = payload.description || payload.message || payload.body || '';
    const severity = payload.severity || payload.level || '';
    const service = payload.service || '';
    const hostname = payload.hostname || payload.host || '';
    
    // Combine all fields for matching (don't convert to lowercase since regex is case-insensitive)
    const searchText = `${title} ${description} ${severity} ${service} ${hostname}`;
    
    if (regex.test(searchText)) {
      webhook.acknowledged = true;
      webhook.acknowledgedBy = user?.username || 'Unknown';
      webhook.acknowledgedById = user?.id;
      webhook.acknowledgedAt = new Date().toISOString();
      acknowledged.push(webhook);
      
      logger.info({ 
        webhookId: webhook.id,
        acknowledgedBy: webhook.acknowledgedBy,
        pattern
      }, 'Webhook acknowledged by pattern');
    }
  }
  
  return { acknowledged, alreadyAcked };
}