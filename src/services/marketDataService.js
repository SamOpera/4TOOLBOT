const axios = require('axios');

class MarketDataService {
    constructor() {
        this.birdeyeApiKey = process.env.BIRDEYE_API_KEY;
        this.birdeyeBaseUrl = 'https://public-api.birdeye.so';
        this.dexscreenerBaseUrl = 'https://api.dexscreener.com/latest';
    }

    async getTokenData(mintAddress) {
        try {
            // Fetch data from both sources
            const [birdeyeData, dexscreenerData] = await Promise.all([
                this.getBirdeyeData(mintAddress),
                this.getDexscreenerData(mintAddress)
            ]);

            // Combine and normalize the data
            return this.normalizeTokenData(birdeyeData, dexscreenerData);
        } catch (error) {
            console.error('Error fetching token data:', error);
            throw error;
        }
    }

    async getBirdeyeData(mintAddress) {
        try {
            const response = await axios.get(`${this.birdeyeBaseUrl}/public/token_data`, {
                params: {
                    address: mintAddress
                },
                headers: {
                    'X-API-KEY': this.birdeyeApiKey
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching BirdEye data:', error);
            return null;
        }
    }

    async getDexscreenerData(mintAddress) {
        try {
            const response = await axios.get(`${this.dexscreenerBaseUrl}/dex/tokens/${mintAddress}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching DexScreener data:', error);
            return null;
        }
    }

    normalizeTokenData(birdeyeData, dexscreenerData) {
        // Combine and normalize data from both sources
        return {
            mint: birdeyeData?.address || dexscreenerData?.pairs?.[0]?.baseToken?.address,
            price: birdeyeData?.price || dexscreenerData?.pairs?.[0]?.priceUsd,
            marketCap: birdeyeData?.marketCap || null,
            volume24h: birdeyeData?.volume24h || dexscreenerData?.pairs?.[0]?.volume24h,
            liquidity: birdeyeData?.liquidity || dexscreenerData?.pairs?.[0]?.liquidity?.usd,
            holders: birdeyeData?.holders || null,
            launchDate: birdeyeData?.launchDate || null,
            category: birdeyeData?.category || 'other',
            priceChange: {
                '1h': dexscreenerData?.pairs?.[0]?.priceChange1h,
                '24h': dexscreenerData?.pairs?.[0]?.priceChange24h,
                '7d': dexscreenerData?.pairs?.[0]?.priceChange7d
            },
            volumeChange: {
                '1h': dexscreenerData?.pairs?.[0]?.volumeChange1h,
                '24h': dexscreenerData?.pairs?.[0]?.volumeChange24h,
                '7d': dexscreenerData?.pairs?.[0]?.volumeChange7d
            }
        };
    }

    async getTopTokens(criteria = {}) {
        try {
            // Fetch tokens from BirdEye using the correct endpoint and parameters
            console.log('[getTopTokens] Fetching tokens from Birdeye /defi/tokenlist...');
            const response = await axios.get('https://public-api.birdeye.so/defi/tokenlist', {
                params: {
                    sort_by: 'v24hUSD',
                    sort_type: 'desc',
                    offset: '0',
                    limit: '50',
                    min_liquidity: '100',
                    ...criteria // Allow override via criteria
                },
                headers: {
                    accept: 'application/json',
                    'x-chain': 'solana',
                    'X-API-KEY': this.birdeyeApiKey
                }
            });
            if (response.data && response.data.success && response.data.data && Array.isArray(response.data.data.tokens)) {
                console.log(`[getTopTokens] Fetched ${response.data.data.tokens.length} tokens from Birdeye.`);
                return response.data.data.tokens;
            } else {
                console.error('[getTopTokens] Unexpected response from Birdeye:', response.data);
                return [];
            }
        } catch (error) {
            console.error('Error fetching top tokens from Birdeye:', error);
            return [];
        }
    }
}

module.exports = MarketDataService; 