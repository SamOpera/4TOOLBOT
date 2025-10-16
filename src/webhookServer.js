const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const winston = require('winston');
const cors = require('cors');
const compression = require('compression');

class WebhookServer {
    constructor(config, telegramBotManager) {
        this.config = config;
        this.telegramBotManager = telegramBotManager;
        this.app = express();
        this.server = null;
        this.bot = null;
        
        // Initialize logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'webhook-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'webhook-combined.log' })
            ]
        });

        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }

        this.setupMiddleware();
        this.setupRoutes();
        this.initializeBot();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'],
            credentials: true
        }));

        // Compression
        this.app.use(compression());

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            this.logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            next();
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            this.logger.error('Webhook server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Test webhook endpoint for debugging
        this.app.post('/test-webhook', (req, res) => {
            this.logger.info('Test webhook request received', {
                headers: req.headers,
                body: req.body,
                ip: req.ip
            });
            
            // Simulate a valid Telegram update
            const testUpdate = {
                update_id: 999999,
                message: {
                    message_id: 1,
                    from: {
                        id: 123456789,
                        is_bot: false,
                        first_name: 'Test',
                        username: 'testuser'
                    },
                    chat: {
                        id: 123456789,
                        first_name: 'Test',
                        username: 'testuser',
                        type: 'private'
                    },
                    date: Math.floor(Date.now() / 1000),
                    text: 'test'
                }
            };
            
            res.json({ 
                status: 'test-success', 
                message: 'Test webhook processed successfully',
                update: testUpdate
            });
        });

        // Debug endpoint to show current configuration
        this.app.get('/debug', (req, res) => {
            res.json({
                config: {
                    hasTelegramToken: !!this.config.telegram.token,
                    hasWebhookUrl: !!this.config.telegram.webhook,
                    webhookUrl: this.config.telegram.webhook,
                    webhookPort: this.config.telegram.webhookPort,
                    polling: this.config.telegram.polling
                },
                environment: {
                    nodeEnv: process.env.NODE_ENV,
                    skipWebhook: process.env.TELEGRAM_SKIP_SET_WEBHOOK,
                    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ? 'set' : 'not set'
                },
                bot: {
                    initialized: !!this.bot,
                    hasWebhook: this.bot ? 'checking...' : 'not initialized'
                }
            });
        });

        // Telegram webhook endpoint
        this.app.post('/webhook', async (req, res) => {
            try {
                // Verify the request is from Telegram
                const verificationResult = this.verifyTelegramRequest(req);
                if (!verificationResult.valid) {
                    this.logger.warn('Invalid webhook request received', {
                        ip: req.ip,
                        headers: req.headers,
                        userAgent: req.get('User-Agent'),
                        secretToken: req.headers['x-telegram-bot-api-secret-token'] ? 'present' : 'missing',
                        expectedToken: process.env.TELEGRAM_WEBHOOK_SECRET || 'some-strong-secret'
                    });
                    return res.status(401).json({ error: 'Unauthorized' });
                }
                
                this.logger.info('Webhook request verified successfully', {
                    ip: req.ip,
                    verificationMethod: verificationResult.method,
                    userAgent: req.get('User-Agent')
                });

                // Process the update
                const update = req.body;
                
                // Validate update structure
                if (!update || typeof update !== 'object') {
                    this.logger.warn('Invalid update structure received', { body: req.body });
                    return res.status(400).json({ error: 'Invalid update structure' });
                }
                
                // Enhanced logging for debugging callback query issues
                this.logger.info('Received webhook update', {
                    updateId: update.update_id,
                    type: this.getUpdateType(update),
                    hasMessage: !!update.message,
                    hasCallbackQuery: !!update.callback_query,
                    messageStructure: update.message ? {
                        hasChat: !!update.message.chat,
                        hasFrom: !!update.message.from,
                        hasText: !!update.message.text
                    } : null,
                    callbackQueryDetails: update.callback_query ? {
                        id: update.callback_query.id,
                        hasFrom: !!update.callback_query.from,
                        hasMessage: !!update.callback_query.message,
                        hasData: !!update.callback_query.data,
                        messageHasChat: !!(update.callback_query.message && update.callback_query.message.chat)
                    } : null
                });

                // Handle the update through the bot manager
                await this.telegramBotManager.handleWebhookUpdate(update);

                res.json({ status: 'ok' });
            } catch (error) {
                this.logger.error('Error processing webhook update:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Set webhook endpoint (for manual webhook management)
        this.app.post('/set-webhook', async (req, res) => {
            try {
                const { url, secret_token } = req.body;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL is required' });
                }

                const result = await this.bot.setWebHook(url, {
                    secret_token: secret_token || process.env.TELEGRAM_WEBHOOK_SECRET,
                    max_connections: 40,
                    allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result']
                });

                this.logger.info('Webhook set successfully', { url, result });
                res.json({ success: true, result });
            } catch (error) {
                this.logger.error('Error setting webhook:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Delete webhook endpoint
        this.app.delete('/delete-webhook', async (req, res) => {
            try {
                const result = await this.bot.deleteWebHook();
                this.logger.info('Webhook deleted successfully', { result });
                res.json({ success: true, result });
            } catch (error) {
                this.logger.error('Error deleting webhook:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Get webhook info endpoint
        this.app.get('/webhook-info', async (req, res) => {
            try {
                const info = await this.bot.getWebHookInfo();
                res.json(info);
            } catch (error) {
                this.logger.error('Error getting webhook info:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Catch-all route for undefined endpoints
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    verifyTelegramRequest(req) {
        // Check for Telegram webhook secret token (most reliable method)
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET || 'some-strong-secret';
        
        if (secretToken === expectedToken) {
            return { valid: true, method: 'secret_token' };
        }
        
        // Fallback: Check User-Agent for Telegram requests
        const userAgent = req.get('User-Agent');
        if (userAgent && (
            userAgent.includes('TelegramBot') || 
            userAgent.includes('Go-http-client') ||
            userAgent.includes('curl') // Allow curl for testing
        )) {
            return { valid: true, method: 'user_agent' };
        }
        
        // Allow local development
        if (process.env.NODE_ENV === 'development' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') {
            return { valid: true, method: 'local_development' };
        }
        
        return { valid: false, method: 'none' };
    }

    getUpdateType(update) {
        if (update.message) return 'message';
        if (update.callback_query) return 'callback_query';
        if (update.inline_query) return 'inline_query';
        if (update.chosen_inline_result) return 'chosen_inline_result';
        if (update.channel_post) return 'channel_post';
        if (update.edited_message) return 'edited_message';
        if (update.edited_channel_post) return 'edited_channel_post';
        if (update.shipping_query) return 'shipping_query';
        if (update.pre_checkout_query) return 'pre_checkout_query';
        if (update.poll) return 'poll';
        if (update.poll_answer) return 'poll_answer';
        if (update.my_chat_member) return 'my_chat_member';
        if (update.chat_member) return 'chat_member';
        if (update.chat_join_request) return 'chat_join_request';
        return 'unknown';
    }

    async initializeBot() {
    try {
        // Create bot instance without polling
        this.bot = new TelegramBot(this.config.telegram.token, { polling: false });

        // Add Telegram shortcut commands (slash commands)
        this.bot.setMyCommands([
            { command: 'start', description: 'Start using the bot' },
            { command: 'wallet', description: 'Manage your Solana wallet' },
            { command: 'strategy', description: 'Configure trading strategies' },
            { command: 'portfolio', description: 'View your holdings and P&L' },
            { command: 'claim', description: 'Claim 4TOOL fee rewards' },
            { command: 'status', description: 'Check bot status' },
            { command: 'help', description: 'Show this help message' },
            { command: 'buy', description: 'Buy a token' },
            { command: 'sell', description: 'Sell a token' },
            { command: 'set', description: 'Open settings menu' }
        ]);

        // Set webhook if URL is provided and valid HTTPS, unless explicitly skipped
        const skipSet = (process.env.TELEGRAM_SKIP_SET_WEBHOOK || '').toLowerCase() === 'true';
        const url = this.config.telegram.webhook;
        if (url) {
            if (skipSet) {
                this.logger.warn('Skipping setWebHook due to TELEGRAM_SKIP_SET_WEBHOOK=true');
            } else if (typeof url === 'string' && url.startsWith('https://')) {
                await this.setWebhook();
            } else {
                this.logger.error('TELEGRAM_WEBHOOK_URL must be HTTPS in webhook-only mode. Set a valid URL or set TELEGRAM_SKIP_SET_WEBHOOK=true for local testing.');
            }
        }

        this.logger.info('Webhook bot initialized successfully');
        this.botInitialized = true;
    } catch (error) {
        this.logger.error('Failed to initialize webhook bot:', error);
        throw error;
    }
}

    // Method to wait for bot initialization
    async waitForBotInitialization() {
        if (this.botInitialized) {
            return this.bot;
        }
        
        // Wait for bot to be initialized
        while (!this.botInitialized) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return this.bot;
    }

    async setWebhook() {
        try {
            const webhookUrl = `${this.config.telegram.webhook}/webhook`;
            const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || 'your-secret-token';
            
            const result = await this.bot.setWebHook(webhookUrl, {
                secret_token: secretToken,
                max_connections: 40,
                allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result']
            });

            this.logger.info('Webhook set successfully', { 
                url: webhookUrl, 
                result,
                secretToken: secretToken.substring(0, 8) + '...'
            });

            return result;
        } catch (error) {
            this.logger.error('Failed to set webhook:', error);
            throw error;
        }
    }

    async start(port = process.env.PORT || 3000) {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(port, () => {
                    this.logger.info(`Webhook server started on port ${port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    this.logger.error('Webhook server error:', error);
                    reject(error);
                });

                // Graceful shutdown
                process.on('SIGTERM', () => this.shutdown());
                process.on('SIGINT', () => this.shutdown());

            } catch (error) {
                this.logger.error('Failed to start webhook server:', error);
                reject(error);
            }
        });
    }

    async shutdown() {
        this.logger.info('Shutting down webhook server...');
        
        try {
            // Delete webhook
            if (this.bot) {
                await this.bot.deleteWebHook();
                this.logger.info('Webhook deleted successfully');
            }

            // Close server
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Webhook server closed');
                    process.exit(0);
                });
            }
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    getBot() {
        if (!this.bot || !this.botInitialized) {
            throw new Error('Bot not yet initialized. Call waitForBotInitialization() first.');
        }
        return this.bot;
    }
}

module.exports = WebhookServer;

