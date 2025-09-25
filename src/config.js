require('dotenv').config();

const config = {
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        polling: {
            interval: 300,
            autoStart: true,
            params: {
                timeout: 10
            }
        }
    },
    birdeye: {
        apiKey: process.env.BIRDEYE_API_KEY
    },
    dexscreener: {
        apiKey: process.env.DEXSCREENER_API_KEY
    },
    helius: {
        apiKey: process.env.HELIUS_API_KEY,
        rpcEndpoint: process.env.HELIUS_RPC_ENDPOINT || 'https://api.helius.xyz/v0/rpc'
    },
    database: {
        path: process.env.DATABASE_PATH || './data/bot.db'
    },
    rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
    rules: {
        checkInterval: 5 * 60 * 1000, // 5 minutes
        maxRulesPerUser: 10,
        maxActiveRulesPerUser: 5
    },
    trading: {
        maxSlippage: 1, // 1%
        minLiquidity: 10000, // $10,000
        maxGasPrice: 100, // GWEI
        defaultTimeout: 30000, // 30 seconds
        // Trading provider: 'raydium' or 'jupiter'
        tradingProvider: process.env.TRADING_PROVIDER || 'raydium',
        // Enable fallback to other provider if primary fails
        enableFallback: process.env.ENABLE_TRADING_FALLBACK !== 'false',
        // Raydium specific settings
        raydium: {
            defaultSlippageBps: 50, // 0.5% (50 basis points)
            priorityLevel: process.env.RAYDIUM_PRIORITY_LEVEL || 'h', // 'vh', 'h', 'm'
            maxTransactionRetries: 3,
            retryDelay: 1000 // 1 second
        }
    },
    copyTrading: {
        pollInterval: 10000, // 10 seconds
        maxProcessedSwaps: 1000, // Keep last 1000 processed swaps
        defaultSettings: {
            maxTradeAmount: 10, // 10 SOL
            minTradeAmount: 0.1, // 0.1 SOL
            maxDailyTrades: 10,
            autoConfirmTrades: false,
            notifyOnTrade: true
        },
        swapTypes: ['SWAP'], // Types of transactions to monitor
        maxRetries: 3, // Maximum number of retries for failed trades
        retryDelay: 5000 // 5 seconds delay between retries
    },
    // Add heliusApiKey for backward compatibility
    heliusApiKey: process.env.HELIUS_API_KEY
};

module.exports = config; 