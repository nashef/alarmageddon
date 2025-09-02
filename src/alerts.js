import { DiscordRequest } from '../utils.js';
import logger from './logger.js';

// Format webhook payload into Discord embed
export function formatAlert(webhook) {
  const { id, timestamp, payload } = webhook;
  
  // Extract relevant fields from payload
  const title = payload.title || payload.subject || 'Alert';
  const description = payload.description || payload.message || payload.body || 'No description provided';
  const severity = payload.severity || payload.level || 'info';
  const source = payload.source || payload.service || 'google-alerts';
  
  // Determine color based on severity
  const severityColors = {
    critical: 0xFF0000, // Red
    high: 0xFF9900,     // Orange  
    medium: 0xFFFF00,   // Yellow
    low: 0x00FF00,      // Green
    info: 0x0099FF,     // Blue
  };
  
  const color = severityColors[severity.toLowerCase()] || severityColors.info;
  
  // Build embed
  const embed = {
    title: title.substring(0, 256), // Discord title limit
    description: description.substring(0, 4096), // Discord description limit
    color: color,
    fields: [
      {
        name: 'Severity',
        value: severity.toUpperCase(),
        inline: true
      },
      {
        name: 'Source',
        value: source,
        inline: true
      },
      {
        name: 'Alert ID',
        value: `${id}`,
        inline: true
      }
    ],
    timestamp: new Date(timestamp).toISOString(),
    footer: {
      text: 'Alarmageddon'
    }
  };
  
  // Add any additional fields from payload
  if (payload.url) {
    embed.url = payload.url;
  }
  
  if (payload.hostname || payload.host) {
    embed.fields.push({
      name: 'Host',
      value: payload.hostname || payload.host,
      inline: true
    });
  }
  
  if (payload.service) {
    embed.fields.push({
      name: 'Service', 
      value: payload.service,
      inline: true
    });
  }
  
  return embed;
}

// Send alert to Discord channel
export async function sendAlertToDiscord(webhook, channelId) {
  if (!channelId) {
    logger.warn('No channel ID provided for alert');
    return null;
  }
  
  const embed = formatAlert(webhook);
  
  const messageData = {
    embeds: [embed],
    components: [
      {
        type: 1, // Action row
        components: [
          {
            type: 2, // Button
            style: 3, // Success (green)
            label: 'Acknowledge',
            custom_id: `ack_${webhook.id}`,
            emoji: {
              name: '✅'
            }
          }
        ]
      }
    ]
  };
  
  try {
    const endpoint = `channels/${channelId}/messages`;
    const response = await DiscordRequest(endpoint, {
      method: 'POST',
      body: messageData
    });
    
    if (!response.ok) {
      const error = await response.text();
      logger.error({ 
        statusCode: response.status, 
        error,
        webhookId: webhook.id,
        channelId 
      }, 'Failed to send alert to Discord');
      return null;
    }
    
    const message = await response.json();
    logger.info({ 
      webhookId: webhook.id, 
      messageId: message.id,
      channelId: message.channel_id
    }, 'Alert sent to Discord');
    
    return message;
  } catch (error) {
    logger.error({ 
      error: error.message, 
      webhookId: webhook.id,
      channelId
    }, 'Error sending alert to Discord');
    return null;
  }
}

// Format alert list for Discord
export function formatAlertList(webhooks) {
  if (!webhooks || webhooks.length === 0) {
    return {
      content: 'No recent alerts found.',
      ephemeral: true
    };
  }
  
  const alertList = webhooks.map((webhook, index) => {
    const payload = webhook.payload || {};
    const severity = payload.severity || payload.level || 'info';
    const title = payload.title || payload.subject || 'Alert';
    const time = new Date(webhook.timestamp).toLocaleString();
    const messageId = webhook.messageId ? `([View](https://discord.com/channels/@me/${webhook.channelId}/${webhook.messageId}))` : '';
    const ackStatus = webhook.acknowledged ? ' ✅' : '';
    
    return `**${index + 1}.** ID: \`${webhook.id}\` | \`${severity.toUpperCase()}\` ${title.substring(0, 50)} - ${time} ${messageId}${ackStatus}`;
  }).join('\n');
  
  return {
    embeds: [{
      title: 'Recent Alerts',
      description: alertList,
      color: 0x0099FF,
      footer: {
        text: `Showing ${webhooks.length} most recent alerts`
      }
    }],
    ephemeral: true
  };
}

// Update an alert message in Discord
export async function updateAlertMessage(webhook) {
  if (!webhook.messageId || !webhook.channelId) {
    logger.warn({ webhookId: webhook.id }, 'Cannot update message - missing message or channel ID');
    return null;
  }
  
  const embed = formatAlert(webhook);
  
  // Add acknowledgment info to the embed
  if (webhook.acknowledged) {
    embed.fields.push({
      name: '✅ Acknowledged',
      value: `By ${webhook.acknowledgedBy} at ${new Date(webhook.acknowledgedAt).toLocaleString()}`,
      inline: false
    });
    
    // Change color to green when acknowledged
    embed.color = 0x00FF00;
  }
  
  // Update components (disable button if acknowledged)
  const components = webhook.acknowledged ? [] : [
    {
      type: 1, // Action row
      components: [
        {
          type: 2, // Button
          style: 3, // Success (green)
          label: 'Acknowledge',
          custom_id: `ack_${webhook.id}`,
          emoji: {
            name: '✅'
          }
        }
      ]
    }
  ];
  
  try {
    const endpoint = `channels/${webhook.channelId}/messages/${webhook.messageId}`;
    const response = await DiscordRequest(endpoint, {
      method: 'PATCH',
      body: {
        embeds: [embed],
        components: components
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      logger.error({ 
        statusCode: response.status, 
        error,
        webhookId: webhook.id
      }, 'Failed to update alert message');
      return null;
    }
    
    const message = await response.json();
    logger.info({ 
      webhookId: webhook.id, 
      messageId: message.id
    }, 'Alert message updated');
    
    return message;
  } catch (error) {
    logger.error({ 
      error: error.message, 
      webhookId: webhook.id
    }, 'Error updating alert message');
    return null;
  }
}