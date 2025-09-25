const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const winston = require('winston');

class RulesManager {
    constructor() {
        this.ruleTypes = {
            volume: {
                validate: (rule) => this.validateThresholdRule(rule, 'volume'),
                evaluate: (token, rule) => this.evaluateThresholdRule(token, rule, 'volume')
            },
            price: {
                validate: (rule) => this.validateThresholdRule(rule, 'price'),
                evaluate: (token, rule) => this.evaluateThresholdRule(token, rule, 'price')
            },
            marketCap: {
                validate: (rule) => this.validateRangeRule(rule, 'marketCap'),
                evaluate: (token, rule) => this.evaluateRangeRule(token, rule, 'marketCap')
            },
            liquidity: {
                validate: (rule) => this.validateRangeRule(rule, 'liquidity'),
                evaluate: (token, rule) => this.evaluateRangeRule(token, rule, 'liquidity')
            },
            holders: {
                validate: (rule) => this.validateRangeRule(rule, 'holders'),
                evaluate: (token, rule) => this.evaluateRangeRule(token, rule, 'holders')
            }
        };
    }

    validateThresholdRule(rule, type) {
        if (!rule.threshold || typeof rule.threshold !== 'number') {
            throw new Error(`${type} rule must have a numeric threshold`);
        }
        if (!rule.change || !['increase', 'decrease'].includes(rule.change)) {
            throw new Error(`${type} rule must specify 'increase' or 'decrease'`);
        }
        if (rule.timeframe && !['1h', '4h', '12h', '24h', '1d', '7d', '1w'].includes(rule.timeframe)) {
            throw new Error(`Invalid timeframe for ${type} rule`);
        }
        return true;
    }

    validateRangeRule(rule, type) {
        if (rule.min !== undefined && typeof rule.min !== 'number') {
            throw new Error(`${type} rule min must be a number`);
        }
        if (rule.max !== undefined && typeof rule.max !== 'number') {
            throw new Error(`${type} rule max must be a number`);
        }
        if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) {
            throw new Error(`${type} rule min cannot be greater than max`);
        }
        return true;
    }

    evaluateThresholdRule(token, rule, type) {
        const change = type === 'volume' ? 
            this.calculateVolumeChange(token, rule.timeframe) :
            this.calculatePriceChange(token, rule.timeframe);

        const met = rule.change === 'increase' ? 
            change >= rule.threshold : 
            change <= -rule.threshold;

        return {
            type,
            met,
            actualChange: change,
            requiredChange: rule.threshold,
            timeframe: rule.timeframe
        };
    }

    evaluateRangeRule(token, rule, type) {
        const value = token[type];
        const met = (!rule.min || value >= rule.min) && 
                   (!rule.max || value <= rule.max);

        return {
            type,
            met,
            actual: value,
            range: { min: rule.min, max: rule.max }
        };
    }

    createRule(type, params) {
        if (!this.ruleTypes[type]) {
            throw new Error(`Unknown rule type: ${type}`);
        }

        const rule = { type, ...params };
        this.ruleTypes[type].validate(rule);
        return rule;
    }

    evaluateRule(token, rule) {
        if (!this.ruleTypes[rule.type]) {
            throw new Error(`Unknown rule type: ${rule.type}`);
        }

        return this.ruleTypes[rule.type].evaluate(token, rule);
    }

    calculateVolumeChange(token, timeframe) {
        return token.volumeChange?.[timeframe] || 0;
    }

    calculatePriceChange(token, timeframe) {
        return token.priceChange?.[timeframe] || 0;
    }
}

