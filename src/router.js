import logger from './logger.js';

// In-memory storage for routing decisions (for debugging)
const routingDecisions = [];
const MAX_DECISIONS = 100;

/**
 * AlertRouter - Routes alerts to appropriate Discord channels
 * For now, this is a pass-through router that sends everything to DEFAULT_CHANNEL_ID
 * Future iterations will add rule-based routing
 */
export class AlertRouter {
  constructor() {
    this.defaultChannelId = process.env.DEFAULT_CHANNEL_ID;
  }

  /**
   * Route an alert to the appropriate destination
   * @param {Object} alert - The alert to route
   * @returns {Object} Routing decision with action and destination
   */
  async route(alert) {
    // Extract alert properties for routing decisions
    const payload = alert.payload || alert;
    const service = payload.service || '';
    const severity = payload.severity || payload.level || '';
    const title = payload.title || payload.subject || '';
    
    // Simple routing rules (hardcoded for now - will be database-driven in 6.5)
    let decision = null;
    
    // Rule: Route database alerts to #db channel (you need to provide the channel ID)
    if (service.toLowerCase() === 'database' || 
        title.toLowerCase().includes('database') || 
        title.toLowerCase().includes('db')) {
      // TODO: Replace with actual #db channel ID
      const dbChannelId = process.env.DB_CHANNEL_ID || this.defaultChannelId;
      decision = {
        alertId: alert.id,
        action: 'REDIRECT',
        destination: dbChannelId,
        reason: 'Matched database routing rule',
        timestamp: new Date().toISOString()
      };
    }
    
    // Default routing if no rules matched
    if (!decision) {
      decision = {
        alertId: alert.id,
        action: 'PASS',
        destination: this.defaultChannelId,
        reason: 'Default routing (no matching rules)',
        timestamp: new Date().toISOString()
      };
    }
    
    // Log routing decision
    await this.logRoutingDecision(alert, decision);
    
    return decision;
  }

  /**
   * Log a routing decision for debugging and auditing
   */
  async logRoutingDecision(alert, decision) {
    // Extract key fields for logging
    const payload = alert.payload || alert;
    const severity = payload.severity || payload.level || 'info';
    const title = payload.title || payload.subject || 'Alert';
    
    const logEntry = {
      ...decision,
      alertTitle: title,
      alertSeverity: severity,
      alertSource: payload.source || 'unknown'
    };
    
    // Store in memory for debugging
    routingDecisions.unshift(logEntry);
    if (routingDecisions.length > MAX_DECISIONS) {
      routingDecisions.pop();
    }
    
    // Log to file
    logger.debug({
      routingDecision: decision,
      alertId: alert.id,
      severity,
      title
    }, 'Routing decision made');
    
    return logEntry;
  }

  /**
   * Get recent routing decisions for debugging
   */
  getRecentDecisions() {
    return [...routingDecisions];
  }

  /**
   * Clear routing decision history
   */
  clearDecisions() {
    routingDecisions.length = 0;
    logger.info('Cleared routing decision history');
  }

  /**
   * Get routing statistics
   */
  getStats() {
    const stats = {
      totalDecisions: routingDecisions.length,
      byAction: {},
      byDestination: {}
    };
    
    for (const decision of routingDecisions) {
      // Count by action
      stats.byAction[decision.action] = (stats.byAction[decision.action] || 0) + 1;
      
      // Count by destination
      const dest = decision.destination || 'none';
      stats.byDestination[dest] = (stats.byDestination[dest] || 0) + 1;
    }
    
    return stats;
  }
}

// Singleton instance
let routerInstance = null;

/**
 * Get or create the AlertRouter instance
 */
export function getAlertRouter() {
  if (!routerInstance) {
    routerInstance = new AlertRouter();
    logger.info('AlertRouter initialized');
  }
  return routerInstance;
}