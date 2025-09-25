const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');
const TokenAnalysis = require('./tokenAnalysis');

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_\*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function escapeMarkdownV2(text) {
    if (!text) return '';
    return text.toString()
        .replace(/([_\*\[\]()~`>#+\-=|{}\.!])/g, '\\$1'); 
}

function formatSellConfirmation(orderData) {
    const liquidity = orderData.liquidity ? orderData.liquidity.toLocaleString() : 'Unknown';
    const volume24h = orderData.volume24h ? orderData.volume24h.toLocaleString() : 'Unknown';
    
    return `🔍 Sell Order Confirmation

Token: ${orderData.tokenName}
Amount to Sell: ${orderData.amount} tokens (${orderData.displayAmount})
💰 Estimated SOL: ~${orderData.estimatedSOL} SOL
📊 Price Impact: ${orderData.priceImpact}%

Current Market Data:
${orderData.marketData}

⚠️ Important Warnings:
1. Verify the token address carefully
2. Check the price impact before proceeding  
3. Consider market conditions
4. Transaction fees will be deducted

Are you sure you want to proceed with this sell order?`;
}

function formatSellConfirmationMarkdownV2(orderData) {
    const tokenName = escapeMarkdownV2(orderData.tokenName || 'Unknown Token');
    const amount = escapeMarkdownV2((orderData.amount || '0').toString());
    let displayAmount = escapeMarkdownV2(((orderData.displayAmount || '0').replace(/\(\s*(\d+)%\s*\)/, '$1%')).toString());
    const estimatedSOL = escapeMarkdownV2((orderData.estimatedSOL || '0').toString());
    const priceImpact = escapeMarkdownV2((orderData.priceImpact || '0').toString());
    const marketData = escapeMarkdownV2((orderData.marketData || 'Current market data unavailable').toString());

    return `*🔍 Sell Order Confirmation*\n\n*Token:* ${tokenName}\n*Amount to Sell:* ${amount} tokens ${displayAmount}\n*Estimated SOL:* \\~${estimatedSOL} SOL\n*Price Impact:* ${priceImpact}%\n\n*Current Market Data:*\n${marketData}\n\n*Important Warnings:*\n1\. Verify the token address carefully\n2\. Check the price impact before proceeding\n3\. Consider market conditions\n4\. Transaction fees will be deducted\n\nAre you sure you want to proceed with this sell order\\?`;
}

class SellManager {
    constructor(config, tradingExecution, db, messageManager) {
        this.config = config;
        this.tradingExecution = tradingExecution;
        this.db = db;
        this.messageManager = messageManager;
        this.pendingSell = new Map(); 
        this.pendingSellByKey = {}; 
        this.sellMessageIds = new Map(); 
        this.tokenAnalysis = new TokenAnalysis();
    }

    generateShortKey(length = 8) {
        return Math.random().toString(36).substr(2, length);
    }

    async trackSellMessageId(telegramId, sentMessage) {
        if (!sentMessage || !sentMessage.message_id) return;
        if (!this.sellMessageIds.has(telegramId)) {
            this.sellMessageIds.set(telegramId, []);
        }
        this.sellMessageIds.get(telegramId).push(sentMessage.message_id);
    }

    async sendTelegramMessage(chatId, orderData, reply_markup = undefined, telegramId = null) {
        const plainMessage = formatSellConfirmation(orderData);
        console.log('[TelegramMessage] Sending plain text message:', plainMessage);
        const sentMessage = await this.messageManager.sendAndStoreMessage(chatId, plainMessage, reply_markup ? { reply_markup } : undefined);
        if (telegramId) {
            await this.trackSellMessageId(telegramId, sentMessage);
        }
        console.log('Message sent successfully with plain text');
        return sentMessage;
    }

    async initiateSell(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.safeSendMessage(chatId, 'Please create or import a wallet first to sell tokens.', {}, 3, telegramId);
                return;
            }

            if (activeWallet.is_locked) {
                await this.safeSendMessage(chatId, 'Please unlock your wallet first to start selling.', {}, 3, telegramId);
                return;
            }

            const tokenHoldings = await this.getUserTokenHoldings(activeWallet.public_key);

            if (tokenHoldings.length === 0) {
                await this.safeSendMessage(chatId, 'No tokens found in your wallet to sell.', {}, 3, telegramId);
                return;
            }

            await this.showTokenHoldings(chatId, telegramId, tokenHoldings);
        } catch (error) {
            console.error('Error initiating sell:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while initiating the sell process.', {}, 3, telegramId);
        }
    }

    async showTokenHoldings(chatId, telegramId, holdings) {
        try {
            let message = `
*💰 Your Token Holdings*

Select a token to sell:

`;

            const keyboard = {
                inline_keyboard: []
            };

            holdings.forEach((holding, index) => {
                let displayName = (holding.name && holding.name !== 'Unknown Token') ? holding.name : ((holding.symbol && holding.symbol !== 'UNKNOWN') ? holding.symbol : (holding.mint ? holding.mint.slice(0, 4) + '...' : 'Token'));
                const tokenValue = holding.balance * (holding.price || 0);
                message += `${index + 1}. **${displayName}**\n`;
                message += `   Balance: ${holding.balance.toFixed(6)}\n`;
                message += `   Value: $${tokenValue.toFixed(2)}\n`;
                message += `   Address: \`${holding.address}\`\n\n`;

                if (index < 10) {
                    keyboard.inline_keyboard.push([{
                        text: `${displayName} (${holding.balance.toFixed(2)})`,
                        callback_data: `sell_token_${holding.mint}` 
                    }]);
                }
            });

            keyboard.inline_keyboard.push([
                { text: '🔄 Refresh Holdings', callback_data: 'refresh_holdings' },
                { text: '◀️ Back to Trade', callback_data: 'trade' }
            ]);
            await this.safeSendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }, 3, telegramId);
        } catch (error) {
            console.error('Error showing token holdings:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while fetching your token holdings.', {}, 3, telegramId);
        }
    }

    async handleTokenSell(chatId, telegramId, tokenAddress) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            const balance = await this.tradingExecution.getTokenBalance(
                new (require('@solana/web3.js').PublicKey)(activeWallet.public_key), 
                tokenAddress
            );

            if (balance === 0) {
                await this.safeSendMessage(chatId, 'You don\'t have any of this token to sell.', {}, 3, telegramId);
                return;
            }

            const tokenInfo = await this.tradingExecution.getTokenInfo(tokenAddress);
            let displayName = (tokenInfo.name && tokenInfo.name !== 'Unknown Token') ? tokenInfo.name : ((tokenInfo.symbol && tokenInfo.symbol !== 'UNKNOWN') ? tokenInfo.symbol : (tokenAddress ? tokenAddress.slice(0, 4) + '...' : 'Token'));
            this.pendingSell.set(telegramId, {
                status: 'waiting_for_amount',
                tokenAddress,
                balance,
                tokenInfo: { ...tokenInfo, displayName }
            });
            console.log('[SellManager] Set pendingSell for', telegramId, this.pendingSell.get(telegramId));

            const message = `\n*💰 Sell ${displayName}*\n\n*Your Balance:* ${balance.toFixed(6)} tokens\n*Token Address:* \`${tokenAddress}\`\n\nSelect sell amount:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '25%', callback_data: `sell_percent_25_${tokenAddress}` },
                        { text: '50%', callback_data: `sell_percent_50_${tokenAddress}` }
                    ],
                    [
                        { text: '75%', callback_data: `sell_percent_75_${tokenAddress}` },
                        { text: '100%', callback_data: `sell_percent_100_${tokenAddress}` }
                    ],
                    [
                        { text: 'Custom Amount', callback_data: `sell_custom_${tokenAddress}` }
                    ],
                    [
                        { text: '◀️ Back to Holdings', callback_data: 'sell_token' }
                    ]
                ]
            };

            await this.safeSendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }, 3, telegramId);

        } catch (error) {
            console.error('Error handling token sell:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while preparing the sell order.', {}, 3, telegramId);
        }
    }

    async handleSellPercent(chatId, telegramId, tokenAddress, percentage) {
        try {
            const pendingSell = this.pendingSell.get(telegramId);
            console.log('[SellManager] handleSellPercent for', telegramId, pendingSell);
            if (!pendingSell || pendingSell.tokenAddress !== tokenAddress) {
                await this.safeSendMessage(chatId, 'Sell session expired. Please start over.', {}, 3, telegramId);
                return;
            }

            const sellAmount = (pendingSell.balance * percentage) / 100;
            await this.confirmSell(
                chatId,
                telegramId,
                tokenAddress,
                sellAmount,
                `${sellAmount}`,
                null
            );

        } catch (error) {
            console.error('Error handling sell percentage:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while calculating sell amount.', {}, 3, telegramId);
        }
    }

    async handleCustomSellAmount(chatId, telegramId, tokenAddress) {
        try {
            this.pendingSell.set(telegramId, {
                ...this.pendingSell.get(telegramId),
                status: 'awaiting_custom_amount'
            });

            const message = `
