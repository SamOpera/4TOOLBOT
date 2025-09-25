const express = require('express');
const WalletHoldingsService = require('../services/walletHoldingsService');

class WalletHoldingsAPI {
    constructor(config = {}) {
        this.router = express.Router();
        this.holdingsService = new WalletHoldingsService(config);
        this.setupRoutes();
    }

    setupRoutes() {
        // Health check endpoint
        this.router.get('/health', this.healthCheck.bind(this));
        
        // Get all holdings for a wallet
        this.router.get('/wallet/:address/holdings', this.getWalletHoldings.bind(this));
        
        // Get balance for a specific token
        this.router.get('/wallet/:address/balance/:token', this.getTokenBalance.bind(this));
        
        // Clear cache endpoint (for debugging/maintenance)
        this.router.post('/cache/clear', this.clearCache.bind(this));
    }

    /**
     * Health check endpoint
     */
    async healthCheck(req, res) {
        try {
            res.json({
                success: true,
                message: 'Wallet Holdings API is running',
                timestamp: new Date().toISOString(),
                service: 'walletHoldingsAPI'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * API Endpoint: GET /api/wallet/:address/holdings
     * Fetches all token holdings for a wallet address
     */
    async getWalletHoldings(req, res) {
        try {
            const { address } = req.params;
            const { 
                includeZero = false, 
                minValue = 0,
                sortBy = 'value' 
            } = req.query;

            console.log(`📥 API Request: Get holdings for ${address}`);

            // Validate wallet address
            if (!this.holdingsService.validateWalletAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid wallet address',
                    code: 'INVALID_ADDRESS'
                });
            }

            // Get holdings
            const holdings = await this.holdingsService.getAllHoldings(address);

            // Apply filters if requested
            let filteredHoldings = holdings.holdings;

            if (!includeZero) {
                filteredHoldings = filteredHoldings.filter(h => h.balance > 0);
            }

            if (minValue > 0) {
                filteredHoldings = filteredHoldings.filter(h => 
                    h.value.usd === null || h.value.usd >= parseFloat(minValue)
                );
            }

            // Apply sorting
            if (sortBy === 'symbol') {
                filteredHoldings.sort((a, b) => a.symbol.localeCompare(b.symbol));
            } else if (sortBy === 'balance') {
                filteredHoldings.sort((a, b) => b.balance - a.balance);
            }
            // Default is already sorted by value

            const response = {
                success: true,
                data: {
                    ...holdings,
                    holdings: filteredHoldings,
                    totalHoldings: filteredHoldings.length
                }
            };

            console.log(`✅ Successfully returned ${filteredHoldings.length} holdings`);
            res.json(response);

        } catch (error) {
            console.error('❌ API Error:', error.message);
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'INTERNAL_ERROR'
            });
        }
    }

    /**
     * API Endpoint: GET /api/wallet/:address/balance/:token
     * Get balance for a specific token
     */
    async getTokenBalance(req, res) {
        try {
            const { address, token } = req.params;

            if (!this.holdingsService.validateWalletAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid wallet address'
                });
            }

            let balance;
            if (token.toLowerCase() === 'sol' || token === 'So11111111111111111111111111111111111111112') {
                balance = await this.holdingsService.getSolBalance(address);
                const enriched = await this.holdingsService.enrichHoldings([balance]);
                balance = enriched[0];
            } else {
                balance = await this.holdingsService.getSpecificTokenBalance(address, token);
            }

            if (!balance || !balance.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Token not found in wallet'
                });
            }

            res.json({
                success: true,
                data: balance
            });

        } catch (error) {
            console.error('API Error:', error.message);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Clear service cache
     */
    async clearCache(req, res) {
        try {
            this.holdingsService.clearCache();
            res.json({
                success: true,
                message: 'Cache cleared successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    getRouter() {
        return this.router;
    }
}

module.exports = WalletHoldingsAPI;
