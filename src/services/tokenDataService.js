const axios = require('axios');
// Removed MarketDataService import since we only use Jupiter now

class TokenDataService {
    constructor(config) {
        // No API keys needed for Jupiter
        this.priceCache = new Map(); // tokenAddress -> { priceData, timestamp }
        this.cacheTTL = 20 * 1000; // 30 seconds
        this.lastJupiterCall = 0; // Timestamp of last Jupiter API call
        this.cooldownMs = (config && config.jupiterCooldownMs) ? config.jupiterCooldownMs : 10 * 1000; // Configurable cooldown
        this.cooldownPromise = null; // Promise for ongoing cooldown
    }

    async cooldownIfNeeded() {
        const now = Date.now();
        const timeSinceLast = now - this.lastJupiterCall;
        if (timeSinceLast < this.cooldownMs) {
            // If a cooldown is already in progress, wait for it
            if (this.cooldownPromise) {
                await this.cooldownPromise;
            } else {
                // Otherwise, create a new cooldown promise
                this.cooldownPromise = new Promise(resolve => {
                    setTimeout(() => {
                        this.cooldownPromise = null;
                        resolve();
                    }, this.cooldownMs - timeSinceLast);
                });
                await this.cooldownPromise;
            }
        }
        // Update last call time
        this.lastJupiterCall = Date.now();
    }

    async getTokenData(tokenAddress) {
        // Check cache first
        const cached = this.priceCache.get(tokenAddress);
        const now = Date.now();
        if (cached && (now - cached.timestamp < this.cacheTTL)) {
            return cached.priceData;
        }
        try {
            await this.cooldownIfNeeded();
            const jupiterData = await this.getJupiterData(tokenAddress);
            // Cache the result
            this.priceCache.set(tokenAddress, { priceData: jupiterData, timestamp: Date.now() });
            return jupiterData;
        } catch (error) {
            console.error('Error fetching token data:', error);
            throw error;
        }
    }

    async getJupiterData(tokenAddress) {
        try {
            const url = `https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`;
            const response = await axios.get(url, { headers: { 'Accept': 'application/json' } });
            
            // Jupiter returns an array; find the token with exact mint match
            if (Array.isArray(response.data) && response.data.length > 0) {
                // First try to find exact match
                let token = response.data.find(t => 
                    t.id === tokenAddress || 
                    t.address === tokenAddress || 
                    t.mint === tokenAddress
                );
                
                // If no exact match, try partial match or use first result
                if (!token) {
                    token = response.data.find(t => 
                        t.id?.toLowerCase().includes(tokenAddress.toLowerCase()) ||
                        t.address?.toLowerCase().includes(tokenAddress.toLowerCase()) ||
                        t.mint?.toLowerCase().includes(tokenAddress.toLowerCase())
                    ) || response.data[0];
                }
                
                if (token) {
                    return {
                        price: token.usdPrice,
                        address: token.id, // Jupiter uses 'id' as the token address
                        symbol: token.symbol,
                        name: token.name,
                        marketCap: token.mcap, // Jupiter uses 'mcap' for market cap
                        category: token.tags ? token.tags[0] : null, // Use first tag as category
                        volume24h: token.stats24h ? (token.stats24h.buyVolume + token.stats24h.sellVolume) : null,
                        liquidity: token.liquidity,
                        volume: token.stats24h ? (token.stats24h.buyVolume + token.stats24h.sellVolume) : null
                    };
                }
            }
            
            // If Jupiter fails, try alternative sources
            return await this.getAlternativeTokenData(tokenAddress);
        } catch (error) {
            console.error('Error fetching Jupiter data:', error);
            // Try alternative sources on Jupiter failure
            return await this.getAlternativeTokenData(tokenAddress);
        }
    }

    async getAlternativeTokenData(tokenAddress) {
        try {
            // Try DexScreener as alternative
            const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
            const response = await axios.get(dexscreenerUrl, { 
                headers: { 'Accept': 'application/json' },
                timeout: 5000 
            });
            
            if (response.data && response.data.pairs && response.data.pairs.length > 0) {
                const pair = response.data.pairs[0];
                return {
                    price: pair.priceUsd,
                    address: tokenAddress,
                    symbol: pair.baseToken?.symbol || 'UNKNOWN',
                    name: pair.baseToken?.name || 'Unknown Token',
                    marketCap: null,
                    category: null,
                    volume24h: pair.volume24h,
                    liquidity: pair.liquidity?.usd,
                    volume: pair.volume24h
                };
            }
        } catch (error) {
            console.error('Error fetching alternative token data:', error);
        }
        
        // Final fallback - return basic info with token address
        return {
            price: 0,
            address: tokenAddress,
            symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
            name: 'Unknown Token',
            marketCap: null,
            category: null,
            volume24h: null,
            liquidity: null,
            volume: null
        };
    }

