require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
// Use native fetch if available, fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');
const WebSocket = require('ws');
const TelegramBotManager = require('./telegramBot');
const DatabaseManager = require('./database');

class WalletTokenMonitor {
    constructor(apiKey, walletAddress) {
        this.apiKey = apiKey;
        this.walletAddress = walletAddress;
        this.baseUrl = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}`;
        this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        this.wsUrl = `wss://atlas-mainnet.helius-rpc.com/?api-key=${apiKey}`;
        this.processedTransactions = new Set();
        this.isPolling = false;
        this.ws = null;
    }

    // Method 1: Polling approach using Enhanced Transactions API
    async startPolling(intervalMs = 10000) {
        if (this.isPolling) {
            console.log('Polling already active');
            return;
        }

        this.isPolling = true;
        console.log(`Starting to monitor wallet ${this.walletAddress} for token purchases...`);

        const poll = async () => {
            if (!this.isPolling) return;

            try {
                // Fetch recent transactions with SWAP type filter
                const swapUrl = `${this.baseUrl}&type=SWAP&limit=10`;
                const transferUrl = `${this.baseUrl}&type=TRANSFER&limit=10`;

                // Check both swaps and transfers for token purchases
                const [swapResponse, transferResponse] = await Promise.all([
                    fetch(swapUrl),
                    fetch(transferUrl)
                ]);

                const swapTransactions = await swapResponse.json();
                const transferTransactions = await transferResponse.json();

                // Process swap transactions (likely token purchases)
                if (Array.isArray(swapTransactions)) {
                    for (const tx of swapTransactions) {
                        if (!this.processedTransactions.has(tx.signature)) {
                            this.processedTransactions.add(tx.signature);
                            await this.analyzeTokenPurchase(tx);
                        }
                    }
                }

                // Process transfer transactions (could be token purchases)
                if (Array.isArray(transferTransactions)) {
                    for (const tx of transferTransactions) {
                        if (!this.processedTransactions.has(tx.signature)) {
                            this.processedTransactions.add(tx.signature);
                            await this.analyzeTokenTransfer(tx);
                        }
                    }
                }

            } catch (error) {
                console.error('Error polling for transactions:', error);
            }

            // Schedule next poll
            setTimeout(poll, intervalMs);
        };

        // Start polling
        poll();
    }

    // Method 2: WebSocket approach for real-time monitoring
    async startWebSocketMonitoring() {
        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                console.log(`WebSocket connected for wallet ${this.walletAddress}`);
                
                // Subscribe to account changes
                const subscribeMessage = {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "accountSubscribe",
                    params: [
                        this.walletAddress,
                        {
                            encoding: "jsonParsed",
                            commitment: "confirmed"
                        }
                    ]
                };
                
                this.ws.send(JSON.stringify(subscribeMessage));
            });

            this.ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.method === 'accountNotification') {
                        await this.handleAccountChange(message.params);
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            this.ws.on('close', () => {
                console.log('WebSocket connection closed, attempting to reconnect...');
                setTimeout(() => this.startWebSocketMonitoring(), 5000);
            });

        } catch (error) {
            console.error('Error starting WebSocket monitoring:', error);
        }
    }

    async analyzeTokenPurchase(transaction) {
        try {
            console.log(`[🔍 Token Purchase Analysis] Signature: ${transaction.signature}`);
            
            // Check if this is a token purchase (swap from SOL/USDC to another token)
            if (transaction.type === 'SWAP') {
                const events = transaction.events;
                if (events && events.swap) {
                    const swapEvent = events.swap;
                    const tokenIn = swapEvent.tokenIn;
                    const tokenOut = swapEvent.tokenOut;
                    
                    // Check if buying a new token (SOL/USDC -> other token)
                    const commonTokens = [
                        'So11111111111111111111111111111111111111112', // SOL
                        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
                    ];
                    
                    if (commonTokens.includes(tokenIn.mint) && !commonTokens.includes(tokenOut.mint)) {
                        const purchaseData = {
                            signature: transaction.signature,
                            timestamp: transaction.timestamp,
                            walletAddress: this.walletAddress,
                            tokenPurchased: {
                                mint: tokenOut.mint,
                                amount: tokenOut.amount,
                                symbol: tokenOut.symbol || 'Unknown'
                            },
                            tokenSold: {
                                mint: tokenIn.mint,
                                amount: tokenIn.amount,
                                symbol: tokenIn.symbol || 'Unknown'
                            },
                            fee: transaction.fee
                        };
                        
                        console.log(`[💰 New Token Purchase Detected]`, purchaseData);
                        return purchaseData;
                    }
                }
            }
        } catch (error) {
            console.error('Error analyzing token purchase:', error);
        }
    }

    async analyzeTokenTransfer(transaction) {
        try {
            // Analyze transfer transactions for potential token acquisitions
            if (transaction.type === 'TRANSFER') {
                const events = transaction.events;
                if (events && events.transfer) {
                    // Process transfer events that might indicate token purchases
                    console.log(`[📤 Transfer Analysis] Signature: ${transaction.signature}`);
                }
            }
        } catch (error) {
            console.error('Error analyzing token transfer:', error);
        }
    }

    async handleAccountChange(params) {
        try {
            console.log('[🔔 Account Change Detected]', params);
            // Handle real-time account changes
        } catch (error) {
            console.error('Error handling account change:', error);
        }
    }

    stopPolling() {
        this.isPolling = false;
        console.log(`Stopped polling for wallet ${this.walletAddress}`);
    }

    closeWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    cleanup() {
        this.stopPolling();
        this.closeWebSocket();
    }
}

