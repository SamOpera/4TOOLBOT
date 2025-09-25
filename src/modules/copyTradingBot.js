require('dotenv').config();
const DatabaseManager = require('./database');
const BuyManager = require('./buyManager');

// Use global fetch if available (Node.js 18+), otherwise fall back to node-fetch
let fetch;
if (typeof globalThis.fetch !== 'undefined') {
    fetch = globalThis.fetch;
} else {
    try {
        fetch = require('node-fetch');
    } catch (error) {
        console.error('❌ Neither global fetch nor node-fetch is available. Please install node-fetch or use Node.js 18+');
        throw error;
    }
}

const WebSocket = require('ws'); // npm install ws

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
        this.onTokenPurchase = null; // Callback for token purchases
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

    // Method 2: Real-time monitoring using WebSockets
    startWebSocketMonitoring() {
        console.log(`Starting WebSocket monitoring for wallet ${this.walletAddress}...`);
        
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            
            // Subscribe to transactions involving the wallet address
            const subscribeMessage = {
                jsonrpc: "2.0",
                id: 1,
                method: "transactionSubscribe",
                params: [
                    {
                        accountInclude: [this.walletAddress],
                        failed: false
                    },
                    {
                        commitment: "confirmed",
                        encoding: "jsonParsed",
                        transactionDetails: "full",
                        maxSupportedTransactionVersion: 0
                    }
                ]
            };

            this.ws.send(JSON.stringify(subscribeMessage));

            // Send ping every 30 seconds to keep connection alive
            this.wsPingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            }, 30000);
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                if (message.method === 'transactionNotification') {
                    const transaction = message.params.result;
                    await this.processRealtimeTransaction(transaction);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.ws.on('close', () => {
            console.log('WebSocket connection closed');
            clearInterval(this.wsPingInterval);
            this.ws = null;
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.startWebSocketMonitoring(), 5000);
        });
    }

    // Analyze swap transactions for token purchases
    async analyzeTokenPurchase(transaction) {
        if (transaction.type === 'SWAP' && transaction.events?.swap) {
            const swap = transaction.events.swap;
            
            // Check if this is a token purchase (SOL -> Token or Token -> Token)
            const tokensBought = swap.tokenOutputs?.filter(output => 
                output.userAccount === this.walletAddress
            );

            if (tokensBought && tokensBought.length > 0) {
                for (const token of tokensBought) {
                    console.log('🎉 NEW TOKEN PURCHASE DETECTED!');
                    console.log(`Wallet: ${this.walletAddress}`);
                    console.log(`Token: ${token.mint}`);
                    console.log(`Amount: ${token.tokenAmount}`);
                    console.log(`Transaction: ${transaction.signature}`);
                    console.log(`Timestamp: ${new Date(transaction.timestamp * 1000).toISOString()}`);
                    console.log('---');

                    // Get additional token information
                    await this.getTokenInfo(token.mint);

                    // Trigger callback if set
                    if (this.onTokenPurchase) {
                        await this.onTokenPurchase({
                            walletAddress: this.walletAddress,
                            tokenMint: token.mint,
                            amount: token.tokenAmount,
                            signature: transaction.signature,
                            timestamp: transaction.timestamp,
                            transaction: transaction
                        });
                    }
                }
            }
        }
    }

    // Analyze transfer transactions
    async analyzeTokenTransfer(transaction) {
        if (transaction.tokenTransfers) {
            for (const transfer of transaction.tokenTransfers) {
                // Check if wallet received tokens
                if (transfer.toUserAccount === this.walletAddress && transfer.tokenAmount > 0) {
                    console.log('📥 TOKEN TRANSFER RECEIVED');
                    console.log(`Wallet: ${this.walletAddress}`);
                    console.log(`Token: ${transfer.mint}`);
                    console.log(`Amount: ${transfer.tokenAmount}`);
                    console.log(`From: ${transfer.fromUserAccount}`);
                    console.log(`Transaction: ${transaction.signature}`);
                    console.log(`Timestamp: ${new Date(transaction.timestamp * 1000).toISOString()}`);
                    console.log('---');

                    // Trigger callback if set
                    if (this.onTokenPurchase) {
                        await this.onTokenPurchase({
                            walletAddress: this.walletAddress,
                            tokenMint: transfer.mint,
                            amount: transfer.tokenAmount,
                            signature: transaction.signature,
                            timestamp: transaction.timestamp,
                            transaction: transaction,
                            type: 'transfer'
                        });
                    }
                }
            }
        }
    }

    // Process real-time transactions from WebSocket
    async processRealtimeTransaction(transactionData) {
        const signature = transactionData.signature;
        
        if (this.processedTransactions.has(signature)) {
            return; // Already processed
        }
        
        this.processedTransactions.add(signature);

        // Parse the transaction to look for token purchases
        const transaction = transactionData.transaction;
        const meta = transaction.meta;

        // Check for token balance changes
        if (meta.postTokenBalances && meta.preTokenBalances) {
            const tokenChanges = this.calculateTokenChanges(
                meta.preTokenBalances,
                meta.postTokenBalances
            );

            for (const change of tokenChanges) {
                if (change.owner === this.walletAddress && change.change > 0) {
                    console.log('⚡ REAL-TIME TOKEN PURCHASE DETECTED!');
                    console.log(`Wallet: ${this.walletAddress}`);
                    console.log(`Token Mint: ${change.mint}`);
                    console.log(`Amount Change: +${change.change}`);
                    console.log(`Transaction: ${signature}`);
                    console.log(`Slot: ${transactionData.slot}`);
                    console.log('---');

                    // Get token information
                    await this.getTokenInfo(change.mint);

                    // Trigger callback if set
                    if (this.onTokenPurchase) {
                        await this.onTokenPurchase({
                            walletAddress: this.walletAddress,
                            tokenMint: change.mint,
                            amount: change.change,
                            signature: signature,
                            slot: transactionData.slot,
                            transaction: transactionData,
                            type: 'realtime'
                        });
                    }
                }
            }
        }
    }

    // Calculate token balance changes
    calculateTokenChanges(preBalances, postBalances) {
        const changes = [];
        const preMap = new Map();
        
        // Map pre-balances
        preBalances.forEach(balance => {
            const key = `${balance.owner}-${balance.mint}`;
            preMap.set(key, parseFloat(balance.uiTokenAmount.uiAmountString || '0'));
        });

        // Calculate changes
        postBalances.forEach(balance => {
            const key = `${balance.owner}-${balance.mint}`;
            const preAmount = preMap.get(key) || 0;
            const postAmount = parseFloat(balance.uiTokenAmount.uiAmountString || '0');
            const change = postAmount - preAmount;

            if (change !== 0) {
                changes.push({
                    owner: balance.owner,
                    mint: balance.mint,
                    change: change,
                    preAmount: preAmount,
                    postAmount: postAmount
                });
            }
        });

        return changes;
    }

    // Get additional token information using DAS API
    async getTokenInfo(mintAddress) {
        try {
            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getAsset',
                    params: {
                        id: mintAddress,
                        displayOptions: {
                            showFungible: true
                        }
                    }
                })
            });

            const data = await response.json();
            const tokenInfo = data.result?.token_info;

            if (tokenInfo) {
                console.log(`Token Symbol: ${tokenInfo.symbol || 'Unknown'}`);
                console.log(`Token Name: ${tokenInfo.name || 'Unknown'}`);
                console.log(`Decimals: ${tokenInfo.decimals || 'Unknown'}`);
                
                if (tokenInfo.price_info) {
                    console.log(`Price: $${tokenInfo.price_info.price_per_token}`);
                }
            }
        } catch (error) {
            console.error('Error fetching token info:', error);
        }
    }

    // Stop polling
    stopPolling() {
        this.isPolling = false;
        console.log('Stopped polling');
    }

    // Stop WebSocket monitoring
    stopWebSocketMonitoring() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            clearInterval(this.wsPingInterval);
        }
        console.log('Stopped WebSocket monitoring');
    }

    // Stop all monitoring
    stop() {
        this.stopPolling();
        this.stopWebSocketMonitoring();
    }
}

