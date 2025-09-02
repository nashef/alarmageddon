import logger from './logger.js';

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
 * Stores a webhook in memory for debugging
 */
export function storeWebhook(webhook) {
  const timestampedWebhook = {
    ...webhook,
    receivedAt: new Date().toISOString(),
    id: Date.now()
  };
  
  recentWebhooks.unshift(timestampedWebhook);
  
  // Keep only the most recent webhooks
  if (recentWebhooks.length > MAX_WEBHOOKS) {
    recentWebhooks.pop();
  }
  
  logger.debug({ 
    webhookId: timestampedWebhook.id,
    totalStored: recentWebhooks.length 
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