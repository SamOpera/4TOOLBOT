const { Connection, PublicKey } = require('@solana/web3.js');
const winston = require('winston');
const DatabaseManager = require('../modules/database');
const TokenDataService = require('./tokenDataService');

class TradingService {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.rpcEndpoint);
        this.db = new DatabaseManager();
        this.tokenDataService = new TokenDataService(config);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
    }

    async trackToken(userId, tokenAddress, settings) {
        try {
            const tokenData = await this.tokenDataService.getTokenData(tokenAddress);
            if (!tokenData) {
                throw new Error('Token data not found');
            }

            const currentPrice = tokenData.price;
            const tpPrice = settings.tp_percentage ? 
                currentPrice * (1 + settings.tp_percentage / 100) : 
                settings.tp_price;
            const slPrice = settings.sl_percentage ? 
                currentPrice * (1 - settings.sl_percentage / 100) : 
                settings.sl_price;

            await this.db.createTokenTracking({
                user_id: userId,
                token_address: tokenAddress,
                buy_price: currentPrice,
                tp_price: tpPrice,
                sl_price: slPrice,
                trailing_sl: settings.trailing_sl || false,
                trailing_sl_threshold: settings.trailing_sl_threshold,
                active: true
            });

            return {
                success: true,
                message: 'Token tracking started successfully',
                data: {
                    token_address: tokenAddress,
                    current_price: currentPrice,
                    tp_price: tpPrice,
                    sl_price: slPrice
                }
            };
        } catch (error) {
            this.logger.error(`Error tracking token: ${error.message}`);
            throw error;
        }
    }

    async checkTokenConditions(userId, tokenAddress) {
        try {
            const trackedToken = await this.db.getTrackedToken(userId, tokenAddress);
            if (!trackedToken || !trackedToken.active) {
                return null;
            }

            const tokenData = await this.tokenDataService.getTokenData(tokenAddress);
            const currentPrice = tokenData.price;
            let shouldExecute = false;
            let action = null;
            let reason = null;

            // Check take profit
            if (currentPrice >= trackedToken.tp_price) {
                shouldExecute = true;
                action = 'SELL';
                reason = 'Take profit reached';
            }
            // Check stop loss
            else if (currentPrice <= trackedToken.sl_price) {
                shouldExecute = true;
                action = 'SELL';
                reason = 'Stop loss triggered';
            }
            // Check trailing stop loss
            else if (trackedToken.trailing_sl) {
                const highestPrice = await this.db.getHighestPrice(tokenAddress);
                const trailingStopPrice = highestPrice * (1 - trackedToken.trailing_sl_threshold / 100);
                
                if (currentPrice <= trailingStopPrice) {
                    shouldExecute = true;
                    action = 'SELL';
                    reason = 'Trailing stop loss triggered';
                }
            }

            if (shouldExecute) {
                await this.executeTrade(userId, tokenAddress, action, currentPrice);
                await this.db.updateTokenTrackingStatus(userId, tokenAddress, false);
            }

            return {
                shouldExecute,
                action,
                reason,
                currentPrice,
                tpPrice: trackedToken.tp_price,
                slPrice: trackedToken.sl_price
            };
        } catch (error) {
            this.logger.error(`Error checking token conditions: ${error.message}`);
            throw error;
        }
    }

    async executeTrade(userId, tokenAddress, action, price) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            const positionSize = this.calculatePositionSize(userSettings, price);
            
            // Record trade in history
            await this.db.createTradeHistory({
                user_id: userId,
                token_address: tokenAddress,
                trade_type: action,
                amount: positionSize,
                price: price,
                total_value: positionSize * price,
                fee_amount: this.calculateFee(positionSize * price),
                status: 'EXECUTED'
            });

            // TODO: Implement actual trade execution logic here
            // This would involve interacting with DEX contracts

            return {
                success: true,
                message: `Trade executed successfully: ${action} ${positionSize} tokens at ${price}`,
                data: {
                    action,
                    amount: positionSize,
                    price,
                    total_value: positionSize * price
                }
            };
        } catch (error) {
            this.logger.error(`Error executing trade: ${error.message}`);
            throw error;
        }
    }

    calculatePositionSize(userSettings, price) {
        const maxTradeAmount = userSettings.max_trade_amount || 10; // Default 10 SOL
        const minTradeAmount = userSettings.min_trade_amount || 0.1; // Default 0.1 SOL
        
        // Calculate position size based on user's risk settings
        let positionSize = maxTradeAmount / price;
        
        // Ensure position size is within limits
        if (positionSize * price < minTradeAmount) {
            positionSize = minTradeAmount / price;
        }
        
        return positionSize;
    }

    calculateFee(tradeValue) {
        // Get fee configuration from database
        const feeConfig = this.db.getFeeConfiguration();
        return tradeValue * (feeConfig.fee_percentage / 100);
    }

    async updateTrailingStop(userId, tokenAddress, currentPrice) {
        try {
            const trackedToken = await this.db.getTrackedToken(userId, tokenAddress);
            if (!trackedToken || !trackedToken.trailing_sl) {
                return;
            }

            const highestPrice = await this.db.getHighestPrice(tokenAddress);
            if (currentPrice > highestPrice) {
                await this.db.updateHighestPrice(tokenAddress, currentPrice);
                
                // Update trailing stop price
                const newTrailingStopPrice = currentPrice * (1 - trackedToken.trailing_sl_threshold / 100);
                await this.db.updateTokenTracking({
                    user_id: userId,
                    token_address: tokenAddress,
                    sl_price: newTrailingStopPrice
                });
            }
        } catch (error) {
            this.logger.error(`Error updating trailing stop: ${error.message}`);
            throw error;
        }
    }
}

module.exports = TradingService; 