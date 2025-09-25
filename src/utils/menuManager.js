const axios = require('axios');
const HeliusWalletService = require('../services/heliusWalletService');

class MenuManager {
    constructor(bot, db, messageManager) {
        this.bot = bot;
        this.db = db;
        this.messageManager = messageManager;
        this.heliusService = new HeliusWalletService();
    }

    async showMainMenu(chatId, activeWallet = null, ruleEngine = null, telegramId = null) {
        try {
            // Don't delete the main menu message, just update it
            let currentActiveWallet = activeWallet;
            let user = null;
            if (!currentActiveWallet) {
                // Use telegramId if provided, otherwise fall back to chatId
                const userIdToSearch = telegramId || chatId.toString();
                user = await this.db.getUserByTelegramId(userIdToSearch);
                if (user) {
                    currentActiveWallet = await this.db.getActiveWallet(user.id);
                }
            }

            // Get user settings for autonomous mode status
            if (!user) {
                const userIdToSearch = telegramId || chatId.toString();
                user = await this.db.getUserByTelegramId(userIdToSearch);
            }
            const settings = user ? await this.db.getUserSettings(user.id) : null;
            const isAutonomousMode = settings?.autonomous_enabled || false;

            if (!currentActiveWallet) {
                const message = `
*⚠️ No Active Wallet*

Please create or import a wallet to get started.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ]
                    ]
                };

                const sentMessage = await this.messageManager.editMessageOrSend(
                    chatId, 
                    message, 
                    { parse_mode: 'Markdown', reply_markup: keyboard },
                    this.messageManager.lastMainMenuMessageId
                );
                this.messageManager.lastMainMenuMessageId = sentMessage.message_id;
                return;
            }

            let portfolioValue = 0;
            let totalValue = 0;
            let solBalance = 0;
            let tokenCount = 0;
            let tokenValue = 0;
            let solPrice = 0;
            
            try {
                // Get comprehensive wallet data using Helius service
                const walletSummary = await this.heliusService.getWalletSummary(currentActiveWallet.public_key);
                console.log('Wallet summary:', walletSummary);
                
                // Extract native SOL balance
                solBalance = walletSummary.summary.nativeBalance / 1e9; // Convert from lamports to SOL
                
                // Get fungible token count and estimated value
                tokenCount = walletSummary.summary.fungibleTokenCount;
                
                // Fetch SOL price from CoinGecko for accurate USD calculation
                try {
                    const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
                        timeout: 5000 // 5 second timeout
                    });
                    if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) {
                        solPrice = cgResp.data.solana.usd;
                        
                        // Calculate accurate SOL value using real-time price
                        const solValue = solBalance * solPrice;
                        
                        // For now, use only SOL value since Helius total includes SOL
                        // TODO: Implement proper token price fetching for accurate token values
                        totalValue = solValue;
                        portfolioValue = totalValue;
                    } else {
                        // Fallback to Helius estimated value if CoinGecko fails
                        totalValue = walletSummary.summary.totalEstimatedValue;
                        portfolioValue = totalValue;
                    }
                } catch (priceError) {
                    console.error('Error fetching SOL price from CoinGecko:', priceError.message);
                    // Fallback to Helius estimated value
                    totalValue = walletSummary.summary.totalEstimatedValue;
                    portfolioValue = totalValue;
                }
                
            } catch (e) {
                console.error('Error fetching wallet data from Helius:', e);
                // Fallback to basic balance check
                try {
                    const basicBalance = await getWalletBalance(currentActiveWallet.public_key);
                    solBalance = basicBalance.sol;
                    tokenCount = 0;
                    tokenValue = 0;
                    
                    // Try to get SOL price for basic calculation
                    try {
                        const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
                            timeout: 5000 // 5 second timeout
                        });
                        if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) {
                            solPrice = cgResp.data.solana.usd;
                            totalValue = solBalance * solPrice;
                        } else {
                            totalValue = 0;
                        }
                    } catch (priceError) {
                        console.error('Error fetching SOL price in fallback:', priceError.message);
                        totalValue = 0;
                    }
                } catch (fallbackError) {
                    console.error('Error in fallback balance check:', fallbackError);
                    solBalance = 0;
                    tokenCount = 0;
                    tokenValue = 0;
                    totalValue = 0;
                }
            }

            const message = `
*🤖 4T-Bot Main Menu*

*Active Wallet:* \`${currentActiveWallet.public_key}\`
*Status:* ${currentActiveWallet.is_locked ? '🔒 Locked' : '🔓 Unlocked'}
*Autonomous Mode:* ${isAutonomousMode ? '🟢 ON' : '🔴 OFF'}

*Portfolio Overview:*
💰 SOL Balance: ${solBalance.toFixed(4)} SOL
💵 SOL Price: ${solPrice > 0 ? `$${solPrice.toFixed(2)}` : 'Unavailable'}
🪙 Token Count: ${tokenCount} tokens
📊 Total Value: $${totalValue.toFixed(2)}
📈 24h Change: 0.00%

*Quick Actions:*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Portfolio', callback_data: 'view_portfolio' },
                    ],
                    [
                        { text: '⚡️ Trade', callback_data: 'trade' },
                        { text: '🎯 Strategies', callback_data: 'strategies' }
                    ],
                    [
                        { text: '📋 Rules', callback_data: 'rules' },
                        { text: '⚙️ Settings', callback_data: 'settings' }
                    ],
                    [
                        { 
                            text: isAutonomousMode ? '🤖 Autonomous Mode: ON' : '🤖 Autonomous Mode: OFF',
                            callback_data: 'toggle_autonomous'
                        }
                    ],
                    [
                        { text: '❓ Help', callback_data: 'help' }
                    ]
                ]
            };

            const sentMessage = await this.messageManager.editMessageOrSend(
                chatId, 
                message, 
                { parse_mode: 'Markdown', reply_markup: keyboard },
                this.messageManager.lastMainMenuMessageId
            );
            this.messageManager.lastMainMenuMessageId = sentMessage.message_id;

        } catch (error) {
            console.error('Error showing main menu:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the main menu.');
        }
    }

    async showSettings(chatId, telegramId) {
        const message = `
*⚙️ Settings*
Manage your bot preferences and wallet settings`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '👛 Wallet Management', callback_data: 'wallet_management' },
                    { text: '⚡️ Trading Settings', callback_data: 'trading_settings' }
                ],
                [
                    { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                ]
            ]
        };

        await this.messageManager.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showWalletManagement(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);
            const activeWallet = await this.db.getActiveWallet(user.id);

            let message = `
*👛 Wallet Management*

*Active Wallet:*
\`${activeWallet.public_key}\`
${activeWallet.created_at ? `Created: ${new Date(activeWallet.created_at).toLocaleDateString()}` : ''}
${activeWallet.is_locked ? '🔒 Locked' : '🔓 Unlocked'}

*All Wallets:*\n`;
            
            if (wallets.length === 0) {
                message += `No wallets found. Create or import a wallet to get started.`;
            } else {
                wallets.forEach((wallet, index) => {
                    const isActive = wallet.is_active ? '✅' : '';
                    const isLocked = wallet.is_locked ? '🔒' : '🔓';
                    message += `${index + 1}. \`${wallet.public_key}\` ${isActive} ${isLocked}\n`;
                });
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Create New Wallet', callback_data: 'create_wallet' },
                        { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                    ],
                    [
                        { text: '📤 Export Keys', callback_data: 'export_keys' },
                        { text: '🔄 Switch Wallet', callback_data: 'switch_wallet' }
                    ],
                    [
                        { text: '🔒 Security', callback_data: 'wallet_security' },
                        { text: '🔑 Passphrase', callback_data: 'wallet_passphrase' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing wallet management:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, something went wrong while fetching wallet information.');
        }
    }

    async showHelp(chatId) {
        const message = `
*4T-Bot Help Guide* 📚

*Commands:*
/start - Start using the bot
/wallet - Manage your Solana wallet
/strategy - Configure trading strategies
/portfolio - View your holdings and P&L
/claim - Claim 4TOOL fee rewards
/status - Check bot status
/help - Show this help message

*Need more help?* Contact support at support@4tool.com`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📚 Documentation', url: 'https://docs.4tool.com' },
                    { text: '💬 Support', url: 'https://t.me/4tool_support' }
                ]
            ]
        };

        await this.messageManager.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showTradeMenu(chatId) {
        const message = `
*🔄 Trade Menu*

Select an action:
- Buy Token - Purchase a new token
- Check Token - Verify token details
- View Portfolio - See your current holdings`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💰 Buy Token', callback_data: 'buy_token' },
                    { text: '🔍 Check Token', callback_data: 'check_token' }
                ],
                [
                    { text: '💰 Sell Token', callback_data: 'sell_token' },
                    { text: '📊 View Portfolio', callback_data: 'view_portfolio' }
                ],
                [
                    { text: '🔥 Enhanced Portfolio', callback_data: 'enhanced_view_portfolio' }
                ],
                [
                    { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                ]
            ]
        };

        await this.messageManager.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
}

async function getWalletBalance(walletAddress) {
    try {
        const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
        const connection = new Connection('https://api.mainnet-beta.solana.com');
        const publicKey = new PublicKey(walletAddress);
        const balanceInLamports = await connection.getBalance(publicKey);
        const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;
        return {
            lamports: balanceInLamports,
            sol: balanceInSol
        };
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        return { lamports: 0, sol: 0 };
    }
}

module.exports = MenuManager;
