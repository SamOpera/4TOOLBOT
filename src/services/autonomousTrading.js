const { Connection, PublicKey } = require('@solana/web3.js');
const winston = require('winston');
const TokenDataService = require('./tokenDataService');
const TradingExecution = require('../modules/tradingExecution');
const MarketDataService = require('./marketDataService');
const crypto = require('crypto');
const BuyManager = require('../modules/buyManager');
const { Keypair } = require('@solana/web3.js');

class AutonomousTrading {
    constructor(config, db, ruleEngine, telegramBot = null) {
        this.config = config;
        this.db = db;
        this.ruleEngine = ruleEngine;
        this.telegramBot = telegramBot;
        this.tokenDataService = new TokenDataService(config);
        this.tradingExecution = new TradingExecution(config);
        this.isRunning = false;
        this.monitoringInterval = null;
        this.activePositions = new Map();
        this.currentUserId = null; // Track the current user
        
        // Rate limiting for autonomous mode
        this.HOURLY_BUY_LIMIT = 5;
        this.HOUR_IN_MS = 60 * 60 * 1000;
        this.buyRateLimit = new Map();
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
    }

    /**
     * Check if user can make another buy in autonomous mode
     */
    canUserBuy(userId) {
        const now = Date.now();
        const userAttempts = this.buyRateLimit.get(userId) || [];
        
        // Filter out attempts older than 1 hour
        const recentAttempts = userAttempts.filter(timestamp => 
            now - timestamp < this.HOUR_IN_MS
        );
        
        // Update the map with filtered attempts
        if (recentAttempts.length > 0) {
            this.buyRateLimit.set(userId, recentAttempts);
        } else {
            this.buyRateLimit.delete(userId);
        }
        
        return recentAttempts.length < this.HOURLY_BUY_LIMIT;
    }

    /**
     * Record a buy attempt for rate limiting
     */
    recordBuyAttempt(userId) {
        const now = Date.now();
        const userAttempts = this.buyRateLimit.get(userId) || [];
        userAttempts.push(now);
        this.buyRateLimit.set(userId, userAttempts);
    }

    /**
     * Get remaining buys for a user
     */
    getRemainingBuys(userId) {
        const now = Date.now();
        const userAttempts = this.buyRateLimit.get(userId) || [];
        const recentAttempts = userAttempts.filter(timestamp => 
            now - timestamp < this.HOUR_IN_MS
        );
        return Math.max(0, this.HOURLY_BUY_LIMIT - recentAttempts.length);
    }

    /**
     * Get next buy time for a user
     */
    getNextBuyTime(userId) {
        const userAttempts = this.buyRateLimit.get(userId) || [];
        if (userAttempts.length === 0) return null;
        
        const oldestAttempt = Math.min(...userAttempts);
        return new Date(oldestAttempt + this.HOUR_IN_MS);
    }

    /**
     * Fetch top tokens from Jupiter API
     */
    async getTopTokensFromJupiter() {
        try {
            const axios = require('axios');
            const response = await axios.get('https://lite-api.jup.ag/tokens/v2/toptraded/24h', {
                headers: { 'Accept': 'application/json' }
            });
            if (Array.isArray(response.data)) {
                return response.data;
            } else if (response.data && Array.isArray(response.data.data)) {
                return response.data.data;
            } else {
                this.logger.error('[getTopTokensFromJupiter] Unexpected response:', response.data);
                return [];
            }
        } catch (error) {
            this.logger.error('Error fetching top tokens from Jupiter:', error);
            return [];
        }
    }

