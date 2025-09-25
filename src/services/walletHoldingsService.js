const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');
const winston = require('winston');

class WalletHoldingsService {
    constructor(config = {}) {
        this.connection = new Connection(
            config.rpcEndpoint || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
        this.tokenListCache = new Map();
        this.priceCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
    }

    /**
     * Validate Solana wallet address
     */
    validateWalletAddress(address) {
        try {
            new PublicKey(address);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get comprehensive token list with metadata from Raydium only
     */
    async getTokenList() {
        try {
            // Check cache first
            const cacheKey = 'tokenList';
            const cached = this.tokenListCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                return cached.data;
            }

            // Fetch only from Raydium API
            const raydiumTokens = await axios.get('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json');

            let tokenMap = new Map();

            // Add SOL manually as it might not be in the Raydium token list
            tokenMap.set('So11111111111111111111111111111111111111112', {
                address: 'So11111111111111111111111111111111111111112',
                symbol: 'SOL',
                name: 'Solana',
                decimals: 9,
                logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
                tags: ['verified'],
                source: 'native'
            });

            // Add major stablecoins manually to ensure they're always recognized
            tokenMap.set('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 6,
                logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
                tags: ['verified', 'stablecoin'],
                source: 'manual'
            });

            tokenMap.set('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', {
                address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 6,
                logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
                tags: ['verified', 'stablecoin'],
                source: 'manual'
            });

            // Process Raydium tokens
            if (raydiumTokens.data && raydiumTokens.data) {
                Object.values(raydiumTokens.data).forEach(token => {
                    tokenMap.set(token.mint, {
                        address: token.mint,
                        symbol: token.symbol,
                        name: token.name || token.symbol,
                        decimals: token.decimals,
                        logoURI: token.logoURI,
                        tags: token.tags || [],
                        source: 'raydium'
                    });
                });
            }

            const tokenList = Object.fromEntries(tokenMap);
            
            // Cache the result
            this.tokenListCache.set(cacheKey, {
                data: tokenList,
                timestamp: Date.now()
            });

            return tokenList;
        } catch (error) {
            this.logger.error('Error fetching token list:', error.message);
            return {
                'So11111111111111111111111111111111111111112': {
                    address: 'So11111111111111111111111111111111111111112',
                    symbol: 'SOL',
                    name: 'Solana',
                    decimals: 9,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
                    tags: ['verified'],
                    source: 'native'
                },
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
                    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    symbol: 'USDC',
                    name: 'USD Coin',
                    decimals: 6,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
                    tags: ['verified', 'stablecoin'],
                    source: 'manual'
                },
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
                    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
                    symbol: 'USDT',
                    name: 'Tether USD',
                    decimals: 6,
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
                    tags: ['verified', 'stablecoin'],
                    source: 'manual'
                }
            };
        }
    }

    /**
     * Get token prices from Raydium pools only
     */
    async getTokenPrices(tokenAddresses) {
        try {
            if (!tokenAddresses.length) return {};

            const cacheKey = tokenAddresses.sort().join(',');
            const cached = this.priceCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
                return cached.data;
            }

            const prices = {};
            const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            const solMint = 'So11111111111111111111111111111111111111112';
            
            // Set a reasonable fallback SOL price
            let solPriceInUsdc = 150; // Default fallback price

            // Try multiple smaller endpoints instead of the large pairs endpoint
            try {
                // Try to get SOL price from a simple price endpoint first
                try {
                    const solPriceResponse = await axios.get('https://api.raydium.io/v2/main/price', {
                        params: { ids: solMint },
                        timeout: 5000
                    });
                    
                    if (solPriceResponse.data && solPriceResponse.data[solMint]) {
                        solPriceInUsdc = parseFloat(solPriceResponse.data[solMint]);
                    }
                } catch (priceError) {
                    this.logger.warn('Primary price API unavailable, trying alternative endpoint...');
                    
                    // Fallback: try to get basic pool info for SOL/USDC
                    try {
                        const infoResponse = await axios.get('https://api.raydium.io/v2/main/info', {
                            timeout: 5000
                        });
                        
                        if (infoResponse.data && infoResponse.data.price && infoResponse.data.price.SOL) {
                            solPriceInUsdc = parseFloat(infoResponse.data.price.SOL);
                            this.logger.info('SOL price obtained from info endpoint');
                        }
                    } catch (infoError) {
                        this.logger.warn('Alternative price source also unavailable, using fallback price');
                    }
                }

                // Set SOL price
                prices[solMint] = {
                    usd: solPriceInUsdc,
                    usd_24h_change: 0,
                    source: 'raydium-price'
                };

                // For other tokens, try to get individual prices or use fallback
                for (const tokenAddress of tokenAddresses) {
                    if (tokenAddress === solMint) continue; // Already handled
                    
                    try {
                        // Try to get individual token price
                        const tokenPriceResponse = await axios.get('https://api.raydium.io/v2/main/price', {
                            params: { ids: tokenAddress },
                            timeout: 3000
                        });
                        
                        if (tokenPriceResponse.data && tokenPriceResponse.data[tokenAddress]) {
                            const tokenPrice = parseFloat(tokenPriceResponse.data[tokenAddress]);
                            if (tokenPrice > 0) {
                                prices[tokenAddress] = {
                                    usd: tokenPrice,
                                    usd_24h_change: 0,
                                    source: 'raydium-price'
                                };
                            }
                        }
                    } catch (tokenError) {
                        // Silent fail for individual tokens - they'll just not have prices
                        // This is normal for tokens not actively traded on Raydium
                    }
                }

                // If we couldn't get prices from the price endpoint, try a simpler approach
                if (Object.keys(prices).length === 1) { // Only SOL price
                    this.logger.info('Only SOL price available, skipping additional price lookups for now');
                    // Note: Additional price discovery methods could be added here in the future
                }

            } catch (error) {
                this.logger.warn('All Raydium APIs failed:', error.message);
                
                // Final fallback: Set basic SOL price
                prices[solMint] = {
                    usd: solPriceInUsdc,
                    usd_24h_change: 0,
                    source: 'fallback'
                };
            }

            // Cache the result
            this.priceCache.set(cacheKey, {
                data: prices,
                timestamp: Date.now()
            });

            return prices;
        } catch (error) {
            this.logger.error('Error fetching token prices:', error.message);
            return {
                'So11111111111111111111111111111111111111112': {
                    usd: 150,
                    usd_24h_change: 0,
                    source: 'error-fallback'
                }
            };
        }
    }

    /**
     * Get SOL balance for wallet
     */
    async getSolBalance(walletAddress) {
        try {
            const publicKey = new PublicKey(walletAddress);
            const balance = await this.connection.getBalance(publicKey);
            return {
                mint: 'So11111111111111111111111111111111111111112',
                symbol: 'SOL',
                name: 'Solana',
                balance: balance / 1e9,
                decimals: 9,
                uiAmount: balance / 1e9,
                rawBalance: balance.toString(),
                isNative: true
            };
        } catch (error) {
            throw new Error(`Failed to get SOL balance: ${error.message}`);
        }
    }

    /**
     * Get all SPL token holdings for wallet
     */
    async getSplTokenHoldings(walletAddress) {
        try {
            const publicKey = new PublicKey(walletAddress);
            
            // Get all token accounts owned by the wallet
            const tokenAccounts = await this.connection.getTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID },
                'confirmed'
            );

            const holdings = [];

            for (const { account, pubkey } of tokenAccounts.value) {
                try {
                    // Parse token account data
                    const accountData = account.data;
                    const mint = new PublicKey(accountData.slice(0, 32));
                    const owner = new PublicKey(accountData.slice(32, 64));
                    const amount = accountData.readBigUInt64LE(64);

                    // Skip accounts with zero balance
                    if (amount === 0n) continue;

                    // Get mint info for decimals
                    const mintInfo = await this.connection.getParsedAccountInfo(mint);
                    const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 0;
                    const supply = mintInfo.value?.data?.parsed?.info?.supply || '0';

                    const uiAmount = Number(amount) / Math.pow(10, decimals);

                    holdings.push({
                        tokenAccount: pubkey.toString(),
                        mint: mint.toString(),
                        owner: owner.toString(),
                        balance: uiAmount,
                        decimals: decimals,
                        uiAmount: uiAmount,
                        rawBalance: amount.toString(),
                        supply: supply,
                        isNative: false
                    });

                } catch (error) {
                    this.logger.warn(`Failed to parse token account ${pubkey.toString()}:`, error.message);
                    continue;
                }
            }

            return holdings;
        } catch (error) {
            throw new Error(`Failed to get SPL token holdings: ${error.message}`);
        }
    }

    /**
     * Fetch token metadata directly from blockchain
     */
    async getTokenMetadataFromChain(mintAddress) {
        try {
            const mint = new PublicKey(mintAddress);
            
            // Get mint info for basic details
            const mintInfo = await this.connection.getParsedAccountInfo(mint);
            if (!mintInfo.value) return null;
            
            const decimals = mintInfo.value.data?.parsed?.info?.decimals || 0;
            
            // Try to get metadata from Metaplex (if available)
            try {
                // Metaplex metadata PDA
                const [metadataPDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from('metadata'),
                        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
                        mint.toBuffer(),
                    ],
                    new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
                );

                const metadataAccount = await this.connection.getAccountInfo(metadataPDA);
                if (metadataAccount) {
                    // Parse basic metadata (simplified parsing)
                    const data = metadataAccount.data;
                    if (data.length > 100) {
                        // Try to extract name and symbol (basic parsing)
                        let offset = 1 + 32 + 32; // Skip discriminator and keys
                        
                        // Read name length and name
                        const nameLength = data.readUInt32LE(offset);
                        offset += 4;
                        const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '').trim();
                        offset += nameLength;
                        
                        // Read symbol length and symbol
                        const symbolLength = data.readUInt32LE(offset);
                        offset += 4;
                        const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '').trim();
                        
                        if (name && symbol) {
                            return {
                                address: mintAddress,
                                symbol: symbol,
                                name: name,
                                decimals: decimals,
                                logoURI: null,
                                tags: [],
                                source: 'chain-metadata'
                            };
                        }
                    }
                }
            } catch (metadataError) {
                // Metadata parsing failed, continue with fallback
            }
            
            // Fallback: return basic info with shortened address as symbol
            const shortAddress = `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
            return {
                address: mintAddress,
                symbol: shortAddress,
                name: `Token ${shortAddress}`,
                decimals: decimals,
                logoURI: null,
                tags: [],
                source: 'chain-basic'
            };
            
        } catch (error) {
            this.logger.warn(`Failed to fetch metadata for ${mintAddress}:`, error.message);
            return null;
        }
    }

    /**
     * Enrich holdings with metadata and prices
     */
    async enrichHoldings(holdings) {
        try {
            const tokenList = await this.getTokenList();
            const tokenAddresses = holdings
                .filter(h => !h.isNative)
                .map(h => h.mint);
            
            // Add SOL for price lookup
            tokenAddresses.push('So11111111111111111111111111111111111111112');
            
            const prices = await this.getTokenPrices(tokenAddresses);

            // Fetch missing token metadata from blockchain
            const enrichedResults = await Promise.all(holdings.map(async (holding) => {
                let metadata = tokenList[holding.mint] || {};
                
                // If token is not in our list and not SOL, try to fetch from blockchain
                if (!metadata.symbol && holding.mint !== 'So11111111111111111111111111111111111111112') {
                    const chainMetadata = await this.getTokenMetadataFromChain(holding.mint);
                    if (chainMetadata) {
                        metadata = chainMetadata;
                    }
                }
                
                const price = prices[holding.mint] || {};
                const usdValue = price.usd ? holding.balance * price.usd : null;

                return {
                    ...holding,
                    symbol: metadata.symbol || 'UNKNOWN',
                    name: metadata.name || 'Unknown Token',
                    logoURI: metadata.logoURI || null,
                    tags: metadata.tags || [],
                    price: {
                        usd: price.usd || null,
                        usd_24h_change: price.usd_24h_change || null,
                        source: price.source || null
                    },
                    value: {
                        usd: usdValue,
                        formatted: usdValue ? `$${usdValue.toFixed(2)}` : null
                    },
                    metadata: {
                        source: metadata.source || null,
                        verified: metadata.tags?.includes('verified') || false
                    }
                };
            }));

            return enrichedResults;
        } catch (error) {
            this.logger.error('Error enriching holdings:', error.message);
            return holdings;
        }
    }

    /**
     * Get complete wallet holdings with metadata and prices
     */
    async getAllHoldings(walletAddress) {
        try {
            this.logger.info(`🔍 Fetching holdings for wallet: ${walletAddress}`);

            if (!this.validateWalletAddress(walletAddress)) {
                throw new Error('Invalid wallet address');
            }

            // Get SOL and SPL token holdings in parallel
            const [solBalance, splHoldings] = await Promise.all([
                this.getSolBalance(walletAddress),
                this.getSplTokenHoldings(walletAddress)
            ]);

            // Combine all holdings
            const allHoldings = [solBalance, ...splHoldings];

            // Filter out dust amounts (less than $0.01 or very small balances)
            const significantHoldings = allHoldings.filter(holding => {
                if (holding.isNative) return holding.balance > 0.001; // At least 0.001 SOL
                return holding.balance > 0; // Any amount for tokens
            });

            this.logger.info(`📊 Found ${significantHoldings.length} token holdings`);

            // Enrich with metadata and prices
            const enrichedHoldings = await this.enrichHoldings(significantHoldings);

            // Sort by USD value (highest first), then by balance
            enrichedHoldings.sort((a, b) => {
                if (a.value.usd && b.value.usd) {
                    return b.value.usd - a.value.usd;
                } else if (a.value.usd) {
                    return -1;
                } else if (b.value.usd) {
                    return 1;
                } else {
                    return b.balance - a.balance;
                }
            });

            // Calculate total portfolio value
            const totalValue = enrichedHoldings.reduce((sum, holding) => {
                return sum + (holding.value.usd || 0);
            }, 0);

            return {
                wallet: walletAddress,
                totalHoldings: enrichedHoldings.length,
                totalValue: {
                    usd: totalValue,
                    formatted: `$${totalValue.toFixed(2)}`
                },
                holdings: enrichedHoldings,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Failed to get wallet holdings: ${error.message}`);
        }
    }

    /**
     * Get balance for a specific token in a wallet
     */
    async getSpecificTokenBalance(walletAddress, tokenMint) {
        try {
            const holdings = await this.getAllHoldings(walletAddress);
            const tokenHolding = holdings.holdings.find(h => h.mint === tokenMint);
            
            if (!tokenHolding) {
                return {
                    mint: tokenMint,
                    balance: 0,
                    uiAmount: 0,
                    exists: false
                };
            }

            return {
                ...tokenHolding,
                exists: true
            };
        } catch (error) {
            throw new Error(`Failed to get specific token balance: ${error.message}`);
        }
    }

    /**
     * Clear caches
     */
    clearCache() {
        this.tokenListCache.clear();
        this.priceCache.clear();
        this.logger.info('Cache cleared');
    }
}

module.exports = WalletHoldingsService;