class WalletMonitor {
    constructor(config) {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // Initialize TelegramBot only if config is properly provided
        if (config && config.telegram && config.telegram.token) {
            this.telegramBot = new TelegramBotManager(config);
        } else {
            console.warn('TelegramBot not initialized: missing config or token');
            this.telegramBot = null;
        }
        
        this.db = new DatabaseManager();
        this.apiKey = process.env.HELIUS_API_KEY;
        this.tokenMonitors = new Map(); // Store active monitors for each wallet
        
        this.setupServer();
    }

    setupServer() {
        this.app.use(bodyParser.json());
        
        // Add endpoint to start monitoring a wallet
        this.app.post('/monitor/start', async (req, res) => {
            const { walletAddress, telegramId } = req.body;
            
            if (!walletAddress || !telegramId) {
                return res.status(400).json({ error: 'Missing walletAddress or telegramId' });
            }

            const success = await this.startWalletTokenMonitoring(walletAddress, telegramId);
            res.json({ success, message: success ? 'Monitoring started' : 'Failed to start monitoring' });
        });

        // Add endpoint to stop monitoring a wallet
        this.app.post('/monitor/stop', async (req, res) => {
            const { walletAddress } = req.body;
            
            if (!walletAddress) {
                return res.status(400).json({ error: 'Missing walletAddress' });
            }

            const success = await this.stopWalletTokenMonitoring(walletAddress);
            res.json({ success, message: success ? 'Monitoring stopped' : 'Wallet not being monitored' });
        });

        // Get status of all monitored wallets
        this.app.get('/monitor/status', (req, res) => {
            const monitoredWallets = Array.from(this.tokenMonitors.keys());
            res.json({ 
                totalMonitored: monitoredWallets.length,
                wallets: monitoredWallets 
            });
        });
        
        this.app.post('/webhook', async (req, res) => {
            const { transactions } = req.body;

            for (const tx of transactions) {
                try {
                    const swapEvent = tx?.events?.swap;
                    if (!swapEvent) continue;

                    const inputMint = swapEvent.tokenIn.mint;
                    const outputMint = swapEvent.tokenOut.mint;
                    const amount = parseInt(swapEvent.tokenIn.amount);
                    const walletAddress = tx.walletAddress;

                    // Get wallet owner's telegram ID from database
                    const walletInfo = await this.db.getWalletByAddress(walletAddress);
                    if (!walletInfo) continue;

                    const telegramId = walletInfo.telegramId;
                    
                    // Log the swap event
                    console.log(`[📡 Detected Swap] Wallet: ${walletAddress} | ${inputMint} -> ${outputMint} | Amount: ${amount}`);
                    
                    // Notify user via Telegram (if available)
                    if (this.telegramBot) {
                        await this.telegramBot.sendAndStoreMessage(
                            telegramId,
                            `🔔 *Wallet Activity Detected*\n\n` +
                            `*Transaction Type:* Swap\n` +
                            `*Input Token:* \`${inputMint}\`\n` +
                            `*Output Token:* \`${outputMint}\`\n` +
                            `*Amount:* ${amount}\n\n` +
                            `Would you like to copy this trade?`,
                            {
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            { text: '✅ Copy Trade', callback_data: `copy_trade_${inputMint}_${outputMint}_${amount}` },
                                            { text: '❌ Ignore', callback_data: 'ignore_trade' }
                                        ]
                                    ]
                                }
                            }
                        );
                    } else {
                        console.log(`[📡 Telegram not available] Would notify ${telegramId} about swap: ${inputMint} -> ${outputMint}`);
                    }

                } catch (err) {
                    console.error('Error handling webhook tx:', err);
                }
            }