class TokenScreening {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.rpcEndpoint);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
        this.supportedCategories = ['meme', 'ai', 'gaming', 'defi', 'nft', 'other'];
        this.timeframes = ['1h', '4h', '24h', '7d'];
        this.rulesManager = new RulesManager();
    }

    async fetchTokenMetadata(tokenAddress) {
        try {
            const response = await axios.get(`https://public-api.birdeye.so/public/token_meta?address=${tokenAddress}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Error fetching token metadata: ${error.message}`);
            throw error;
        }
    }

    async fetchTradingMetrics(tokenAddress) {
        try {
            const response = await axios.get(`https://public-api.birdeye.so/public/token_price?address=${tokenAddress}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Error fetching trading metrics: ${error.message}`);
            throw error;
        }
    }

    async evaluateToken(tokenAddress, criteria) {
        const metadata = await this.fetchTokenMetadata(tokenAddress);
        const metrics = await this.fetchTradingMetrics(tokenAddress);

        return {
            meetsCriteria: this.checkCriteria(metadata, metrics, criteria),
            metadata,
            metrics
        };
    }

    checkCriteria(metadata, metrics, criteria) {
        const checks = {
            category: () => criteria.categories.includes(metadata.category),
            marketCap: () => metrics.marketCap >= criteria.minMarketCap && metrics.marketCap <= criteria.maxMarketCap,
            volumeChange: () => metrics.volumeChange24h >= criteria.minVolumeChange,
            priceChange: () => metrics.priceChange24h >= criteria.minPriceChange,
            liquidity: () => metrics.liquidity >= criteria.minLiquidity
        };

        return Object.entries(criteria)
            .filter(([key]) => checks[key])
            .every(([key]) => checks[key]());
    }

    async scanNewTokens() {
        // Implementation for scanning new token listings
        // This would integrate with DEX APIs to monitor new token listings
    }

    // Token filtering methods
    async filterTokens(tokens, criteria) {
        const {
            category,
            minMarketCap,
            maxMarketCap,
            minPrice,
            maxPrice,
            minLiquidity,
            minVolume,
            launchDate,
            minHolders
        } = criteria;

        return tokens.filter(token => {
            // Category filter
            if (category && !this.supportedCategories.includes(token.category?.toLowerCase())) {
                return false;
            }

            // Market cap range
            if (token.marketCap === undefined || token.marketCap === null) return false;
            if (minMarketCap !== undefined && minMarketCap !== null && token.marketCap < minMarketCap) return false;
            if (maxMarketCap !== undefined && maxMarketCap !== null && token.marketCap > maxMarketCap) return false;

            // Price range
            if (minPrice && token.price < minPrice) return false;
            if (maxPrice && token.price > maxPrice) return false;

            // Liquidity check
            if (minLiquidity && token.liquidity < minLiquidity) return false;

            // Volume check
            if (minVolume && token.volume24h < minVolume) return false;

            // Launch date check
            if (launchDate && new Date(token.launchDate) < new Date(launchDate)) return false;

            // Holders count check
            if (minHolders && token.holders < minHolders) return false;

            return true;
        });
    }

    // Strategy rule evaluation
    evaluateStrategy(token, strategy) {
        try {
            const rules = this.parseStrategyRules(strategy);
            const results = rules.map(rule => this.rulesManager.evaluateRule(token, rule));
            
            return {
                meetsCriteria: results.every(result => result.met),
                conditions: results,
                score: this.calculateStrategyScore(results)
            };
        } catch (error) {
            this.logger.error(`Error evaluating strategy: ${error.message}`);
            throw error;
        }
    }

    parseStrategyRules(strategy) {
        const rules = [];
        
        // Volume rules
        if (strategy.volumeChange && strategy.volumeThreshold) {
            rules.push(this.rulesManager.createRule('volume', {
                change: strategy.volumeChange,
                threshold: strategy.volumeThreshold,
                timeframe: strategy.timeframe || '24h'
            }));
        }

        // Price rules
        if (strategy.priceChange && strategy.priceThreshold) {
            rules.push(this.rulesManager.createRule('price', {
                change: strategy.priceChange,
                threshold: strategy.priceThreshold,
                timeframe: strategy.timeframe || '24h'
            }));
        }

        // Market cap rules
        if (strategy.marketCap) {
            rules.push(this.rulesManager.createRule('marketCap', {
                min: strategy.marketCap.min,
                max: strategy.marketCap.max
            }));
        }

        // Liquidity rules
        if (strategy.liquidity) {
            rules.push(this.rulesManager.createRule('liquidity', {
                min: strategy.liquidity.min,
                max: strategy.liquidity.max
            }));
        }

        // Holder count rules
        if (strategy.holders) {
            rules.push(this.rulesManager.createRule('holders', {
                min: strategy.holders.min,
                max: strategy.holders.max
            }));
        }

        return rules;
    }

    calculateStrategyScore(results) {
        const totalRules = results.length;
        if (totalRules === 0) return 0;
        const passedRules = results.filter(r => r.met).length;
        return (passedRules / totalRules) * 100;
    }

    formatStrategyRules(strategy) {
        try {
            const rules = this.parseStrategyRules(strategy);
            return rules.map(rule => {
                switch (rule.type) {
                    case 'volume':
                        return `Volume ${rule.change} ${rule.threshold}% in ${rule.timeframe}`;
                    case 'price':
                        return `Price ${rule.change} ${rule.threshold}% in ${rule.timeframe}`;
                    case 'marketCap':
                        return `Market Cap between ${rule.min || '0'} and ${rule.max || '∞'}`;
                    case 'liquidity':
                        return `Liquidity between ${rule.min || '0'} and ${rule.max || '∞'}`;
                    case 'holders':
                        return `Holders between ${rule.min || '0'} and ${rule.max || '∞'}`;
                    default:
                        return 'Unknown rule';
                }
            }).join(' AND ');
        } catch (error) {
            this.logger.error(`Error formatting strategy rules: ${error.message}`);
            return 'Invalid strategy rules';
        }
    }
}

module.exports = TokenScreening; 