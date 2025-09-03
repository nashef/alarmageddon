import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import logger from './src/logger.js';
import { validateBearerToken, storeWebhook, getRecentWebhooks, getWebhookById, acknowledgeWebhook, acknowledgeWebhooksByPattern } from './src/webhooks.js';
import { formatAlertList, updateAlertMessage } from './src/alerts.js';
import { createSilence, getActiveSilences, deleteSilence, formatSilenceList, setupSilenceCleanup } from './src/silences.js';
import { getAlertRouter } from './src/router.js';
import { initDatabase } from './src/database.js';

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
        
        const recentWebhooks = await getRecentWebhooks();
        const response = formatAlertList(recentWebhooks);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: response
        });
      }
      
      if (subcommand === 'ack') {
        const pattern = options?.[0]?.options?.[0]?.value || '.*'; // Default to match all
        const user = req.body.member?.user || req.body.user;
        
        logger.info({ 
          command: name, 
          subcommand, 
          interaction_id: id,
          pattern
        }, 'Handling alert ack command with pattern');
        
        const { acknowledged, alreadyAcked } = await acknowledgeWebhooksByPattern(pattern, user);
        
        // Update Discord messages for all acknowledged alerts
        for (const webhook of acknowledged) {
          await updateAlertMessage(webhook);
        }
        
        let responseMessage = '';
        
        if (acknowledged.length > 0) {
          const titles = acknowledged.map(w => w.payload?.title || w.payload?.subject || 'Alert').slice(0, 3);
          const titlesText = titles.join(', ');
          const moreText = acknowledged.length > 3 ? ` and ${acknowledged.length - 3} more` : '';
          responseMessage = `✅ Acknowledged ${acknowledged.length} alert(s): ${titlesText}${moreText}`;
        } else {
          responseMessage = `❌ No unacknowledged alerts found matching pattern: ${pattern}`;
        }
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: responseMessage,
            ephemeral: true
          }
        });
      }
    }

    // "silence" command with subcommands
    if (name === 'silence') {
      const subcommand = options?.[0]?.name;
      
      if (subcommand === 'create') {
        const duration = options?.[0]?.options?.find(o => o.name === 'duration')?.value;
        const pattern = options?.[0]?.options?.find(o => o.name === 'pattern')?.value || '.*';
        const user = req.body.member?.user || req.body.user;
        
        logger.info({ 
          command: name, 
          subcommand, 
          interaction_id: id,
          duration,
          pattern
        }, 'Handling silence create command');
        
        const silence = await createSilence(pattern, duration, user);
        
        if (silence) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🔇 Created silence \`${silence.id}\` for pattern \`${pattern}\` lasting ${duration}. Expires at ${new Date(silence.expiresAt).toLocaleString()}`,
              ephemeral: true
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Invalid duration format. Use formats like: 30s, 5m, 2h, 1d`,
              ephemeral: true
            }
          });
        }
      }
      
      if (subcommand === 'list') {
        logger.info({ command: name, subcommand, interaction_id: id }, 'Handling silence list command');
        
        const silences = await getActiveSilences();
        const response = formatSilenceList(silences);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: response
        });
      }
      
      if (subcommand === 'delete') {
        const silenceId = options?.[0]?.options?.[0]?.value;
        
        logger.info({ 
          command: name, 
          subcommand, 
          interaction_id: id,
          silenceId
        }, 'Handling silence delete command');
        
        const deleted = await deleteSilence(silenceId);
        
        if (deleted) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `✅ Deleted silence \`${silenceId}\``,
              ephemeral: true
            }
          });
        } else {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Silence \`${silenceId}\` not found`,
              ephemeral: true
            }
          });
        }
      }
    }

    // "route" command with subcommands
    if (name === 'route') {
      const subcommand = options?.[0]?.name;
      const router = getAlertRouter();
      
      if (subcommand === 'list') {
        logger.info({ command: name, subcommand, interaction_id: id }, 'Handling route list command');
        
        const decisions = await router.getRecentDecisions();
        
        if (!decisions || decisions.length === 0) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'No routing decisions recorded yet.',
              ephemeral: true
            }
          });
        }
        
        const decisionList = decisions.slice(0, 10).map((d, i) => {
          const time = new Date(d.timestamp).toLocaleTimeString();
          return `**${i + 1}.** \`${d.action}\` → ${d.destination ? `<#${d.destination}>` : 'none'} | ${d.alertTitle.substring(0, 30)} | ${time}`;
        }).join('\n');
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: 'Recent Routing Decisions',
              description: decisionList,
              color: 0x00FFFF,
              footer: {
                text: `Showing ${Math.min(10, decisions.length)} of ${decisions.length} decisions`
              }
            }],
            ephemeral: true
          }
        });
      }
      
      if (subcommand === 'stats') {
        logger.info({ command: name, subcommand, interaction_id: id }, 'Handling route stats command');
        
        const stats = await router.getStats();
        
        const actionStats = Object.entries(stats.byAction)
          .map(([action, count]) => `\`${action}\`: ${count}`)
          .join('\n') || 'No actions recorded';
        
        const destStats = Object.entries(stats.byDestination)
          .slice(0, 5)
          .map(([dest, count]) => `<#${dest}>: ${count}`)
          .join('\n') || 'No destinations recorded';
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            embeds: [{
              title: 'Routing Statistics',
              fields: [
                {
                  name: 'Total Decisions',
                  value: `${stats.totalDecisions}`,
                  inline: true
                },
                {
                  name: 'By Action',
                  value: actionStats,
                  inline: true
                },
                {
                  name: 'Top Destinations',
                  value: destStats,
                  inline: false
                }
              ],
              color: 0x00FFFF
            }],
            ephemeral: true
          }
        });
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
      const webhook = await acknowledgeWebhook(webhookId, user);
      
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
app.get('/webhooks/recent', async (req, res) => {
  // Check for simple auth (can be same token or different)
  if (!validateBearerToken(req)) {
    logger.warn({ 
      ip: req.ip 
    }, 'Unauthorized attempt to view recent webhooks');
    
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const webhooks = await getRecentWebhooks();
  
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

// Initialize database and start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started with database persistence');
    
    // Set up periodic silence cleanup
    setupSilenceCleanup();
  });
}).catch(error => {
  logger.error({ error: error.message }, 'Failed to start server');
  process.exit(1);
});