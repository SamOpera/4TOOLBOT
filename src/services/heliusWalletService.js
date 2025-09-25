const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const winston = require('winston');

class HeliusWalletService {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.HELIUS_API_KEY || '35d3d141-6c2d-46ac-956a-b9748f91d6ca';
        this.baseUrl = 'https://mainnet.helius-rpc.com';
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'logs/helius-wallet-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/helius-wallet-combined.log' })
            ]
        });

        // Add console transport for development
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }
    }

    /**
     * Validate Solana wallet address
     */
    validateWalletAddress(address) {
        try {
            // Basic validation - check if it's a valid string
            if (typeof address !== 'string' || address.trim().length === 0) {
                return false;
            }
            
            // Solana addresses are typically 32-44 characters long
            const trimmedAddress = address.trim();
            if (trimmedAddress.length < 32 || trimmedAddress.length > 44) {
                return false;
            }
            
            // Check if it contains only valid base58 characters
            const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
            return base58Regex.test(trimmedAddress);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get wallet assets using Helius RPC API
     */
    async getWalletAssets(ownerAddress, options = {}) {
        try {
            if (!this.validateWalletAddress(ownerAddress)) {
                throw new Error('Invalid wallet address format');
            }

            const cacheKey = `wallet_${ownerAddress}_${JSON.stringify(options)}`;
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                this.logger.info(`Returning cached wallet data for ${ownerAddress}`);
                return cached.data;
            }

            const response = await fetch(`${this.baseUrl}/?api-key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: '1',
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: ownerAddress,
                        displayOptions: {
                            showFungible: options.showFungible !== false,
                            showNativeBalance: options.showNativeBalance !== false,
                            showUnverifiedCollections: options.showUnverifiedCollections || false,
                            showZeroBalance: options.showZeroBalance || false
                        }
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`Helius API error: ${data.error.message}`);
            }

            // Process and filter the results
            const processedData = this.processWalletData(data.result, options);
            
            // Cache the result
            this.cache.set(cacheKey, {
                timestamp: Date.now(),
                data: processedData
            });

            this.logger.info(`Successfully fetched wallet data for ${ownerAddress}`);
            return processedData;

        } catch (error) {
            this.logger.error(`Error fetching wallet assets for ${ownerAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get only fungible tokens from wallet
     */
    async getFungibleTokens(ownerAddress) {
        try {
            const walletData = await this.getWalletAssets(ownerAddress, {
                showFungible: true,
                showNativeBalance: true,
                showUnverifiedCollections: false,
                showZeroBalance: false
            });

            // Filter to show only fungible tokens (exclude NFTs)
            const fungibleTokens = walletData.items.filter(item => 
                item.interface === 'FungibleToken'
            );

            return {
                ownerAddress,
                fungibleTokens,
                totalTokens: fungibleTokens.length,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error(`Error fetching fungible tokens for ${ownerAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get native SOL balance
     */
    async getNativeBalance(ownerAddress) {
        try {
            const walletData = await this.getWalletAssets(ownerAddress, {
                showFungible: false,
                showNativeBalance: true,
                showUnverifiedCollections: false,
                showZeroBalance: false
            });

            return {
                ownerAddress,
                nativeBalance: walletData.nativeBalance || 0,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error(`Error fetching native balance for ${ownerAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get comprehensive wallet summary
     */
    async getWalletSummary(ownerAddress) {
        try {
            const [fungibleTokens, nativeBalance] = await Promise.all([
                this.getFungibleTokens(ownerAddress),
                this.getNativeBalance(ownerAddress)
            ]);

            // Calculate total value (if price data is available)
            const totalValue = this.calculateTotalValue(fungibleTokens.fungibleTokens, nativeBalance.nativeBalance);

            return {
                ownerAddress,
                summary: {
                    nativeBalance: nativeBalance.nativeBalance,
                    fungibleTokenCount: fungibleTokens.totalTokens,
                    totalEstimatedValue: totalValue,
                    lastUpdated: new Date().toISOString()
                },
                details: {
                    nativeBalance: nativeBalance,
                    fungibleTokens: fungibleTokens
                }
            };

        } catch (error) {
            this.logger.error(`Error generating wallet summary for ${ownerAddress}:`, error);
            throw error;
        }
    }

    /**
     * Process and format wallet data from Helius API
     */
    processWalletData(result, options) {
        if (!result || !result.items) {
            return { items: [], nativeBalance: 0 };
        }

        let items = result.items || [];
        
        // Handle native balance - it can be a number or an object with lamports
        let nativeBalance = 0;
        if (result.nativeBalance) {
            if (typeof result.nativeBalance === 'object' && result.nativeBalance.lamports) {
                nativeBalance = parseInt(result.nativeBalance.lamports) || 0;
            } else if (typeof result.nativeBalance === 'number') {
                nativeBalance = result.nativeBalance;
            } else if (typeof result.nativeBalance === 'string') {
                nativeBalance = parseInt(result.nativeBalance) || 0;
            }
        }

        // Apply filters based on options
        if (options.showFungible !== undefined) {
            items = items.filter(item => 
                options.showFungible ? item.interface === 'FungibleToken' : item.interface !== 'FungibleToken'
            );
        }

        if (options.showZeroBalance === false) {
            items = items.filter(item => {
                if (item.interface === 'FungibleToken') {
                    // Handle different balance structures
                    let balance = 0;
                    if (item.token_info?.balance_info?.current_balance) {
                        // Old structure
                        balance = parseInt(item.token_info.balance_info.current_balance) || 0;
                    } else if (item.token_info?.balance) {
                        // New structure
                        balance = parseInt(item.token_info.balance) || 0;
                    }
                    return balance > 0;
                }
                return true; // Keep non-fungible items
            });
        }

        return {
            items,
            nativeBalance,
            totalItems: items.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculate total estimated value (placeholder for price integration)
     */
    calculateTotalValue(fungibleTokens, nativeBalance) {
        // This is a placeholder - in a real implementation, you'd fetch current prices
        // and calculate the actual USD value
        let totalValue = 0;
        
        // Add native SOL value (rough estimate)
        if (nativeBalance > 0) {
            // Assuming SOL price around $100 - this should be fetched from price API
            totalValue += (nativeBalance / 1e9) * 100;
        }

        // Add fungible token values (placeholder)
        fungibleTokens.forEach(token => {
            let balance = 0;
            let decimals = 0;
            
            // Handle different balance structures
            if (token.token_info?.balance_info?.current_balance) {
                // Old structure
                balance = token.token_info.balance_info.current_balance;
                decimals = token.token_info.decimals || 0;
            } else if (token.token_info?.balance) {
                // New structure
                balance = token.token_info.balance;
                decimals = token.token_info.decimals || 0;
            }
            
            if (balance > 0) {
                const actualBalance = balance / Math.pow(10, decimals);
                
                // Placeholder value calculation - should use real price data
                totalValue += actualBalance * 0.01; // Assuming $0.01 per token
            }
        });

        return totalValue;
    }

    /**
     * Clear cache for a specific wallet or all wallets
     */
    clearCache(walletAddress = null) {
        if (walletAddress) {
            // Clear cache for specific wallet
            for (const [key] of this.cache) {
                if (key.startsWith(`wallet_${walletAddress}`)) {
                    this.cache.delete(key);
                }
            }
            this.logger.info(`Cleared cache for wallet: ${walletAddress}`);
        } else {
            // Clear all cache
            this.cache.clear();
            this.logger.info('Cleared all wallet cache');
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            totalEntries: this.cache.size,
            cacheExpiry: this.cacheExpiry,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = HeliusWalletService; 