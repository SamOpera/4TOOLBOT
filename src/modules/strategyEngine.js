const { Connection, PublicKey } = require('@solana/web3.js');
const winston = require('winston');
const DatabaseManager = require('./database');
const TradingExecution = require('./tradingExecution');

class StrategyEngine {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.rpcEndpoint);
        this.db = new DatabaseManager();
        this.tradingExecution = new TradingExecution(config);
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });

        this.strategyTypes = {
            PORTFOLIO_REBALANCE: 'portfolio_rebalance',
            NARRATIVE_ROTATION: 'narrative_rotation',
            MOMENTUM: 'momentum',
            VOLATILITY_HARVEST: 'volatility_harvest',
            COPY_TRADE: 'copy_trade',
            EVENT_TRIGGER: 'event_trigger',
            RISK_MANAGEMENT: 'risk_management'
        };
    }

    async executeStrategy(userId, strategy) {
        try {
            const user = await this.db.getUserByTelegramId(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const wallet = await this.db.getWalletByUserId(user.id);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            switch (strategy.type) {
                case this.strategyTypes.VOLUME_SPIKE:
                    await this.executeVolumeSpikeStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.DIP_BUY:
                    await this.executeDipBuyStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.NARRATIVE:
                    await this.executeNarrativeStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.MOMENTUM:
                    await this.executeMomentumStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.VOLATILITY_HARVEST:
                    await this.executeVolatilityHarvestStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.COPY_TRADE:
                    await this.executeCopyTradeStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.PORTFOLIO_REBALANCE:
                    await this.executePortfolioRebalanceStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.NARRATIVE_ROTATION:
                    await this.executeNarrativeRotationStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.EVENT_TRIGGER:
                    await this.executeEventTriggerStrategy(user, wallet, strategy);
                    break;
                case this.strategyTypes.RISK_MANAGEMENT:
                    await this.executeRiskManagementStrategy(user, wallet, strategy);
                    break;
                default:
                    throw new Error('Invalid strategy type');
            }
        } catch (error) {
            this.logger.error(`Error executing strategy: ${error.message}`);
            throw error;
        }
    }

    async executeVolumeSpikeStrategy(user, wallet, strategy) {
        try {
            const {
                minVolumeIncrease = 200,
                timeWindow = 3600,
                minLiquidity = 50000,
                maxSlippage = 1
            } = strategy.params;

            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            const userSettings = await this.db.getUserSettings(user.id);

            const volumeSpikes = await this.findVolumeSpikes({
                minVolumeIncrease,
                timeWindow,
                minLiquidity
            });

            const trades = [];
            for (const spike of volumeSpikes) {
                const volumeIncrease = spike.volumeChange;
                const basePositionSize = totalValue * (volumeIncrease / 1000);
                const maxPositionSize = totalValue * (userSettings.max_trade_amount / 100);
                const adjustedAmount = Math.min(basePositionSize, maxPositionSize);
                const newTokenExposure = adjustedAmount / totalValue * 100;

                if (newTokenExposure <= userSettings.max_token_exposure) {
                    trades.push({
                        tokenAddress: spike.tokenAddress,
                        amount: adjustedAmount,
                        side: 'buy',
                        volumeIncrease,
                        confidence: spike.confidence
                    });
                }
            }

            trades.sort((a, b) => b.confidence - a.confidence);

            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + maxSlippage / 100);

                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage,
                        expectedPrice
                    });

                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing volume spike trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }

            this.logger.info(`Volume spike strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                volumeSpikes,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in volume spike strategy: ${error.message}`);
            throw error;
        }
    }

    async executeDipBuyStrategy(user, wallet, strategy) {
        try {
            const {
                minPriceDrop = 10,
                timeWindow = 3600,
                minLiquidity = 50000,
                maxSlippage = 1
            } = strategy.params;

            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            const userSettings = await this.db.getUserSettings(user.id);

            const priceDips = await this.findPriceDips({
                minPriceDrop,
                timeWindow,
                minLiquidity
            });

            const trades = [];
            for (const dip of priceDips) {
                const priceDrop = dip.priceChange;
                const basePositionSize = totalValue * (priceDrop / 100);
                const maxPositionSize = totalValue * (userSettings.max_trade_amount / 100);
                const adjustedAmount = Math.min(basePositionSize, maxPositionSize);
                const newTokenExposure = adjustedAmount / totalValue * 100;

                if (newTokenExposure <= userSettings.max_token_exposure) {
                    trades.push({
                        tokenAddress: dip.tokenAddress,
                        amount: adjustedAmount,
                        side: 'buy',
                        priceDrop,
                        confidence: dip.confidence
                    });
                }
            }

            trades.sort((a, b) => b.confidence - a.confidence);

            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + maxSlippage / 100);

                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage,
                        expectedPrice
                    });

                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing dip buy trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }

            this.logger.info(`Dip buy strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                priceDips,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in dip buy strategy: ${error.message}`);
            throw error;
        }
    }

    async executeNarrativeStrategy(user, wallet, strategy) {
        try {
            const {
                categories = ['meme', 'gaming', 'ai'],
                maxPositionSize = 0.2, // 20% of portfolio
                minLiquidity = 50000, // $50k minimum liquidity
                maxSlippage = 1, // 1% slippage
                minSocialScore = 0.6, // Minimum social sentiment score
                minDeveloperScore = 0.5 // Minimum developer activity score
            } = strategy.params;

            // Get current portfolio value and holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);

            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);

            // Analyze trending narratives
            const narrativeAnalysis = await this.analyzeTrendingNarratives(categories);

            // Filter and prepare trades
            const trades = [];
            for (const category of categories) {
                const categoryData = narrativeAnalysis[category];
                if (!categoryData) continue;

                // Get tokens in this category
                const categoryTokens = await this.findTokensByCategory(category, {
                    minLiquidity,
                    minMarketCap: totalValue * 0.02 // 2% of portfolio
                });

                // Calculate base position size for this category
                const basePositionSize = totalValue * maxPositionSize / categories.length;

                for (const token of categoryTokens) {
                    // Get token metrics
                    const socialScore = await this.getSocialMediaSentiment(category);
                    const volumeTrend = await this.getVolumeTrend(category);
                    const priceMomentum = await this.getPriceMomentum(category);
                    const developerScore = await this.getDeveloperActivity(category);

                    // Calculate confidence score
                    const confidence = (
                        socialScore * 0.3 +
                        volumeTrend * 0.2 +
                        priceMomentum * 0.3 +
                        developerScore * 0.2
                    );

                    // Check if token meets minimum criteria
                    if (socialScore >= minSocialScore && developerScore >= minDeveloperScore) {
                        // Calculate position size based on confidence
                        const positionSize = basePositionSize * confidence;

                        // Check if we already have a position
                        const existingPosition = currentHoldings.find(h => h.tokenAddress === token.address);
                        const currentPositionSize = existingPosition ? existingPosition.value : 0;

                        // Check if we need to adjust position
                        if (Math.abs(positionSize - currentPositionSize) > totalValue * 0.01) { // 1% threshold
                            const tradeAmount = positionSize - currentPositionSize;

                            // Apply risk management
                            if (Math.abs(tradeAmount) > 0) {
                                // Check if trade would exceed max position size
                                const maxAllowedSize = totalValue * (userSettings.max_trade_amount / 100);
                                const adjustedAmount = Math.min(Math.abs(tradeAmount), maxAllowedSize);

                                // Check if trade would exceed max token exposure
                                const newTokenExposure = (currentPositionSize + tradeAmount) / totalValue * 100;
                                if (newTokenExposure <= userSettings.max_token_exposure) {
                                    trades.push({
                                        tokenAddress: token.address,
                                        amount: adjustedAmount,
                                        side: tradeAmount > 0 ? 'buy' : 'sell',
                                        confidence,
                                        category,
                                        socialScore,
                                        volumeTrend,
                                        priceMomentum,
                                        developerScore
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Sort trades by confidence
            trades.sort((a, b) => b.confidence - a.confidence);

            // Execute trades with slippage protection
            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + (trade.side === 'buy' ? maxSlippage : -maxSlippage) / 100);

                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage,
                        expectedPrice
                    });

                    // Add delay between trades
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing narrative trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }

            this.logger.info(`Narrative strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                narrativeAnalysis,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in narrative strategy: ${error.message}`);
            throw error;
        }
    }

    async executeMomentumStrategy(user, wallet, strategy) {
        try {
            const {
                lookbackPeriod = 86400, // 24 hours
                topPerformers = 5,
                momentumThreshold = 0.1, // 10% price increase
                volumeThreshold = 2, // 2x volume increase
                maxPositionSize = 0.2, // 20% of portfolio
                minLiquidity = 100000, // $100k minimum liquidity
                maxSlippage = 1, // 1% slippage
                rsiOverbought = 70, // RSI overbought threshold
                rsiOversold = 30, // RSI oversold threshold
                macdSignalPeriod = 9 // MACD signal period
            } = strategy.params;

            // Get current portfolio value and holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);

            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);

            // Get top performing tokens
            const topTokens = await this.getTopPerformingTokens(lookbackPeriod, {
                minLiquidity,
                minMarketCap: totalValue * 0.05, // 5% of portfolio
                momentumThreshold,
                volumeThreshold
            });

            // Calculate momentum scores with enhanced indicators
            const momentumScores = await this.calculateMomentumScores(topTokens, lookbackPeriod);

            // Sort tokens by momentum score
            const sortedTokens = Object.entries(momentumScores)
                .sort(([, a], [, b]) => b.score - a.score)
                .slice(0, topPerformers);

            // Calculate position sizes
            const trades = [];
            const basePositionSize = totalValue * maxPositionSize / topPerformers;

            for (const [tokenAddress, momentumData] of sortedTokens) {
                // Check if we already have a position
                const existingPosition = currentHoldings.find(h => h.tokenAddress === tokenAddress);
                const currentPositionSize = existingPosition ? existingPosition.value : 0;

                // Calculate target position size based on momentum score and technical indicators
                let targetPositionSize = basePositionSize * (momentumData.score / momentumScores[sortedTokens[0][0]].score);

                // Adjust position size based on RSI
                if (momentumData.rsi > rsiOverbought) {
                    targetPositionSize *= 0.5; // Reduce position size when overbought
                } else if (momentumData.rsi < rsiOversold) {
                    targetPositionSize *= 1.5; // Increase position size when oversold
                }

                // Adjust position size based on MACD
                if (momentumData.macd > 0 && momentumData.macd > momentumData.macdSignal) {
                    targetPositionSize *= 1.2; // Increase position size on strong MACD signal
                } else if (momentumData.macd < 0 && momentumData.macd < momentumData.macdSignal) {
                    targetPositionSize *= 0.8; // Reduce position size on weak MACD signal
                }

                // Check if we need to adjust position
                if (Math.abs(targetPositionSize - currentPositionSize) > totalValue * 0.01) { // 1% threshold
                    const tradeAmount = targetPositionSize - currentPositionSize;

                    // Apply risk management
                    if (Math.abs(tradeAmount) > 0) {
                        // Check if trade would exceed max position size
                        const maxAllowedSize = totalValue * (userSettings.max_trade_amount / 100);
                        const adjustedAmount = Math.min(Math.abs(tradeAmount), maxAllowedSize);

                        // Check if trade would exceed max token exposure
                        const newTokenExposure = (currentPositionSize + tradeAmount) / totalValue * 100;
                        if (newTokenExposure <= userSettings.max_token_exposure) {
                            trades.push({
                                tokenAddress,
                                amount: adjustedAmount,
                                side: tradeAmount > 0 ? 'buy' : 'sell',
                                momentumScore: momentumData.score,
                                priceChange: momentumData.priceChange,
                                volumeChange: momentumData.volumeChange,
                                rsi: momentumData.rsi,
                                macd: momentumData.macd,
                                macdSignal: momentumData.macdSignal
                            });
                        }
                    }
                }
            }

            // Sort trades by momentum score
            trades.sort((a, b) => b.momentumScore - a.momentumScore);

            // Execute trades with slippage protection
            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + (trade.side === 'buy' ? maxSlippage : -maxSlippage) / 100);

                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage,
                        expectedPrice
                    });

                    // Add delay between trades
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing momentum trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }

            this.logger.info(`Momentum strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                momentumScores,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in momentum strategy: ${error.message}`);
            throw error;
        }
    }

    async executeVolatilityHarvestStrategy(user, wallet, strategy) {
        try {
            const {
                volatilityThreshold = 10, // 10% volatility threshold
                timeWindow = 3600, // 1 hour
                meanReversionPeriod = 24, // 24 hours
                maxPositionSize = 0.1, // 10% of portfolio
                minLiquidity = 50000, // $50k minimum liquidity
                profitTarget = 0.05, // 5% profit target
                stopLoss = 0.03 // 3% stop loss
            } = strategy.params;
            
            // Get current portfolio value and holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            
            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);
            
            // Get volatile tokens
            const volatileTokens = await this.getVolatileTokens({
                minLiquidity,
                minMarketCap: totalValue * 0.02, // 2% of portfolio
                volatilityThreshold,
                timeWindow
            });
            
            // Calculate mean reversion opportunities
            const opportunities = [];
            for (const token of volatileTokens) {
                const priceHistory = await this.getPriceHistory(token.address, meanReversionPeriod * 3600);
                const volumeHistory = await this.getVolumeHistory(token.address, meanReversionPeriod * 3600);
                
                // Calculate volatility metrics
                const volatility = this.calculateVolatility(priceHistory);
                const meanPrice = this.calculateMeanPrice(priceHistory);
                const currentPrice = priceHistory[priceHistory.length - 1];
                const priceDeviation = (currentPrice - meanPrice) / meanPrice;
                
                // Calculate volume metrics
                const meanVolume = this.calculateMeanVolume(volumeHistory);
                const currentVolume = volumeHistory[volumeHistory.length - 1];
                const volumeRatio = currentVolume / meanVolume;
                
                // Check for mean reversion opportunities
                if (Math.abs(priceDeviation) > volatilityThreshold / 100) {
                    const opportunity = {
                        tokenAddress: token.address,
                        currentPrice,
                        meanPrice,
                        priceDeviation,
                        volatility,
                        volumeRatio,
                        side: priceDeviation > 0 ? 'sell' : 'buy',
                        confidence: this.calculateConfidence(priceDeviation, volatility, volumeRatio)
                    };
                    
                    opportunities.push(opportunity);
                }
            }
            
            // Sort opportunities by confidence
            opportunities.sort((a, b) => b.confidence - a.confidence);
            
            // Execute trades
            const trades = [];
            for (const opportunity of opportunities) {
                // Check if we already have a position
                const existingPosition = currentHoldings.find(h => h.tokenAddress === opportunity.tokenAddress);
                const currentPositionSize = existingPosition ? existingPosition.value : 0;
                
                // Calculate position size based on confidence
                const basePositionSize = totalValue * maxPositionSize;
                const targetPositionSize = basePositionSize * opportunity.confidence;
                
                // Check if we need to adjust position
                if (Math.abs(targetPositionSize - currentPositionSize) > totalValue * 0.01) { // 1% threshold
                    const tradeAmount = targetPositionSize - currentPositionSize;
                    
                    // Apply risk management
                    if (Math.abs(tradeAmount) > 0) {
                        // Check if trade would exceed max position size
                        const maxAllowedSize = totalValue * (userSettings.max_trade_amount / 100);
                        const adjustedAmount = Math.min(Math.abs(tradeAmount), maxAllowedSize);
                        
                        // Check if trade would exceed max token exposure
                        const newTokenExposure = (currentPositionSize + tradeAmount) / totalValue * 100;
                        if (newTokenExposure <= userSettings.max_token_exposure) {
                            trades.push({
                                tokenAddress: opportunity.tokenAddress,
                                amount: adjustedAmount,
                                side: opportunity.side,
                                confidence: opportunity.confidence,
                                priceDeviation: opportunity.priceDeviation,
                                volatility: opportunity.volatility,
                                profitTarget: opportunity.side === 'buy' ? 
                                    currentPrice * (1 + profitTarget) : 
                                    currentPrice * (1 - profitTarget),
                                stopLoss: opportunity.side === 'buy' ? 
                                    currentPrice * (1 - stopLoss) : 
                                    currentPrice * (1 + stopLoss)
                            });
                        }
                    }
                }
            }
            
            // Sort trades by confidence
            trades.sort((a, b) => b.confidence - a.confidence);
            
            // Execute trades with slippage protection
            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + (trade.side === 'buy' ? 0.01 : -0.01)); // 1% slippage tolerance
                    
                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage: 1,
                        expectedPrice,
                        profitTarget: trade.profitTarget,
                        stopLoss: trade.stopLoss
                    });
                    
                    // Add delay between trades
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing volatility trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }
            
            this.logger.info(`Volatility harvesting strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                opportunities,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in volatility harvesting: ${error.message}`);
            throw error;
        }
    }

    async executeCopyTradeStrategy(user, wallet, strategy) {
        try {
            const {
                targetWallets = [],
                minTradeSize = 0.1, // 0.1 SOL
                maxTradeSize = 10, // 10 SOL
                minSuccessRate = 0.7, // 70% success rate
                maxSlippage = 1, // 1% slippage
                delaySeconds = 2, // 2 seconds delay
                maxPositions = 5, // Maximum number of positions per wallet
                minLiquidity = 50000, // $50k minimum liquidity
                minHoldTime = 3600, // 1 hour minimum hold time
                maxDrawdown = 0.1, // 10% maximum drawdown
                minProfitFactor = 2 // Minimum profit factor
            } = strategy.params;

            // Get current portfolio value and holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);

            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);

            // Get recent trades from target wallets with enhanced filtering
            const recentTrades = await this.getRecentTradesFromWallets(targetWallets, {
                minTradeSize,
                maxTradeSize,
                minSuccessRate,
                minLiquidity,
                minHoldTime,
                maxDrawdown,
                minProfitFactor
            });

            // Analyze and filter trades
            const tradesToCopy = [];
            for (const trade of recentTrades) {
                // Skip if we already have a position
                if (currentHoldings.some(h => h.tokenAddress === trade.tokenAddress)) {
                    continue;
                }

                // Get detailed wallet metrics
                const walletMetrics = await this.getWalletMetrics(trade.walletAddress);
                if (!walletMetrics) continue;

                // Calculate position size based on wallet's performance metrics
                const basePositionSize = totalValue * this.calculatePositionSize(walletMetrics);

                // Apply risk management
                const maxAllowedSize = totalValue * (userSettings.max_trade_amount / 100);
                const adjustedAmount = Math.min(basePositionSize, maxAllowedSize);

                // Check if trade would exceed max token exposure
                const newTokenExposure = adjustedAmount / totalValue * 100;
                if (newTokenExposure <= userSettings.max_token_exposure) {
                    tradesToCopy.push({
                        tokenAddress: trade.tokenAddress,
                        amount: adjustedAmount,
                        side: trade.side,
                        walletAddress: trade.walletAddress,
                        successRate: walletMetrics.successRate,
                        profitFactor: walletMetrics.profitFactor,
                        avgHoldTime: walletMetrics.avgHoldTime,
                        maxDrawdown: walletMetrics.maxDrawdown,
                        tradeSize: trade.amount,
                        timestamp: trade.timestamp,
                        confidence: this.calculateTradeConfidence(walletMetrics, trade)
                    });
                }
            }

            // Sort trades by confidence score
            tradesToCopy.sort((a, b) => b.confidence - a.confidence);

            // Limit number of trades based on maxPositions
            const limitedTrades = tradesToCopy.slice(0, maxPositions);

            // Execute trades with slippage protection
            for (const trade of limitedTrades) {
                try {
                    // Add delay to prevent front-running
                    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + (trade.side === 'buy' ? maxSlippage : -maxSlippage) / 100);

                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage,
                        expectedPrice
                    });

                    // Add delay between trades
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing copy trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }

            this.logger.info(`Copy trading strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: limitedTrades.length,
                tradesToCopy,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in copy trading strategy: ${error.message}`);
            throw error;
        }
    }

    async getWalletMetrics(walletAddress) {
        try {
            const trades = await this.getWalletTrades(walletAddress, { limit: 100 });
            if (!trades || trades.length === 0) return null;

            const metrics = {
                successRate: 0,
                profitFactor: 0,
                avgHoldTime: 0,
                maxDrawdown: 0,
                totalTrades: trades.length,
                winningTrades: 0,
                losingTrades: 0,
                totalProfit: 0,
                totalLoss: 0
            };

            let currentDrawdown = 0;
            let peakValue = 0;
            let currentValue = 0;

            for (const trade of trades) {
                if (trade.profit > 0) {
                    metrics.winningTrades++;
                    metrics.totalProfit += trade.profit;
                } else {
                    metrics.losingTrades++;
                    metrics.totalLoss += Math.abs(trade.profit);
                }

                currentValue += trade.profit;
                if (currentValue > peakValue) {
                    peakValue = currentValue;
                }
                currentDrawdown = (peakValue - currentValue) / peakValue;
                metrics.maxDrawdown = Math.max(metrics.maxDrawdown, currentDrawdown);

                if (trade.holdTime) {
                    metrics.avgHoldTime += trade.holdTime;
                }
            }

            metrics.successRate = metrics.winningTrades / metrics.totalTrades;
            metrics.profitFactor = metrics.totalProfit / (metrics.totalLoss || 1);
            metrics.avgHoldTime = metrics.avgHoldTime / metrics.totalTrades;

            return metrics;
        } catch (error) {
            this.logger.error(`Error getting wallet metrics: ${error.message}`);
            return null;
        }
    }

    calculatePositionSize(walletMetrics) {
        // Base position size on success rate and profit factor
        const baseSize = 0.1; // 10% base position size
        const successRateMultiplier = walletMetrics.successRate;
        const profitFactorMultiplier = Math.min(walletMetrics.profitFactor / 2, 1);
        const drawdownMultiplier = 1 - walletMetrics.maxDrawdown;

        return baseSize * successRateMultiplier * profitFactorMultiplier * drawdownMultiplier;
    }

    calculateTradeConfidence(walletMetrics, trade) {
        // Calculate confidence score based on wallet metrics and trade characteristics
        const successRateScore = walletMetrics.successRate;
        const profitFactorScore = Math.min(walletMetrics.profitFactor / 2, 1);
        const drawdownScore = 1 - walletMetrics.maxDrawdown;
        const holdTimeScore = Math.min(walletMetrics.avgHoldTime / (24 * 3600), 1); // Normalize to 24 hours

        return (
            successRateScore * 0.4 +
            profitFactorScore * 0.3 +
            drawdownScore * 0.2 +
            holdTimeScore * 0.1
        ) * 100;
    }

    async executePortfolioRebalanceStrategy(user, wallet, strategy) {
        try {
            const { targetAllocations, rebalanceThreshold = 5, maxSlippage = 1 } = strategy.params;
            
            // Get current portfolio holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            
            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);
            
            // Calculate required trades with risk management
            const trades = [];
            for (const [tokenAddress, targetAllocation] of Object.entries(targetAllocations)) {
                const currentHolding = currentHoldings.find(h => h.tokenAddress === tokenAddress);
                const currentAllocation = currentHolding ? (currentHolding.value / totalValue) * 100 : 0;
                
                // Check if rebalancing is needed and within risk limits
                if (Math.abs(currentAllocation - targetAllocation) > rebalanceThreshold) {
                    const targetValue = (targetAllocation / 100) * totalValue;
                    const tradeAmount = targetValue - (currentHolding?.value || 0);
                    
                    // Apply risk management
                    if (Math.abs(tradeAmount) > 0) {
                        // Check if trade amount exceeds max position size
                        const maxPositionSize = totalValue * (userSettings.max_trade_amount / 100);
                        const adjustedAmount = Math.min(Math.abs(tradeAmount), maxPositionSize);
                        
                        // Check if trade would exceed max token exposure
                        const newTokenExposure = ((currentHolding?.value || 0) + tradeAmount) / totalValue * 100;
                        if (newTokenExposure <= userSettings.max_token_exposure) {
                            trades.push({
                                tokenAddress,
                                amount: adjustedAmount,
                                side: tradeAmount > 0 ? 'buy' : 'sell',
                                slippage: maxSlippage
                            });
                        }
                    }
                }
            }
            
            // Sort trades by priority (largest deviation first)
            trades.sort((a, b) => {
                const aDeviation = Math.abs(targetAllocations[a.tokenAddress] - 
                    (currentHoldings.find(h => h.tokenAddress === a.tokenAddress)?.value || 0) / totalValue * 100);
                const bDeviation = Math.abs(targetAllocations[b.tokenAddress] - 
                    (currentHoldings.find(h => h.tokenAddress === b.tokenAddress)?.value || 0) / totalValue * 100);
                return bDeviation - aDeviation;
            });
            
            // Execute rebalancing trades with slippage protection
            for (const trade of trades) {
                try {
                    // Get current price and calculate expected price
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * (1 + (trade.side === 'buy' ? trade.slippage : -trade.slippage) / 100);
                    
                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage: trade.slippage,
                        expectedPrice
                    });
                    
                    // Add delay between trades to prevent market impact
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing rebalance trade for ${trade.tokenAddress}: ${error.message}`);
                    // Continue with next trade even if one fails
                }
            }
            
            this.logger.info(`Portfolio rebalancing executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in portfolio rebalancing: ${error.message}`);
            throw error;
        }
    }

    async executeNarrativeRotationStrategy(user, wallet, strategy) {
        try {
            const { categories, maxAllocation = 20, minTrendScore = 0.7 } = strategy.params;
            
            // Get current portfolio value and holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            
            // Get user settings for risk management
            const userSettings = await this.db.getUserSettings(user.id);
            
            // Analyze trending narratives
            const trendingNarratives = await this.analyzeTrendingNarratives(categories);
            
            // Calculate new target allocations based on trend scores
            const targetAllocations = {};
            let totalTrendScore = 0;
            
            for (const [category, trendData] of Object.entries(trendingNarratives)) {
                if (trendData.score >= minTrendScore) {
                    totalTrendScore += trendData.score;
                    targetAllocations[category] = trendData.score;
                }
            }
            
            // Normalize allocations
            for (const category in targetAllocations) {
                targetAllocations[category] = (targetAllocations[category] / totalTrendScore) * maxAllocation;
            }
            
            // Get current category allocations
            const currentAllocations = {};
            for (const holding of currentHoldings) {
                const tokenData = await this.getTokenInfo(holding.tokenAddress);
                if (tokenData && tokenData.category) {
                    currentAllocations[tokenData.category] = (currentAllocations[tokenData.category] || 0) + 
                        (holding.value / totalValue) * 100;
                }
            }
            
            // Calculate required trades
            const trades = [];
            for (const [category, targetAllocation] of Object.entries(targetAllocations)) {
                const currentAllocation = currentAllocations[category] || 0;
                
                if (Math.abs(currentAllocation - targetAllocation) > 5) { // 5% threshold
                    // Find tokens in this category to buy
                    const tokensToBuy = await this.findTokensByCategory(category, {
                        minLiquidity: totalValue * 0.1, // 10% of portfolio
                        minMarketCap: totalValue * 0.05, // 5% of portfolio
                        maxSlippage: 1
                    });
                    
                    // Calculate amount to allocate
                    const targetValue = (targetAllocation / 100) * totalValue;
                    const currentValue = (currentAllocation / 100) * totalValue;
                    const valueToAllocate = targetValue - currentValue;
                    
                    if (valueToAllocate > 0) {
                        // Distribute allocation among top tokens
                        const allocationPerToken = valueToAllocate / Math.min(tokensToBuy.length, 3);
                        
                        for (const token of tokensToBuy.slice(0, 3)) {
                            // Check risk limits
                            const maxPositionSize = totalValue * (userSettings.max_trade_amount / 100);
                            const adjustedAmount = Math.min(allocationPerToken, maxPositionSize);
                            
                            trades.push({
                                tokenAddress: token.address,
                                amount: adjustedAmount,
                                side: 'buy',
                                category,
                                trendScore: trendingNarratives[category].score
                            });
                        }
                    }
                }
            }
            
            // Sort trades by trend score
            trades.sort((a, b) => b.trendScore - a.trendScore);
            
            // Execute trades with slippage protection
            for (const trade of trades) {
                try {
                    const currentPrice = await this.getTokenPrice(trade.tokenAddress);
                    const expectedPrice = currentPrice * 1.01; // 1% slippage tolerance
                    
                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: trade.tokenAddress,
                        amount: trade.amount,
                        side: trade.side,
                        type: 'market',
                        maxSlippage: 1,
                        expectedPrice
                    });
                    
                    // Add delay between trades
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    this.logger.error(`Error executing narrative rotation trade for ${trade.tokenAddress}: ${error.message}`);
                }
            }
            
            this.logger.info(`Narrative rotation strategy executed for user ${user.id}`);
            return {
                success: true,
                tradesExecuted: trades.length,
                narratives: trendingNarratives,
                totalValue
            };
        } catch (error) {
            this.logger.error(`Error in narrative rotation: ${error.message}`);
            throw error;
        }
    }

    async executeEventTriggerStrategy(user, wallet, strategy) {
        try {
            const { eventType, tokenAddress, action } = strategy.params;
            
            // Monitor for specific events
            switch (eventType) {
                case 'token_listing':
                    await this.handleTokenListing(user, wallet, tokenAddress, action);
                    break;
                case 'airdrop':
                    await this.handleAirdrop(user, wallet, tokenAddress, action);
                    break;
                case 'ecosystem_signal':
                    await this.handleEcosystemSignal(user, wallet, tokenAddress, action);
                    break;
                default:
                    throw new Error('Invalid event type');
            }
            
            this.logger.info(`Event trigger strategy executed for user ${user.id}`);
        } catch (error) {
            this.logger.error(`Error in event trigger strategy: ${error.message}`);
            throw error;
        }
    }

    async executeRiskManagementStrategy(user, wallet, strategy) {
        try {
            const { maxTokenExposure, maxPortfolioExposure } = strategy.params;
            
            // Get current portfolio holdings
            const currentHoldings = await this.db.getPortfolioHoldings(wallet.id);
            const totalValue = currentHoldings.reduce((sum, holding) => sum + holding.value, 0);
            
            // Check and adjust token exposures
            for (const holding of currentHoldings) {
                const tokenExposure = (holding.value / totalValue) * 100;
                
                if (tokenExposure > maxTokenExposure) {
                    const excessValue = holding.value - (maxTokenExposure / 100) * totalValue;
                    
                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: holding.tokenAddress,
                        amount: excessValue,
                        side: 'sell',
                        type: 'market'
                    });
                }
            }
            
            // Check total portfolio exposure
            if (totalValue > maxPortfolioExposure) {
                const excessValue = totalValue - maxPortfolioExposure;
                const reductionPercentage = excessValue / totalValue;
                
                for (const holding of currentHoldings) {
                    const sellAmount = holding.value * reductionPercentage;
                    
                    await this.tradingExecution.executeTrade({
                        user,
                        wallet,
                        tokenAddress: holding.tokenAddress,
                        amount: sellAmount,
                        side: 'sell',
                        type: 'market'
                    });
                }
            }
            
            this.logger.info(`Risk management strategy executed for user ${user.id}`);
        } catch (error) {
            this.logger.error(`Error in risk management strategy: ${error.message}`);
            throw error;
        }
    }

    // Helper methods
    async getRecentTrades(tokenAddress) {
        // TODO: Implement recent trades fetching logic
        return [];
    }

    calculateVolumeChange(trades, timeWindow) {
        // TODO: Implement volume change calculation
        return 0;
    }

    async getPriceHistory(tokenAddress, lookbackPeriod) {
        // TODO: Implement price history fetching logic
        return [];
    }

    calculatePriceChange(priceHistory) {
        // TODO: Implement price change calculation
        return 0;
    }

    async getTrendingTokens(categories) {
        // TODO: Implement trending tokens fetching logic
        return [];
    }

    async getTopPerformingTokens(lookbackPeriod, filters) {
        // Implement top performing tokens retrieval with filters
        return [];
    }

    async calculateVolatility(priceHistory) {
        if (priceHistory.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < priceHistory.length; i++) {
            returns.push((priceHistory[i] - priceHistory[i-1]) / priceHistory[i-1]);
        }
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance) * 100; // Convert to percentage
    }

    calculateMeanPrice(priceHistory) {
        return priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
    }

    calculateMeanVolume(volumeHistory) {
        return volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length;
    }

    calculateConfidence(priceDeviation, volatility, volumeRatio) {
        // Normalize inputs
        const normalizedDeviation = Math.min(Math.abs(priceDeviation) / 0.5, 1); // Cap at 50% deviation
        const normalizedVolatility = Math.min(volatility / 100, 1); // Cap at 100% volatility
        const normalizedVolume = Math.min(volumeRatio / 3, 1); // Cap at 3x volume
        
        // Calculate confidence score (weighted average)
        return (
            normalizedDeviation * 0.4 +
            (1 - normalizedVolatility) * 0.3 + // Lower volatility is better
            normalizedVolume * 0.3
        );
    }

    async getRecentTradesFromWallets(wallets, filters) {
        const trades = [];
        
        for (const walletAddress of wallets) {
            try {
                // Get recent trades from wallet
                const walletTrades = await this.getWalletTrades(walletAddress, {
                    limit: 50, // Get last 50 trades
                    minTimestamp: Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
                });
                
                // Filter trades based on criteria
                const filteredTrades = walletTrades.filter(trade => {
                    // Check trade size
                    if (trade.amount < filters.minTradeSize || trade.amount > filters.maxTradeSize) {
                        return false;
                    }
                    
                    // Check liquidity
                    if (trade.liquidity < filters.minLiquidity) {
                        return false;
                    }
                    
                    return true;
                });
                
                trades.push(...filteredTrades);
            } catch (error) {
                this.logger.error(`Error getting trades for wallet ${walletAddress}: ${error.message}`);
            }
        }
        
        return trades;
    }

    async getWalletSuccessRate(walletAddress) {
        try {
            // Get wallet's trade history
            const trades = await this.getWalletTrades(walletAddress, {
                limit: 100, // Last 100 trades
                minTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 // Last 7 days
            });
            
            if (trades.length === 0) return 0;
            
            // Calculate success rate based on profitable trades
            const profitableTrades = trades.filter(trade => trade.profit > 0);
            return (profitableTrades.length / trades.length) * 100;
        } catch (error) {
            this.logger.error(`Error calculating success rate for wallet ${walletAddress}: ${error.message}`);
            return 0;
        }
    }

    async getWalletTrades(walletAddress, options) {
        // Implement wallet trades retrieval
        return [];
    }

    async handleTokenListing(user, wallet, tokenAddress, action) {
        try {
            const listingInfo = await this.getTokenListingInfo(tokenAddress);
            
            if (listingInfo && action === 'buy') {
                await this.tradingExecution.executeTrade({
                    user,
                    wallet,
                    tokenAddress,
                    amount: action.params.amount,
                    side: 'buy',
                    type: 'market'
                });
            }
        } catch (error) {
            this.logger.error(`Error handling token listing: ${error.message}`);
            throw error;
        }
    }

    async handleAirdrop(user, wallet, tokenAddress, action) {
        try {
            const airdropInfo = await this.getAirdropInfo(tokenAddress);
            
            if (airdropInfo && action === 'buy') {
                await this.tradingExecution.executeTrade({
                    user,
                    wallet,
                    tokenAddress,
                    amount: action.params.amount,
                    side: 'buy',
                    type: 'market'
                });
            }
        } catch (error) {
            this.logger.error(`Error handling airdrop: ${error.message}`);
            throw error;
        }
    }

    async handleEcosystemSignal(user, wallet, tokenAddress, action) {
        try {
            const signalInfo = await this.getEcosystemSignalInfo(tokenAddress);
            
            if (signalInfo && signalInfo.strength >= action.params.minSignalStrength) {
                await this.tradingExecution.executeTrade({
                    user,
                    wallet,
                    tokenAddress,
                    amount: action.params.amount,
                    side: action.params.side,
                    type: 'market'
                });
            }
        } catch (error) {
            this.logger.error(`Error handling ecosystem signal: ${error.message}`);
            throw error;
        }
    }

    async getTokenListingInfo(tokenAddress) {
        // Implement token listing info retrieval
        return null;
    }

    async getAirdropInfo(tokenAddress) {
        // Implement airdrop info retrieval
        return null;
    }

    async getEcosystemSignalInfo(tokenAddress) {
        // Implement ecosystem signal info retrieval
        return null;
    }

    async analyzeTrendingNarratives(categories) {
        const narratives = {};
        
        for (const category of categories) {
            // Get social media sentiment
            const sentiment = await this.getSocialMediaSentiment(category);
            
            // Get trading volume trend
            const volumeTrend = await this.getVolumeTrend(category);
            
            // Get price momentum
            const momentum = await this.getPriceMomentum(category);
            
            // Get developer activity
            const devActivity = await this.getDeveloperActivity(category);
            
            // Calculate trend score (weighted average)
            const trendScore = (
                sentiment.score * 0.3 +
                volumeTrend.score * 0.3 +
                momentum.score * 0.2 +
                devActivity.score * 0.2
            );
            
            narratives[category] = {
                score: trendScore,
                sentiment: sentiment.score,
                volumeTrend: volumeTrend.score,
                momentum: momentum.score,
                devActivity: devActivity.score,
                topTokens: await this.getTopTokensByCategory(category)
            };
        }
        
        return narratives;
    }

    async findTokensByCategory(category, filters) {
        // Implement token discovery logic based on category and filters
        // This would involve querying token data sources and applying filters
        return [];
    }

    async getSocialMediaSentiment(category) {
        // Implement social media sentiment analysis
        return { score: 0.5 };
    }

    async getVolumeTrend(category) {
        // Implement volume trend analysis
        return { score: 0.5 };
    }

    async getPriceMomentum(category) {
        // Implement price momentum analysis
        return { score: 0.5 };
    }

    async getDeveloperActivity(category) {
        // Implement developer activity analysis
        return { score: 0.5 };
    }

    async getTopTokensByCategory(category) {
        // Implement top tokens by category retrieval
        return [];
    }

    async calculateMomentumScores(tokens, lookbackPeriod) {
        const scores = {};
        
        for (const token of tokens) {
            // Get price history
            const priceHistory = await this.getPriceHistory(token.address, lookbackPeriod);
            
            // Get volume history
            const volumeHistory = await this.getVolumeHistory(token.address, lookbackPeriod);
            
            // Calculate price momentum
            const priceChange = this.calculatePriceChange(priceHistory);
            
            // Calculate volume momentum
            const volumeChange = this.calculateVolumeChange(volumeHistory);
            
            // Calculate RSI
            const rsi = this.calculateRSI(priceHistory);
            
            // Calculate MACD
            const macd = this.calculateMACD(priceHistory);
            
            // Calculate momentum score (weighted average)
            const momentumScore = (
                priceChange * 0.4 +
                volumeChange * 0.3 +
                (rsi > 50 ? 1 : 0) * 0.15 +
                (macd > 0 ? 1 : 0) * 0.15
            );
            
            scores[token.address] = {
                score: momentumScore,
                priceChange,
                volumeChange,
                rsi,
                macd
            };
        }
        
        return scores;
    }

    async getVolumeHistory(tokenAddress, lookbackPeriod) {
        // Implement volume history retrieval
        return [];
    }

    calculateRSI(priceHistory, period = 14) {
        if (priceHistory.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i < period + 1; i++) {
            const change = priceHistory[i] - priceHistory[i - 1];
            if (change >= 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    calculateMACD(priceHistory) {
        if (priceHistory.length < 26) return 0;
        
        const ema12 = this.calculateEMA(priceHistory, 12);
        const ema26 = this.calculateEMA(priceHistory, 26);
        
        return ema12 - ema26;
    }

    calculateEMA(priceHistory, period) {
        const multiplier = 2 / (period + 1);
        let ema = priceHistory[0];
        
        for (let i = 1; i < priceHistory.length; i++) {
            ema = (priceHistory[i] - ema) * multiplier + ema;
        }
        
        return ema;
    }

    async getVolatileTokens(filters) {
        // Implement volatile tokens retrieval with filters
        return [];
    }

    async findVolumeSpikes(params) {
        const { minVolumeIncrease, timeWindow, minLiquidity } = params;
        const spikes = [];

        try {
            // Get recent trades for all tokens
            const recentTrades = await this.getRecentTrades(null, timeWindow);

            // Group trades by token
            const tokenTrades = {};
            for (const trade of recentTrades) {
                if (!tokenTrades[trade.tokenAddress]) {
                    tokenTrades[trade.tokenAddress] = [];
                }
                tokenTrades[trade.tokenAddress].push(trade);
            }

            // Analyze each token's volume
            for (const [tokenAddress, trades] of Object.entries(tokenTrades)) {
                // Calculate volume change
                const volumeChange = this.calculateVolumeChange(trades, timeWindow);
                
                // Check if volume spike meets criteria
                if (volumeChange >= minVolumeIncrease) {
                    // Get token liquidity
                    const liquidity = await this.getTokenLiquidity(tokenAddress);
                    
                    if (liquidity >= minLiquidity) {
                        // Calculate confidence score
                        const confidence = this.calculateConfidence(
                            volumeChange,
                            liquidity,
                            trades.length
                        );

                        spikes.push({
                            tokenAddress,
                            volumeChange,
                            liquidity,
                            confidence,
                            trades: trades.length
                        });
                    }
                }
            }

            return spikes;
        } catch (error) {
            this.logger.error(`Error finding volume spikes: ${error.message}`);
            return [];
        }
    }

    async findPriceDips(params) {
        const { minPriceDrop, timeWindow, minLiquidity } = params;
        const dips = [];

        try {
            // Get recent trades for all tokens
            const recentTrades = await this.getRecentTrades(null, timeWindow);

            // Group trades by token
            const tokenTrades = {};
            for (const trade of recentTrades) {
                if (!tokenTrades[trade.tokenAddress]) {
                    tokenTrades[trade.tokenAddress] = [];
                }
                tokenTrades[trade.tokenAddress].push(trade);
            }

            // Analyze each token's price
            for (const [tokenAddress, trades] of Object.entries(tokenTrades)) {
                // Calculate price change
                const priceChange = this.calculatePriceChange(trades);
                
                // Check if price drop meets criteria
                if (priceChange <= -minPriceDrop) {
                    // Get token liquidity
                    const liquidity = await this.getTokenLiquidity(tokenAddress);
                    
                    if (liquidity >= minLiquidity) {
                        // Calculate confidence score
                        const confidence = this.calculateConfidence(
                            Math.abs(priceChange),
                            liquidity,
                            trades.length
                        );

                        dips.push({
                            tokenAddress,
                            priceChange,
                            liquidity,
                            confidence,
                            trades: trades.length
                        });
                    }
                }
            }

            return dips;
        } catch (error) {
            this.logger.error(`Error finding price dips: ${error.message}`);
            return [];
        }
    }

    async getTokenLiquidity(tokenAddress) {
        try {
            // Implement token liquidity fetching
            return 0;
        } catch (error) {
            this.logger.error(`Error getting token liquidity: ${error.message}`);
            return 0;
        }
    }

    calculateConfidence(change, liquidity, tradeCount) {
        // Normalize factors
        const changeScore = Math.min(change / 100, 1);
        const liquidityScore = Math.min(liquidity / 1000000, 1); // $1M max
        const tradeCountScore = Math.min(tradeCount / 100, 1);

        // Weighted average
        return (changeScore * 0.4 + liquidityScore * 0.4 + tradeCountScore * 0.2) * 100;
    }
}

module.exports = StrategyEngine; 