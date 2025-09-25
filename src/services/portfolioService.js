const winston = require('winston');
const DatabaseManager = require('../modules/database');
const TokenDataService = require('./tokenDataService');
const TradingService = require('./tradingService');
const WalletHoldingsService = require('./walletHoldingsService');
const HeliusWalletService = require('./heliusWalletService');
const solanaWeb3 = require('@solana/web3.js');
const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const EventEmitter = require('events');

class PortfolioService extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.db = new DatabaseManager();
        this.tokenDataService = new TokenDataService(config);
        this.tradingService = new TradingService(config);
        this.walletHoldingsService = new WalletHoldingsService(config);
        this.heliusService = new HeliusWalletService(config);
        
        // Cache for wallet balances to avoid repeated API calls
        this.balanceCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds cache
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
        
        // Set up event listeners for external triggers
        this.setupEventListeners();
    }

    /**
     * Set up event listeners for external triggers
     */
    setupEventListeners() {
        // Listen for wallet balance refresh requests
        this.on('refreshWalletBalance', async (walletAddress) => {
            try {
                this.logger.info(`Event triggered: Refreshing wallet balance for ${walletAddress}`);
                await this.refreshWalletBalance(walletAddress);
            } catch (error) {
                this.logger.error(`Error refreshing wallet balance for ${walletAddress}:`, error);
            }
        });

        // Listen for portfolio update requests
        this.on('updatePortfolio', async (userId) => {
            try {
                this.logger.info(`Event triggered: Updating portfolio for user ${userId}`);
                await this.updateUserPortfolio(userId);
            } catch (error) {
                this.logger.error(`Error updating portfolio for user ${userId}:`, error);
            }
        });

        // Listen for balance check requests (for trading decisions)
        this.on('checkBalanceForTrade', async (walletAddress) => {
            try {
                this.logger.info(`Event triggered: Checking balance for trade on ${walletAddress}`);
                const balance = await this.getWalletBalance(walletAddress);
                this.emit('balanceChecked', { walletAddress, balance });
            } catch (error) {
                this.logger.error(`Error checking balance for trade on ${walletAddress}:`, error);
            }
        });
    }

    /**
     * Refresh wallet balance and clear cache
     */
    async refreshWalletBalance(walletAddress) {
        // Clear cache for this wallet
        this.balanceCache.delete(walletAddress);
        
        // Fetch fresh data
        const balance = await this.getWalletBalance(walletAddress);
        
        // Emit event with updated balance
        this.emit('walletBalanceUpdated', { walletAddress, balance });
        
        return balance;
    }

    /**
     * Update user portfolio (triggered by events)
     */
    async updateUserPortfolio(userId) {
        try {
            const user = await this.db.getUserById(userId);
            if (!user) {
                throw new Error(`User ${userId} not found`);
            }

            const activeWallet = await this.db.getActiveWallet(userId);
            if (!activeWallet) {
                throw new Error(`No active wallet for user ${userId}`);
            }

            // Refresh wallet balance
            const balance = await this.refreshWalletBalance(activeWallet.public_key);
            
            // Update user's portfolio data in database
            await this.db.updateUserPortfolioData(userId, {
                last_updated: new Date(),
                total_value: balance.totalValue,
                sol_balance: balance.sol,
                token_count: balance.tokens.length
            });

            this.emit('portfolioUpdated', { userId, balance });
            
            return balance;
        } catch (error) {
            this.logger.error(`Error updating portfolio for user ${userId}:`, error);
            throw error;
        }
    }

    async rebalancePortfolio(userId) {
        try {
            const allocations = await this.db.getPortfolioAllocations(userId);
            const currentHoldings = await this.getCurrentHoldings(userId);
            const totalValue = this.calculateTotalPortfolioValue(currentHoldings);
            
            const rebalanceActions = [];
            
            for (const allocation of allocations) {
                const currentValue = this.getCategoryValue(currentHoldings, allocation.category);
                const currentPercentage = (currentValue / totalValue) * 100;
                const targetValue = (totalValue * allocation.target_percentage) / 100;
                
                if (Math.abs(currentPercentage - allocation.target_percentage) > 5) { // 5% threshold
                    const difference = targetValue - currentValue;
                    if (difference > 0) {
                        // Need to buy more tokens in this category
                        const tokensToBuy = await this.findTokensToBuy(allocation.category, difference);
                        rebalanceActions.push({
                            type: 'BUY',
                            category: allocation.category,
                            tokens: tokensToBuy,
                            value: difference
                        });
                    } else {
                        // Need to sell tokens in this category
                        const tokensToSell = this.findTokensToSell(currentHoldings, allocation.category, Math.abs(difference));
                        rebalanceActions.push({
                            type: 'SELL',
                            category: allocation.category,
                            tokens: tokensToSell,
                            value: Math.abs(difference)
                        });
                    }
                }
            }
            
            // Execute rebalancing actions
            for (const action of rebalanceActions) {
                await this.executeRebalanceAction(userId, action);
            }
            
            await this.db.updateLastRebalance(userId);
            
            return {
                success: true,
                message: 'Portfolio rebalanced successfully',
                actions: rebalanceActions
            };
        } catch (error) {
            this.logger.error(`Error rebalancing portfolio: ${error.message}`);
            throw error;
        }
    }

    async executeMomentumStrategy(userId) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            const categories = await this.db.getPortfolioAllocations(userId);
            
            for (const category of categories) {
                const topTokens = await this.findTopPerformingTokens(category.category);
                const bottomTokens = await this.findBottomPerformingTokens(category.category);
                
                // Sell bottom performers
                for (const token of bottomTokens) {
                    await this.tradingService.executeTrade(userId, token.address, 'SELL', token.price);
                }
                
                // Buy top performers
                for (const token of topTokens) {
                    await this.tradingService.executeTrade(userId, token.address, 'BUY', token.price);
                }
            }
            
            return {
                success: true,
                message: 'Momentum strategy executed successfully'
            };
        } catch (error) {
            this.logger.error(`Error executing momentum strategy: ${error.message}`);
            throw error;
        }
    }

    async executeVolatilityStrategy(userId) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            const trackedTokens = await this.db.getTrackedTokens(userId);
            
            for (const token of trackedTokens) {
                const tokenData = await this.tokenDataService.getTokenData(token.token_address);
                const volatility = this.calculateVolatility(tokenData.priceHistory);
                
                if (volatility > userSettings.volatility_threshold) {
                    // Price is volatile, implement mean reversion strategy
                    const meanPrice = this.calculateMeanPrice(tokenData.priceHistory);
                    
                    if (tokenData.price > meanPrice * 1.1) { // 10% above mean
                        await this.tradingService.executeTrade(userId, token.token_address, 'SELL', tokenData.price);
                    } else if (tokenData.price < meanPrice * 0.9) { // 10% below mean
                        await this.tradingService.executeTrade(userId, token.token_address, 'BUY', tokenData.price);
                    }
                }
            }
            
            return {
                success: true,
                message: 'Volatility strategy executed successfully'
            };
        } catch (error) {
            this.logger.error(`Error executing volatility strategy: ${error.message}`);
            throw error;
        }
    }

    async executeNarrativeRotation(userId) {
        try {
            const trendingCategories = await this.analyzeTrendingCategories();
            const currentAllocations = await this.db.getPortfolioAllocations(userId);
            
            // Adjust allocations based on trending categories
            for (const category of currentAllocations) {
                const trendScore = trendingCategories[category.category] || 0;
                const newTargetPercentage = this.calculateNewTargetPercentage(category.target_percentage, trendScore);
                
                await this.db.updatePortfolioAllocation(userId, category.category, newTargetPercentage);
            }
            
            // Rebalance portfolio with new allocations
            await this.rebalancePortfolio(userId);
            
            return {
                success: true,
                message: 'Narrative rotation executed successfully',
                newAllocations: await this.db.getPortfolioAllocations(userId)
            };
        } catch (error) {
            this.logger.error(`Error executing narrative rotation: ${error.message}`);
            throw error;
        }
    }

    async executeSmartWalletCopyTrading(userId) {
        try {
        const externalWallets = await this.db.getExternalWallets(userId);
        const userSettings = await this.db.getUserSettings(userId);
        
        for (const wallet of externalWallets) {
            if (!wallet.is_active) continue;
            
            const recentTrades = await this.getRecentWalletTrades(wallet.wallet_address);
            
            for (const trade of recentTrades) {
                // Check if we should copy this trade
                if (this.shouldCopyTrade(trade, userSettings)) {
                    await this.tradingService.executeTrade(
                        userId,
                        trade.token_address,
                        trade.trade_type,
                        trade.price
                    );
                }
            }
            
            await this.db.updateExternalWalletLastTrade(wallet.id);
        }
        
        return {
            success: true,
            message: 'Smart wallet copy trading executed successfully'
        };
        } catch (error) {
            this.logger.error(`Error executing smart wallet copy trading: ${error.message}`);
            throw error;
        }
    }

    // Helper methods
    async getCurrentHoldings(userId) {
        const trackedTokens = await this.db.getTrackedTokens(userId);
        const holdings = [];
        
        for (const token of trackedTokens) {
            const tokenData = await this.tokenDataService.getTokenData(token.token_address);
            holdings.push({
                address: token.token_address,
                amount: token.amount,
                price: tokenData.price,
                category: tokenData.category
            });
        }
        
        return holdings;
    }

    calculateTotalPortfolioValue(holdings) {
        return holdings.reduce((total, holding) => total + (holding.amount * holding.price), 0);
    }

    getCategoryValue(holdings, category) {
        return holdings
            .filter(holding => holding.category === category)
            .reduce((total, holding) => total + (holding.amount * holding.price), 0);
    }

    async findTokensToBuy(category, value) {
        // Implement token discovery logic based on category and value
        // This would involve querying token data sources and applying filters
        return [];
    }

    findTokensToSell(holdings, category, value) {
        return holdings
            .filter(holding => holding.category === category)
            .sort((a, b) => b.price - a.price)
            .slice(0, Math.ceil(value / 1000)); // Assuming minimum $1000 per trade
    }

    async executeRebalanceAction(userId, action) {
        for (const token of action.tokens) {
            await this.tradingService.executeTrade(
                userId,
                token.address,
                action.type,
                token.price
            );
        }
    }

    calculateVolatility(priceHistory) {
        if (priceHistory.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < priceHistory.length; i++) {
            returns.push((priceHistory[i] - priceHistory[i-1]) / priceHistory[i-1]);
        }
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    calculateMeanPrice(priceHistory) {
        return priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
    }

    async analyzeTrendingCategories() {
        // Implement category trend analysis
        // This would involve analyzing social media, news, and market data
        return {};
    }

    calculateNewTargetPercentage(currentPercentage, trendScore) {
        // Implement target percentage adjustment logic based on trend score
        return currentPercentage;
    }

    async getRecentWalletTrades(walletAddress) {
        // Implement logic to fetch recent trades from a wallet
        return [];
    }

    shouldCopyTrade(trade, userSettings) {
        // Implement logic to determine if a trade should be copied
        // This would involve checking trade size, token type, etc.
        return true;
    }

    /**
     * Get wallet balance with caching
     */
    async getWalletBalance(walletAddress) {
        // Check cache first
        const cached = this.balanceCache.get(walletAddress);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            this.logger.info(`Using cached balance for ${walletAddress}`);
            return cached.data;
        }

        try {
            // Use Helius service for comprehensive wallet data
            const walletSummary = await this.heliusService.getWalletSummary(walletAddress);
            
            // Extract SOL balance
            const solBalance = walletSummary.summary.nativeBalance / 1e9; // Convert from lamports to SOL
            
            // Extract fungible tokens
            const tokens = walletSummary.details.fungibleTokens.fungibleTokens.map(token => {
                const balance = token.token_info?.balance || 0;
                const decimals = token.token_info?.decimals || 0;
                const actualBalance = balance / Math.pow(10, decimals);
                
                return {
                    mint: token.id || token.content?.metadata?.symbol,
                    address: token.token_info?.associated_token_address || token.id,
                    amount: actualBalance,
                    decimals: decimals,
                    rawAmount: balance,
                    symbol: token.content?.metadata?.symbol || 'Unknown',
                    name: token.content?.metadata?.name || 'Unknown',
                    usdValue: 0, // Will be calculated separately if needed
                    price: 0 // Will be fetched separately if needed
                };
            });

            const result = {
                lamports: walletSummary.summary.nativeBalance,
                sol: solBalance,
                tokens: tokens,
                totalValue: walletSummary.summary.totalEstimatedValue,
                totalHoldings: walletSummary.summary.fungibleTokenCount + 1, // +1 for SOL
                enhanced: true, // Flag to indicate this is using the Helius service
                heliusData: walletSummary // Include full Helius data for advanced usage
            };

            // Cache the result
            this.balanceCache.set(walletAddress, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            this.logger.error('Error fetching Helius wallet balance:', error);
            
            // Fallback to legacy method if Helius service fails
            return this.getWalletBalanceLegacy(walletAddress);
        }
    }

    // Keep the original method as a fallback
    async getWalletBalanceLegacy(walletAddress) {
        try {
            if (!walletAddress || typeof walletAddress !== 'string') {
                throw new Error('Invalid wallet address');
            }
            let publicKey;
            try {
                publicKey = new PublicKey(walletAddress);
            } catch (err) {
                this.logger.error('Invalid wallet address:', walletAddress);
                return { lamports: 0, sol: 0, tokens: [] };
            }
            const connection = new Connection(clusterApiUrl('mainnet-beta'));
            const balanceInLamports = await connection.getBalance(publicKey);
            const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;

            // Fetch SPL token balances
            let tokens = [];
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );
                for (const tokenAccount of tokenAccounts.value) {
                    const info = tokenAccount.account.data.parsed.info;
                    if (parseFloat(info.tokenAmount.uiAmount) > 0) {
                        tokens.push({
                            mint: info.mint,
                            address: tokenAccount.pubkey.toString(),
                            amount: info.tokenAmount.uiAmount,
                            decimals: info.tokenAmount.decimals,
                            rawAmount: info.tokenAmount.amount
                        });
                    }
                }
            } catch (err) {
                this.logger.error('Error fetching SPL token balances:', err);
            }
            return {
                lamports: balanceInLamports,
                sol: balanceInSol,
                tokens
            };
        } catch (error) {
            this.logger.error('Error fetching wallet balance:', error);
            return { lamports: 0, sol: 0, tokens: [] };
        }
    }

    /**
     * Clear cache for specific wallet or all wallets
     */
    clearCache(walletAddress = null) {
        if (walletAddress) {
            this.balanceCache.delete(walletAddress);
            this.logger.info(`Cache cleared for wallet ${walletAddress}`);
        } else {
            this.balanceCache.clear();
            this.logger.info('All wallet balance cache cleared');
        }
    }

    /**
     * Get cache status
     */
    getCacheStatus() {
        return {
            cacheSize: this.balanceCache.size,
            cachedWallets: Array.from(this.balanceCache.keys()),
            cacheTimeout: this.cacheTimeout
        };
    }

    /**
     * Get detailed portfolio analysis for a wallet
     */
    async getPortfolioAnalysis(walletAddress) {
        try {
            const holdings = await this.walletHoldingsService.getAllHoldings(walletAddress);
            
            // Calculate portfolio distribution
            const distribution = this.calculatePortfolioDistribution(holdings.holdings);
            
            // Analyze risk profile
            const riskProfile = this.analyzeRiskProfile(holdings.holdings);
            
            return {
                ...holdings,
                analysis: {
                    distribution,
                    riskProfile,
                    recommendations: this.generateRecommendations(holdings.holdings, distribution, riskProfile)
                }
            };
        } catch (error) {
            this.logger.error('Error getting portfolio analysis:', error);
            throw error;
        }
    }

    /**
     * Calculate portfolio distribution by categories
     */
    calculatePortfolioDistribution(holdings) {
        const totalValue = holdings.reduce((sum, h) => sum + (h.value.usd || 0), 0);
        
        const distribution = {
            native: 0,       // SOL
            stablecoins: 0,  // USDC, USDT, etc.
            verified: 0,     // Verified tokens
            unverified: 0    // Unverified/new tokens
        };

        holdings.forEach(holding => {
            const percentage = totalValue > 0 ? ((holding.value.usd || 0) / totalValue) * 100 : 0;
            
            if (holding.isNative) {
                distribution.native += percentage;
            } else if (holding.tags?.includes('stablecoin')) {
                distribution.stablecoins += percentage;
            } else if (holding.metadata?.verified) {
                distribution.verified += percentage;
            } else {
                distribution.unverified += percentage;
            }
        });

        return distribution;
    }

    /**
     * Analyze portfolio risk profile
     */
    analyzeRiskProfile(holdings) {
        const totalValue = holdings.reduce((sum, h) => sum + (h.value.usd || 0), 0);
        
        let riskScore = 0;
        let diversificationScore = 0;
        
        // Calculate risk based on token distribution
        holdings.forEach(holding => {
            const weight = totalValue > 0 ? (holding.value.usd || 0) / totalValue : 0;
            
            // Risk factors
            if (holding.isNative) {
                riskScore += weight * 0.3; // SOL is relatively stable
            } else if (holding.tags?.includes('stablecoin')) {
                riskScore += weight * 0.1; // Stablecoins are low risk
            } else if (holding.metadata?.verified) {
                riskScore += weight * 0.5; // Verified tokens moderate risk
            } else {
                riskScore += weight * 0.9; // Unverified tokens high risk
            }
        });

        // Calculate diversification (number of holdings vs concentration)
        const holdingsCount = holdings.length;
        const largestHolding = Math.max(...holdings.map(h => 
            totalValue > 0 ? ((h.value.usd || 0) / totalValue) * 100 : 0
        ));

        diversificationScore = Math.min(holdingsCount / 10, 1) - (largestHolding / 100) * 0.5;

        return {
            riskScore: Math.round(riskScore * 100),
            diversificationScore: Math.round(diversificationScore * 100),
            riskLevel: riskScore > 0.7 ? 'High' : riskScore > 0.4 ? 'Medium' : 'Low',
            diversificationLevel: diversificationScore > 0.7 ? 'Good' : diversificationScore > 0.4 ? 'Moderate' : 'Poor'
        };
    }

    /**
     * Generate portfolio recommendations
     */
    generateRecommendations(holdings, distribution, riskProfile) {
        const recommendations = [];

        // Diversification recommendations
        if (riskProfile.diversificationScore < 50) {
            recommendations.push({
                type: 'diversification',
                message: 'Consider diversifying your portfolio across more tokens',
                priority: 'medium'
            });
        }

        // Risk recommendations
        if (riskProfile.riskScore > 70) {
            recommendations.push({
                type: 'risk',
                message: 'High risk portfolio. Consider adding more stablecoins or verified tokens',
                priority: 'high'
            });
        }

        // Stablecoin recommendations
        if (distribution.stablecoins < 10) {
            recommendations.push({
                type: 'stability',
                message: 'Consider holding some stablecoins for portfolio stability',
                priority: 'medium'
            });
        }

        return recommendations;
    }
}

module.exports = PortfolioService;