class CopyTradingBot {
    constructor(config) {
        this.config = config;
        this.db = new DatabaseManager();
        this.buyManager = new BuyManager(config, null, this.db);
        this.isRunning = false;
        this.lastProcessedSignature = null;
        this.processedSwaps = new Set();
        this.pollInterval = config.copyTrading.pollInterval || 10000; // 10 seconds default
        this.activeStrategies = new Map(); // Store active strategies per user
        this.walletMonitors = new Map(); // Store wallet monitors for each wallet
    }

    // Create a wallet monitor for a specific wallet
    createWalletMonitor(walletAddress, userId) {
        const monitor = new WalletTokenMonitor(this.config.heliusApiKey, walletAddress);
        
        // Set up callback for token purchases
        monitor.onTokenPurchase = async (purchaseData) => {
            await this.handleTokenPurchase(userId, purchaseData);
        };

        return monitor;
    }

    // Handle token purchase detected by wallet monitor
    async handleTokenPurchase(userId, purchaseData) {
        try {
            console.log(`🎯 Processing token purchase for user ${userId}`);
            
            // Get user settings
            const userSettings = await this.db.getUserSettings(userId);
            if (!userSettings) {
                console.log('No user settings found for user:', userId);
                return;
            }

            // Create swap data structure compatible with existing logic
            const swapData = {
                signature: purchaseData.signature,
                timestamp: new Date(purchaseData.timestamp * 1000),
                tokenIn: 'So11111111111111111111111111111111111111112', // SOL mint (assuming SOL->Token swap)
                tokenOut: purchaseData.tokenMint,
                amountIn: purchaseData.amount || 0,
                amountOut: purchaseData.amount || 0,
                dex: 'detected'
            };

            // Process the swap using existing logic
            await this.processSwap(userId, swapData, userSettings);

        } catch (error) {
            console.error('❌ Error handling token purchase:', error);
        }
    }