*💰 Custom Sell Amount*

Please enter the amount of tokens you want to sell:

*Your Balance:* ${this.pendingSell.get(telegramId).balance.toFixed(6)} tokens

Send the amount as a number (e.g., 100.5)`;

            await this.safeSendMessage(chatId, message, {
                parse_mode: 'Markdown'
            }, 3, telegramId);

        } catch (error) {
            console.error('Error setting up custom sell amount:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while setting up custom amount.', {}, 3, telegramId);
        }
    }

    async confirmSell(chatId, telegramId, tokenAddress, amount, displayAmount) {
        try {
            const pendingSell = this.pendingSell.get(telegramId);
            if (!pendingSell) {
                await this.safeSendMessage(chatId, 'Sell session expired. Please start over.', {}, 3, telegramId);
                return;
            }

            const report = await this.getTokenSellReport(tokenAddress, amount);
            const orderData = {
                tokenName: pendingSell.tokenInfo.name,
                amount: amount.toFixed(6),
                displayAmount,
                estimatedSOL: report.estimatedSOL.toFixed(4),
                priceImpact: report.priceImpact.toFixed(2),
                marketData: report.marketData,
                liquidity: report.liquidity,
                volume24h: report.volume24h,
                priceTrend: report.priceTrend
            };

            const shortKey = this.generateShortKey();
            this.pendingSellByKey[shortKey] = {
                telegramId,
                tokenAddress,
                amount,
                displayAmount,
                orderData
            };

            const reply_markup = {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm Sell', callback_data: `confirm_sell_${shortKey}` },
                        { text: '❌ Cancel', callback_data: 'cancel_sell' }
                    ]
                ]
            };

            await this.sendTelegramMessage(chatId, orderData, reply_markup, telegramId);
        } catch (error) {
            console.error('Error confirming sell:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong while preparing sell confirmation.', {}, 3, telegramId);
        }
    }

    async executeSell(chatId, telegramId, tokenAddress, amount, bot) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                throw new Error('No active wallet found');
            }

            if (activeWallet.is_locked) {
                throw new Error('Wallet is locked');
            }

            const decryptedKey = this.decryptPrivateKey(activeWallet.encrypted_private_key, telegramId);
            const privateKeyBuffer = Buffer.from(decryptedKey, 'base64');
            const keypair = Keypair.fromSecretKey(privateKeyBuffer);
            
            this.tradingExecution.setUserWallet(keypair);

            const result = await this.tradingExecution.executeSell(user.id, tokenAddress, amount, keypair);

            if (result.success) {
                await this.db.createTrade(
                    user.id,
                    tokenAddress,
                    amount,
                    result.tokenPrice,
                    'sell'
                );

                // Get token info for display
                const tokenInfo = result.symbol ? 
                    { symbol: result.symbol, name: result.name } : 
                    await this.tradingExecution.getTokenInfo(tokenAddress);

                const successMessage = `