    async getTokenMetrics(tokenAddress, timeframe = '1h') {
        const data = await this.getTokenData(tokenAddress);
        
        return {
            price: data?.price,
            marketCap: data?.marketCap,
            volume: data?.volume24h || data?.volume, 
            priceChange: undefined, 
            volumeChange: undefined,
            liquidity: data?.liquidity, 
            category: data?.category
        };
    }

    async getTokenLiquidity(tokenAddress) {
        const data = await this.getTokenData(tokenAddress);
        return data?.liquidity || 0;
    }

    /**
     * Fetch tokens from Jupiter, filter by rule criteria, and return a random selection.
     * @param {Object} rule - The rule object containing criteria for filtering tokens.
     * @param {number} count - Number of random tokens to return (default 3).
     * @param {Object} db - Database manager instance for user-specific data.
     * @param {Object} config - Config object.
     * @param {number} userId - User ID for user-specific filtering (optional).
     * @returns {Promise<Array>} Array of token objects.
     */
    async getTokensByCriteria(rule, count = 3, db = null, config = null, userId = null) {
        try {
            // Fetch trending tokens from Jupiter
            const axios = require('axios');
            const response = await axios.get('https://lite-api.jup.ag/tokens/v2/toptraded/24h', {
                headers: { 'Accept': 'application/json' }
            });
            let tokens = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            console.log(`[TokenDataService] Rule:`, JSON.stringify(rule, null, 2));
            console.log(`[TokenDataService] Tokens fetched from Jupiter: ${tokens.length}`);
            if (!tokens.length) return [];

            // Fetch rule conditions from DB if possible
            let conditions = [];
            if (db && rule.id) {
                if (typeof db.getRuleConditions === 'function') {
                    conditions = await db.getRuleConditions(rule.id);
                }
            }
            console.log(`[TokenDataService] Rule conditions:`, JSON.stringify(conditions, null, 2));

            // Filtering logic (category, market cap, price, etc.)
            const filtered = tokens.filter(token => {
                // Check ALL conditions - token must pass every single one
                for (const cond of conditions) {
                    try {
                        let value;
                        // For category and timeframe conditions, the value is a string, not JSON
                        if (cond.condition_type === 'category' || cond.condition_type === 'discovery_category' || 
                            cond.condition_type === 'timeframe' || cond.condition_type === 'discovery_timeframe') {
                            value = cond.condition_value;
                        } else {
                            value = JSON.parse(cond.condition_value);
                        }
                        let conditionPassed = true;
                        
                        switch (cond.condition_type) {
                            case 'category':
                            case 'discovery_category':
                                // Jupiter uses 'tags' instead of 'category'
                                const tokenCategory = token.tags ? token.tags[0] : token.category;
                                if (!tokenCategory || tokenCategory.toLowerCase() !== value.toLowerCase()) {
                                    conditionPassed = false;
                                }
                                break;
                            case 'market_cap':
                            case 'discovery_market_cap': {
                                // Jupiter uses 'mcap' for market cap
                                const cap = token.mcap ?? token.marketCap ?? token.market_cap;
                                if (cap === undefined || cap === null) { 
                                    conditionPassed = false; 
                                    break; 
                                }
                                if (typeof value === 'object') {
                                    if (value.min !== undefined && value.min !== null && cap < Number(value.min)) conditionPassed = false;
                                    if (value.max !== undefined && value.max !== null && cap > Number(value.max)) conditionPassed = false;
                                } else {
                                    if (cond.operator === '>=') { if (cap < Number(value)) conditionPassed = false; }
                                    else if (cond.operator === '<=') { if (cap > Number(value)) conditionPassed = false; }
                                    else if (!cond.operator && cap > Number(value)) conditionPassed = false; // fallback: treat as max
                                }
                                if (!conditionPassed) {
                                    console.log(`[TokenDataService] Token ${token.symbol || token.id || token.address} filtered out by ${cond.condition_type} condition:`, cond, 'Token market cap:', cap);
                                }
                                break;
                            }
                            case 'price':
                            case 'discovery_price':
                                if (token.usdPrice === undefined || token.usdPrice === null) { 
                                    conditionPassed = false; 
                                    break; 
                                }
                                if (cond.operator === '>=') { if (token.usdPrice < value) conditionPassed = false; }
                                if (cond.operator === '<=') { if (token.usdPrice > value) conditionPassed = false; }
                                break;
                            case 'volume':
                            case 'discovery_volume': {
                                // Jupiter provides volume data in stats24h
                                const volume = token.stats24h ? (token.stats24h.buyVolume + token.stats24h.sellVolume) : (token.volume24h ?? token.volume);
                                if (volume === undefined || volume === null) {
                                    // If volume data is not available, we'll skip this condition for now
                                    console.log(`[TokenDataService] Volume data not available for token ${token.symbol || token.id || token.address}, skipping volume condition`);
                                    break;
                                }
                                if (typeof value === 'object') {
                                    if (value.min !== undefined && value.min !== null && volume < Number(value.min)) conditionPassed = false;
                                    if (value.max !== undefined && value.max !== null && volume > Number(value.max)) conditionPassed = false;
                                } else {
                                    if (cond.operator === '>=') { if (volume < Number(value)) conditionPassed = false; }
                                    else if (cond.operator === '<=') { if (volume > Number(value)) conditionPassed = false; }
                                    else if (!cond.operator && volume < Number(value)) conditionPassed = false; // fallback: treat as min
                                }
                                if (!conditionPassed) {
                                    console.log(`[TokenDataService] Token ${token.symbol || token.id || token.address} filtered out by ${cond.condition_type} condition:`, cond, 'Token volume:', volume);
                                }
                                break;
                            }
                            case 'liquidity':
                            case 'discovery_liquidity': {
                                // Jupiter provides liquidity data directly
                                const liquidity = token.liquidity;
                                if (liquidity === undefined || liquidity === null) {
                                    // If liquidity data is not available, we'll skip this condition for now
                                    console.log(`[TokenDataService] Liquidity data not available for token ${token.symbol || token.id || token.address}, skipping liquidity condition`);
                                    break;
                                }
                                if (typeof value === 'object') {
                                    if (value.min !== undefined && value.min !== null && liquidity < Number(value.min)) conditionPassed = false;
                                    if (value.max !== undefined && value.max !== null && liquidity > Number(value.max)) conditionPassed = false;
                                } else {
                                    if (cond.operator === '>=') { if (liquidity < Number(value)) conditionPassed = false; }
                                    else if (cond.operator === '<=') { if (liquidity > Number(value)) conditionPassed = false; }
                                    else if (!cond.operator && liquidity < Number(value)) conditionPassed = false; // fallback: treat as min
                                }
                                if (!conditionPassed) {
                                    console.log(`[TokenDataService] Token ${token.symbol || token.id || token.address} filtered out by ${cond.condition_type} condition:`, cond, 'Token liquidity:', liquidity);
                                }
                                break;
                            }
                            case 'timeframe':
                            case 'discovery_timeframe':
                                // Timeframe is typically used for change calculations (price change, volume change)
                                // Since we're filtering static token data, we'll skip timeframe conditions
                                // They should be handled in the rule evaluation phase
                                console.log(`[TokenDataService] Timeframe condition skipped for static filtering:`, cond);
                                break;
                            // Add more condition types as needed
                        }
                        
                        // If any condition fails, the token is rejected
                        if (!conditionPassed) {
                            return false;
                        }
                    } catch (e) {
                        console.log(`[TokenDataService] Error parsing condition or filtering token:`, e, cond);
                        return false; // Reject token if condition parsing fails
                    }
                }
                // If we get here, ALL conditions passed
                return true;
            });
            console.log(`[TokenDataService] Tokens after filtering: ${filtered.length}`);
            if (!filtered.length) {
                console.log(`[TokenDataService] No tokens matched the rule. Returning empty array.`);
                return [];
            }
            // Shuffle and pick up to count
            const shuffled = filtered.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        } catch (error) {
            console.error('[TokenDataService] Error in getTokensByCriteria:', error);
            return [];
        }
    }
}

module.exports = TokenDataService;