    // Start monitoring for a specific user
    async startMonitoringForUser(userId) {
        try {
            // Get active external wallets for the user
            const externalWallets = await this.db.getExternalWallets(userId);
            const activeWallets = externalWallets.filter(wallet => wallet.is_active);

            if (activeWallets.length === 0) {
                console.log(`No active external wallets found for user ${userId}`);
                return;
            }

            console.log(`📡 Starting monitoring for ${activeWallets.length} wallets for user ${userId}`);

            for (const wallet of activeWallets) {
                const monitor = this.createWalletMonitor(wallet.wallet_address, userId);
                
                // Store the monitor
                this.walletMonitors.set(wallet.wallet_address, monitor);

                // Start both polling and WebSocket monitoring for maximum coverage
                monitor.startPolling(this.pollInterval);
                monitor.startWebSocketMonitoring();

                console.log(`🔍 Started monitoring wallet: ${wallet.wallet_address}`);
            }

        } catch (error) {
            console.error('❌ Error starting monitoring for user:', error);
        }
    }

    // Stop monitoring for a specific wallet
    stopMonitoringWallet(walletAddress) {
        const monitor = this.walletMonitors.get(walletAddress);
        if (monitor) {
            monitor.stop();
            this.walletMonitors.delete(walletAddress);
            console.log(`🛑 Stopped monitoring wallet: ${walletAddress}`);
        }
    }

    // Stop all wallet monitoring
    stopAllMonitoring() {
        for (const [walletAddress, monitor] of this.walletMonitors) {
            monitor.stop();
        }
        this.walletMonitors.clear();
        console.log('🛑 Stopped all wallet monitoring');
    }

