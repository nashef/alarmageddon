import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import logger from './src/logger.js';
import { validateBearerToken, storeWebhook, getRecentWebhooks, getWebhookById, acknowledgeWebhook } from './src/webhooks.js';
import { formatAlertList, updateAlertMessage } from './src/alerts.js';

// Create an express app
const app = express();
// Get port, or default to 31337
const PORT = process.env.PORT || 31337;

// Parse JSON bodies for webhook endpoints
app.use('/webhooks', express.json());

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;
  
  // Log incoming interaction
  logger.debug({ 
    interaction_id: id, 
    type, 
    data 
  }, 'Received interaction');

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    // "ping" command - we'll implement this in Iteration 1
    if (name === 'ping') {
      logger.info({ command: name, interaction_id: id }, 'Handling ping command');
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Pong!'
        },
      });
    }

    // "webhook" command with subcommands
    if (name === 'webhook') {
      const subcommand = options?.[0]?.name;
      
      if (subcommand === 'test') {
        logger.info({ command: name, subcommand, interaction_id: id }, 'Handling webhook test command');
        
        // Send test webhook to ourselves
        const webhookUrl = `http://localhost:${PORT}/webhooks/google-alerts`;
        const testPayload = {
          title: 'Test Alert',
          message: 'This is a test webhook triggered from Discord',
          severity: 'info',
          timestamp: new Date().toISOString(),
          source: 'discord-test'
        };
        
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`
            },
            body: JSON.stringify(testPayload)
          });
          
          if (response.ok) {
            const result = await response.json();
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `✅ Test webhook sent successfully! Webhook ID: ${result.webhookId}`
              },
            });
          } else {
            logger.error({ status: response.status }, 'Test webhook failed');
            return res.send({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ Test webhook failed with status: ${response.status}`
              },
            });
          }
        } catch (error) {
          logger.error({ error: error.message }, 'Failed to send test webhook');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Failed to send test webhook: ${error.message}`
            },
          });
        }
      }
    }

    // "alert" command with subcommands
    if (name === 'alert') {
      const subcommand = options?.[0]?.name;
      
      if (subcommand === 'list') {
        logger.info({ command: name, subcommand, interaction_id: id }, 'Handling alert list command');
        
        const recentWebhooks = getRecentWebhooks();
        const response = formatAlertList(recentWebhooks);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: response
        });
      }
      
      if (subcommand === 'ack') {
        const alertId = options?.[0]?.options?.[0]?.value;
        const user = req.body.member?.user || req.body.user;
        
        logger.info({ 
          command: name, 
          subcommand, 
          interaction_id: id,
          alertId
        }, 'Handling alert ack command');
        
        const webhookId = parseInt(alertId);
        const webhook = acknowledgeWebhook(webhookId, user);
        
        if (webhook) {
          // Update the Discord message
          await updateAlertMessage(webhook);
          
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Alert ${webhookId} acknowledged successfully`,
              ephemeral: true
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Alert ${alertId} not found or already acknowledged`,
              ephemeral: true
            }
          });
        }
      }
    }

    logger.error({ command: name, interaction_id: id }, 'Unknown command received');
    return res.status(400).json({ error: 'unknown command' });
  }

  /**
   * Handle message component interactions (buttons, selects, etc)
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;
    
    // Handle acknowledge button clicks
    if (custom_id && custom_id.startsWith('ack_')) {
      const webhookId = parseInt(custom_id.substring(4));
      const user = req.body.member?.user || req.body.user;
      
      logger.info({ 
        interaction_id: id, 
        webhookId,
        user: user?.username 
      }, 'Handling acknowledge button');
      
      // Acknowledge the webhook
      const webhook = acknowledgeWebhook(webhookId, user);
      
      if (webhook) {
        // Update the Discord message
        await updateAlertMessage(webhook);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `✅ Alert acknowledged by ${user?.username || 'Unknown'}`,
            ephemeral: true
          }
        });
      } else {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Alert not found or already acknowledged',
            ephemeral: true
          }
        });
      }
    }
  }

  logger.error({ type, interaction_id: id }, 'Unknown interaction type');
  return res.status(400).json({ error: 'unknown interaction type' });
});

/**
 * Webhook endpoint for Google Alerts
 */
app.post('/webhooks/google-alerts', async (req, res) => {
  // Validate authentication
  if (!validateBearerToken(req)) {
    logger.warn({ 
      ip: req.ip,
      userAgent: req.get('user-agent')
    }, 'Unauthorized webhook attempt');
    
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Store the webhook and send to Discord
  const webhook = await storeWebhook({
    source: 'google-alerts',
    ...req.body
  });
  
  logger.info({ 
    webhookId: webhook.id,
    source: 'google-alerts'
  }, 'Webhook received');
  
  // Return success
  res.status(200).json({ 
    success: true,
    webhookId: webhook.id,
    message: 'Webhook received'
  });
});

/**
 * Debug endpoint to view recent webhooks
 */
app.get('/webhooks/recent', (req, res) => {
  // Check for simple auth (can be same token or different)
  if (!validateBearerToken(req)) {
    logger.warn({ 
      ip: req.ip 
    }, 'Unauthorized attempt to view recent webhooks');
    
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const webhooks = getRecentWebhooks();
  
  logger.debug({ 
    count: webhooks.length 
  }, 'Recent webhooks requested');
  
  res.status(200).json({
    count: webhooks.length,
    webhooks: webhooks
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  logger.debug({
    ip: req.ip,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path
  }, 'Health check requested');
  
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});