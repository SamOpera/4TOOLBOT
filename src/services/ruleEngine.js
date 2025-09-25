const TokenDataService = require('./tokenDataService');
const TradingExecution = require('../modules/tradingExecution');

class RuleEngine {
    constructor(db, config) {
        this.db = db;
        this.tokenDataService = new TokenDataService(config);
        this.tradingExecution = new TradingExecution(config);
        this.isAutonomousMode = false;
    }

    async evaluateRule(ruleId, tokenAddress) {
        try {
            // Get rule and its criteria
            const rule = await this.getRule(ruleId);
            const criteria = await this.getRuleCriteria(ruleId);
            const metrics = await this.getRuleMetrics(ruleId);

            // Get token data
            const tokenData = await this.tokenDataService.getTokenMetrics(tokenAddress);

            // Evaluate criteria
            const criteriaMatch = await this.evaluateCriteria(criteria, tokenData);
            if (!criteriaMatch) {
                return { match: false };
            }

            // Evaluate metrics
            const metricsMatch = await this.evaluateMetrics(metrics, tokenData);
            if (!metricsMatch) {
                return { match: false };
            }

            // Record rule trigger only if we have valid data
            if (tokenAddress && tokenData) {
                await this.recordRuleTrigger(ruleId, tokenAddress, tokenData);
            } else {
                console.warn(`Skipping rule history record for rule ${ruleId}: missing tokenAddress or tokenData`);
            }

            return {
                match: true,
                tokenData,
                rule
            };
        } catch (error) {
            console.error('Error evaluating rule:', error);
            throw error;
        }
    }

    /**
     * Execute auto-sell based on rule evaluation
     */
    async executeAutoSell(ruleId, tokenAddress, userId, sellAmount = null) {
        try {
            // Get rule details
            const rule = await this.getRule(ruleId);
            if (!rule) {
                throw new Error(`Rule ${ruleId} not found`);
            }

            // Get user's wallet
            const activeWallet = await this.db.getActiveWallet(userId);
            if (!activeWallet || !activeWallet.encrypted_private_key) {
                throw new Error('No active wallet found for user');
            }

            // Get user's telegram ID for decryption
            const user = await this.db.getUserByTelegramId(userId.toString());
            if (!user || !user.telegram_id) {
                throw new Error('User telegram ID not found');
            }

            // Decrypt private key
            const BuyManager = require('../modules/buyManager');
            const buyManager = new BuyManager(this.config, this.tradingExecution, this.db, null);
            const decryptedKey = buyManager.decryptPrivateKey(activeWallet.encrypted_private_key, user.telegram_id.toString());
            const secretKey = Buffer.from(decryptedKey, 'base64');
            
            if (secretKey.length !== 64) {
                throw new Error('Invalid private key length');
            }

            const { Keypair } = require('@solana/web3.js');
            const keypair = Keypair.fromSecretKey(secretKey);
            this.tradingExecution.setUserWallet(keypair);

            // If no specific sell amount, sell entire position
            if (!sellAmount) {
                // Get token balance
                const tokenBalance = await this.tradingExecution.getTokenBalance(tokenAddress);
                if (tokenBalance <= 0) {
                    throw new Error('No tokens to sell');
                }
                sellAmount = tokenBalance;
            }

            // Execute sell
            const sellResult = await this.tradingExecution.executeSell(userId, tokenAddress, sellAmount);
            
            if (sellResult.success) {
                // Record successful sell
                await this.recordAutoSellSuccess(ruleId, tokenAddress, userId, sellAmount, sellResult.signature);
                
                // Update rule stats
                await this.updateRuleStats(ruleId, true);
                
                return {
                    success: true,
                    signature: sellResult.signature,
                    amount: sellAmount,
                    message: `Auto-sell executed successfully for ${tokenAddress}`
                };
            } else {
                // Record failed sell
                await this.recordAutoSellFailure(ruleId, tokenAddress, userId, sellAmount, sellResult.error);
                
                // Update rule stats
                await this.updateRuleStats(ruleId, false);
                
                throw new Error(`Sell execution failed: ${sellResult.error}`);
            }
        } catch (error) {
            console.error('Error executing auto-sell:', error);
            throw error;
        }
    }

    /**
     * Record successful auto-sell
     */
    async recordAutoSellSuccess(ruleId, tokenAddress, userId, amount, signature) {
        const stmt = this.db.db.prepare(`
            INSERT INTO auto_sell_history (
                rule_id, user_id, token_address, amount, signature, 
                status, executed_at
            ) VALUES (?, ?, ?, ?, ?, 'success', CURRENT_TIMESTAMP)
        `);
        
        return stmt.run([ruleId, userId, tokenAddress, amount, signature]);
    }

    /**
     * Record failed auto-sell
     */
    async recordAutoSellFailure(ruleId, tokenAddress, userId, amount, error) {
        const stmt = this.db.db.prepare(`
            INSERT INTO auto_sell_history (
                rule_id, user_id, token_address, amount, error_message, 
                status, executed_at
            ) VALUES (?, ?, ?, ?, ?, 'failed', CURRENT_TIMESTAMP)
        `);
        
        return stmt.run([ruleId, userId, tokenAddress, amount, error]);
    }

    async getRule(ruleId) {
        const stmt = this.db.db.prepare('SELECT * FROM rules WHERE id = ?');
        return stmt.get(ruleId);
    }

    async getRuleCriteria(ruleId) {
        // Use the same rule_conditions table as the rest of the application
        const stmt = this.db.db.prepare('SELECT * FROM rule_conditions WHERE rule_id = ?');
        return stmt.all(ruleId);
    }

