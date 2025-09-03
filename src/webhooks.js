import logger from './logger.js';
import { sendAlertToDiscord } from './alerts.js';
import { isAlertSilenced } from './silences.js';
import { getAlertRouter } from './router.js';
import { saveAlert, updateAlert, getAlert, getRecentAlerts as getRecentAlertsFromDB, saveRoutingDecision } from './database.js';

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
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    payload: webhook,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    silenced: false,
    silencedBy: null
  };
  
  // Check if alert is silenced
  const silence = await isAlertSilenced(timestampedWebhook);
  if (silence) {
    timestampedWebhook.silenced = true;
    timestampedWebhook.silencedBy = silence.id;
    
    logger.info({ 
      webhookId: timestampedWebhook.id,
      silenceId: silence.id,
      pattern: silence.pattern
    }, 'Alert silenced, not sending to Discord');
  } else {
    // Route the alert through AlertRouter
    const router = getAlertRouter();
    const routingDecision = await router.route(timestampedWebhook);
    
    timestampedWebhook.routingDecision = routingDecision;
    
    // Save routing decision to database
    await saveRoutingDecision(routingDecision);
    
    // Handle routing decision
    if (routingDecision.action === 'PASS' && routingDecision.destination) {
      const message = await sendAlertToDiscord(timestampedWebhook, routingDecision.destination);
      if (message) {
        timestampedWebhook.messageId = message.id;
        timestampedWebhook.channelId = message.channel_id;
      }
    } else if (routingDecision.action === 'DROP') {
      logger.info({ 
        webhookId: timestampedWebhook.id,
        routingDecision
      }, 'Alert dropped by router');
    } else if (routingDecision.action === 'REDIRECT') {
      // Handle redirect to different channel
      const message = await sendAlertToDiscord(timestampedWebhook, routingDecision.destination);
      if (message) {
        timestampedWebhook.messageId = message.id;
        timestampedWebhook.channelId = message.channel_id;
      }
    }
  }
  
  // Save to database
  await saveAlert(timestampedWebhook);
  
  logger.debug({ 
    webhookId: timestampedWebhook.id,
    silenced: timestampedWebhook.silenced || false,
    routed: !timestampedWebhook.silenced
  }, 'Webhook stored in database');
  
  return timestampedWebhook;
}

/**
 * Gets recent webhooks for debugging
 */
export async function getRecentWebhooks() {
  return await getRecentAlertsFromDB(10);
}

/**
 * Clears all stored webhooks
 */
export function clearWebhooks() {
  // No longer needed with database storage
  logger.info('Webhook clearing deprecated - using database retention');
}

/**
 * Gets a webhook by ID
 */
export async function getWebhookById(id) {
  return await getAlert(id);
}

/**
 * Acknowledges a webhook
 */
export async function acknowledgeWebhook(id, user) {
  const webhook = await getAlert(id);
  
  if (!webhook) {
    logger.warn({ webhookId: id }, 'Webhook not found for acknowledgment');
    return null;
  }
  
  if (webhook.acknowledged) {
    logger.warn({ webhookId: id }, 'Webhook already acknowledged');
    return null;
  }
  
  const updates = {
    acknowledged: 1,
    acknowledgedBy: user?.username || 'Unknown',
    acknowledgedAt: new Date().toISOString()
  };
  
  const success = await updateAlert(id, updates);
  
  if (success) {
    logger.info({ 
      webhookId: id,
      acknowledgedBy: updates.acknowledgedBy
    }, 'Webhook acknowledged');
    
    return await getAlert(id);
  }
  
  return null;
}

/**
 * Acknowledges multiple webhooks matching a pattern
 */
export async function acknowledgeWebhooksByPattern(pattern, user) {
  const regex = new RegExp(pattern, 'i'); // Case-insensitive matching
  const acknowledged = [];
  const alreadyAcked = [];
  
  const recentWebhooks = await getRecentAlertsFromDB(100);
  
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
      const updates = {
        acknowledged: 1,
        acknowledgedBy: user?.username || 'Unknown',
        acknowledgedAt: new Date().toISOString()
      };
      
      const success = await updateAlert(webhook.id, updates);
      
      if (success) {
        const updatedWebhook = await getAlert(webhook.id);
        acknowledged.push(updatedWebhook);
        
        logger.info({ 
          webhookId: webhook.id,
          acknowledgedBy: updates.acknowledgedBy,
          pattern
        }, 'Webhook acknowledged by pattern');
      }
    }
  }
  
  return { acknowledged, alreadyAcked };
}