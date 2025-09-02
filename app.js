import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import logger from './src/logger.js';

// Create an express app
const app = express();
// Get port, or default to 31337
const PORT = process.env.PORT || 31337;

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
    const { name } = data;

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

    logger.error({ command: name, interaction_id: id }, 'Unknown command received');
    return res.status(400).json({ error: 'unknown command' });
  }

  logger.error({ type, interaction_id: id }, 'Unknown interaction type');
  return res.status(400).json({ error: 'unknown interaction type' });
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