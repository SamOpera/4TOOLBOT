const axios = require('axios');

class RugCheck {
    constructor() {
        this.baseUrl = 'https://api.rugcheck.xyz/v1';
    }

    /**
     * Get token report from RugCheck API
     * @param {string} tokenAddress - The Solana token address to check
     * @returns {Promise<Object>} The token report data
     */
    async getTokenReport(tokenAddress) {
        try {
            const response = await axios.get(`${this.baseUrl}/tokens/${tokenAddress}/report`, {
                headers: {
                    'accept': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                if (error.response.status === 400 && error.response.data.error === 'not found') {
                    throw new Error('Token not found. Please check the address and try again.');
                }
                if (error.response.status === 429) {
                    throw new Error('Rate limit exceeded. Please try again in a few minutes.');
                }
            }
            console.error('Error fetching token report:', error);
            throw new Error(`Failed to fetch token report: ${error.message}`);
        }
    }

    /**
     * Format token price with proper formatting
     * @param {number} price - The token price
     * @returns {string} Formatted price
     */
    formatPrice(price) {
        if (!price) return '$0.00';
        return `$${price.toFixed(2)}`;
    }

    /**
     * Format large numbers with K/M/B suffix
     * @param {number} num - The number to format
     * @returns {string} Formatted number
     */
    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toString();
    }

    /**
     * Format address to show only first and last 4 characters
     * @param {string} address - The address to format
     * @returns {string} Formatted address
     */
    formatAddress(address) {
        if (!address) return 'N/A';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    /**
     * Get risk level based on score
     * @param {number} score - Risk score out of 100
     * @returns {string} Risk level description
     */
    getRiskLevel(score) {
        // Let the API response determine the risk level
        return score?.riskLevel || 'Unknown';
    }

    /**
     * Format market information
     * @param {Object} market - Market data
     * @returns {string} Formatted market info
     */
    formatMarketInfo(market) {
        if (!market) return 'No market data available';
        return `${this.formatAddress(market.address)} $${this.formatNumber(market.liquidity)} ${market.lockedPercentage}%`;
    }
}

module.exports = RugCheck; 