    /**
     * Fetch top tokens, pick 3 random, and send to all users with autonomous mode enabled.
     * Now uses Jupiter API instead of Birdeye.
     */
    async sendRandomTokensToAutonomousUsers() {
        console.log('[DEBUG] sendRandomTokensToAutonomousUsers called');
        console.log('[DEBUG] telegramBot is', !!this.telegramBot);
        if (!this.telegramBot) return;
        try {
            // Get all users with autonomous enabled
            const users = await this.db.getAllUsers();
            let messaged = 0;
            for (const user of users) {
                const settings = await this.db.getUserSettings(user.id);
                console.log(`[DEBUG] Processing user: ${user.id}, telegram_id: ${user.telegram_id}, autonomous_enabled: ${settings && settings.autonomous_enabled}`);
                if (settings && (settings.autonomous_enabled === 1 || settings.autonomous_enabled === true)) {
                    if (user.telegram_id) {
                        // Fetch all active autonomous_strategy rules for the user
                        const rules = await this.getActiveRules(user.id);
                        console.log(`[DEBUG] User ${user.id} has ${rules.length} active autonomous_strategy rules`);
                        let allFilteredTokens = [];
                        for (const rule of rules) {
                            console.log(`[DEBUG] Fetching tokens for rule: ${rule.name} (id: ${rule.id})`);
                            // Get filtered tokens for this rule
                            const filteredTokens = await this.tokenDataService.getTokensByCriteria(rule, 10, this.db, this.config, user.id);
                            console.log(`[DEBUG] Rule ${rule.name} (id: ${rule.id}) filtered tokens: ${filteredTokens.length}`);
                            allFilteredTokens = allFilteredTokens.concat(filteredTokens);
                        }
                        // Remove duplicates by address/mint
                        const uniqueTokens = [];
                        const seen = new Set();
                        for (const t of allFilteredTokens) {
                            const addr = t.address || t.mint;
                            if (!seen.has(addr)) {
                                uniqueTokens.push(t);
                                seen.add(addr);
                            }
                        }
                        console.log(`[DEBUG] User ${user.id} unique filtered tokens: ${uniqueTokens.length}`);
                        if (uniqueTokens.length === 0) {
                            console.log(`[DEBUG] No tokens to send for user ${user.id}`);
                            continue;
                        }
                        // Format message
                        const message =
                            `🤖 *Token Radar: Filtered Tokens for Your Autonomous Strategies (Jupiter)*\n` +
                            uniqueTokens.map((t, i) => {
                                // Market Cap
                                const marketCap = t.mcap || t.fdv || t.marketCap || null;
                                // 24h Volume
                                let volume24h = null;
                                if (t.stats24h && typeof t.stats24h.buyVolume === 'number' && typeof t.stats24h.sellVolume === 'number') {
                                    volume24h = t.stats24h.buyVolume + t.stats24h.sellVolume;
                                }
                                // Time Frame
                                const timeFrame = t.stats24h ? '24h' : 'N/A';

                                return (
                                    `*${i + 1}. ${t.symbol || t.name || t.id}*\n` +
                                    (t.name ? `Name: ${t.name}\n` : '') +
                                    (t.symbol ? `Symbol: ${t.symbol}\n` : '') +
                                    ((t.id ? `Address: \`${t.id}\`\n` : (t.address ? `Address: \`${t.address}\`\n` : (t.mint ? `Address: \`${t.mint}\`\n` : '')))) +
                                    (t.usdPrice ? `Price: $${Number(t.usdPrice).toFixed(6)}\n` : '') +
                                    `Market Cap: $${marketCap ? Number(marketCap).toLocaleString() : 'N/A'}\n` +
                                    `24h Volume: ${volume24h !== null ? '$' + Number(volume24h).toLocaleString() : 'N/A'}\n` +
                                    `Time Frame: ${timeFrame}\n` +
                                    (t.liquidity ? `Liquidity: $${Number(t.liquidity).toLocaleString()}\n` : '')
                                );
                            }).join('\n') +
                            '\n_Discover more in Autonomous Mode!_';
                        // Send to user
                        try {
                            console.log(`[DEBUG] Sending message to user ${user.telegram_id}`);
                            await this.telegramBot.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
                            messaged++;
                        } catch (err) {
                            console.error('[DEBUG] Telegram sendMessage error:', err);
                            if (err && err.response) {
                                console.error('[DEBUG] Telegram API response:', err.response.body);
                            }
                            if (err.code === 'ETELEGRAM' && err.response && err.response.body && err.response.body.description && err.response.body.description.includes('bot was blocked by the user')) {
                                this.logger.warn(`User ${user.telegram_id} has blocked the bot. Skipping.`);
                            } else {
                                this.logger.error('Error sending Telegram message:', err);
                            }
                        }
                        // --- AUTOBUY LOGIC ---
                        try {
                            // Check rate limiting for autonomous mode
                            if (!this.canUserBuy(user.id)) {
                                const nextBuyTime = this.getNextBuyTime(user.id);
                                const remainingBuys = this.getRemainingBuys(user.id);
                                this.logger.warn(`Rate limit reached for user ${user.id}. Next buy available at: ${nextBuyTime}`);
                                
                                try {
                                    await this.telegramBot.sendMessage(user.telegram_id, 
                                        `⏰ *Rate Limit Reached*\n\n` +
                                        `You've reached the limit of 5 tokens per hour in autonomous mode.\n` +
                                        `Next buy available: ${nextBuyTime.toLocaleTimeString()}\n` +
                                        `Remaining buys this hour: ${remainingBuys}`, 
                                        { parse_mode: 'Markdown' }
                                    );
                                } catch (notifyErr) {
                                    this.logger.error(`Failed to send rate limit notification:`, notifyErr);
                                }
                                continue;
                            }

                            const activeWallet = await this.db.getActiveWallet(user.id);
                            if (!activeWallet || !activeWallet.encrypted_private_key) {
                                this.logger.warn(`No active wallet for user ${user.id}, skipping autobuy.`);
                                continue;
                            }
                            // Use telegram_id as password for decryption (as in BuyManager)
                            const buyManager = new BuyManager(this.config, this.tradingExecution, this.db, null);
                            const decryptedKey = buyManager.decryptPrivateKey(activeWallet.encrypted_private_key, user.telegram_id.toString());
                            const secretKey = Buffer.from(decryptedKey, 'base64');
                            if (secretKey.length !== 64) {
                                this.logger.error(`Invalid private key length for user ${user.id}`);
                                continue;
                            }
                            const keypair = Keypair.fromSecretKey(secretKey);
                            this.tradingExecution.setUserWallet(keypair);
                            // --- BUY AMOUNT LOGIC ---
                            // Use the new method to get buy amount from rules with proper fallback
                            const autobuyAmount = await this.getBuyAmountFromRules(user.id);
                            // --- END BUY AMOUNT LOGIC ---
                            // --- EXTRACT ADDRESS FROM MESSAGE ---
                            this.logger.info('[AUTOBUY DEBUG] Raw message for address extraction:', JSON.stringify(message));
                            this.logger.info('[AUTOBUY DEBUG] Message hex:', Buffer.from(message).toString('hex'));
                            const tokenAddresses = extractAllTokenAddresses(message);
                            this.logger.info(`[AUTOBUY DEBUG] Extracted token addresses for user ${user.id}: ${JSON.stringify(tokenAddresses)}`);
                            const tokenAddress = tokenAddresses.length > 0 ? tokenAddresses[0] : null;
                            if (!tokenAddress || tokenAddress.length < 32) {
                                const errMsg = `Autobuy failed: No valid token address extracted for user ${user.id}: ${JSON.stringify(tokenAddresses)}`;
                                this.logger.error(errMsg);
                                try {
                                    await this.telegramBot.sendMessage(user.telegram_id, `❌ *Autobuy Failed! No valid token address extracted.*\nError: Invalid token address`, { parse_mode: 'Markdown' });
                                } catch (notifyErr) {
                                    this.logger.error(`Failed to send autobuy failure notification:`, notifyErr);
                                    if (notifyErr && notifyErr.response) {
                                        this.logger.error('[DEBUG] Telegram API response:', notifyErr.response.body);
                                    }
                                }
                                continue;
                            }
                            // --- END ADDRESS EXTRACTION ---
                            const buyResult = await this.tradingExecution.executeBuy(user.id, tokenAddress, autobuyAmount);
                            if (buyResult.success) {
                                // Record the buy attempt for rate limiting
                                this.recordBuyAttempt(user.id);
                                
                                // Additional verification for autonomous trading
                                await this.verifyAutonomousBuySuccess(buyResult.signature, tokenAddress, user.id);
                                
                                this.logger.info(`Autobuy successful for user ${user.id}: ${tokenAddress}`);
                                
                                // Get remaining buys for user notification
                                const remainingBuys = this.getRemainingBuys(user.id);
                                
                                // Notify user via Telegram
                                try {
                                    await this.telegramBot.sendMessage(user.telegram_id, 
                                        `✅ *Autobuy Success!*\n` +
                                        `Token: ${tokenAddress}\n` +
                                        `Amount: ${autobuyAmount} SOL\n\n` +
                                        `📊 Rate Limit: ${remainingBuys} buys remaining this hour`, 
                                        { parse_mode: 'Markdown' }
                                    );
                                } catch (notifyErr) {
                                    this.logger.error(`Failed to send autobuy success notification:`, notifyErr);
                                    if (notifyErr && notifyErr.response) {
                                        this.logger.error('[DEBUG] Telegram API response:', notifyErr.response.body);
                                    }
                                }
                            } else {
                                this.logger.error(`Autobuy failed for user ${user.id}: ${buyResult.error}`);
                                // Notify user via Telegram
                                try {
                                    await this.telegramBot.sendMessage(user.telegram_id, `❌ *Autobuy Failed!*\nToken: ${tokenAddress}\nAmount: ${autobuyAmount} SOL\nError: ${buyResult.error || 'Unknown error'}`, { parse_mode: 'Markdown' });
                                } catch (notifyErr) {
                                    this.logger.error(`Failed to send autobuy failure notification:`, notifyErr);
                                    if (notifyErr && notifyErr.response) {
                                        this.logger.error('[DEBUG] Telegram API response:', notifyErr.response.body);
                                    }
                                }
                            }
                        } catch (autobuyErr) {
                            this.logger.error(`Autobuy error for user ${user.id}: ${autobuyErr.message}`);
                        }
                        // --- END AUTOBUY LOGIC ---
                    } else {
                        console.log(`[DEBUG] User ${user.id} has no telegram_id, skipping.`);
                    }
                } else {
                    console.log(`[DEBUG] User ${user.id} does not have autonomous_enabled, skipping.`);
                }
            }
            console.log('[DEBUG] total users messaged:', messaged);
        } catch (err) {
            this.logger.error('Error sending filtered tokens to autonomous users:', err);
            console.log('[DEBUG] error in sendRandomTokensToAutonomousUsers:', err);
        }
    }

