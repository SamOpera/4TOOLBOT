const { Transaction, VersionedTransaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');

/**
 * Raydium Trading Service
 * Implements Raydium Trade API for swap operations
 */
class RaydiumService {
    constructor(connection, config) {
        this.connection = connection;
        this.config = config;
        
        // Raydium API URLs - Updated to current endpoints
        this.API_URLS = {
            SWAP_HOST: 'https://transaction-v1.raydium.io',
            BASE_HOST: 'https://api-v3.raydium.io',
            // Alternative endpoints in case primary fails
            ALT_SWAP_HOST: 'https://api.raydium.io/v2',
            ALT_BASE_HOST: 'https://api.raydium.io'
        };
        
        // Rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 500; // 500ms between requests
        
        // Circuit breaker
        this.circuitBreaker = {
            failureCount: 0,
            lastFailureTime: 0,
            isOpen: false,
            threshold: 5,
            timeout: 60000 // 1 minute
        };
    }

    /**
     * Test connection to Raydium API
     * @returns {Promise<Object>} Connection test result
     */
    async testConnection() {
        try {
            console.log('[Raydium] Testing API connection...');
            
            // Test with a known SOL->USDC swap quote (small amount)
            const testInputMint = 'So11111111111111111111111111111111111111112'; // SOL
            const testOutputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
            const testAmount = 1000000; // 0.001 SOL
            
            const result = await this.getSwapQuote(testInputMint, testOutputMint, testAmount, 50, 'V0');
            
            console.log('[Raydium] API connection test successful');
            return {
                success: true,
                message: 'Raydium API is working',
                testResult: result
            };
        } catch (error) {
            console.error('[Raydium] API connection test failed:', error.message);
            return {
                success: false,
                message: 'Raydium API connection failed',
                error: error.message
            };
        }
    }

    /**
     * Validate token mint addresses
     * @param {string} inputMint - Input token mint
     * @param {string} outputMint - Output token mint
     * @returns {boolean} True if valid
     */
    validateMintAddresses(inputMint, outputMint) {
        // Basic validation for Solana addresses (base58, length 32-44 chars)
        const addressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        
        if (!addressRegex.test(inputMint)) {
            throw new Error(`Invalid input mint address: ${inputMint}`);
        }
        
        if (!addressRegex.test(outputMint)) {
            throw new Error(`Invalid output mint address: ${outputMint}`);
        }
        
        if (inputMint === outputMint) {
            throw new Error('Input and output mint addresses cannot be the same');
        }
        
        return true;
    }

    /**
     * Enhanced error handling with exponential backoff and better fallbacks
     */
    handleRequestError(error) {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        // Log detailed error information
        console.error(`[Raydium] Request failed: ${error.message}`, {
            error: error.message,
            stack: error.stack,
            failureCount: this.circuitBreaker.failureCount,
            timestamp: new Date().toISOString()
        });

        // Circuit breaker logic
        if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
            this.circuitBreaker.isOpen = true;
            console.warn('[Raydium] Circuit breaker opened due to repeated failures');
            
            // Auto-reset after timeout
            setTimeout(() => {
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failureCount = 0;
                console.info('[Raydium] Circuit breaker auto-reset after timeout');
            }, this.circuitBreaker.timeout);
        }
    }

    /**
     * Check circuit breaker status
     */
    checkCircuitBreaker() {
        if (this.circuitBreaker.isOpen) {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
            if (timeSinceLastFailure < this.circuitBreaker.timeout) {
                throw new Error('Raydium service temporarily unavailable due to repeated failures. Please try again in a few minutes.');
            }
        }
    }

    /**
     * Get swap quote from Raydium
     * @param {string} inputMint - Input token mint address
     * @param {string} outputMint - Output token mint address
     * @param {number} amount - Amount in lamports
     * @param {number} slippageBps - Slippage in basis points (100 = 1%)
     * @param {string} txVersion - Transaction version ('v0' or 'legacy')
     * @returns {Promise<Object>} Quote response
     */
    async getSwapQuote(inputMint, outputMint, amount, slippageBps = 50, txVersion = 'v0') {
        // Validate inputs
        this.validateMintAddresses(inputMint, outputMint);
        
        if (amount <= 0) {
            throw new Error(`Invalid amount: ${amount}. Amount must be greater than 0`);
        }
        
        if (slippageBps < 0 || slippageBps > 5000) {
            throw new Error(`Invalid slippage: ${slippageBps}. Slippage must be between 0 and 5000 basis points`);
        }

        // Try different approaches - first without txVersion, then with supported versions
        const approaches = [
            { params: '', description: 'without txVersion parameter' },
            { params: '&txVersion=V0', description: 'with txVersion=V0' },
            { params: '&txVersion=LEGACY', description: 'with txVersion=LEGACY' }
        ];

        const baseEndpoint = `${this.API_URLS.SWAP_HOST}/compute/swap-base-in`;
        let lastError = null;

        for (const approach of approaches) {
            try {
                await this.rateLimit();
                this.checkCircuitBreaker();

                const url = `${baseEndpoint}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}${approach.params}`;
                
                console.log(`[Raydium] Getting quote ${approach.description}: ${url}`);
                
                const response = await axios.get(url, {
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': '4TOOL-Trading-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });

                if (response.status !== 200) {
                    throw new Error(`Raydium API error: ${response.status} - ${response.statusText}`);
                }

                const data = response.data;
                
                console.log(`[Raydium] Raw API response:`, JSON.stringify(data, null, 2));
                
                // Handle different response formats
                if (!data) {
                    throw new Error('Empty response from Raydium API');
                }
                
                // Check for error response
                if (data.success === false) {
                    const errorMessage = data.msg || data.error || data.message || 'Unknown error from Raydium API';
                    
                    // If it's a version error, try next approach
                    if (errorMessage.includes('TX_VERSION_ERROR') || errorMessage.includes('REQ_TX_VERSION_ERROR')) {
                        console.log(`[Raydium] Approach failed (${approach.description}): ${errorMessage}, trying next...`);
                        continue;
                    }
                    
                    // Handle specific error cases
                    if (errorMessage.includes('pool not found') || errorMessage.includes('no route')) {
                        throw new Error(`No trading pool found for this token pair on Raydium: ${inputMint} -> ${outputMint}`);
                    }
                    
                    if (errorMessage.includes('insufficient liquidity')) {
                        throw new Error(`Insufficient liquidity for this trade amount on Raydium`);
                    }
                    
                    throw new Error(`Raydium API error: ${errorMessage}`);
                }
                
                // Validate response structure - handle both old and new formats
                const hasValidData = data.data || data.routePlan || data.outAmount || data.routes;
                if (!hasValidData) {
                    throw new Error(`Invalid quote response structure from Raydium. Response: ${JSON.stringify(data)}`);
                }

                // Additional validation for quote data - check the new API format
                if (data.data) {
                    if (!data.data.outputAmount || data.data.outputAmount === '0') {
                        throw new Error('Invalid quote: output amount is zero or missing');
                    }
                } else if (data.outAmount && data.outAmount === '0') {
                    throw new Error('Invalid quote: output amount is zero or missing');
                }

                console.log(`[Raydium] Quote received successfully ${approach.description}`);
                
                // Reset circuit breaker on success
                this.circuitBreaker.failureCount = 0;
                this.circuitBreaker.isOpen = false;
                
                return data;
                
            } catch (error) {
                lastError = error;
                console.log(`[Raydium] Failed ${approach.description}: ${error.message}`);
                
                // If it's a version error, continue to next approach
                if (error.message.includes('TX_VERSION_ERROR') || error.message.includes('REQ_TX_VERSION_ERROR')) {
                    continue;
                }
                
                // For other errors, wait a bit before trying next approach
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // If all approaches failed, handle the error
        if (lastError) {
            this.handleRequestError(lastError);
            throw lastError;
        } else {
            const fallbackError = new Error('All quote approaches failed with unknown errors');
            this.handleRequestError(fallbackError);
            throw fallbackError;
        }
    }

    /**
     * Get priority fee information
     * @returns {Promise<Object>} Priority fee data
     */
    async getPriorityFee() {
        // Use fixed default values since API endpoints are consistently failing
        console.log('[Raydium] Using default priority fee values');
        return {
            success: true,
            data: {
                default: {
                    vh: 1000000, // very high: 0.001 SOL
                    h: 500000,   // high: 0.0005 SOL  
                    m: 100000    // medium: 0.0001 SOL
                }
            }
        };
    }

    /**
     * Create swap transaction
     * @param {Object} swapResponse - Response from getSwapQuote
     * @param {string} walletAddress - User wallet public key
     * @param {string} txVersion - Transaction version
     * @param {number} computeUnitPriceMicroLamports - Priority fee
     * @param {boolean} wrapSol - Whether to wrap SOL
     * @param {boolean} unwrapSol - Whether to unwrap SOL
     * @param {string} inputAccount - Input token account (optional)
     * @param {string} outputAccount - Output token account (optional)
     * @returns {Promise<Object>} Transaction data
     */
    async createSwapTransaction(swapResponse, walletAddress, txVersion = 'v0', computeUnitPriceMicroLamports, wrapSol = false, unwrapSol = true, inputAccount = undefined, outputAccount = undefined) {
        try {
            await this.rateLimit();
            this.checkCircuitBreaker();

            // Validate swap response
            if (!swapResponse || (!swapResponse.data && !swapResponse.routePlan)) {
                throw new Error('Invalid swap response provided to createSwapTransaction');
            }

            const requestBody = {
                computeUnitPriceMicroLamports: String(computeUnitPriceMicroLamports),
                swapResponse,
                txVersion,
                wallet: walletAddress,
                wrapSol,
                unwrapSol
            };

            // Only include account parameters if they exist
            if (inputAccount) {
                requestBody.inputAccount = inputAccount;
            }
            if (outputAccount) {
                requestBody.outputAccount = outputAccount;
            }

            console.log(`[Raydium] Creating swap transaction with body:`, JSON.stringify({
                ...requestBody,
                swapResponse: 'redacted for brevity'
            }, null, 2));

            const endpoints = [
                `${this.API_URLS.SWAP_HOST}/transaction/swap-base-in`
            ];

            let lastError = null;

            for (let i = 0; i < endpoints.length; i++) {
                try {
                    const response = await axios.post(
                        endpoints[i],
                        requestBody,
                        {
                            timeout: 30000,
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': '4TOOL-Trading-Bot/1.0'
                            }
                        }
                    );

                    if (response.status !== 200) {
                        throw new Error(`Raydium transaction API error: ${response.status} - ${response.statusText}`);
                    }

                    const data = response.data;
                    
                    // Check for specific error responses
                    if (!data.success) {
                        const errorMsg = data.msg || data.message || 'Unknown error';
                        if (errorMsg.includes('REQ_INPUT_ACCOUT_ERROR')) {
                            // Try again without specifying accounts - let Raydium create them
                            console.log(`[Raydium] Retrying without token accounts - letting Raydium handle account creation`);
                            
                            const retryBody = {
                                computeUnitPriceMicroLamports: requestBody.computeUnitPriceMicroLamports,
                                swapResponse: requestBody.swapResponse,
                                txVersion: requestBody.txVersion,
                                wallet: requestBody.wallet,
                                wrapSol: requestBody.wrapSol,
                                unwrapSol: requestBody.unwrapSol
                                // Intentionally omit inputAccount and outputAccount
                            };
                            
                            const retryResponse = await axios.post(
                                endpoints[i],
                                retryBody,
                                {
                                    timeout: 30000,
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'User-Agent': '4TOOL-Trading-Bot/1.0'
                                    }
                                }
                            );
                            
                            if (retryResponse.status === 200 && retryResponse.data.success) {
                                console.log(`[Raydium] Retry successful without token accounts`);
                                return retryResponse.data;
                            }
                        }
                        throw new Error(`Raydium transaction API error: ${errorMsg}`);
                    }
                    
                    if (!data.data || !Array.isArray(data.data)) {
                        throw new Error(`Invalid transaction response from Raydium: ${JSON.stringify(data)}`);
                    }

                    console.log(`[Raydium] Transaction created successfully, ${data.data.length} transactions`);
                    
                    // Reset circuit breaker on success
                    this.circuitBreaker.failureCount = 0;
                    this.circuitBreaker.isOpen = false;
                    
                    return data;
                    
                } catch (error) {
                    lastError = error;
                    console.log(`[Raydium] Transaction endpoint ${i + 1} failed: ${error.message}`);
                    
                    if (i < endpoints.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            this.handleRequestError(lastError);
            throw lastError;
            
        } catch (error) {
            this.handleRequestError(error);
            throw error;
        }
    }

    /**
     * Execute a complete swap operation
     * @param {string} inputMint - Input token mint
     * @param {string} outputMint - Output token mint  
     * @param {number} amount - Amount in lamports
     * @param {Object} wallet - Wallet keypair
     * @param {number} slippageBps - Slippage in basis points
     * @param {string} priorityLevel - Priority level ('vh', 'h', 'm')
     * @param {string} inputTokenAccount - Input token account address (optional)
     * @returns {Promise<Object>} Swap result
     */
    async executeSwap(inputMint, outputMint, amount, wallet, slippageBps = 50, priorityLevel = 'h', inputTokenAccount = null) {
        try {
            console.log(`[Raydium] Starting swap: ${amount} lamports from ${inputMint} to ${outputMint}`);
            
            const isInputSol = inputMint === NATIVE_MINT.toString();
            const isOutputSol = outputMint === NATIVE_MINT.toString();
            const txVersion = 'V0'; // Use versioned transactions by default
            const isV0Tx = txVersion === 'V0';

            // Step 1: Get priority fee
            const priorityFeeData = await this.getPriorityFee();
            const computeUnitPriceMicroLamports = priorityFeeData.data.default[priorityLevel];
            
            console.log(`[Raydium] Using priority fee: ${computeUnitPriceMicroLamports} micro lamports (${priorityLevel})`);

            // Step 2: Get swap quote
            const swapResponse = await this.getSwapQuote(
                inputMint,
                outputMint,
                amount,
                slippageBps,
                txVersion
            );

            // Step 3: Get token accounts if needed
            let inputTokenAcc, outputTokenAcc;
            if (!isInputSol || !isOutputSol) {
                try {
                    const tokenAccounts = await this.getTokenAccounts(wallet.publicKey);
                    
                    if (!isInputSol) {
                        // Use provided input token account if available, otherwise find from wallet
                        if (inputTokenAccount) {
                            inputTokenAcc = inputTokenAccount; // Already a string
                            console.log(`[Raydium] Using provided input token account: ${inputTokenAccount}`);
                        } else {
                            const foundAccount = tokenAccounts.find(acc => acc.mint === inputMint);
                            if (foundAccount) {
                                inputTokenAcc = foundAccount.address; // Already a string
                                console.log(`[Raydium] Found input token account: ${foundAccount.address} for mint ${inputMint} with balance ${foundAccount.uiAmount}`);
                            } else {
                                console.log(`[Raydium] No existing token account found for input mint: ${inputMint}. Will let Raydium handle account creation.`);
                            }
                        }
                    }
                    if (!isOutputSol) {
                        const foundAccount = tokenAccounts.find(acc => acc.mint === outputMint);
                        if (foundAccount) {
                            outputTokenAcc = foundAccount.address; // Already a string
                            console.log(`[Raydium] Found output token account: ${foundAccount.address} for mint ${outputMint} with balance ${foundAccount.uiAmount}`);
                        } else {
                            console.log(`[Raydium] No existing token account found for output mint: ${outputMint}. Will let Raydium handle account creation.`);
                        }
                    }
                } catch (error) {
                    console.error('[Raydium] Error getting token accounts:', error.message);
                    console.log('[Raydium] Proceeding without token accounts - Raydium will handle account creation');
                }
            }

            // Step 4: Create swap transaction
            console.log(`[Raydium] Creating transaction with accounts - Input: ${inputTokenAcc || 'SOL'}, Output: ${outputTokenAcc || 'SOL'}`);
            
            const swapTransactions = await this.createSwapTransaction(
                swapResponse,
                wallet.publicKey.toBase58(),
                txVersion,
                computeUnitPriceMicroLamports,
                isInputSol,
                isOutputSol,
                inputTokenAcc, // Pass as string
                outputTokenAcc // Pass as string
            );

            // Step 5: Deserialize transactions
            const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'));
            const allTransactions = allTxBuf.map((txBuf) =>
                isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
            );

            console.log(`[Raydium] Total ${allTransactions.length} transactions to execute`);

            // Step 6: Sign and execute transactions
            const signatures = [];
            let idx = 0;

            if (!isV0Tx) {
                // Legacy transactions
                for (const tx of allTransactions) {
                    console.log(`[Raydium] ${++idx} transaction sending...`);
                    const transaction = tx;
                    transaction.sign(wallet);
                    const txId = await sendAndConfirmTransaction(
                        this.connection, 
                        transaction, 
                        [wallet], 
                        { skipPreflight: true }
                    );
                    console.log(`[Raydium] ${idx} transaction confirmed, txId: ${txId}`);
                    signatures.push(txId);
                }
            } else {
                // Versioned transactions
                for (const tx of allTransactions) {
                    idx++;
                    const transaction = tx;
                    transaction.sign([wallet]);
                    
                    const txId = await this.connection.sendTransaction(transaction, { 
                        skipPreflight: true 
                    });
                    
                    const { lastValidBlockHeight, blockhash } = await this.connection.getLatestBlockhash({
                        commitment: 'finalized',
                    });
                    
                    console.log(`[Raydium] ${idx} transaction sending..., txId: ${txId}`);
                    
                    await this.connection.confirmTransaction(
                        {
                            blockhash,
                            lastValidBlockHeight,
                            signature: txId,
                        },
                        'confirmed'
                    );
                    
                    console.log(`[Raydium] ${idx} transaction confirmed`);
                    signatures.push(txId);
                }
            }

            // Return the result with enhanced information
            return {
                success: true,
                signatures,
                swapResponse,
                priorityFee: computeUnitPriceMicroLamports,
                transactionCount: allTransactions.length,
                provider: 'raydium',
                inputMint,
                outputMint,
                inputAmount: amount,
                outputAmount: swapResponse?.data?.outputAmount || swapResponse?.outAmount || 0,
                priceImpact: swapResponse?.data?.priceImpactPct || swapResponse?.priceImpactPct || 0
            };

        } catch (error) {
            console.error('[Raydium] Swap execution failed:', error);
            throw error;
        }
    }

    /**
     * Get token accounts for a wallet
     * @param {PublicKey} walletPublicKey - Wallet public key
     * @returns {Promise<Array>} Token accounts
     */
    async getTokenAccounts(walletPublicKey) {
        try {
            console.log(`[Raydium] Getting token accounts for wallet: ${walletPublicKey.toString()}`);
            
            // Get both regular SPL token accounts and Token 2022 accounts
            const [splResponse, token2022Response] = await Promise.all([
                this.connection.getTokenAccountsByOwner(
                    walletPublicKey,
                    { programId: TOKEN_PROGRAM_ID }
                ).catch(err => {
                    console.log(`[Raydium] Error getting SPL token accounts: ${err.message}`);
                    return { value: [] };
                }),
                this.connection.getTokenAccountsByOwner(
                    walletPublicKey,
                    { programId: TOKEN_2022_PROGRAM_ID }
                ).catch(err => {
                    console.log(`[Raydium] Error getting Token 2022 accounts: ${err.message}`);
                    return { value: [] };
                })
            ]);
            
            const allAccounts = [...splResponse.value, ...token2022Response.value];
            console.log(`[Raydium] Raw account count: SPL=${splResponse.value.length}, Token2022=${token2022Response.value.length}, Total=${allAccounts.length}`);
            
            const accounts = [];
            
            for (const acc of allAccounts) {
                try {
                    // Parse account data
                    const parsedAccount = await this.connection.getParsedAccountInfo(acc.pubkey);
                    if (parsedAccount.value && parsedAccount.value.data && parsedAccount.value.data.parsed) {
                        const parsedInfo = parsedAccount.value.data.parsed.info;
                        
                        const account = {
                            address: acc.pubkey.toString(),
                            mint: parsedInfo.mint,
                            amount: parsedInfo.tokenAmount?.amount || '0',
                            decimals: parsedInfo.tokenAmount?.decimals || 0,
                            uiAmount: parsedInfo.tokenAmount?.uiAmount || 0
                        };
                        
                        // Only include accounts with positive balance for selling
                        if (parseFloat(account.amount) > 0) {
                            accounts.push(account);
                            console.log(`[Raydium] Found token account: ${account.address} for mint ${account.mint} with balance ${account.uiAmount}`);
                        }
                    }
                } catch (parseError) {
                    console.log(`[Raydium] Error parsing token account ${acc.pubkey.toString()}: ${parseError.message}`);
                }
            }
            
            console.log(`[Raydium] Found ${accounts.length} token accounts with positive balances for wallet`);
            return accounts;
        } catch (error) {
            console.error('[Raydium] Error getting token accounts:', error);
            return [];
        }
    }

    /**
     * Rate limiting implementation
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`[Raydium] Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Circuit breaker implementation
     */
    checkCircuitBreaker() {
        const now = Date.now();
        
        if (this.circuitBreaker.isOpen) {
            if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
                console.log('[Raydium] Circuit breaker timeout reached, closing circuit');
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failureCount = 0;
            } else {
                throw new Error('Raydium API is temporarily unavailable due to high error rate. Please try again in a minute.');
            }
        }
    }

    /**
     * Enhanced error handling with exponential backoff and better fallbacks
     */
    handleRequestError(error) {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        // Log detailed error information
        console.error(`[Raydium] Request failed: ${error.message}`, {
            error: error.message,
            stack: error.stack,
            failureCount: this.circuitBreaker.failureCount,
            timestamp: new Date().toISOString()
        });

        // Circuit breaker logic
        if (this.circuitBreaker.failureCount >= 5) {
            this.circuitBreaker.isOpen = true;
            console.warn('[Raydium] Circuit breaker opened due to repeated failures');
            
            // Auto-reset after 5 minutes
            setTimeout(() => {
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failureCount = 0;
                console.info('[Raydium] Circuit breaker auto-reset after 5 minutes');
            }, 5 * 60 * 1000);
        }
    }

    /**
     * Get quote with improved error handling and fallbacks
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = 100) {
        // Check circuit breaker
        if (this.circuitBreaker.isOpen) {
            const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
            if (timeSinceLastFailure < 5 * 60 * 1000) { // 5 minutes
                throw new Error('Raydium service temporarily unavailable due to repeated failures. Please try again in a few minutes.');
            }
        }

        // Validate inputs
        if (!inputMint || typeof inputMint !== 'string') {
            throw new Error(`Invalid input mint address: ${inputMint}`);
        }
        if (!outputMint || typeof outputMint !== 'string') {
            throw new Error(`Invalid output mint address: ${outputMint}`);
        }
        if (inputMint === outputMint) {
            throw new Error('Input and output mint addresses cannot be the same');
        }
        if (!amount || amount <= 0) {
            throw new Error(`Invalid amount: ${amount}. Amount must be greater than 0`);
        }
        if (slippageBps < 0 || slippageBps > 5000) {
            throw new Error(`Invalid slippage: ${slippageBps}. Slippage must be between 0 and 5000 basis points`);
        }

        // Multiple API endpoints with fallback
        const approaches = [
            {
                description: 'Primary Raydium API',
                url: 'https://api.raydium.io/v2/sdk/liquidity/mainnet/quote',
                method: 'POST',
                data: {
                    inputMint,
                    outputMint,
                    amount: amount.toString(),
                    slippage: slippageBps
                }
            },
            {
                description: 'Alternative Raydium API',
                url: 'https://api.raydium.io/v2/sdk/liquidity/mainnet/quote',
                method: 'POST',
                data: {
                    inputMint,
                    outputMint,
                    amount: amount.toString(),
                    slippage: Math.min(slippageBps * 1.1, 5000) // Slightly higher slippage
                }
            },
            {
                description: 'Fallback with reduced requirements',
                url: 'https://api.raydium.io/v2/sdk/liquidity/mainnet/quote',
                method: 'POST',
                data: {
                    inputMint,
                    outputMint,
                    amount: (amount * 0.95).toString(), // Slightly reduced amount
                    slippage: Math.min(slippageBps * 1.2, 5000)
                }
            }
        ];

        let lastError = null;
        const axios = require('axios');

        for (let i = 0; i < approaches.length; i++) {
            const approach = approaches[i];
            try {
                console.log(`[Raydium] Trying ${approach.description} (attempt ${i + 1}/${approaches.length})`);
                
                const response = await axios({
                    method: approach.method,
                    url: approach.url,
                    data: approach.data,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Raydium-Trading-Bot/1.0'
                    },
                    timeout: 10000 // 10 second timeout
                });

                if (response.status !== 200) {
                    throw new Error(`Raydium API error: ${response.status} - ${response.statusText}`);
                }

                const data = response.data;
                if (!data) {
                    throw new Error('Empty response from Raydium API');
                }

                // Check for error response
                if (data.error || data.msg) {
                    const errorMessage = data.msg || data.error || data.message || 'Unknown error from Raydium API';
                    
                    // If it's a version error, try next approach
                    if (errorMessage.includes('TX_VERSION_ERROR') || errorMessage.includes('REQ_TX_VERSION_ERROR')) {
                        console.log(`[Raydium] Approach failed (${approach.description}): ${errorMessage}, trying next...`);
                        lastError = new Error(errorMessage);
                        continue;
                    }

                    // Handle specific error cases
                    if (errorMessage.includes('pool not found') || errorMessage.includes('no route') || errorMessage.includes('ROUTE_NOT_FOUND')) {
                        throw new Error(`No trading pool found for this token pair on Raydium: ${inputMint} -> ${outputMint}`);
                    }
                    if (errorMessage.includes('insufficient liquidity')) {
                        throw new Error(`Insufficient liquidity for this trade amount on Raydium`);
                    }
                    if (errorMessage.includes('REQ_TX_VERSION_ERROR')) {
                        // This is a version compatibility issue, not a route issue
                        console.log(`[Raydium] Version error: ${errorMessage}, will try next approach`);
                        lastError = new Error(errorMessage);
                        continue;
                    }
                    throw new Error(`Raydium API error: ${errorMessage}`);
                }

                // Validate quote response
                if (!data.outAmount || data.outAmount === '0') {
                    throw new Error(`Invalid quote response structure from Raydium. Response: ${JSON.stringify(data)}`);
                }

                // Additional validation
                if (!data.outAmount || parseFloat(data.outAmount) <= 0) {
                    throw new Error('Invalid quote: output amount is zero or missing');
                }

                // Success - reset circuit breaker
                this.circuitBreaker.failureCount = 0;
                this.circuitBreaker.isOpen = false;

                return {
                    inputMint,
                    outputMint,
                    inAmount: amount.toString(),
                    outAmount: data.outAmount,
                    priceImpact: data.priceImpact || 0,
                    fee: data.fee || 0,
                    otherAmountThreshold: data.otherAmountThreshold || data.outAmount,
                    swapMode: data.swapMode || 'ExactIn'
                };

            } catch (error) {
                lastError = error;
                                    console.log(`[Raydium] Failed ${approach.description}: ${error.message}`);
                
                // If it's a version error, continue to next approach
                if (error.message.includes('TX_VERSION_ERROR') || error.message.includes('REQ_TX_VERSION_ERROR')) {
                    continue;
                }

                // For other errors, wait a bit before trying next approach
                if (i < approaches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Progressive delay
                }
            }
        }

        // If all approaches failed, handle the error
        if (lastError) {
            this.handleRequestError(lastError);
            throw lastError;
        } else {
            const fallbackError = new Error('All quote approaches failed with unknown errors');
            this.handleRequestError(fallbackError);
            throw fallbackError;
        }
    }
}

module.exports = RaydiumService;
