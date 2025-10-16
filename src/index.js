require('dotenv').config();
const TelegramBotManager = require('./modules/telegramBot');
const WebhookServer = require('./webhookServer');
const StrategyEngine = require('./modules/strategyEngine');
const DatabaseManager = require('./modules/database');
const FeeManagement = require('./modules/feeManagement');
const TradingExecution = require('./modules/tradingExecution');
const ManualManagementService = require('./services/manualManagementService');
const winston = require('winston');
const cron = require('node-cron');

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Configuration
const config = {
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        // Webhook-only mode enforced
        polling: false,
        webhook: process.env.TELEGRAM_WEBHOOK_URL,
        webhookPort: parseInt(process.env.TELEGRAM_WEBHOOK_PORT) || 3000
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD
    },
    rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
    treasuryWallet: process.env.TREASURY_WALLET,
    marketingWallet: process.env.MARKETING_WALLET,
    feePercentage: parseFloat(process.env.FEE_PERCENTAGE) || 0.003,
    marketingShare: parseFloat(process.env.MARKETING_SHARE) || 0.5,
    minimumTokenHoldings: parseInt(process.env.MINIMUM_TOKEN_HOLDINGS) || 1000,
    jupiterApiKey: process.env.JUPITER_API_KEY,
    birdEyeApiKey: process.env.BIRDEYE_API_KEY,
    dexscreenerApiKey: process.env.DEXSCREENER_API_KEY,
    // Trading configuration - Jupiter ONLY with Raydium fallback
    tradingProvider: 'jupiter', // Force Jupiter as primary
    enableFallback: true, // Keep Raydium as fallback only
    preferJupiter: true // New flag to strongly prefer Jupiter
};

// Initialize components
const db = new DatabaseManager();
const feeManager = new FeeManagement(config);
const tradingExecution = new TradingExecution(config);
const strategyEngine = new StrategyEngine(config);

// Initialize Telegram bot manager (webhook-only)
const telegramBotManager = new TelegramBotManager(config, null);
const webhookServer = new WebhookServer(config, telegramBotManager);

// Wait for bot initialization and then set it
async function initializeBot() {
    try {
        await webhookServer.waitForBotInitialization();
        telegramBotManager.setBot(webhookServer.getBot());
        console.log('Telegram bot manager initialized successfully');
    } catch (error) {
        console.error('Failed to initialize telegram bot manager:', error);
        process.exit(1);
    }
}

// Initialize bot asynchronously
initializeBot();

// Step 2: create manualManagementService with the real telegramBot
const manualManagementService = new ManualManagementService(config, db, tradingExecution, telegramBotManager.bot);
// Step 3: set manualManagementService on telegramBot
telegramBotManager.manualManagementService = manualManagementService;

// Background jobs
function initializeBackgroundJobs() {
    // Market data update (every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        try {
            logger.info('Running market data update job');
            // TODO: Implement market data update logic
        } catch (error) {
            logger.error(`Error in market data update job: ${error.message}`);
        }
    });

    // Strategy evaluation (every minute)
    cron.schedule('* * * * *', async () => {
        try {
            logger.info('Running strategy evaluation job');
            // TODO: Implement strategy evaluation logic
        } catch (error) {
            logger.error(`Error in strategy evaluation job: ${error.message}`);
        }
    });

    // Snapshot job (every hour)
    cron.schedule('0 * * * *', async () => {
        try {
            logger.info('Running snapshot job');
            await feeManager.takeSnapshot();
        } catch (error) {
            logger.error(`Error in snapshot job: ${error.message}`);
        }
    });

    // Fee distribution (weekly)
    cron.schedule('0 0 * * 0', async () => {
        try {
            logger.info('Running fee distribution job');
            await feeManager.distributeFees();
        } catch (error) {
            logger.error(`Error in fee distribution job: ${error.message}`);
        }
    });
}

// Error handling
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.error(error.stack);
    // Don't exit the process in production
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise);
    logger.error('Reason:', reason);
});

// Start the application
async function start() {
    try {
        logger.info('Starting 4T-Bot application...');
        
        logger.info('Starting webhook server...');
        await webhookServer.start(config.telegram.webhookPort);
        logger.info(`Webhook server started on port ${config.telegram.webhookPort}`);
        
        // Initialize background jobs
        initializeBackgroundJobs();
        // Start manual management monitoring
        manualManagementService.startMonitoring();
        
        logger.info('4T-Bot application started successfully');
    } catch (error) {
        logger.error(`Error starting application: ${error.message}`);
        process.exit(1);
    }
}

// Start the application
start(); 