    async start(userId) {
        if (this.isRunning) {
            this.logger.info('Autonomous trading is already running');
            return;
        }

        this.currentUserId = userId; // Set the current user
        this.isRunning = true;
        this.logger.info(`Starting autonomous trading for user ${userId}`);

        // Ensure autonomous strategy settings exist
        await this.ensureAutonomousStrategySettings(userId);

        // Fetch initial data
        try {
            // Fetch top traded tokens from Jupiter with memory optimization
            try {
                const response = await axios.get('https://price.jup.ag/v4/price?ids=SOL', {
                    timeout: 10000,
                    maxContentLength: 1024 * 1024 // 1MB limit
                });
                // Only log essential data to prevent memory bloat
                console.log('[DEBUG] Jupiter SOL price:', response.data?.data?.SOL?.price || 'N/A');
                // Clear response data from memory
                response.data = null;
            } catch (err) {
                console.error('[DEBUG] Exception in Jupiter price fetch:', err.message);
            }

            try {
                const response = await axios.get('https://price.jup.ag/v4/toptraded', {
                    timeout: 10000,
                    maxContentLength: 1024 * 1024 // 1MB limit
                });
                // Only log count to prevent memory bloat
                const tokenCount = response.data?.data?.length || 0;
                console.log('[DEBUG] Jupiter toptraded tokens count:', tokenCount);
                // Clear response data from memory immediately
                response.data = null;
            } catch (err) {
                console.error('[DEBUG] Exception in Jupiter toptraded fetch:', err.message);
            }

            // Immediate fetch and process
            await this.monitorAndExecute(userId);
        } catch (error) {
            this.logger.error('Error in initial autonomous trading setup:', error);
        }

        // Start (or restart) monitoring interval
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.monitorAndExecute(userId);
                await this.sendRandomTokensToAutonomousUsers();
            } catch (error) {
                this.logger.error('Error in monitoring cycle:', error);
            }
        }, 300000); // Check every 5 minutes
    }

    async ensureAutonomousStrategySettings(userId) {
        try {
            // Check if autonomous strategy settings exist
            const existingSettings = await this.db.getStrategySettings(userId, 'autonomous');
            
            if (!existingSettings) {
                // Create default autonomous strategy settings
                const defaultSettings = {
                    type: 'autonomous',
                    params: {
                        isActive: true,
                        maxPositionSize: 0.1,
                        maxDailyLoss: 0.05,
                        maxOpenPositions: 5,
                        stopLoss: 0.1,
                        takeProfit: 0.2,
                        maxSlippage: 1,
                        minLiquidity: 10000
                    }
                };
                
                await this.db.createStrategy(userId, defaultSettings);
                this.logger.info(`Created default autonomous strategy settings for user ${userId}`);
            } else if (!existingSettings.params || !existingSettings.params.isActive) {
                // Update existing settings to be active
                const updatedSettings = {
                    ...existingSettings,
                    params: {
                        ...existingSettings.params,
                        isActive: true
                    }
                };
                
                await this.db.updateStrategySettings(userId, 'autonomous', updatedSettings.params);
                this.logger.info(`Activated autonomous strategy settings for user ${userId}`);
            }
        } catch (error) {
            this.logger.error(`Error ensuring autonomous strategy settings for user ${userId}:`, error);
        }
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.logger.info('Autonomous trading stopped');
    }

    async monitorAndExecute(userId) {
        try {
            this.logger.info(`Starting monitorAndExecute for user ${userId}`);
            
            // Get all active rules
            const rules = await this.getActiveRules(userId);
            this.logger.info(`Found ${rules.length} active autonomous strategy rules for user ${userId}`);
            
            // Check if there are no active autonomous strategy rules
            if (rules.length === 0) {
                this.logger.info(`No active autonomous strategy rules found for user ${userId}, disabling autonomous mode`);
                await this.checkAndDisableAutonomousModeIfNoRules(userId);
                return;
            }
            
            // Get portfolio value and positions
            const portfolio = await this.getPortfolioValue();
            this.logger.info(`Portfolio value for user ${userId}: ${portfolio.totalValue} SOL`);
            
            // Get user's active strategy settings
            const strategySettings = await this.db.getStrategySettings(userId, 'autonomous');
            this.logger.info(`Strategy settings for user ${userId}:`, strategySettings);
            
            if (!strategySettings || !strategySettings.params.isActive) {
                this.logger.info('No active autonomous trading strategy found');
                return;
            }

            const riskLimits = {
                maxPositionSize: strategySettings.params.maxPositionSize || 0.1,
                maxDailyLoss: strategySettings.params.maxDailyLoss || 0.05,
                maxOpenPositions: strategySettings.params.maxOpenPositions || 5,
                stopLoss: strategySettings.params.stopLoss || 0.1,
                takeProfit: strategySettings.params.takeProfit || 0.2,
                maxSlippage: strategySettings.params.maxSlippage || 1,
                minLiquidity: strategySettings.params.minLiquidity || 10000
            };
            
            this.logger.info(`Risk limits for user ${userId}:`, riskLimits);
            
            // Check risk limits
            if (!this.checkRiskLimits(portfolio, riskLimits)) {
                this.logger.warn('Risk limits reached, skipping execution');
                return;
            }

            // Monitor existing positions
            await this.monitorPositions(riskLimits);

            // Evaluate rules and execute trades
            for (const rule of rules) {
                this.logger.info(`Evaluating rule ${rule.name} (ID: ${rule.id}) for user ${userId}`);
                const opportunities = await this.findTradingOpportunities(rule, userId);
                this.logger.info(`Found ${opportunities.length} trading opportunities for rule ${rule.name}`);
                
                for (const opportunity of opportunities) {
                    this.logger.info(`Validating opportunity for token ${opportunity.token.address} with rule ${rule.name}`);
                    if (await this.validateOpportunity(opportunity, portfolio, strategySettings.params, rule)) {
                        this.logger.info(`Executing trade for token ${opportunity.token.address} with rule ${rule.name}`);
                        const tradeResult = await this.executeTrade(opportunity, rule, strategySettings.params);
                        
                        if (tradeResult.success) {
                            // Record the trade in database
                            await this.db.createTrade(
                                userId,
                                opportunity.token.address,
                                tradeResult.amount,
                                tradeResult.price,
                                'buy'
                            );

                            // Send notification
                            await this.sendTradeNotification(userId, {
                                type: 'AUTONOMOUS_TRADE',
                                token: opportunity.token.address,
                                action: 'buy',
                                amount: tradeResult.amount,
                                price: tradeResult.price,
                                rule: rule.name
                            });
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error in monitorAndExecute:', error);
        }
    }

    async getActiveRules(userId) {
        // Use the new getRulesWithConditions method to get rules with their conditions
        const rules = await this.db.getRulesWithConditions(userId);
        return rules.filter(r => r.is_active && r.type === 'autonomous_strategy');
    }

    /**
     * Check if a user has any active autonomous strategy rules
     * @param {number} userId - The user ID to check
     * @returns {Promise<boolean>} - True if user has active autonomous strategy rules, false otherwise
     */
    async hasActiveAutonomousRules(userId) {
        const activeRules = await this.getActiveRules(userId);
        return activeRules.length > 0;
    }

    /**
     * Automatically disable autonomous mode for a user if they have no active autonomous strategy rules
     * @param {number} userId - The user ID to check and potentially disable autonomous mode for
     * @returns {Promise<boolean>} - True if autonomous mode was disabled, false if it was already disabled or has active rules
     */
    async checkAndDisableAutonomousModeIfNoRules(userId) {
        try {
            const activeRules = await this.getActiveRules(userId);
            if (activeRules.length === 0) {
                this.logger.info(`No active autonomous strategy rules found for user ${userId}. Automatically turning off autonomous mode.`);
                
                // Turn off autonomous mode in user settings
                await this.db.updateUserSettings(userId, { autonomous_enabled: false });
                
                // Send notification to user about autonomous mode being turned off
                if (this.telegramBot) {
                    try {
                        // Get all users and find the one with matching userId
                        const users = await this.db.getAllUsers();
                        const user = users.find(u => u.id === userId);
                        if (user && user.telegram_id) {
                            await this.telegramBot.sendMessage(user.telegram_id, 
                                '🤖 *Autonomous Mode Automatically Disabled*\n\n' +
                                'No active autonomous strategy rules were found. ' +
                                'Autonomous mode has been automatically turned off for your safety.\n\n' +
                                'To re-enable autonomous mode, please create and activate at least one autonomous strategy rule.',
                                { parse_mode: 'Markdown' }
                            );
                        }
                    } catch (telegramError) {
                        this.logger.error(`Error sending autonomous mode disabled notification: ${telegramError.message}`);
                    }
                }
                
                return true; // Autonomous mode was disabled
            }
            return false; // Autonomous mode was not disabled (either already disabled or has active rules)
        } catch (error) {
            this.logger.error(`Error checking and disabling autonomous mode for user ${userId}: ${error.message}`);
            return false;
        }
    }

    async getPortfolioValue() {
        try {
            // Get user's wallet balance and positions
            const walletBalance = await this.getWalletBalance();
            const positions = await this.getActivePositions();
            
            // Calculate total portfolio value
            let totalValue = walletBalance;
            for (const position of positions) {
                try {
                    const currentPrice = await this.getTokenPrice(position.tokenAddress);
                    const positionValue = position.amount * currentPrice;
                    totalValue += positionValue;
                } catch (error) {
                    this.logger.error(`Error calculating position value for ${position.tokenAddress}:`, error);
                }
            }
            
            return {
                totalValue,
                positions: positions.map(p => ({
                    tokenAddress: p.tokenAddress,
                    amount: p.amount,
                    entryPrice: p.entryPrice
                }))
            };
        } catch (error) {
            this.logger.error('Error getting portfolio value:', error);
            // Return a default value to prevent crashes
            return {
                totalValue: 1, // Default to 1 SOL to allow trading
                positions: []
            };
        }
    }

    async getWalletBalance() {
        try {
            // Get user's wallet balance from the database or wallet service
            // For now, return a default value
            return 1; // Default to 1 SOL
        } catch (error) {
            this.logger.error('Error getting wallet balance:', error);
            return 1; // Default to 1 SOL
        }
    }

    async getActivePositions() {
        try {
            if (!this.currentUserId) {
                this.logger.warn('No current user ID set, returning empty positions');
                return [];
            }
            
            // Get active positions from the database
            const positions = await this.db.getActivePositions(this.currentUserId);
            return positions || [];
        } catch (error) {
            this.logger.error('Error getting active positions:', error);
            return [];
        }
    }

    checkRiskLimits(portfolio, riskLimits) {
        // Check if we've hit daily loss limit
        const dailyLoss = this.calculateDailyLoss();
        if (dailyLoss > riskLimits.maxDailyLoss) {
            return false;
        }

        // Check if we've hit max positions limit
        if (this.activePositions.size >= riskLimits.maxOpenPositions) {
            return false;
        }

        return true;
    }

    calculateDailyLoss() {
        // Implement daily loss calculation
        return 0;
    }

    async monitorPositions(riskLimits) {
        for (const [tokenAddress, position] of this.activePositions) {
            try {
                const currentPrice = await this.getTokenPrice(tokenAddress);
                const entryPrice = position.entryPrice;
                const pnl = (currentPrice - entryPrice) / entryPrice;

                // Check stop loss
                if (pnl <= -riskLimits.stopLoss) {
                    await this.closePosition(tokenAddress, 'stop_loss');
                }
                // Check take profit
                else if (pnl >= riskLimits.takeProfit) {
                    await this.closePosition(tokenAddress, 'take_profit');
                }
            } catch (error) {
                this.logger.error(`Error monitoring position for ${tokenAddress}:`, error);
            }
        }
    }

    async findTradingOpportunities(rule, userId) {
        const opportunities = [];
        try {
            this.logger.info(`Finding trading opportunities for rule ${rule.name} (ID: ${rule.id})`);
            
            // Use TokenDataService to fetch and filter tokens from Jupiter by rule criteria
            const tokens = await this.tokenDataService.getTokensByCriteria(rule, 50, this.db, this.config, userId);
            this.logger.info(`Rule ${rule.name} - Filtered tokens: ${tokens.map(t => t.address || t.mint).join(', ')}`);
            
            for (const token of tokens) {
                try {
                    this.logger.info(`Evaluating rule ${rule.name} for token ${token.address || token.mint}`);
                    const evaluation = await this.ruleEngine.evaluateRule(rule.id, token.address || token.mint);
                    this.logger.info(`Rule ${rule.name} evaluation result for token ${token.address || token.mint}:`, evaluation);
                    
                    if (evaluation.match) {
                        this.logger.info(`Rule ${rule.name} matched for token ${token.address || token.mint}`);
                        opportunities.push({
                            token,
                            rule,
                            evaluation
                        });
                    }
                } catch (evalError) {
                    this.logger.error(`Error evaluating rule ${rule.name} for token ${token.mint || token.address}:`, evalError);
                }
            }
        } catch (error) {
            this.logger.error('Error finding trading opportunities:', error);
        }
        
        this.logger.info(`Found ${opportunities.length} opportunities for rule ${rule.name}`);
        return opportunities;
    }

    async validateOpportunity(opportunity, portfolio, strategyParams, rule) {
        try {
            const { token } = opportunity;
            
            // Check if we already have a position
            if (this.activePositions.has(token.address)) {
                return false;
            }

            // Check liquidity
            const liquidity = await this.tokenDataService.getTokenLiquidity(token.address);
            if (liquidity < strategyParams.minLiquidity) {
                return false;
            }

            // Get the buy amount from the rule conditions
            let buyAmount = null;
            if (rule.conditions && rule.conditions.buy_amount) {
                // The buy_amount is stored as { value: number, unit: ' SOL' }
                const buyAmountData = rule.conditions.buy_amount;
                if (buyAmountData && buyAmountData.value) {
                    buyAmount = parseFloat(buyAmountData.value); // Use the fixed amount set in the rule
                    this.logger.info(`Using buy amount from rule ${rule.id}: ${buyAmount} SOL`);
                }
            }
            if (!buyAmount) {
                // Fallback to percentage-based calculation if no buy amount is set
                buyAmount = portfolio.totalValue * strategyParams.maxPositionSize;
                this.logger.info(`No rule buy amount set, using percentage-based: ${buyAmount} SOL`);
            }

            // Check if we have enough balance
            if (buyAmount > liquidity * 0.1) { // Don't take more than 10% of liquidity
                return false;
            }

            return true;
        } catch (error) {
            this.logger.error('Error validating opportunity:', error);
            return false;
        }
    }

    async executeTrade(opportunity, rule, strategyParams) {
        try {
            const { token } = opportunity;
            
            // Get the buy amount from the rule conditions
            let buyAmount = null;
            if (rule.conditions && rule.conditions.buy_amount) {
                // The buy_amount is stored as { value: number, unit: ' SOL' }
                const buyAmountData = rule.conditions.buy_amount;
                if (buyAmountData && buyAmountData.value) {
                    buyAmount = parseFloat(buyAmountData.value); // Use the fixed amount set in the rule
                    this.logger.info(`Using buy amount from rule ${rule.id}: ${buyAmount} SOL`);
                }
            }
            if (!buyAmount) {
                // Fallback to percentage-based calculation if no buy amount is set
                const portfolio = await this.getPortfolioValue();
                buyAmount = portfolio.totalValue * strategyParams.maxPositionSize;
                this.logger.info(`No rule buy amount set, using percentage-based: ${buyAmount} SOL`);
            }

            // Execute the trade
            const tradeResult = await this.tradingExecution.executeBuy(
                token.address,
                buyAmount,
                strategyParams.maxSlippage || 1
            );

            if (tradeResult.success) {
                // Record the position
                this.activePositions.set(token.address, {
                    entryPrice: tradeResult.price,
                    size: buyAmount,
                    timestamp: Date.now(),
                    ruleId: rule.id
                });

                // Log the trade
                this.logger.info('Autonomous trade executed:', {
                    token: token.address,
                    size: buyAmount,
                    price: tradeResult.price,
                    ruleId: rule.id,
                    buyAmountSource: rule.conditions && rule.conditions.buy_amount ? 'rule_setting' : 'percentage_based'
                });

                return tradeResult;
            }
        } catch (error) {
            this.logger.error('Error executing trade:', error);
        }
    }

    async closePosition(tokenAddress, reason) {
        try {
            const position = this.activePositions.get(tokenAddress);
            if (!position) return;

            // Execute the sell
            const tradeResult = await this.tradingExecution.executeSell(
                tokenAddress,
                position.size,
                this.config.defaultSlippage
            );

            if (tradeResult.success) {
                // Remove the position
                this.activePositions.delete(tokenAddress);

                // Log the close
                this.logger.info('Position closed:', {
                    token: tokenAddress,
                    reason,
                    pnl: tradeResult.pnl
                });
            }
        } catch (error) {
            this.logger.error('Error closing position:', error);
        }
    }

    async getTokenPrice(tokenAddress) {
        // Implement token price fetching
        return 0;
    }

    async sendTradeNotification(userId, tradeData) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            if (userSettings.telegram_alerts_enabled) {
                // Format the notification message
                const message = `
🤖 Autonomous Trade Executed
Token: ${tradeData.token}
Action: ${tradeData.action.toUpperCase()}
Amount: ${tradeData.amount}
Price: $${tradeData.price}
Rule: ${tradeData.rule}
                `;

                // Send via Telegram bot
                await this.telegramBot.sendMessage(userId, message);
            }
        } catch (error) {
            this.logger.error('Error sending trade notification:', error);
        }
    }

    async verifyAutonomousBuySuccess(signature, tokenAddress, userId) {
        try {
            this.logger.info(`[verifyAutonomousBuySuccess] Verifying autonomous buy for user ${userId}, signature: ${signature}`);
            
            // Wait a bit for transaction to be fully confirmed
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Get transaction details
            const { Connection } = require('@solana/web3.js');
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            
            const transaction = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                throw new Error('Transaction not found on blockchain');
            }

            if (transaction.meta && transaction.meta.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(transaction.meta.err)}`);
            }

            // Verify that tokens were actually received
            if (transaction.meta && transaction.meta.postTokenBalances) {
                const tokenTransfers = transaction.meta.postTokenBalances.filter(
                    balance => balance.mint === tokenAddress
                );
                
                if (tokenTransfers.length === 0) {
                    throw new Error('No token transfer detected in transaction');
                }

                // Check if any token balance increased (indicating successful buy)
                const preBalances = transaction.meta.preTokenBalances || [];
                const postBalances = transaction.meta.postTokenBalances || [];
                
                let tokenReceived = false;
                for (const postBalance of postBalances) {
                    if (postBalance.mint === tokenAddress) {
                        const preBalance = preBalances.find(b => 
                            b.accountIndex === postBalance.accountIndex && 
                            b.mint === tokenAddress
                        );
                        
                        if (!preBalance || parseFloat(postBalance.uiTokenAmount.uiAmount) > parseFloat(preBalance.uiTokenAmount.uiAmount)) {
                            tokenReceived = true;
                            break;
                        }
                    }
                }

                if (!tokenReceived) {
                    throw new Error('No tokens were received in the transaction');
                }
            }

            this.logger.info(`[verifyAutonomousBuySuccess] Autonomous buy verified successfully for user ${userId}`);
            return true;
        } catch (error) {
            this.logger.error(`[verifyAutonomousBuySuccess] Autonomous buy verification failed for user ${userId}: ${error.message}`);
            throw new Error(`Autonomous buy verification failed: ${error.message}`);
        }
    }

    /**
     * Get buy amount from user's active rules, with fallback to default
     * @param {number} userId - The user ID
     * @returns {Promise<number>} - The buy amount in SOL
     */
    async getBuyAmountFromRules(userId) {
        try {
            // Get active autonomous strategy rules for the user
            const activeRules = await this.getActiveRules(userId);
            
            // Check each rule for buy_amount condition
            for (const rule of activeRules) {
                if (rule.conditions && rule.conditions.buy_amount) {
                    // The buy_amount is stored as { value: number, unit: ' SOL' }
                    const buyAmountData = rule.conditions.buy_amount;
                    if (buyAmountData && buyAmountData.value) {
                        const buyAmount = parseFloat(buyAmountData.value);
                        if (!isNaN(buyAmount) && buyAmount > 0) {
                            this.logger.info(`Using buy amount from rule ${rule.id}: ${buyAmount} SOL`);
                            return buyAmount;
                        }
                    }
                }
            }
            
            // Fallback to checking user strategies (legacy support)
            const userStrategies = await this.db.getUserStrategies(userId);
            if (userStrategies && userStrategies.length > 0) {
                for (const strat of userStrategies) {
                    let params = strat.params;
                    if (typeof params === 'string') {
                        try { params = JSON.parse(params); } catch (e) { params = {}; }
                    }
                    if (params && (params.buyAmount || params.tradeAmount)) {
                        const buyAmount = parseFloat(params.buyAmount || params.tradeAmount);
                        if (!isNaN(buyAmount) && buyAmount > 0) {
                            this.logger.info(`Using buy amount from user strategy: ${buyAmount} SOL`);
                            return buyAmount;
                        }
                    }
                }
            }
            
            // Final fallback to default
            const defaultAmount = 0.0001;
            this.logger.info(`No rule-based buy amount found, using default: ${defaultAmount} SOL`);
            return defaultAmount;
        } catch (error) {
            this.logger.error(`Error getting buy amount from rules for user ${userId}:`, error);
            return 0.0001; // Safe fallback
        }
    }

    /**
     * Check if user has any buy amount rules configured
     * @param {number} userId - The user ID
     * @returns {Promise<boolean>} - True if user has buy amount rules, false otherwise
     */
    async hasBuyAmountRules(userId) {
        try {
            const activeRules = await this.getActiveRules(userId);
            
            for (const rule of activeRules) {
                if (rule.conditions && rule.conditions.buy_amount) {
                    // The buy_amount is stored as { value: number, unit: ' SOL' }
                    const buyAmountData = rule.conditions.buy_amount;
                    if (buyAmountData && buyAmountData.value) {
                        const buyAmount = parseFloat(buyAmountData.value);
                        if (!isNaN(buyAmount) && buyAmount > 0) {
                            return true;
                        }
                    }
                }
            }
            
            return false;
        } catch (error) {
            this.logger.error(`Error checking buy amount rules for user ${userId}:`, error);
            return false;
        }
    }
}

// Utility function to extract all token addresses from a message
function extractAllTokenAddresses(message) {
    // Match: Address: `SOMEADDRESS` or Address: SOMEADDRESS
    const regex = /^\s*Address:\s*`?([A-Za-z0-9]{32,})`?/gim;
    const addresses = [];
    let match;
    while ((match = regex.exec(message)) !== null) {
        addresses.push(match[1]);
    }
    return addresses;
}

module.exports = AutonomousTrading; 