*✅ Sell Order Executed Successfully!*

*Transaction Details:*
• **Tokens Sold:** ${amount.toFixed(6)} ${tokenInfo.symbol || 'tokens'}
• **SOL Received:** ${result.solReceived.toFixed(4)} SOL
• **Token Price:** ${result.tokenPrice.toFixed(8)} SOL per token
• **Price Impact:** ${result.priceImpact.toFixed(2)}%

*Fees:*
• **Bot Fee:** ${result.botFee.toFixed(4)} SOL
• **Network Fee:** ${result.networkFee.toFixed(6)} SOL

*Transaction Info:*
• **Signature:** \`${result.signature}\`
• **Provider:** Raydium

*Performance:*
• **Net SOL Received:** ${(result.solReceived - result.botFee - result.networkFee).toFixed(4)} SOL

[View on Solscan](https://solscan.io/tx/${result.signature})

Thank you for using 4TOOL Trading Bot! 🚀`;

                await this.safeSendMessage(chatId, successMessage, { parse_mode: 'Markdown' }, 3, telegramId);

                if (bot) {
                    await this.deleteSellMessages(chatId, telegramId, bot);
                }

            } else {
                throw new Error(result.error || 'Sell execution failed');
            }

            this.pendingSell.delete(telegramId);
            this.clearPendingSellAndUserState(telegramId);

        } catch (error) {
            console.error('Error executing sell:', error);
            await this.safeSendMessage(chatId, `❌ Sell failed: ${error.message}`);
            throw error;
        }
    }

    async getUserTokenHoldings(walletAddress) {
        try {
            const PortfolioService = require('../services/portfolioService');
            const portfolioService = new PortfolioService(this.config);
            const axios = require('axios');
            const walletBalance = await portfolioService.getWalletBalance(walletAddress);
            const tokens = walletBalance.tokens || [];
            const holdings = [];
            for (const t of tokens) {
                if (t.amount > 0) {
                    let symbol = t.mint.slice(0, 4) + '...';
                    let price = 0;
                    try {
                        const url = `https://lite-api.jup.ag/tokens/v2/search?query=${t.mint}`;
                        const resp = await axios.get(url, { headers: { 'Accept': 'application/json' } });
                        if (Array.isArray(resp.data) && resp.data.length > 0) {
                            const meta = resp.data[0];
                            if (meta.symbol) symbol = meta.symbol;
                            if (meta.usdPrice) price = meta.usdPrice;
                        }
                    } catch (e) {}
                    holdings.push({
                        address: t.address,
                        mint: t.mint,
                        balance: t.amount,
                        symbol,
                        price,
                        decimals: t.decimals
                    });
                }
            }
            return holdings;
        } catch (error) {
            console.error('Error getting user token holdings:', error);
            return [];
        }
    }

    async getTokenSellReport(tokenAddress, amount) {
        try {
            // Get real SOL estimation using Raydium quote
            const { NATIVE_MINT } = require('@solana/spl-token');
            const tokenInfo = await this.tradingExecution.getTokenInfo(tokenAddress);
            const decimals = tokenInfo.decimals;
            const amountInTokenUnits = Math.floor(amount * Math.pow(10, decimals));

            console.log(`[getTokenSellReport] Getting quote for ${amount} ${tokenInfo.symbol} (${amountInTokenUnits} units)`);

            // Get swap quote from Raydium
            const swapQuote = await this.tradingExecution.raydiumService.getSwapQuote(
                tokenAddress,                    // Input token mint
                NATIVE_MINT.toString(),         // Output mint (SOL)
                amountInTokenUnits,             // Amount in token units
                50,                             // 0.5% slippage
                'V0'                           // Transaction version
            );

            let estimatedSOL = 0;
            let priceImpact = 0;

            if (swapQuote && swapQuote.data) {
                // Parse the output amount from lamports to SOL
                const outAmount = parseInt(swapQuote.data.outputAmount || swapQuote.data.outAmount || '0');
                estimatedSOL = outAmount / 1e9; // Convert lamports to SOL
                
                // Get price impact if available
                priceImpact = parseFloat(swapQuote.data.priceImpactPct || swapQuote.data.priceImpact || '0');
            } else if (swapQuote && swapQuote.outAmount) {
                // Handle alternative response format
                const outAmount = parseInt(swapQuote.outAmount || '0');
                estimatedSOL = outAmount / 1e9;
                priceImpact = parseFloat(swapQuote.priceImpactPct || '0');
            }

            // Try to get additional market data
            let marketData = 'Current market data';
            let liquidity = 'Unknown';
            let volume24h = 'Unknown';

            try {
                // Get token data from Jupiter or other sources if available
                const axios = require('axios');
                const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`, {
                    timeout: 3000,
                    headers: { 'Accept': 'application/json' }
                });

                if (Array.isArray(response.data) && response.data.length > 0) {
                    const tokenData = response.data[0];
                    if (tokenData.usdPrice) {
                        marketData = `Price: $${parseFloat(tokenData.usdPrice).toFixed(6)}`;
                    }
                }
            } catch (marketError) {
                console.log('[getTokenSellReport] Could not fetch additional market data:', marketError.message);
            }

            console.log(`[getTokenSellReport] Estimated SOL: ${estimatedSOL.toFixed(4)}, Price Impact: ${priceImpact.toFixed(2)}%`);

            return {
                estimatedSOL: estimatedSOL,
                priceImpact: priceImpact,
                marketData: marketData,
                liquidity: liquidity,
                volume24h: volume24h,
                priceTrend: 'Checking...'
            };
        } catch (error) {
            console.error('Error getting token sell report:', error);
            
            // Fallback to basic estimation if Raydium quote fails
            const fallbackEstimation = amount * 0.001; // Basic fallback
            
            return {
                estimatedSOL: fallbackEstimation,
                priceImpact: 0,
                marketData: 'Market data unavailable (using fallback estimation)',
                liquidity: 'Unknown',
                volume24h: 'Unknown',
                priceTrend: 'Unknown'
            };
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

    clearPendingSell(telegramId) {
        this.pendingSell.delete(telegramId);
    }

    hasPendingSell(telegramId) {
        return this.pendingSell.has(telegramId);
    }

    async handleCustomSell(chatId, telegramId, tokenAddress) {
        try {
            const pendingSell = this.pendingSell.get(telegramId);
            if (!pendingSell) {
                await this.safeSendMessage(chatId, 'No pending sell found. Please start again.', {}, 3, telegramId);
                return;
            }

            pendingSell.status = 'waiting_for_custom_amount';
            this.pendingSell.set(telegramId, pendingSell);
            console.log('[SellManager] handleCustomSell set status for', telegramId, pendingSell);
            let displayName = (pendingSell.tokenInfo && pendingSell.tokenInfo.name && pendingSell.tokenInfo.name !== 'Unknown Token') ? pendingSell.tokenInfo.name : ((pendingSell.tokenInfo && pendingSell.tokenInfo.symbol && pendingSell.tokenInfo.symbol !== 'UNKNOWN') ? pendingSell.tokenInfo.symbol : (tokenAddress ? tokenAddress.slice(0, 4) + '...' : 'Token'));
            const message = `\n*💰 Custom Sell Amount*\n\n*Token:* ${displayName}\n*Your Balance:* ${pendingSell.balance.toFixed(6)} tokens\n\nPlease enter the amount you want to sell:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'sell_token' }
                    ]
                ]
            };

            await this.safeSendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }, 3, telegramId);

        } catch (error) {
            console.error('Error handling custom sell:', error);
            await this.safeSendMessage(chatId, 'Sorry, something went wrong. Please try again.', {}, 3, telegramId);
        }
    }

    async safeSendMessage(chatId, message, options = {}, retries = 3, telegramId = null) {
        for (let i = 0; i < retries; i++) {
            try {
                const sentMessage = await this.messageManager.sendAndStoreMessage(chatId, message, options);
                if (telegramId) {
                    await this.trackSellMessageId(telegramId, sentMessage);
                }
                return sentMessage;
            } catch (error) {
                if (
                    (error.code === 'ETELEGRAM' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND')
                    && i < retries - 1
                ) {
                    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
                    continue;
                }
                console.error('Failed to send message:', error);
                throw error;
            }
        }
    }

    async deleteSellMessages(chatId, telegramId, bot) {
        const ids = this.sellMessageIds.get(telegramId) || [];
        for (const messageId of ids) {
            try {
                await bot.deleteMessage(chatId, messageId);
            } catch (e) {
                console.warn('Failed to delete sell message', messageId, e.message);
            }
        }
        this.sellMessageIds.delete(telegramId);
    }

    clearPendingSellAndUserState(telegramId) {
        this.pendingSell.delete(telegramId);
        console.log('[SellManager] Cleared pendingSell and userState for', telegramId);
    }

    getAndClearPendingSellByKey(key) {
        const data = this.pendingSellByKey[key];
        delete this.pendingSellByKey[key];
        return data;
    }
}

module.exports = SellManager;