    // Legacy methods for backward compatibility
    async getLatestSwaps(walletAddress, limit = 5) {
        const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${this.config.heliusApiKey}&type=SWAP&limit=${limit}`;
        try {
            const response = await fetch(url);
            const swaps = await response.json();
            return swaps;
        } catch (error) {
            console.error('❌ Error fetching swaps:', error);
            return [];
        }
    }

    // Legacy WebSocket method (kept for compatibility but use WalletTokenMonitor instead)
    startWebSocketMonitoring(walletAddress) {
        console.log('⚠️  Using legacy WebSocket method. Consider using WalletTokenMonitor for better functionality.');
        
        if (this.ws) {
            console.log('WebSocket already running');
            return;
        }
        const wsUrl = `wss://atlas-mainnet.helius-rpc.com/?api-key=${this.config.heliusApiKey}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log(`WebSocket connected for wallet ${walletAddress}`);
            const subscribeMessage = {
                jsonrpc: "2.0",
                id: 1,
                method: "transactionSubscribe",
                params: [
                    {
                        accountInclude: [walletAddress],
                        failed: false
                    },
                    {
                        commitment: "confirmed",
                        encoding: "jsonParsed",
                        transactionDetails: "full",
                        maxSupportedTransactionVersion: 0
                    }
                ]
            };
            this.ws.send(JSON.stringify(subscribeMessage));
            this.wsPingInterval = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.ping();
                }
            }, 30000);
        });

        this.ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.method === 'transactionNotification') {
                    const transaction = message.params.result;
                    await this.processRealtimeTransaction(transaction, walletAddress);
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.ws.on('close', () => {
            console.log('WebSocket connection closed');
            clearInterval(this.wsPingInterval);
            this.ws = null;
            setTimeout(() => this.startWebSocketMonitoring(walletAddress), 5000);
        });
    }

    stopWebSocketMonitoring() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            clearInterval(this.wsPingInterval);
        }
        console.log('Stopped WebSocket monitoring');
    }

    async processRealtimeTransaction(transactionData, walletAddress) {
        const signature = transactionData.signature;
        if (this.processedSwaps.has(signature)) {
            return;
        }
        this.processedSwaps.add(signature);

        const transaction = transactionData.transaction;
        const meta = transaction.meta;

        if (meta.postTokenBalances && meta.preTokenBalances) {
            const tokenChanges = this.calculateTokenChanges(
                meta.preTokenBalances,
                meta.postTokenBalances
            );
            for (const change of tokenChanges) {
                if (change.owner === walletAddress && change.change > 0) {
                    console.log('⚡ REAL-TIME TOKEN PURCHASE DETECTED!');
                    console.log(`Wallet: ${walletAddress}`);
                    console.log(`Token Mint: ${change.mint}`);
                    console.log(`Amount Change: +${change.change}`);
                    console.log(`Transaction: ${signature}`);
                    console.log(`Slot: ${transactionData.slot}`);
                    console.log('---');
                    await this.getTokenInfo(change.mint);
                }
            }
        }
    }

    calculateTokenChanges(preBalances, postBalances) {
        const changes = [];
        const preMap = new Map();
        preBalances.forEach(balance => {
            const key = `${balance.owner}-${balance.mint}`;
            preMap.set(key, parseFloat(balance.uiTokenAmount.uiAmountString || '0'));
        });
        postBalances.forEach(balance => {
            const key = `${balance.owner}-${balance.mint}`;
            const preAmount = preMap.get(key) || 0;
            const postAmount = parseFloat(balance.uiTokenAmount.uiAmountString || '0');
            const change = postAmount - preAmount;
            if (change !== 0) {
                changes.push({
                    owner: balance.owner,
                    mint: balance.mint,
                    change: change,
                    preAmount: preAmount,
                    postAmount: postAmount
                });
            }
        });
        return changes;
    }

    async getTokenInfo(mintAddress) {
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.config.heliusApiKey}`;
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getAsset',
                    params: {
                        id: mintAddress,
                        displayOptions: { showFungible: true }
                    }
                })
            });
            const data = await response.json();
            const tokenInfo = data.result?.token_info;
            if (tokenInfo) {
                console.log(`Token Symbol: ${tokenInfo.symbol || 'Unknown'}`);
                console.log(`Token Name: ${tokenInfo.name || 'Unknown'}`);
                console.log(`Decimals: ${tokenInfo.decimals || 'Unknown'}`);
                if (tokenInfo.price_info) {
                    console.log(`Price: $${tokenInfo.price_info.price_per_token}`);
                }
            }
        } catch (error) {
            console.error('Error fetching token info:', error);
        }
    }

    analyzeSwapForCopying(swap) {
        if (!swap.success) return null; // Skip failed swaps

        const swapData = {
            signature: swap.signature,
            timestamp: new Date(swap.timestamp * 1000),
            tokenIn: null,
            tokenOut: null,
            amountIn: 0,
            amountOut: 0,
            dex: swap.source
        };

        // Extract swap details from events
        const swapEvent = swap.events?.swap;
        if (!swapEvent) return null;

        swapData.tokenIn = swapEvent.tokenIn.mint;
        swapData.tokenOut = swapEvent.tokenOut.mint;
        swapData.amountIn = parseInt(swapEvent.tokenIn.amount);
        swapData.amountOut = parseInt(swapEvent.tokenOut.amount);

        return swapData;
    }

    async start(userId) {
        if (this.isRunning) {
            console.log('Copy trading bot is already running');
            return;
        }

        this.isRunning = true;
        console.log(`🚀 Starting copy trading bot for user: ${userId}`);

        // Get user's active strategy
        const strategy = await this.db.getActiveStrategy(userId);
        if (!strategy) {
            console.log('No active strategy found for user:', userId);
            return;
        }

        // Store the strategy
        this.activeStrategies.set(userId, strategy);

        // Start wallet monitoring for the user
        await this.startMonitoringForUser(userId);

        // Keep the legacy polling as fallback
        while (this.isRunning) {
            try {
                // Check if copy trade strategy is still active
                const strategySettings = await this.db.getStrategySettings(userId, 'copy_trade');
                if (!strategySettings || !strategySettings.params.isActive) {
                    console.log('Copy trade strategy is not active, pausing monitoring for user:', userId);
                    await new Promise(resolve => setTimeout(resolve, this.pollInterval * 3));
                    continue;
                }

                // Get active external wallets for the user
                const externalWallets = await this.db.getExternalWallets(userId);
                const activeWallets = externalWallets.filter(wallet => wallet.is_active);

                if (activeWallets.length === 0) {
                    console.log('No active external wallets found for copy trading');
                    await new Promise(resolve => setTimeout(resolve, this.pollInterval));
                    continue;
                }

                // Legacy fallback polling (less frequent since we have real-time monitoring)
                for (const wallet of activeWallets) {
                    // Only do fallback polling if monitor is not active
                    if (!this.walletMonitors.has(wallet.wallet_address)) {
                        const swaps = await this.getLatestSwaps(wallet.wallet_address);
                        
                        for (const swap of swaps) {
                            // Skip if we've already processed this swap
                            if (this.processedSwaps.has(swap.signature)) continue;
                            
                            const swapData = this.analyzeSwapForCopying(swap);
                            if (!swapData) continue;

                            // Get user settings
                            const userSettings = await this.db.getUserSettings(userId);
                            
                            // Process the swap
                            await this.processSwap(userId, swapData, userSettings);
                            
                            // Mark as processed
                            this.processedSwaps.add(swap.signature);
                            this.lastProcessedSignature = swap.signature;

                            // Update wallet's last trade time
                            await this.db.updateExternalWalletLastTrade(wallet.id);
                        }
                    }
                }

                // Clean up old processed swaps (keep last 1000)
                if (this.processedSwaps.size > 1000) {
                    const swapsToKeep = Array.from(this.processedSwaps).slice(-1000);
                    this.processedSwaps = new Set(swapsToKeep);
                }

            } catch (error) {
                console.error('❌ Error in copy trading loop:', error);
            }

            // Wait for next poll (longer interval since we have real-time monitoring)
            await new Promise(resolve => setTimeout(resolve, this.pollInterval * 3));
        }
    }

    async processSwap(userId, swapData, userSettings) {
        try {
            console.log(`📊 Processing swap: ${swapData.signature}`);
            console.log(`Token In: ${swapData.tokenIn}`);
            console.log(`Token Out: ${swapData.tokenOut}`);
            console.log(`Amount In: ${swapData.amountIn}`);
            console.log(`Amount Out: ${swapData.amountOut}`);
            console.log(`DEX: ${swapData.dex}`);

            // Get user settings from database if not provided
            if (!userSettings) {
                userSettings = await this.db.getUserSettings(userId);
            }

            // Check if we should execute the trade based on user settings
            if (!this.shouldExecuteTrade(swapData, userSettings)) {
                console.log('Trade skipped due to user settings');
                return;
            }

            // Calculate the amount to trade based on user settings
            const tradeAmount = this.calculateTradeAmount(swapData, userSettings);
            if (!tradeAmount) {
                console.log('Trade skipped due to amount calculation');
                return;
            }

            // Get the active strategy
            const strategy = this.activeStrategies.get(userId);
            if (!strategy) {
                console.log('No active strategy found for user:', userId);
                return;
            }

            // Check if copy trade strategy is active
            const strategySettings = await this.db.getStrategySettings(userId, 'copy_trade');
            if (!strategySettings || !strategySettings.params.isActive) {
                console.log('Copy trade strategy is not active for user:', userId);
                return;
            }

            // Execute the buy through BuyManager
            const result = await this.buyManager.executeBuy(
                null, // chatId not needed for automated trades
                userId.toString(), // telegramId
                tradeAmount,
                null // bot instance not needed for automated trades
            );

            if (result.success) {
                console.log('✅ Copy trade executed successfully:', result);
                
                // Record the trade in the database
                await this.db.createTrade(
                    userId,
                    swapData.tokenOut,
                    tradeAmount,
                    result.tokenPrice,
                    'buy'
                );
            } else {
                console.error('❌ Copy trade failed:', result.error);
            }

        } catch (error) {
            console.error('❌ Error processing swap:', error);
        }
    }

    shouldExecuteTrade(swapData, userSettings) {
        // Check if auto-confirm is enabled
        if (!userSettings.auto_confirm_trades) {
            return false;
        }

        // Check max daily trades
        if (userSettings.max_daily_trades) {
            // TODO: Implement daily trade count check
        }

        // Check min/max trade amounts
        if (userSettings.min_trade_amount && swapData.amountIn < userSettings.min_trade_amount) {
            return false;
        }
        if (userSettings.max_trade_amount && swapData.amountIn > userSettings.max_trade_amount) {
            return false;
        }

        return true;
    }

    calculateTradeAmount(swapData, userSettings) {
        let amount = swapData.amountIn;

        // Apply max trade amount limit if set
        if (userSettings.max_trade_amount) {
            amount = Math.min(amount, userSettings.max_trade_amount);
        }

        // Apply min trade amount limit if set
        if (userSettings.min_trade_amount && amount < userSettings.min_trade_amount) {
            return null; // Skip trade if below minimum
        }

        return amount;
    }

    stop() {
        this.isRunning = false;
        this.stopAllMonitoring();
        console.log('🛑 Stopping copy trading bot');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastProcessedSignature: this.lastProcessedSignature,
            processedSwapsCount: this.processedSwaps.size,
            pollInterval: this.pollInterval,
            activeStrategies: Array.from(this.activeStrategies.keys()),
            monitoredWallets: Array.from(this.walletMonitors.keys()),
            totalMonitors: this.walletMonitors.size
        };
    }
}

module.exports = CopyTradingBot; 