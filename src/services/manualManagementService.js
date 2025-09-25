const { PublicKey } = require('@solana/web3.js');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Utility sleep function for throttling API calls
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ManualManagementService {
    constructor(config, db, tradingExecution, telegramBot) {
        this.config = config;
        this.db = db;
        this.tradingExecution = tradingExecution;
        this.telegramBot = telegramBot;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.monitoredTokens = new Map(); // tokenAddress -> { userId, ruleId, conditions, buyPrice, highestPrice }
        this.logger = console;
        this.lastBuyCheck = Date.now(); // Track last time we checked for new buys
        this.buyMonitorInterval = null;
        this.pendingSells = new Set(); // Track tokens currently being sold
    }

    /**
     * Start monitoring all active manual management rules
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            this.logger.info('Manual management monitoring already active');
            return;
        }

        this.isMonitoring = true;
        this.logger.info('Starting manual management monitoring...');

        // Initial load of all active manual management rules
        await this.loadActiveManualManagementRules();

        // Start monitoring interval (check every second)
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.checkAllMonitoredTokens();
            } catch (error) {
                this.logger.error('Error in monitoring interval:', error);
            }
        }, 1000);

        this.buyMonitorInterval = setInterval(async () => {
            try {
                await this.checkForNewBuyTokens();
            } catch (error) {
                this.logger.error('Error in buy monitor interval:', error);
            }
        }, 10000);

        this.logger.info('🚀 Manual management monitoring started with 1s sell check and 10s buy token discovery intervals');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.buyMonitorInterval) {
            clearInterval(this.buyMonitorInterval);
            this.buyMonitorInterval = null;
        }
        this.isMonitoring = false;
        this.monitoredTokens.clear();
        this.logger.info('Manual management monitoring stopped');
    }

    /**
     * Load all active manual management rules and their associated tokens
     */
    async loadActiveManualManagementRules() {
        try {
            this.logger.info('Loading active manual management rules...');
            
            // Get all users and their active manual management rules
            const users = await this.getAllUsers();
            this.logger.info(`Found ${users.length} users with active wallets`);
            
            for (const user of users) {
                const rules = await this.db.getRulesByUserId(user.id);
                
                // Filter for both manual_management rules and autonomous_strategy rules with management conditions
                const rulesWithManagement = [];
                
                for (const rule of rules) {
                    if (!rule.is_active) continue;
                    
                    if (rule.type === 'manual_management') {
                        rulesWithManagement.push(rule);
                    } else if (rule.type === 'autonomous_strategy') {
                        // Check if this autonomous rule has management conditions
                        const conditions = await this.db.getRuleConditions(rule.id);
                        const hasManagement = conditions.some(c => 
                            c.condition_type.startsWith('management_'));
                        
                        if (hasManagement) {
                            rulesWithManagement.push(rule);
                        }
                    }
                }

                this.logger.info(`User ${user.id}: Found ${rulesWithManagement.length} active rules with management conditions`);

                for (const rule of rulesWithManagement) {
                    const conditions = await this.db.getRuleConditions(rule.id);
                    const manualConditions = this.parseManualConditions(conditions);
                    
                    this.logger.info(`Rule ${rule.id} (${rule.type}): Parsed conditions:`, manualConditions);
                    
                    if (manualConditions) {
                        const activeWallet = await this.db.getActiveWallet(user.id);
                        
                        if (activeWallet) {
                            await this.addTokensToMonitoring(user.id, rule.id, activeWallet.public_key, manualConditions);
                        } else {
                            this.logger.warn(`No active wallet found for user ${user.id}`);
                        }
                    } else {
                        this.logger.warn(`No manual conditions found for rule ${rule.id}`);
                    }
                }
            }
            
            this.logger.info(`Manual management monitoring loaded. Total monitored tokens: ${this.monitoredTokens.size}`);
        } catch (error) {
            this.logger.error('Error loading manual management rules:', error);
        }
    }

    /**
     * Get all users (helper method)
     */
    async getAllUsers() {
        try {
            // Get all users from the database
            // Since we don't have a direct getAllUsers method, well getusers from wallets
            const stmt = this.db.db.prepare(`
                SELECT DISTINCT u.* FROM users u 
                INNER JOIN wallets w ON u.id = w.user_id 
                WHERE w.is_active = 1`);
            return stmt.all();
        } catch (error) {
            this.logger.error('Error getting all users:', error);
            return [];
        }
    }

    /**
     * Parse manual management conditions from rule conditions
     */
    parseManualConditions(conditions) {
        const manualConditions = {};
        
        for (const condition of conditions) {
            // Only process management-related conditions
            if (!condition.condition_type.startsWith('manual_') && 
                !condition.condition_type.startsWith('management_')) {
                continue; // Skip non-management conditions
            }
            
            try {
                // Try to parse as JSON first, if that fails treat as plain value
                let value;
                try {
                    value = JSON.parse(condition.condition_value);
                } catch (jsonError) {
                    // If JSON parsing fails, use the raw value
                    value = { percentage: parseFloat(condition.condition_value) };
                }
                
                switch (condition.condition_type) {
                    case 'manual_take_profit':
                    case 'management_take_profit':
                        manualConditions.takeProfit = value.percentage;
                        break;
                    case 'manual_stop_loss':
                    case 'management_stop_loss':
                        manualConditions.stopLoss = value.percentage;
                        break;
                    case 'manual_trailing_stop':
                    case 'management_trailing_stop':
                        manualConditions.trailingStop = value.percentage;
                        break;
                }
            } catch (error) {
                this.logger.warn(`Skipping condition ${condition.condition_type} due to parsing error:`, error.message);
            }
        }

        return Object.keys(manualConditions).length > 0 ? manualConditions : null;
    }

    /**
     * Add user's tokens to monitoring based on manual management rules
     */
    async addTokensToMonitoring(userId, ruleId, walletAddress, conditions) {
        try {
            this.logger.info(`Adding tokens to monitoring for user ${userId}, wallet ${walletAddress}`);
            
            // Try to get wallet tokens using multiple methods
            let tokens = [];
            
            // Method 1: Try portfolio service (event-driven)
            try {
                const PortfolioService = require('./portfolioService');
                const portfolioService = new PortfolioService(this.config);
                
                // Trigger portfolio refresh event instead of direct call
                portfolioService.emit('refreshWalletBalance', walletAddress);
                
                // Wait for the balance update event
                const balance = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Portfolio refresh timeout'));
                    }, 10000);
                    
                    portfolioService.once('walletBalanceUpdated', (data) => {
                        clearTimeout(timeout);
                        if (data.walletAddress === walletAddress) {
                            resolve(data.balance);
                        }
                    });
                });
                
                if (balance && balance.tokens) {
                    tokens = balance.tokens.filter(token => token.amount > 0);
                    this.logger.info(`Portfolio service found ${tokens.length} tokens`);
                }
            } catch (error) {
                this.logger.warn('Portfolio service failed, trying DexScreener API:', error.message);
            }

            // Method 2: Try DexScreener API for wallet tracking
            if (tokens.length === 0) {
                try {
                    tokens = await this.getWalletTokensFromDexScreener(walletAddress);
                    this.logger.info(`DexScreener API found ${tokens.length} tokens`);
                } catch (error) {
                    this.logger.warn('DexScreener API failed:', error.message);
                }
            }

            // Method 3: Check for buy trades in database as fallback
            if (tokens.length === 0) {
                try {
                    tokens = await this.getTokensFromTrades(userId);
                    this.logger.info(`Database trades found ${tokens.length} tokens`);
                } catch (error) {
                    this.logger.warn('Database trades lookup failed:', error.message);
                }
            }

            if (tokens.length === 0) {
                this.logger.warn(`No tokens found for user ${userId}, wallet ${walletAddress}`);
                return;
            }

            // Monitor all tokens with balance >0
            for (const token of tokens) {
                if (token.amount > 0) {
                    // --- Prevent monitoring of already sold tokens ---
                    if (await this.isTokenSold(userId, token.mint || token.address)) {
                        this.logger.info(`Token ${token.mint || token.address} already sold for user ${userId}, skipping monitoring.`);
                        continue;
                    }
                    
                    const tokenAddress = token.mint || token.address;
                    
                    // Always fetch the most recent buy trade for this token and user
                    let buyPrice = null;
                    try {
                        const stmt = this.db.db.prepare(`
                            SELECT price FROM trades
                            WHERE user_id = ? AND token_address = ? AND side = 'buy'
                            ORDER BY timestamp DESC LIMIT 1
                        `);
                        const lastBuy = stmt.get(userId, tokenAddress);
                        if (lastBuy && lastBuy.price) {
                            buyPrice = lastBuy.price;
                        }
                    } catch (e) {
                        this.logger.error(`Error fetching last buy price for ${tokenAddress}:`, e);
                    }

                    // Always fetch the current price from DexScreener API
                    let currentPrice = null;
                    try {
                        currentPrice = await this.getCurrentPriceFromDexScreener(tokenAddress);
                        if (!currentPrice) {
                            // Fallback to TokenDataService
                            const TokenDataService = require('./tokenDataService');
                            const tokenDataService = new TokenDataService(this.config);
                            const tokenData = await tokenDataService.getTokenData(tokenAddress);
                            currentPrice = tokenData?.price;
                        }
                    } catch (error) {
                        this.logger.warn(`Error getting current price for ${tokenAddress}:`, error.message);
                    }

                    // Fallback: if no buy trade found, use current price (warn)
                    if (!buyPrice && currentPrice) {
                        buyPrice = currentPrice;
                        this.logger.warn(`No buy trade found for ${tokenAddress}, using current price (${buyPrice}) as buy price fallback`);
                    }

                    // Only monitor if we have a buy price (from trade or fallback)
                    if (buyPrice && currentPrice) {
                        const tokenKey = `${userId}-${tokenAddress}`;
                        this.monitoredTokens.set(tokenKey, {
                            userId,
                            ruleId,
                            walletAddress,
                            conditions,
                            buyPrice, // from trade or fallback
                            highestPrice: Math.max(buyPrice, currentPrice),
                            tokenAmount: token.amount,
                            lastChecked: Date.now(),
                            symbol: token.symbol || 'UNKNOWN',
                            tokenAddress
                        });
                        this.logger.info(`Added token ${tokenAddress} (${token.symbol || 'UNKNOWN'}) to manual management monitoring (buy: ${buyPrice}, current: ${currentPrice})`);
                    } else {
                        this.logger.warn(`Skipping token ${tokenAddress}: missing buy price and/or current price`);
                    }
                    // Throttle API calls to avoid rate limits
                    await sleep(200);
                }
            }
        } catch (error) {
            this.logger.error('Error adding tokens to monitoring:', error);
        }
    }

    /**
     * Check all monitored tokens for sell conditions
     */
    async checkAllMonitoredTokens() {
        if (this.monitoredTokens.size === 0) {
            return; // No tokens to monitor
        }

        this.logger.info(`Checking ${this.monitoredTokens.size} monitored tokens for sell conditions...`);
        
        const TokenDataService = require('./tokenDataService');
        const tokenDataService = new TokenDataService(this.config);

        for (const [tokenKey, tokenData] of this.monitoredTokens) {
            try {
                const tokenAddress = tokenData.tokenAddress;
                
                // Prevent duplicate sell execution for the same token
                if (this.pendingSells.has(tokenKey)) {
                    this.logger.info(`Sell already pending for ${tokenAddress}, skipping this check.`);
                    continue;
                }
                this.logger.info(`Checking token ${tokenAddress} for user ${tokenData.userId} with conditions:`, tokenData.conditions);

                // Get current token price using DexScreener API first, then fallback
                let currentPrice = null;
                try {
                    currentPrice = await this.getCurrentPriceFromDexScreener(tokenAddress);
                } catch (error) {
                    this.logger.warn(`DexScreener API failed for ${tokenAddress}, trying TokenDataService:`, error.message);
                }

                // Fallback to TokenDataService if DexScreener fails
                if (!currentPrice) {
                    try {
                        const TokenDataService = require('./tokenDataService');
                        const tokenDataService = new TokenDataService(this.config);
                        const currentTokenData = await tokenDataService.getTokenData(tokenAddress, true);
                        currentPrice = currentTokenData?.price;
                    } catch (error) {
                        this.logger.warn(`TokenDataService also failed for ${tokenAddress}:`, error.message);
                    }
                }

                if (!currentPrice) {
                    this.logger.warn(`No price data available for token ${tokenAddress} from any source`);
                    continue;
                }

                const buyPrice = tokenData.buyPrice;
                const priceChange = ((currentPrice - buyPrice) / buyPrice) * 100;

                this.logger.info(`Token ${tokenAddress}: Current price: ${currentPrice}, Buy price: ${buyPrice}, Change: ${priceChange.toFixed(2)}%`);

                // Update highest price for trailing stop
                if (currentPrice > tokenData.highestPrice) {
                    tokenData.highestPrice = currentPrice;
                    this.logger.info(`Updated highest price for ${tokenAddress}: ${currentPrice}`);
                }

                // Check sell conditions
                const shouldSell = await this.checkSellConditions(tokenAddress, tokenData, currentPrice, priceChange);
                if (shouldSell && shouldSell.shouldSell) {
                    this.logger.info(`Sell condition met for ${tokenAddress}: ${shouldSell.reason} (${shouldSell.percentage ? shouldSell.percentage.toFixed(2) : ''}%)`);
                    this.pendingSells.add(tokenKey); // Mark as pending
                    const sellResult = await this.executeSell(tokenAddress, tokenData, currentPrice, shouldSell);
                    // Only remove from monitoring if sell was successful
                    if (sellResult && sellResult.success) {
                        this.removeTokenFromMonitoring(tokenData.userId, tokenAddress);
                    }
                    this.pendingSells.delete(tokenKey); // Remove pending status regardless of result
                }
                // Throttle API calls to avoid rate limits
                await sleep(200);
            } catch (error) {
                this.logger.error(`Error checking monitored token ${tokenAddress}:`, error);
                // Remove from monitoring to avoid repeated errors
                this.removeTokenFromMonitoring(tokenData.userId, tokenAddress);
                this.pendingSells.delete(tokenKey); // Clean up pending status if error
            }
        }
    }

    /**
     * Check if sell conditions are met
     */
    async checkSellConditions(tokenAddress, tokenData, currentPrice, priceChange) {
        const { conditions, buyPrice, highestPrice } = tokenData;

        // Check take profit
        if (conditions.takeProfit && priceChange >= conditions.takeProfit) {
            this.logger.info(`Take profit triggered for ${tokenAddress}: ${priceChange.toFixed(2)}% >= ${conditions.takeProfit}%`);
            return { shouldSell: true, reason: 'take_profit', percentage: priceChange };
        }

        // Check stop loss
        if (conditions.stopLoss && priceChange <= -conditions.stopLoss) {
            this.logger.info(`Stop loss triggered for ${tokenAddress}: ${priceChange.toFixed(2)}% <= -${conditions.stopLoss}%`);
            return { shouldSell: true, reason: 'stop_loss', percentage: priceChange };
        }

        // Check trailing stop
        if (conditions.trailingStop) {
            const trailingStopPrice = highestPrice * (1 - conditions.trailingStop / 100);
            if (currentPrice <= trailingStopPrice) {
                const trailingDrop = ((currentPrice - highestPrice) / highestPrice) * 100;
                this.logger.info(`Trailing stop triggered for ${tokenAddress}: ${trailingDrop.toFixed(2)}% <= -${conditions.trailingStop}%`);
                return { shouldSell: true, reason: 'trailing_stop', percentage: trailingDrop };
            }
        }

        return { shouldSell: false };
    }

    /**
     * Execute sell order when conditions are met
     */
    async executeSell(tokenAddress, tokenData, currentPrice, sellReason) {
        try {
            const { userId, walletAddress, tokenAmount, conditions, telegramId } = tokenData;

            // Get user's wallet (userId is already the user ID, not telegram ID)
            const activeWallet = await this.db.getActiveWallet(userId);

            if (!activeWallet || activeWallet.is_locked) {
                this.logger.error(`Cannot execute sell: wallet not available or locked for user ${userId}`);
                return { success: false, error: 'Wallet not available or locked' };
            }

            // You need to get telegramId for this user
            let userTelegramId = telegramId;
            if (!userTelegramId) {
                // Fetch from users table if not present
                const stmt = this.db.db.prepare('SELECT telegram_id FROM users WHERE id = ?');
                const user = stmt.get(userId);
                if (!user) {
                    this.logger.error(`User not found for ID: ${userId}`);
                    return { success: false, error: 'User not found' };
                }
                userTelegramId = user.telegram_id;
            }

            // Decrypt wallet
            const decryptedKey = this.decryptPrivateKey(activeWallet.encrypted_private_key, userTelegramId);
            const privateKeyBuffer = Buffer.from(decryptedKey, 'base64');
            const keypair = Keypair.fromSecretKey(privateKeyBuffer);

            // Set wallet in trading execution
            this.tradingExecution.setUserWallet(keypair);

            // Execute sell
            const result = await this.tradingExecution.executeSell(
                userId,
                tokenAddress,
                tokenAmount,
                keypair
            );

            if (result.success) {
                // Record the trade
                await this.db.createTrade(
                    userId,
                    tokenAddress,
                    tokenAmount,
                    result.tokenPrice,
                    'sell'
                );

                // Send notification
                await this.sendSellNotification(userId, {
                    tokenAddress,
                    tokenAmount,
                    price: result.tokenPrice,
                    solReceived: result.solReceived,
                    reason: sellReason.reason,
                    conditions,
                    signature: result.signature
                });

                // --- Mark as sold in DB to prevent re-monitoring ---
                await this.markTokenAsSold(userId, tokenAddress);

                // --- Charge fees only on successful trade ---
                if (this.feeService && typeof this.feeService.chargeFee === 'function') {
                    try {
                        await this.feeService.chargeFee(userId, tokenAddress, result.tokenPrice, 'sell');
                        this.logger.info(`Fee charged for user ${userId}, token ${tokenAddress}`);
                    } catch (feeError) {
                        this.logger.error('Error charging fee:', feeError);
                    }
                }

                this.logger.info(`Manual management sell executed successfully for ${tokenAddress}`);
            } else {
                this.logger.error(`Manual management sell failed for ${tokenAddress}:`, result.error);
            }

            return result;
        } catch (error) {
            this.logger.error(`Error executing manual management sell for ${tokenAddress}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification about executed sell
     */
    async sendSellNotification(userId, sellData) {
        try {
            // Get user by ID (userId is already the user ID, not telegram ID)
            const stmt = this.db.db.prepare('SELECT * FROM users WHERE id = ?');
            const user = stmt.get(userId);
            
            if (!user) {
                this.logger.error(`User not found for ID: ${userId}`);
                return;
            }

            // Ensure signature is a string
            let signatureStr = 'N/A';
            if (typeof sellData.signature === 'string') {
                signatureStr = sellData.signature;
            } else if (sellData.signature && typeof sellData.signature.signature === 'string') {
                signatureStr = sellData.signature.signature;
            }

            const message = `
*🤖 Manual Management Sell Executed*

*Token:* ${sellData.tokenAddress.slice(0, 8)}...${sellData.tokenAddress.slice(-8)}
*Amount Sold:* ${sellData.tokenAmount.toFixed(6)}
*Price:* ${sellData.price.toFixed(8)} SOL
*SOL Received:* ${sellData.solReceived.toFixed(4)} SOL

*Reason:* ${sellData.reason.replace('_', ' ').toUpperCase()}

*Conditions Applied:*
${sellData.conditions.takeProfit ? `• Take Profit: ${sellData.conditions.takeProfit}%` : ''}
${sellData.conditions.stopLoss ? `• Stop Loss: ${sellData.conditions.stopLoss}%` : ''}
${sellData.conditions.trailingStop ? `• Trailing Stop: ${sellData.conditions.trailingStop}%` : ''}

*Transaction:* [View on Solscan](https://solscan.io/tx/${signatureStr})`;
            
            await this.telegramBot.sendMessage(user.telegram_id, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

        } catch (error) {
            this.logger.error('Error sending sell notification:', error);
        }
    }

    /**
     * Decrypt private key (always use telegramId as password)
     */
    decryptPrivateKey(encryptedPrivateKey, telegramId) {
        if (!encryptedPrivateKey) throw new Error('No private key provided');
        const crypto = require('crypto');
        const [ivHex, encrypted] = encryptedPrivateKey.split(':');
        if (!ivHex || !encrypted) {
            throw new Error('Invalid encrypted data format');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(telegramId.toString(), 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted; // base64 string
    }

    /**
     * Add a specific token to monitoring after a manual buy
     */
    async addTokenToMonitoring(userId, ruleIdOrTokenAddress, tokenAddressOrBuyPrice, buyPriceOrTokenAmount, tokenAmountOrConditions, conditionsOptional = null) {
        try {
            // Handle different method signatures
            let ruleId, tokenAddress, buyPrice, tokenAmount, conditions;
            
            if (typeof ruleIdOrTokenAddress === 'number' && conditionsOptional) {
                // New signature: (userId, ruleId, tokenAddress, buyPrice, tokenAmount, conditions)
                ruleId = ruleIdOrTokenAddress;
                tokenAddress = tokenAddressOrBuyPrice;
                buyPrice = buyPriceOrTokenAmount;
                tokenAmount = tokenAmountOrConditions;
                conditions = conditionsOptional;
            } else {
                // Old signature: (userId, tokenAddress, buyPrice, tokenAmount)
                tokenAddress = ruleIdOrTokenAddress;
                buyPrice = tokenAddressOrBuyPrice;
                tokenAmount = buyPriceOrTokenAmount;
                
                // Get management rules and conditions
                const rules = await this.db.getRulesByUserId(userId);
                const manualRules = rules.filter(rule => 
                    rule.type === 'manual_management' && rule.is_active === 1);

                if (manualRules.length === 0) {
                    this.logger.info(`No active manual management rules found for user ${userId}`);
                    return;
                }

                // Use the first active manual management rule
                const rule = manualRules[0];
                ruleId = rule.id;
                const ruleConditions = await this.db.getRuleConditions(rule.id);
                conditions = this.parseManualConditions(ruleConditions);

                if (!conditions) {
                    this.logger.info(`No manual management conditions found for rule ${rule.id}`);
                    return;
                }
            }

            // --- Prevent monitoring of already sold tokens ---
            const tokenKey = `${userId}-${tokenAddress}`;
            if (await this.isTokenSold(userId, tokenAddress)) {
                this.logger.info(`Token ${tokenAddress} already sold for user ${userId}, skipping monitoring.`);
                return;
            }

            // Check if already monitoring this token for this user
            if (this.monitoredTokens.has(tokenKey)) {
                this.logger.debug(`Token ${tokenAddress} already being monitored for user ${userId}`);
                return;
            }

            // Get user's active wallet
            const activeWallet = await this.db.getActiveWallet(userId);
            if (!activeWallet) {
                this.logger.error(`No active wallet found for user ${userId}`);
                return;
            }

            // Add token to monitoring with unique key
            this.monitoredTokens.set(tokenKey, {
                userId,
                ruleId,
                walletAddress: activeWallet.public_key,
                conditions,
                buyPrice,
                highestPrice: buyPrice,
                tokenAmount,
                lastChecked: Date.now(),
                tokenAddress
            });

            this.logger.info(`✅ Added token ${tokenAddress} to monitoring for user ${userId}, rule ${ruleId}`);
            this.logger.info(`📊 Monitoring conditions:`, conditions);

        } catch (error) {
            this.logger.error('Error adding token to monitoring:', error);
        }
    }

    /**
     * Remove token from monitoring (called when user manually sells)
     */
    removeTokenFromMonitoring(userId, tokenAddress) {
        const tokenKey = `${userId}-${tokenAddress}`;
        if (this.monitoredTokens.has(tokenKey)) {
            this.monitoredTokens.delete(tokenKey);
            this.logger.info(`🗑️ Removed token ${tokenAddress} from monitoring for user ${userId}`);
        }
    }

    /**
     * Periodically check for new buy trades and add new tokens to monitoring
     */
    async checkForNewBuyTokens() {
        try {
            this.logger.info('🔍 Checking for new bought tokens...');
            
            // Get all users with active wallets and management rules
            const users = await this.getAllUsers();
            const since = this.lastBuyCheck;
            this.lastBuyCheck = Date.now();
            
            let newTokensFound = 0;
            
            for (const user of users) {
                try {
                    // First check: Look for new buy trades since last check
                    const stmt = this.db.db.prepare(`
                        SELECT * FROM trades
                        WHERE user_id = ? AND side = 'buy' AND timestamp > ?
                    `);
                    const newBuys = stmt.all(user.id, since);
                    
                    // Process new buy trades
                    for (const trade of newBuys) {
                        const tokenKey = `${user.id}-${trade.token_address}`;
                        if (!this.monitoredTokens.has(tokenKey)) {
                            await this.processNewTokenPurchase(user.id, trade.token_address, trade.price, trade.amount);
                            newTokensFound++;
                        }
                    }
                    
                    // Second check: Scan wallet for new token holdings (more reliable)
                    await this.scanWalletForNewTokens(user.id);
                    
                } catch (error) {
                    this.logger.error(`Error checking new tokens for user ${user.id}:`, error);
                }
            }
            
            if (newTokensFound > 0) {
                this.logger.info(`✅ Found and added ${newTokensFound} new tokens to monitoring`);
            } else {
                this.logger.debug('No new tokens found in this polling cycle');
            }
            
        } catch (error) {
            this.logger.error('Error in checkForNewBuyTokens:', error);
        }
    }

    /**
     * Scan wallet directly for new token holdings
     */
    async scanWalletForNewTokens(userId) {
        try {
            // Get user's management rules to see if monitoring is needed
            const rules = await this.db.getRulesByUserId(userId);
            const hasManagementRules = rules.some(rule => {
                if (!rule.is_active) return false;
                return rule.type === 'manual_management' || 
                       (rule.type === 'autonomous_strategy' && this.ruleHasManagementConditions(rule.id));
            });
            
            if (!hasManagementRules) {
                return; // Skip users without management rules
            }
            
            const activeWallet = await this.db.getActiveWallet(userId);
            if (!activeWallet) {
                return;
            }
            
            // Get current wallet holdings
            let walletTokens = [];
            try {
                const PortfolioService = require('./portfolioService');
                const portfolioService = new PortfolioService(this.config);
                const balance = await portfolioService.getWalletBalance(activeWallet.public_key);
                
                if (balance && balance.tokens) {
                    walletTokens = balance.tokens.filter(token => 
                        token.amount > 0 && 
                        token.mint !== 'So11111111111111111111111111111111111111112' // Exclude SOL
                    );
                }
            } catch (error) {
                this.logger.warn(`Could not fetch wallet holdings for user ${userId}:`, error.message);
                return;
            }
            
            // Check each token in wallet
            for (const token of walletTokens) {
                const tokenKey = `${userId}-${token.mint}`;
                
                // If not already monitored, add it
                if (!this.monitoredTokens.has(tokenKey)) {
                    this.logger.info(`🆕 New token detected in wallet: ${token.symbol || token.mint} (${token.amount})`);
                    await this.processNewTokenPurchase(userId, token.mint, token.price || 0, token.amount);
                }
            }
            
        } catch (error) {
            this.logger.error(`Error scanning wallet for user ${userId}:`, error);
        }
    }

    /**
     * Process a newly purchased token and add to monitoring
     */
    async processNewTokenPurchase(userId, tokenAddress, buyPrice, amount) {
        try {
            // Get user's management rules
            const rules = await this.db.getRulesByUserId(userId);
            const managementRules = [];
            
            for (const rule of rules) {
                if (!rule.is_active) continue;
                
                if (rule.type === 'manual_management') {
                    const conditions = await this.db.getRuleConditions(rule.id);
                    const manualConditions = this.parseManualConditions(conditions);
                    if (manualConditions) {
                        managementRules.push({ rule, conditions: manualConditions });
                    }
                } else if (rule.type === 'autonomous_strategy') {
                    const conditions = await this.db.getRuleConditions(rule.id);
                    const hasManagement = conditions.some(c => c.condition_type.startsWith('management_'));
                    if (hasManagement) {
                        const manualConditions = this.parseManualConditions(conditions);
                        if (manualConditions) {
                            managementRules.push({ rule, conditions: manualConditions });
                        }
                    }
                }
            }
            
            // Add token to monitoring for each applicable rule
            for (const { rule, conditions } of managementRules) {
                await this.addTokenToMonitoring(userId, rule.id, tokenAddress, buyPrice, amount, conditions);
                this.logger.info(`📊 Added token ${tokenAddress} to monitoring for user ${userId}, rule ${rule.id}`);
            }
            
        } catch (error) {
            this.logger.error(`Error processing new token purchase: ${error.message}`);
        }
    }

    /**
     * Check if a rule has management conditions (helper method)
     */
    async ruleHasManagementConditions(ruleId) {
        try {
            const conditions = await this.db.getRuleConditions(ruleId);
            return conditions.some(c => c.condition_type.startsWith('management_'));
        } catch (error) {
            return false;
        }
    }

    // --- Persistent Sold Token Tracking ---
    /**
     * Mark a token as sold for a user (persistent DB)
     */
    async markTokenAsSold(userId, tokenAddress) {
        try {
            const stmt = this.db.db.prepare(
                'INSERT OR REPLACE INTO sold_tokens (user_id, token_address, sold_at) VALUES (?, ?, ?)' 
            );
            stmt.run(userId, tokenAddress, Date.now());
            this.logger.info(`Marked token ${tokenAddress} as sold for user ${userId}`);
        } catch (error) {
            this.logger.error('Error marking token as sold:', error);
        }
    }

    /**
     * Check if a token is already sold for a user (persistent DB)
     */
    async isTokenSold(userId, tokenAddress) {
        try {
            const stmt = this.db.db.prepare(
                'SELECT 1 FROM sold_tokens WHERE user_id = ? AND token_address = ?'
            );
            return !!stmt.get(userId, tokenAddress);
        } catch (error) {
            this.logger.error('Error checking if token is sold:', error);
            return false;
        }
    }

    /**
     * Get monitoring status
     */
    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            monitoredTokensCount: this.monitoredTokens.size,
            monitoredTokens: Array.from(this.monitoredTokens.keys())
        };
    }

    /**
     * Get wallet tokens from DexScreener API
     */
    async getWalletTokensFromDexScreener(walletAddress) {
        try {
            // DexScreener doesn't have a direct wallet endpoint, so we'll use a different approach
            // We'll check for recent buy trades and then get current prices
            this.logger.info(`Getting tokens for wallet ${walletAddress} from database trades`);
            return await this.getTokensFromTrades(null, walletAddress);
        } catch (error) {
            this.logger.error('Error getting wallet tokens from DexScreener:', error);
            return [];
        }
    }

    /**
     * Get tokens from database trades
     */
    async getTokensFromTrades(userId, walletAddress = null) {
        try {
            let query = `
                SELECT DISTINCT 
                    token_address as address,
                    token_address as mint,
                    SUM(CASE WHEN side = 'buy' THEN amount ELSE -amount END) as amount,
                    'UNKNOWN' as symbol
                FROM trades 
                WHERE 1=1
            `;
            const params = [];
            
            if (userId) {
                query += ' AND user_id = ?';
                params.push(userId);
            }
            
            query += `
                GROUP BY token_address 
                HAVING amount > 0
                ORDER BY MAX(timestamp) DESC
            `;
            
            const stmt = this.db.db.prepare(query);
            const results = stmt.all(...params);
            
            // Convert to expected format
            return results.map(row => ({
                address: row.address,
                mint: row.mint,
                amount: row.amount,
                symbol: row.symbol
            }));
        } catch (error) {
            this.logger.error('Error getting tokens from trades:', error);
            return [];
        }
    }

    /**
     * Get current price from DexScreener API
     */
    async getCurrentPriceFromDexScreener(tokenAddress) {
        try {
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
            if (!response.ok) {
                throw new Error(`DexScreener API responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.pairs && data.pairs.length > 0) {
                // Sort by volume and get the most liquid pair
                const sortedPairs = data.pairs.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
                const bestPair = sortedPairs[0];
                
                if (bestPair.priceUsd) {
                    this.logger.debug(`DexScreener price for ${tokenAddress}: $${bestPair.priceUsd}`);
                    return parseFloat(bestPair.priceUsd);
                }
            }
            
            this.logger.warn(`No price data found on DexScreener for token ${tokenAddress}`);
            return null;
        } catch (error) {
            this.logger.error(`Error fetching price from DexScreener for ${tokenAddress}:`, error);
            return null;
        }
    }
}

module.exports = ManualManagementService;