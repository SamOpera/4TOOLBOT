const { LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const crypto = require('crypto');
const TokenAnalysis = require('./tokenAnalysis');

class BuyManager {
    constructor(config, tradingExecution, db, manualManagementService) {
        this.config = config;
        this.tradingExecution = tradingExecution;
        this.db = db;
        this.manualManagementService = manualManagementService;
        this.pendingBuyAmount = new Map(); // Store pending buy amounts for users
        this.lastFailedOrder = new Map(); // Store last failed order details for retry
        this.tokenAnalysis = new TokenAnalysis();
    }

    async initiateBuy(chatId, telegramId, bot) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await bot.sendMessage(chatId, 'Please create or import a wallet first to buy tokens.');
                return;
            }

            await bot.sendMessage(chatId, 'Please paste or scan the token address you want to buy:');
            this.pendingBuyAmount.set(telegramId, { status: 'waiting_for_address' });
        } catch (error) {
            console.error('Error initiating buy:', error);
            await bot.sendMessage(chatId, 'Sorry, something went wrong while initiating the buy process.');
        }
    }

    async confirmBuy(chatId, telegramId, tokenAddress, bot) {
        try {
            // Store the token address for the next step
            this.pendingBuyAmount.set(telegramId, {
                status: 'waiting_for_amount',
                tokenAddress
            });

            const message = `
*🛒 Buy ${tokenAddress}*

Please enter the amount of SOL you want to spend:

*Quick Amounts:*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '0.1 SOL', callback_data: 'buy_amount_0.1' },
                        { text: '0.5 SOL', callback_data: 'buy_amount_0.5' },
                        { text: '1 SOL', callback_data: 'buy_amount_1' }
                    ],
                    [
                        { text: '2 SOL', callback_data: 'buy_amount_2' },
                        { text: '5 SOL', callback_data: 'buy_amount_5' },
                        { text: '10 SOL', callback_data: 'buy_amount_10' }
                    ],
                    [
                        { text: '✏️ Custom Amount', callback_data: `custom_buy_${tokenAddress}` }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: 'cancel_buy' }
                    ]
                ]
            };

            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error confirming buy:', error);
            await bot.sendMessage(chatId, 'Sorry, something went wrong while confirming the buy.');
        }
    }

    async processBuyAmount(chatId, telegramId, amount, bot) {
        try {
            const pendingBuy = this.pendingBuyAmount.get(telegramId);
            if (!pendingBuy || pendingBuy.status !== 'waiting_for_amount') {
                throw new Error('No pending buy found');
            }

            // Convert amount to number and validate
            const solAmount = parseFloat(amount);
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid amount. Please enter a positive number.');
            }

            // Store the amount for execution
            this.pendingBuyAmount.set(telegramId, {
                ...pendingBuy,
                status: 'ready_to_execute',
                amount: solAmount
            });

            const message = `
*🛒 Confirm Buy Order*

*Token:* \`${pendingBuy.tokenAddress}\`
*Amount:* ${solAmount} SOL

Please confirm your order:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm Buy', callback_data: `confirm_buy_execute_${solAmount}` },
                        { text: '❌ Cancel', callback_data: 'cancel_buy' }
                    ]
                ]
            };

            await bot.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error processing buy amount:', error);
            await bot.sendAndStoreMessage(chatId, `Sorry, couldn't process the buy: ${error.message}`);
            this.clearPendingBuy(telegramId);
        }
    }

    async executeBuy(chatId, telegramId, amount, bot) {
        const pendingBuy = this.pendingBuyAmount.get(telegramId);
        let solAmount;
        
        try {
            if (!pendingBuy || pendingBuy.status !== 'ready_to_execute') {
                throw new Error('No pending buy found or buy not ready to execute');
            }

            // Convert amount to number and validate
            solAmount = parseFloat(amount);
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid amount. Please enter a positive number.');
            }

            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*⚠️ No Active Wallet Found*

Please create or import a wallet first to start trading.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Trade', callback_data: 'trade' }
                        ]
                    ]
                };

                await bot.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Decrypt the private key
            const decryptedKey = this.decryptPrivateKey(activeWallet.encrypted_private_key, telegramId.toString());
            
            // Convert the decrypted key to Uint8Array
            let keypair;
            try {
                // The decrypted key should be in base64 format
                const secretKey = Buffer.from(decryptedKey, 'base64');
                if (secretKey.length !== 64) {
                    throw new Error('Invalid private key length');
                }
                keypair = Keypair.fromSecretKey(secretKey);
            } catch (error) {
                console.error('Error creating keypair:', error);
                throw new Error('Invalid wallet key format');
            }

            // Set the wallet in trading execution
            this.tradingExecution.setUserWallet(keypair);

            // Show processing message
            await bot.sendAndStoreMessage(chatId, `
*🔄 Processing Buy Order*

Please wait while we process your order...`, {
                parse_mode: 'Markdown'
            });

            // Execute the buy
            const result = await this.tradingExecution.executeBuy(
                user.id,
                pendingBuy.tokenAddress,
                solAmount
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to execute buy');
            }

            // Additional verification: Double-check transaction success
            await this.verifyBuySuccess(result.signature, pendingBuy.tokenAddress, user.id);

            // Trigger manual management monitoring for this token
            if (this.manualManagementService) {
                try {
                    await this.manualManagementService.addTokenToMonitoring(
                        user.id,
                        pendingBuy.tokenAddress,
                        result.tokenPrice,
                        result.tokensReceived
                    );
                } catch (err) {
                    console.error('Error adding token to manual management monitoring:', err);
                }
            }

            // Format success message
            const message = `
*✅ Buy Order Executed Successfully!*

*Token:* ${result.name} (${result.symbol})
*Amount:* ${result.tokensReceived.toFixed(6)} ${result.symbol}
*Price:* ${result.tokenPrice.toFixed(6)} SOL
*Total Cost:* ${solAmount} SOL

*Fees:*
• Bot Fee: ${result.botFee.toFixed(4)} SOL
• Network Fee: ${result.networkFee.toFixed(4)} SOL

*Transaction:* [View on Solscan](https://solscan.io/tx/${result.signature})

*Price Impact:* ${result.priceImpact.toFixed(2)}%`;

            await bot.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            // Clear the pending buy
            this.clearPendingBuy(telegramId);
        } catch (error) {
            console.error('Error executing buy:', error);
            
            // Store failed order details for retry functionality if we have the order details
            if (pendingBuy && solAmount) {
                this.lastFailedOrder.set(telegramId, {
                    tokenAddress: pendingBuy.tokenAddress,
                    amount: solAmount,
                    timestamp: Date.now()
                });
                console.log(`Stored failed order for retry: ${pendingBuy.tokenAddress}, ${solAmount} SOL`);
            }
            
            // Format error message based on error type
            let errorMessage;
            if (error.message.includes('Transaction expired')) {
                errorMessage = `
*⚠️ Transaction Expired*

The transaction has expired. You can retry with the same details or start a new order.`;
            } else if (error.message.includes('Insufficient SOL balance')) {
                errorMessage = `
*⚠️ Insufficient Balance*

You don't have enough SOL to complete this transaction. Please ensure you have enough SOL to cover:
• Transaction amount
• Network fees
• Bot fees`;
            } else {
                // Build a clean, modern error message with provider details
                const raw = error.message || 'Unknown error';
                const rayMatch = raw.match(/Raydium error:\s*([\s\S]*?)(?:\n\n|$)/);
                const jupLogsIdx = raw.indexOf('Jupiter transaction simulation logs:');
                let jupLogs = '';
                if (jupLogsIdx !== -1) {
                    jupLogs = raw.substring(jupLogsIdx + 'Jupiter transaction simulation logs:'.length).trim();
                }

                const raydiumLine = rayMatch ? rayMatch[1].trim() : null;

                let tips = [];
                if (jupLogs && /insufficient lamports/i.test(jupLogs)) {
                    tips.push('Top up SOL to cover account creation and fees (~0.03 SOL).');
                }
                if (raydiumLine && /No trading pool found|ROUTE_NOT_FOUND/i.test(raydiumLine)) {
                    tips.push('Route not available on Raydium. Try a smaller amount or different token.');
                }

                const tipsBlock = tips.length ? `\n\n*Suggestions:*\n- ${tips.join('\n- ')}` : '';

                const jupiterBlock = jupLogs
                    ? `\n\n*Jupiter Simulation Logs:*\n\n\`\`\`\n${jupLogs}\n\`\`\``
                    : '';

                errorMessage = `
*❌ Trade Failed*

${raydiumLine ? `*Raydium:* \`${raydiumLine}\`` : 'We could not complete your buy order.'}${tipsBlock}${jupiterBlock}

You can retry with the same details or start a new order.`;
            }

            // Add retry keyboard if order details were stored
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Retry Same Order', callback_data: 'retry_last_buy' },
                        { text: '🛒 New Order', callback_data: 'buy_token' }
                    ],
                    [
                        { text: '◀️ Back to Trade', callback_data: 'trade' }
                    ]
                ]
            };

            await bot.sendAndStoreMessage(chatId, errorMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            
            this.clearPendingBuy(telegramId);
        }
    }

    /**
     * Handles custom buy callback action, e.g. _<tokenAddress>
     * Prompts user to enter a custom amount for the specified token.
     */
    async handleCustomBuyCallback(chatId, telegramId, tokenAddress, bot) {
        try {
            // Store the token address and set status to waiting for custom amount
            this.pendingBuyAmount.set(telegramId, {
                status: 'waiting_for_custom_amount',
                tokenAddress
            });

            const message = `\n*🛒 Buy ${tokenAddress}*\n\nPlease enter the custom amount of SOL you want to spend:`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'cancel_buy' }
                    ]
                ]
            };
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling custom buy callback:', error);
            await bot.sendMessage(chatId, 'Sorry, something went wrong while handling custom buy.');
        }
    }

    /**
     * Processes custom buy amount after user input when status is 'waiting_for_custom_amount'.
     */
    async processCustomBuyAmount(chatId, telegramId, amount, bot) {
        try {
            const pendingBuy = this.pendingBuyAmount.get(telegramId);
            if (!pendingBuy || pendingBuy.status !== 'waiting_for_custom_amount') {
                throw new Error('No pending custom buy found');
            }

            // Convert amount to number and validate
            const solAmount = parseFloat(amount);
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid amount. Please enter a positive number.');
            }

            // Store the amount for execution
            this.pendingBuyAmount.set(telegramId, {
                ...pendingBuy,
                status: 'ready_to_execute',
                amount: solAmount
            });

            const message = `\n*🛒 Confirm Buy Order*\n\n*Token:* \`${pendingBuy.tokenAddress}\`\n*Amount:* ${solAmount} SOL\n\nPlease confirm your order:`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm Buy', callback_data: `confirm_buy_execute_${pendingBuy.tokenAddress}_${solAmount}` },
                        { text: '❌ Cancel', callback_data: 'cancel_buy' }
                    ]
                ]
            };
            await bot.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error processing custom buy amount:', error);
            await bot.sendAndStoreMessage(chatId, `Sorry, couldn't process the custom buy: ${error.message}`);
            this.clearPendingBuy(telegramId);
        }
    }

    decryptPrivateKey(encryptedData, password) {
        try {
            const [ivHex, encrypted] = encryptedData.split(':');
            if (!ivHex || !encrypted) {
                throw new Error('Invalid encrypted data format');
            }

            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(password, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Error decrypting private key:', error);
            throw new Error('Failed to decrypt private key');
        }
    }

    hasPendingBuy(telegramId) {
        return this.pendingBuyAmount.has(telegramId);
    }

    clearPendingBuy(telegramId) {
        this.pendingBuyAmount.delete(telegramId);
    }

    async verifyBuySuccess(signature, tokenAddress, userId) {
        try {
            console.log(`[verifyBuySuccess] Verifying buy success for user ${userId}, signature: ${signature}`);
            
            // Wait a bit for transaction to be fully confirmed
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Get transaction details
            const { Connection } = require('@solana/web3.js');
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            
            const transaction = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                throw new Error('Transaction not found on blockchain');
            }

            if (transaction.meta && transaction.meta.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(transaction.meta.err)}`);
            }

            // Verify that tokens were actually received
            if (transaction.meta && transaction.meta.postTokenBalances) {
                const tokenTransfers = transaction.meta.postTokenBalances.filter(
                    balance => balance.mint === tokenAddress
                );
                
                if (tokenTransfers.length === 0) {
                    throw new Error('No token transfer detected in transaction');
                }

                // Check if any token balance increased (indicating successful buy)
                const preBalances = transaction.meta.preTokenBalances || [];
                const postBalances = transaction.meta.postTokenBalances || [];
                
                let tokenReceived = false;
                for (const postBalance of postBalances) {
                    if (postBalance.mint === tokenAddress) {
                        const preBalance = preBalances.find(b => 
                            b.accountIndex === postBalance.accountIndex && 
                            b.mint === tokenAddress
                        );
                        
                        if (!preBalance || parseFloat(postBalance.uiTokenAmount.uiAmount) > parseFloat(preBalance.uiTokenAmount.uiAmount)) {
                            tokenReceived = true;
                            break;
                        }
                    }
                }

                if (!tokenReceived) {
                    throw new Error('No tokens were received in the transaction');
                }
            }

            console.log(`[verifyBuySuccess] Buy verification successful for user ${userId}`);
            return true;
        } catch (error) {
            console.error(`[verifyBuySuccess] Buy verification failed for user ${userId}: ${error.message}`);
            throw new Error(`Buy verification failed: ${error.message}`);
        }
    }

    /**
     * Retry the last failed buy order without asking for token address or amount again
     */
    async retryLastFailedOrder(chatId, telegramId, bot) {
        try {
            const lastOrder = this.lastFailedOrder.get(telegramId);
            
            if (!lastOrder) {
                await bot.sendAndStoreMessage(chatId, 'No previous order found to retry.');
                return;
            }

            // Check if the order is not too old (e.g., 1 hour)
            const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
            if (Date.now() - lastOrder.timestamp > oneHour) {
                this.lastFailedOrder.delete(telegramId);
                await bot.sendAndStoreMessage(chatId, 'Previous order expired. Please start a new buy order.');
                return;
            }

            // Set up the pending buy with the same parameters
            this.pendingBuyAmount.set(telegramId, {
                status: 'ready_to_execute',
                tokenAddress: lastOrder.tokenAddress,
                amount: lastOrder.amount
            });

            // Show confirmation with the same parameters
            const message = `
*🔄 Retry Buy Order*

*Token:* \`${lastOrder.tokenAddress}\`
*Amount:* ${lastOrder.amount} SOL

Retrying your previous order. Please confirm:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm Retry', callback_data: `confirm_buy_execute_${lastOrder.amount}` },
                        { text: '❌ Cancel', callback_data: 'cancel_buy' }
                    ]
                ]
            };

            await bot.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error retrying last failed order:', error);
            await bot.sendAndStoreMessage(chatId, 'Sorry, there was an error retrying your order. Please try again.');
        }
    }

    /**
     * Check if user has a recent failed order that can be retried
     */
    hasRecentFailedOrder(telegramId) {
        const lastOrder = this.lastFailedOrder.get(telegramId);
        if (!lastOrder) return false;

        // Check if order is not older than 1 hour
        const oneHour = 60 * 60 * 1000;
        return (Date.now() - lastOrder.timestamp) <= oneHour;
    }

    /**
     * Get the last failed order details
     */
    getLastFailedOrder(telegramId) {
        return this.lastFailedOrder.get(telegramId);
    }
}

module.exports = BuyManager;