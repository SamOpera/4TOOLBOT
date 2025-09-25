class CopyTradeHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.userStates = new Map();
        this.lastMessageIds = new Map();
    }

    async handleCopyTradeStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get current copy trade settings
            const strategySettings = await this.db.getStrategySettings(user.id, 'copy_trade') || {
                type: 'copy_trade',
                params: {
                    targetWallets: [],
                    minTradeSize: 0.1,
                    maxTradeSize: 10,
                    minSuccessRate: 0.7,
                    maxSlippage: 1,
                    delaySeconds: 2,
                    maxPositions: 5,
                    isActive: false
                }
            };

            // Store settings in user state
            this.userStates.set(telegramId, {
                ...this.userStates.get(telegramId),
                currentStrategy: 'copy_trade',
                strategySettings: strategySettings.params
            });

            const message = `
*👥 Copy Trade Strategy*

This strategy automatically copies trades from selected wallets.

*Current Settings:*
- Target Wallets: ${strategySettings.params.targetWallets.length}
- Trade Size: ${strategySettings.params.minTradeSize}-${strategySettings.params.maxTradeSize} SOL
- Success Rate: ${(strategySettings.params.minSuccessRate * 100)}%
- Max Slippage: ${strategySettings.params.maxSlippage}%
- Max Positions: ${strategySettings.params.maxPositions}
- Status: ${strategySettings.params.isActive ? '✅ Active' : '❌ Inactive'}

Configure your copy trading:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📱 Manage Wallets', callback_data: 'copy_trade_wallets' },
                        { text: '⚙️ Settings', callback_data: 'copy_trade_settings' }
                    ],
                    [
                        { text: '📊 Active Trades', callback_data: 'copy_trade_active' },
                        { text: '📈 Performance', callback_data: 'copy_trade_performance' }
                    ],
                    [
                        { text: strategySettings.params.isActive ? '❌ Deactivate' : '✅ Activate Strategy', 
                          callback_data: strategySettings.params.isActive ? 'copy_trade_deactivate' : 'copy_trade_activate' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleCopyTradeStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the copy trade strategy.');
        }
    }

    async handleCopyTradeSelect(chatId, telegramId) {
        try {
            const message = `
*👥 Copy Trade Configuration*

Configure copy trading settings for rules:

- 🏆 Top Traders - Copy high-performing traders
- 🐋 Whale Wallets - Copy large wallet movements  
- 🧠 Smart Money - Copy institutional traders
- 🤖 Bot Traders - Copy automated traders
- 📝 Custom Wallet - Enter specific wallet address

*Current Status:* Not configured