            res.sendStatus(200);
        });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 Wallet monitoring server running on port ${this.port}`);
        });
    }

    // Cleanup method to stop all monitoring when shutting down
    async cleanup() {
        console.log('Cleaning up wallet monitors...');
        for (const [walletAddress, monitor] of this.tokenMonitors) {
            monitor.cleanup();
            console.log(`Stopped monitoring wallet: ${walletAddress}`);
        }
        this.tokenMonitors.clear();
    }

    async monitorStrategies() {
        try {
            const users = await this.db.getAllUsers();
            
            for (const user of users) {
                const strategies = await this.db.getUserStrategies(user.id);
                
                for (const strategy of strategies) {
                    switch (strategy.type) {
                        case 'portfolio_rebalance':
                            await this.monitorPortfolioRebalance(user, strategy);
                            break;
                        case 'narrative_rotation':
                            await this.monitorNarrativeRotation(user, strategy);
                            break;
                        case 'momentum':
                            await this.monitorMomentum(user, strategy);
                            break;
                        case 'volatility_harvest':
                            await this.monitorVolatilityHarvest(user, strategy);
                            break;
                        case 'copy_trade':
                            await this.monitorCopyTrade(user, strategy);
                            break;
                        case 'event_trigger':
                            await this.monitorEventTriggers(user, strategy);
                            break;
                        case 'risk_management':
                            await this.monitorRiskManagement(user, strategy);
                            break;
                    }
                }
            }
        } catch (error) {
            this.logger.error(`Error monitoring strategies: ${error.message}`);
        }
    }

    async monitorPortfolioRebalance(user, strategy) {
        try {
            const { targetAllocations, rebalanceThreshold, rebalanceInterval } = strategy.params;
            const lastRebalance = strategy.lastExecution || 0;
            
            if (Date.now() - lastRebalance >= rebalanceInterval) {
                await this.strategyEngine.executeStrategy(user.telegramId, strategy);
                await this.db.updateStrategyLastExecution(strategy.id);
            }
        } catch (error) {
            this.logger.error(`Error monitoring portfolio rebalance: ${error.message}`);
        }
    }

    async monitorNarrativeRotation(user, strategy) {
        try {
            const { rotationInterval } = strategy.params;
            const lastRotation = strategy.lastExecution || 0;
            
            if (Date.now() - lastRotation >= rotationInterval) {
                await this.strategyEngine.executeStrategy(user.telegramId, strategy);
                await this.db.updateStrategyLastExecution(strategy.id);
            }
        } catch (error) {
            this.logger.error(`Error monitoring narrative rotation: ${error.message}`);
        }
    }

    async monitorEventTriggers(user, strategy) {
        try {
            const { eventType, tokenAddress } = strategy.params;
            
            switch (eventType) {
                case 'token_listing':
                    await this.monitorTokenListings(user, strategy);
                    break;
                case 'airdrop':
                    await this.monitorAirdrops(user, strategy);
                    break;
                case 'ecosystem_signal':
                    await this.monitorEcosystemSignals(user, strategy);
                    break;
            }
        } catch (error) {
            this.logger.error(`Error monitoring event triggers: ${error.message}`);
        }
    }

    async monitorRiskManagement(user, strategy) {
        try {
            const { checkInterval } = strategy.params;
            const lastCheck = strategy.lastExecution || 0;
            
            if (Date.now() - lastCheck >= checkInterval) {
                await this.strategyEngine.executeStrategy(user.telegramId, strategy);
                await this.db.updateStrategyLastExecution(strategy.id);
            }
        } catch (error) {
            this.logger.error(`Error monitoring risk management: ${error.message}`);
        }
    }

    async monitorTokenListings(user, strategy) {
        // Implement token listing monitoring
    }

    async monitorAirdrops(user, strategy) {
        // Implement airdrop monitoring
    }

    async monitorEcosystemSignals(user, strategy) {
        // Implement ecosystem signal monitoring
    }

    // Add a new method to start monitoring a specific wallet for token purchases
    async startWalletTokenMonitoring(walletAddress, telegramId) {
        try {
            if (!this.apiKey) {
                console.error('Helius API key not found in environment variables');
                return false;
            }

            if (this.tokenMonitors.has(walletAddress)) {
                console.log(`Wallet ${walletAddress} is already being monitored`);
                return false;
            }

            const monitor = new WalletTokenMonitor(this.apiKey, walletAddress);
            
            // Override the analyzeTokenPurchase method to integrate with our notification system
            const originalAnalyze = monitor.analyzeTokenPurchase.bind(monitor);
            monitor.analyzeTokenPurchase = async (transaction) => {
                const purchaseData = await originalAnalyze(transaction);
                if (purchaseData) {
                    await this.notifyTokenPurchase(telegramId, purchaseData);
                }
                return purchaseData;
            };

            // Start both polling and WebSocket monitoring
            await monitor.startPolling(5000); // Poll every 5 seconds
            await monitor.startWebSocketMonitoring();

            this.tokenMonitors.set(walletAddress, monitor);
            console.log(`Started enhanced monitoring for wallet: ${walletAddress}`);
            return true;

        } catch (error) {
            console.error(`Error starting wallet token monitoring: ${error.message}`);
            return false;
        }
    }

    async stopWalletTokenMonitoring(walletAddress) {
        const monitor = this.tokenMonitors.get(walletAddress);
        if (monitor) {
            monitor.cleanup();
            this.tokenMonitors.delete(walletAddress);
            console.log(`Stopped monitoring wallet: ${walletAddress}`);
            return true;
        }
        return false;
    }

    async notifyTokenPurchase(telegramId, purchaseData) {
        try {
            if (!this.telegramBot) {
                console.log('TelegramBot not available, logging purchase instead:', purchaseData);
                return;
            }

            const message = `🎯 *New Token Purchase Detected!*\n\n` +
                `*Token:* \`${purchaseData.tokenPurchased.symbol}\`\n` +
                `*Contract:* \`${purchaseData.tokenPurchased.mint}\`\n` +
                `*Amount:* ${purchaseData.tokenPurchased.amount}\n` +
                `*Paid:* ${purchaseData.tokenSold.amount} ${purchaseData.tokenSold.symbol}\n` +
                `*Fee:* ${purchaseData.fee} SOL\n` +
                `*Time:* ${new Date(purchaseData.timestamp * 1000).toLocaleString()}\n\n` +
                `Would you like to copy this trade?`;

            await this.telegramBot.sendAndStoreMessage(
                telegramId,
                message,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { 
                                    text: '✅ Copy Trade', 
                                    callback_data: `copy_purchase_${purchaseData.tokenPurchased.mint}_${purchaseData.tokenSold.amount}` 
                                },
                                { text: '📊 Analyze Token', callback_data: `analyze_${purchaseData.tokenPurchased.mint}` }
                            ],
                            [
                                { text: '🔔 Set Alert', callback_data: `alert_${purchaseData.tokenPurchased.mint}` },
                                { text: '❌ Ignore', callback_data: 'ignore_purchase' }
                            ]
                        ]
                    }
                }
            );

        } catch (error) {
            console.error('Error notifying token purchase:', error);
        }
    }
}

module.exports = { WalletMonitor, WalletTokenMonitor };