    async getRuleMetrics(ruleId) {
        const stmt = this.db.db.prepare('SELECT * FROM rule_metrics WHERE rule_id = ?');
        return stmt.all(ruleId);
    }

    async evaluateCriteria(criteria, tokenData) {
        for (const criterion of criteria) {
            try {
                let value;
                // For category and timeframe conditions, the value is a string, not JSON
                if (criterion.condition_type === 'category' || criterion.condition_type === 'discovery_category' || 
                    criterion.condition_type === 'timeframe' || criterion.condition_type === 'discovery_timeframe') {
                    value = criterion.condition_value;
                } else {
                    value = JSON.parse(criterion.condition_value);
                }
                const operator = criterion.operator || 'equals';

                switch (criterion.condition_type) {
                    case 'category':
                    case 'discovery_category':
                        if (!this.evaluateCategory(value, tokenData.category)) {
                            return false;
                        }
                        break;
                    case 'market_cap':
                    case 'discovery_market_cap':
                        if (!this.evaluateNumericRange(operator, tokenData.marketCap, value)) {
                            return false;
                        }
                        break;
                    case 'price':
                    case 'discovery_price':
                        if (!this.evaluateNumericRange(operator, tokenData.price, value)) {
                            return false;
                        }
                        break;
                    case 'liquidity':
                    case 'discovery_liquidity':
                        if (!this.evaluateNumericRange(operator, tokenData.liquidity, value)) {
                            return false;
                        }
                        break;
                    case 'volume':
                    case 'discovery_volume':
                        if (!this.evaluateNumericRange(operator, tokenData.volume, value)) {
                            return false;
                        }
                        break;
                    case 'timeframe':
                    case 'discovery_timeframe':
                        // Timeframe is typically used for change calculations
                        // Since we're evaluating static token data, we'll skip timeframe conditions
                        // They should be handled in the change evaluation phase
                        break;
                    case 'num_buys':
                        if (!this.evaluateNumericRange(operator, tokenData.numBuys || tokenData.num_buys, value)) {
                            return false;
                        }
                        break;
                    case 'num_sells':
                        if (!this.evaluateNumericRange(operator, tokenData.numSells || tokenData.num_sells, value)) {
                            return false;
                        }
                        break;
                }
            } catch (error) {
                console.error('Error evaluating criterion:', criterion, error);
                return false;
            }
        }
        return true;
    }

    async evaluateMetrics(metrics, tokenData) {
        for (const metric of metrics) {
            switch (metric.metric_type) {
                case 'volume_change':
                    if (!this.evaluateChange(metric.direction, tokenData.volumeChange, metric.threshold)) {
                        return false;
                    }
                    break;
                case 'price_change':
                    if (!this.evaluateChange(metric.direction, tokenData.priceChange, metric.threshold)) {
                        return false;
                    }
                    break;
            }
        }
        return true;
    }

    evaluateCategory(expectedCategory, actualCategory) {
        return expectedCategory.toLowerCase() === actualCategory.toLowerCase();
    }

    evaluateNumeric(operator, actual, expected, secondaryValue) {
        switch (operator) {
            case '>':
                return actual > expected;
            case '<':
                return actual < expected;
            case '=':
                return actual === expected;
            case '>=':
                return actual >= expected;
            case '<=':
                return actual <= expected;
            case 'between':
                return actual >= expected && actual <= secondaryValue;
            default:
                return false;
        }
    }

    evaluateNumericRange(operator, actual, value) {
        // Handle both single values and range objects
        if (typeof value === 'object' && value !== null) {
            // Range object with min/max
            if (value.min !== undefined && value.min !== null && actual < Number(value.min)) {
                return false;
            }
            if (value.max !== undefined && value.max !== null && actual > Number(value.max)) {
                return false;
            }
            return true;
        } else {
            // Single value with operator
            return this.evaluateNumeric(operator, actual, Number(value));
        }
    }

    evaluateChange(direction, actual, threshold) {
        const thresholdValue = Math.abs(threshold);
        const actualValue = Math.abs(actual);

        if (direction === 'increase') {
            return actual > 0 && actualValue >= thresholdValue;
        } else if (direction === 'decrease') {
            return actual < 0 && actualValue >= thresholdValue;
        }
        return false;
    }

    async recordRuleTrigger(ruleId, tokenAddress, tokenData) {
        // Validate required parameters
        if (!ruleId) {
            throw new Error('Rule ID is required');
        }
        
        if (!tokenAddress) {
            console.warn('Token address is missing, skipping rule history record');
            return null;
        }
        
        if (!tokenData) {
            console.warn('Token data is missing, skipping rule history record');
            return null;
        }

        const stmt = this.db.db.prepare(`
            INSERT INTO rule_history (
                rule_id, token_address, token_name,
                trigger_price, trigger_volume, trigger_market_cap,
                trigger_liquidity, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        return stmt.run([
            ruleId,
            tokenAddress,
            tokenData.name || 'Unknown',
            tokenData.price || 0,
            tokenData.volume || 0,
            tokenData.marketCap || 0,
            tokenData.liquidity || 0,
            'triggered'
        ]);
    }

    async updateRuleStats(ruleId, success) {
        const stmt = this.db.db.prepare(`
            UPDATE rules 
            SET success_count = success_count + ?,
                failure_count = failure_count + ?,
                last_check_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        return stmt.run([
            success ? 1 : 0,
            success ? 0 : 1,
            ruleId
        ]);
    }
}

module.exports = RuleEngine; 