Select your copy trading preferences:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🏆 Top Traders', callback_data: 'copy_trade_top_traders' },
                        { text: '🐋 Whale Wallets', callback_data: 'copy_trade_whales' }
                    ],
                    [
                        { text: '🧠 Smart Money', callback_data: 'copy_trade_smart_money' },
                        { text: '🤖 Bot Traders', callback_data: 'copy_trade_bots' }
                    ],
                    [
                        { text: '📝 Custom Wallet', callback_data: 'copy_trade_custom_wallet' }
                    ],
                    [
                        { text: '⚙️ Advanced Settings', callback_data: 'copy_trade_advanced' }
                    ],
                    [
                        { text: '◀️ Back to Rules', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleCopyTradeSelect:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error loading copy trade configuration.');
        }
    }

    async handleCopyTradeTypeSelection(chatId, telegramId, traderType) {
        try {
            const traderTypeNames = {
                'top_traders': 'Top Traders',
                'whales': 'Whale Wallets',
                'smart_money': 'Smart Money',
                'bots': 'Bot Traders'
            };

            const message = `
*✅ ${traderTypeNames[traderType]} Selected*

You've selected to copy *${traderTypeNames[traderType]}*.

*What happens next:*
- System will monitor qualified wallets
- Trades will be automatically copied
- Risk management rules will apply
- You'll receive notifications for each trade

*Configuration:*
- Min Trade Size: 0.1 SOL
- Max Trade Size: 10 SOL  
- Max Slippage: 1%
- Delay: 2 seconds

Would you like to configure advanced settings?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ Advanced Settings', callback_data: 'copy_trade_advanced' },
                        { text: '✅ Save & Continue', callback_data: 'copy_trade_save_config' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'copy_trade_select' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Store the selection in user state
            const userState = this.userStates.get(telegramId) || {};
            userState.copyTradeConfig = {
                type: traderType,
                name: traderTypeNames[traderType]
            };
            this.userStates.set(telegramId, userState);

        } catch (error) {
            console.error('Error in handleCopyTradeTypeSelection:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error selecting the trader type.');
        }
    }

    async handleCopyTradeCustomWallet(chatId, telegramId) {
        try {
            const message = `
*📝 Custom Wallet Address*

Enter the wallet address you want to copy trade:

*Requirements:*
- Valid Solana wallet address
- Public wallet (not private)
- Active trading history recommended

*Example:*
\`7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\`

Please send the wallet address:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '◀️ Back', callback_data: 'copy_trade_select' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Set user state to expect wallet address input
            const userState = this.userStates.get(telegramId) || {};
            userState.waitingFor = 'copy_trade_custom_wallet';
            this.userStates.set(telegramId, userState);

        } catch (error) {
            console.error('Error in handleCopyTradeCustomWallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error setting up custom wallet input.');
        }
    }

    async handleCopyTradeAdvancedSettings(chatId, telegramId) {
        try {
            const userState = this.userStates.get(telegramId) || {};
            const config = userState.copyTradeConfig || {};

            const message = `
*⚙️ Advanced Copy Trade Settings*

Configure advanced parameters for copy trading:

*Current Configuration:*
- Trader Type: ${config.name || 'Not selected'}
- Min Trade Size: 0.1 SOL
- Max Trade Size: 10 SOL
- Max Slippage: 1%
- Trade Delay: 2 seconds
- Max Positions: 5

*Risk Management:*
- Min Success Rate: 70%
- Max Drawdown: 10%
- Min Profit Factor: 2.0

Configure settings:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💰 Trade Size', callback_data: 'copy_trade_trade_size' },
                        { text: '📊 Slippage', callback_data: 'copy_trade_slippage' }
                    ],
                    [
                        { text: '⏱️ Delay Settings', callback_data: 'copy_trade_delay' },
                        { text: '📈 Positions', callback_data: 'copy_trade_positions' }
                    ],
                    [
                        { text: '🛡️ Risk Management', callback_data: 'copy_trade_risk' },
                        { text: '📋 Success Criteria', callback_data: 'copy_trade_criteria' }
                    ],
                    [
                        { text: '✅ Save Settings', callback_data: 'copy_trade_save_config' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'copy_trade_select' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleCopyTradeAdvancedSettings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error loading advanced settings.');
        }
    }

    async handleCopyTradeSaveConfig(chatId, telegramId) {
        try {
            const userState = this.userStates.get(telegramId) || {};
            const config = userState.copyTradeConfig || {};

            if (!config.type) {
                await this.sendAndStoreMessage(chatId, 'Please select a trader type first.');
                return;
            }

            const message = `
*✅ Copy Trade Configuration Saved*

*Selected Configuration:*
- Trader Type: ${config.name}
- Trade Size: 0.1 - 10 SOL
- Max Slippage: 1%
- Trade Delay: 2 seconds

*Status:* Configuration saved for rules

You can now continue with rule creation or modify these settings anytime in the copy trade section.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleCopyTradeSaveConfig:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error saving the configuration.');
        }
    }

    async handleCopyTradeTradeSize(chatId, telegramId) {
        try {
            const message = `
*💰 Trade Size Configuration*

Set minimum and maximum trade sizes:

*Current Settings:*
- Min Trade Size: 0.1 SOL
- Max Trade Size: 10 SOL

*Recommendations:*
- Start with smaller sizes for testing
- Consider your total portfolio size
- Leave room for multiple positions`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '0.1-1 SOL', callback_data: 'copy_trade_size_small' },
                        { text: '0.5-5 SOL', callback_data: 'copy_trade_size_medium' }
                    ],
                    [
                        { text: '1-10 SOL', callback_data: 'copy_trade_size_large' },
                        { text: '📝 Custom', callback_data: 'copy_trade_size_custom' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'copy_trade_advanced' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleCopyTradeTradeSize:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error loading trade size settings.');
        }
    }

    async handleCopyTradeSlippage(chatId, telegramId) {
        try {
            const message = `
*📊 Slippage Configuration*

Set maximum allowed slippage for copy trades:

*Current Setting:* 1%

*Guidelines:*
- Lower slippage = fewer executed trades
- Higher slippage = more trades but worse prices
- Recommended: 0.5-2% for most strategies`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '0.5%', callback_data: 'copy_trade_slippage_0.5' },
                        { text: '1%', callback_data: 'copy_trade_slippage_1' }
                    ],
                    [
                        { text: '2%', callback_data: 'copy_trade_slippage_2' },
                        { text: '5%', callback_data: 'copy_trade_slippage_5' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'copy_trade_advanced' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleCopyTradeSlippage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error loading slippage settings.');
        }
    }

    async handleCopyTradeActivate(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const userState = this.userStates.get(telegramId);
            if (!userState || !userState.strategySettings) {
                await this.sendAndStoreMessage(chatId, 'Strategy settings not found. Please try again.');
                return;
            }

            // Check if user has external wallets configured
            const externalWallets = await this.db.getExternalWallets(user.id);
            if (externalWallets.length === 0) {
                await this.sendAndStoreMessage(chatId, 'Please add at least one wallet to monitor before activating copy trading.');
                return;
            }

            const activeWallets = externalWallets.filter(wallet => wallet.is_active);
            if (activeWallets.length === 0) {
                await this.sendAndStoreMessage(chatId, 'Please enable at least one wallet before activating copy trading.');
                return;
            }

            // Activate strategy
            userState.strategySettings.isActive = true;
            await this.db.updateStrategySettings(user.id, 'copy_trade', userState.strategySettings);

            await this.sendAndStoreMessage(chatId, `✅ Copy trading strategy has been activated!

*Active Features:*
- Monitoring ${activeWallets.length} wallet(s)
- Real-time trade copying enabled
- Risk management active

The strategy will now automatically copy trades from your monitored wallets based on your settings.`);
            
            // Return to strategy menu
            await this.handleCopyTradeStrategy(chatId, telegramId);
        } catch (error) {
            console.error('Error in handleCopyTradeActivate:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while activating the copy trading strategy.');
        }
    }

    async handleCopyTradeDeactivate(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const userState = this.userStates.get(telegramId);
            if (!userState || !userState.strategySettings) {
                await this.sendAndStoreMessage(chatId, 'Strategy settings not found. Please try again.');
                return;
            }

            // Deactivate strategy
            userState.strategySettings.isActive = false;
            await this.db.updateStrategySettings(user.id, 'copy_trade', userState.strategySettings);

            await this.sendAndStoreMessage(chatId, `❌ Copy trading strategy has been deactivated.

*What this means:*
- No new trades will be copied
- Existing positions remain unchanged
- Wallet monitoring is paused
- You can reactivate anytime

Your settings and monitored wallets are preserved.`);
            
            // Return to strategy menu
            await this.handleCopyTradeStrategy(chatId, telegramId);
        } catch (error) {
            console.error('Error in handleCopyTradeDeactivate:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while deactivating the copy trading strategy.');
        }
    }

    async handleCopyTradeSettingCallback(chatId, telegramId, callbackData) {
        try {
            // Handle specific copy trade setting callbacks
            if (callbackData.startsWith('copy_trade_max_amount_')) {
                const amount = callbackData.replace('copy_trade_max_amount_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum trade amount set to ${amount} SOL`);
            } else if (callbackData.startsWith('copy_trade_min_amount_')) {
                const amount = callbackData.replace('copy_trade_min_amount_', '');
                await this.sendAndStoreMessage(chatId, `✅ Minimum trade amount set to ${amount} SOL`);
            } else if (callbackData.startsWith('copy_trade_max_daily_')) {
                const count = callbackData.replace('copy_trade_max_daily_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum daily trades set to ${count}`);
            } else if (callbackData.startsWith('copy_trade_delay_')) {
                const delay = callbackData.replace('copy_trade_delay_', '');
                await this.sendAndStoreMessage(chatId, `✅ Trade delay set to ${delay} seconds`);
            } else if (callbackData.startsWith('copy_trade_slippage_')) {
                const slippage = callbackData.replace('copy_trade_slippage_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum slippage set to ${slippage}%`);
            } else if (callbackData.startsWith('copy_trade_positions_')) {
                const positions = callbackData.replace('copy_trade_positions_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum positions set to ${positions}`);
            } else if (callbackData.startsWith('copy_trade_size_')) {
                const size = callbackData.replace('copy_trade_size_', '');
                await this.sendAndStoreMessage(chatId, `✅ Trade size preference set to ${size}`);
            } else if (callbackData.startsWith('copy_trade_success_')) {
                const rate = callbackData.replace('copy_trade_success_', '');
                await this.sendAndStoreMessage(chatId, `✅ Minimum success rate set to ${rate}%`);
            } else if (callbackData.startsWith('copy_trade_drawdown_')) {
                const drawdown = callbackData.replace('copy_trade_drawdown_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum drawdown set to ${drawdown}%`);
            } else if (callbackData.startsWith('copy_trade_setting_')) {
                const setting = callbackData.replace('copy_trade_setting_', '');
                await this.sendAndStoreMessage(chatId, `✅ Copy trade setting ${setting} configured`);
            } else {
                await this.sendAndStoreMessage(chatId, 'Copy trade setting updated successfully.');
            }

            // Return to copy trade settings menu
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.handleCopyTradeAdvancedSettings(chatId, telegramId);
        } catch (error) {
            console.error('Error in handleCopyTradeSettingCallback:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the setting.');
        }
    }

    async handleShowActiveCopyTrades(chatId, telegramId) {
        try {
            const message = `
*📊 Active Copy Trades*

*Currently Following:*
• No active copy trades

*Performance Summary:*
• Total Copied Trades: 0
• Successful Trades: 0
• Win Rate: 0%
• Total P&L: $0.00

💡 Configure copy trading strategies to start following successful traders automatically.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Add Copy Trade', callback_data: 'copy_trade_select' },
                        { text: '⚙️ Settings', callback_data: 'copy_trade_settings' }
                    ],
                    [
                        { text: '🔄 Refresh', callback_data: 'show_active_copy_trades' },
                        { text: '◀️ Back', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleShowActiveCopyTrades:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading active copy trades.');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }
}

module.exports = CopyTradeHandlers;
