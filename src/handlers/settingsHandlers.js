const TelegramErrorHandler = require('../utils/telegramErrorHandler');

class SettingsHandlers {
    constructor(bot, db, config, telegramBotManager = null, autonomousService = null) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.telegramBotManager = telegramBotManager;
        this.autonomousService = autonomousService;
        // Removed local userStates; use main bot's userStates
        this.lastMessageIds = new Map();
    }

    // Handle input messages for settings-related waiting states
    async handleMessage(ctx, userState) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const message = ctx.message.text;

        console.log('SettingsHandlers.handleMessage called:', {
            chatId,
            telegramId,
            message,
            userState: userState?.state,
            hasBot: !!this.bot,
            hasDb: !!this.db
        });

        // Safety checks
        if (!this.bot) {
            console.error('Bot instance not available in settings handler');
            return false;
        }
        
        if (!this.db) {
            console.error('Database instance not available in settings handler');
            return false;
        }

        try {
            if (userState && userState.state) {
                console.log('Processing userState:', userState.state);
                switch (userState.state) {
                    case 'waiting_max_trade_amount': {
                        console.log('🔍 Processing max trade amount input:', message);
                        const maxAmount = parseFloat(message);
                        console.log('🔍 Parsed max amount:', maxAmount);
                        
                        if (isNaN(maxAmount) || maxAmount <= 0) {
                            console.log('❌ Invalid max trade amount, sending error message');
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid maximum trade amount (positive number).');
                            return { handled: true, clearState: false };
                        }
                        
                        console.log('🔍 Getting user by telegram ID:', telegramId);
                        const user = await this.db.getUserByTelegramId(telegramId);
                        console.log('✅ Found user:', user.id);
                        
                        console.log('🔍 Updating user settings with max trade amount:', maxAmount);
                        await this.db.updateUserSettings(user.id, { max_trade_amount: maxAmount });
                        console.log('✅ Settings updated successfully');
                        
                        await this.sendAndStoreMessage(chatId, `✅ Maximum trade amount set to ${maxAmount} SOL.`);
                        console.log('✅ Max trade amount handling completed successfully');
                        return { handled: true, clearState: true, redirectTo: 'trade_settings' };
                    }
                    case 'waiting_min_trade_amount': {
                        console.log('🔍 Processing min trade amount input:', message);
                        const minAmount = parseFloat(message);
                        console.log('🔍 Parsed min amount:', minAmount);
                        
                        if (isNaN(minAmount) || minAmount <= 0) {
                            console.log('❌ Invalid min trade amount, sending error message');
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid minimum trade amount (positive number).');
                            return { handled: true, clearState: false };
                        }
                        
                        console.log('🔍 Getting user by telegram ID:', telegramId);
                        const user = await this.db.getUserByTelegramId(telegramId);
                        console.log('✅ Found user:', user.id);
                        
                        console.log('🔍 Updating user settings with min trade amount:', minAmount);
                        await this.db.updateUserSettings(user.id, { min_trade_amount: minAmount });
                        console.log('✅ Settings updated successfully');
                        
                        await this.sendAndStoreMessage(chatId, `✅ Minimum trade amount set to ${minAmount} SOL.`);
                        console.log('✅ Min trade amount handling completed successfully');
                        return { handled: true, clearState: true, redirectTo: 'trade_settings' };
                    }
                    case 'waiting_max_daily_trades': {
                        const maxDaily = parseInt(message);
                        if (isNaN(maxDaily) || maxDaily <= 0) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid maximum daily trades (positive integer).');
                            return { handled: true, clearState: false };
                        }
                        const user = await this.db.getUserByTelegramId(telegramId);
                        await this.db.updateUserSettings(user.id, { max_daily_trades: maxDaily });
                        await this.sendAndStoreMessage(chatId, `✅ Maximum daily trades set to ${maxDaily}.`);
                        return { handled: true, clearState: true, redirectTo: 'trade_settings' };
                    }
                    case 'waiting_default_slippage': {
                        console.log('🔍 Processing slippage input:', message);
                        try {
                            const slippage = parseFloat(message);
                            console.log('🔍 Parsed slippage value:', slippage);
                            
                            if (isNaN(slippage) || slippage < 0 || slippage > 50) {
                                console.log('❌ Invalid slippage value, sending error message');
                                await this.sendAndStoreMessage(chatId, '❌ Please enter a valid slippage percentage (0-50).\n\n📊 *Common values:*\n• 0.1-0.5% - Low slippage (may fail in volatile markets)\n• 1-2% - Standard slippage (recommended)\n• 3-5% - High slippage (for volatile tokens)\n• 5-50% - Very high slippage (use with caution)', { parse_mode: 'Markdown' });
                                return { handled: true, clearState: false };
                            }
                            
                            console.log('🔍 Getting user by telegram ID:', telegramId);
                            const user = await this.db.getUserByTelegramId(telegramId);
                            if (!user) {
                                console.error('❌ User not found for telegram ID:', telegramId);
                                throw new Error('User not found in database');
                            }
                            console.log('✅ Found user:', user.id);
                            
                            console.log('🔍 Updating user settings with slippage:', slippage);
                            await this.db.updateUserSettings(user.id, { default_slippage: slippage });
                            console.log('✅ Settings updated successfully');
                            
                            let slippageAdvice = '';
                            if (slippage < 0.5) {
                                slippageAdvice = '\n\n💡 *Low slippage* - Better prices but trades may fail in volatile markets.';
                            } else if (slippage <= 2) {
                                slippageAdvice = '\n\n✅ *Standard slippage* - Good balance of price execution and success rate.';
                            } else if (slippage <= 5) {
                                slippageAdvice = '\n\n⚠️ *High slippage* - More reliable execution but potentially worse prices.';
                            } else {
                                slippageAdvice = '\n\n🚨 *Very high slippage* - Use only for highly volatile tokens. Monitor your trades carefully.';
                            }
                            
                            console.log('🔍 Sending success message');
                            await this.sendAndStoreMessage(chatId, `✅ Default slippage set to ${slippage}%.${slippageAdvice}`, { parse_mode: 'Markdown' });
                            console.log('✅ Slippage handling completed successfully');
                            return { handled: true, clearState: true, redirectTo: 'trade_settings' };
                        } catch (slippageError) {
                            console.error('❌ Error processing slippage input:', slippageError);
                            await this.sendAndStoreMessage(chatId, '❌ Sorry, there was an error updating your slippage setting. Please try again.');
                            return { handled: true, clearState: true };
                        }
                    }
                    case 'waiting_stop_loss': {
                        const stopLoss = parseFloat(message);
                        if (isNaN(stopLoss) || stopLoss <= 0 || stopLoss > 100) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid stop loss percentage (1-100).');
                            return true;
                        }
                        const user = await this.db.getUserByTelegramId(telegramId);
                        await this.db.updateUserSettings(user.id, { default_stop_loss: stopLoss });
                        await this.sendAndStoreMessage(chatId, `✅ Default stop loss set to ${stopLoss}%.`);
                        return { handled: true, clearState: true, redirectTo: 'risk_settings' };
                    }
                    case 'waiting_take_profit': {
                        const takeProfit = parseFloat(message);
                        if (isNaN(takeProfit) || takeProfit <= 0 || takeProfit > 100) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid take profit percentage (1-100).');
                            return true;
                        }
                        const user = await this.db.getUserByTelegramId(telegramId);
                        await this.db.updateUserSettings(user.id, { default_take_profit: takeProfit });
                        await this.sendAndStoreMessage(chatId, `✅ Default take profit set to ${takeProfit}%.`);
                        return { handled: true, clearState: true, redirectTo: 'risk_settings' };
                    }
                    case 'waiting_trail_threshold': {
                        const threshold = parseFloat(message);
                        if (isNaN(threshold) || threshold <= 0 || threshold > 100) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid trailing stop threshold percentage (1-100).');
                            return true;
                        }
                        const user = await this.db.getUserByTelegramId(telegramId);
                        await this.db.updateUserSettings(user.id, { trailing_stop_threshold: threshold });
                        await this.sendAndStoreMessage(chatId, `✅ Trailing stop threshold set to ${threshold}%.`);
                        return { handled: true, clearState: true, redirectTo: 'risk_settings' };
                    }
                    default:
                        return false; // Not handled by settings
                }
            }
            console.log('⚠️ No matching user state found or user state is empty');
            console.log('🔍 Checking if message looks like a slippage value...');
            
            // Safety check: if the message looks like a slippage value but no state is set,
            // try to handle it anyway (user might have lost state)
            const possibleSlippage = parseFloat(message);
            if (!isNaN(possibleSlippage) && possibleSlippage >= 0 && possibleSlippage <= 50 && message.trim().length <= 5) {
                // Guard: do not hijack if rules flow is active
                try {
                    const rulesStates = this.telegramBotManager?.rulesCommand?.userStates;
                    if (rulesStates && rulesStates.has(telegramId)) {
                        console.log('🛑 Skipping slippage auto-handle: rules flow active for user', telegramId);
                        return false;
                    }
                } catch (e) {
                    console.warn('Guard check failed, continuing with caution:', e?.message);
                }
                console.log('🔧 Message looks like slippage value, attempting to handle without state...');
                // Set the state and process the message
                if (!this.bot.userStates) {
                    this.bot.userStates = new Map();
                }
                this.bot.userStates.set(telegramId, { state: 'waiting_default_slippage' });
                
                // Recursively call handleMessage with the new state
                const newUserState = this.bot.userStates.get(telegramId);
                return await this.handleMessage(ctx, newUserState);
            }
            
            return false;
        } catch (error) {
            console.error('Error in settingsHandlers.handleMessage:', error);
            
            // Try to send an error message to the user
            try {
                await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your settings input. Please try again.');
            } catch (sendError) {
                console.error('Failed to send error message:', sendError);
            }
            
            // Clear the user state to reset them
            if (this.bot.userStates) {
                this.bot.userStates.delete(telegramId);
            }
            
            return { handled: true, clearState: true };
        }
    }

    async handleSettings(chatId, telegramId) {
        try {
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

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading settings.');
        }
    }

    async handleAutonomousToggle(chatId, telegramId, messageId = null) {
        try {
            console.log('handleAutonomousToggle called with:', { chatId, telegramId, messageId });
            console.log('telegramBotManager available:', !!this.telegramBotManager);
            console.log('telegramBotManager showMainMenu method:', typeof this.telegramBotManager?.showMainMenu);
            
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            
            const newStatus = !settings?.autonomous_enabled;
            await this.db.updateUserSettings(user.id, { autonomous_enabled: newStatus });

            // Start/stop autonomous trading process
            if (this.autonomousService) {
                try {
                    if (newStatus) {
                        await this.autonomousService.startAutonomousMode(user.id);
                        console.log('Autonomous trading started for user:', user.id);
                    } else {
                        await this.autonomousService.stopAutonomousMode(user.id);
                        console.log('Autonomous trading stopped for user:', user.id);
                    }
                } catch (autonomousError) {
                    console.error('Error starting/stopping autonomous trading:', autonomousError);
                }
            } else {
                console.warn('AutonomousService instance not available on settings handler.');
            }

            // Delete the previous message if messageId is provided
            if (messageId) {
                try {
                    await this.bot.deleteMessage(chatId, messageId);
                } catch (deleteError) {
                    console.warn('Could not delete previous message:', deleteError.message);
                }
            }

            // Show updated main menu immediately
            const activeWallet = await this.db.getActiveWallet(user.id);
            if (activeWallet) {
                await this.telegramBotManager.showMainMenu(chatId, activeWallet, null, telegramId);
            }

            // Send a brief confirmation message
            const confirmMessage = `🤖 Autonomous Trading ${newStatus ? 'Enabled' : 'Disabled'}`;
            const sentMessage = await this.bot.sendMessage(chatId, confirmMessage);
            
            // Delete the confirmation message after 3 seconds
            setTimeout(async () => {
                try {
                    await this.bot.deleteMessage(chatId, sentMessage.message_id);
                } catch (deleteError) {
                    console.warn('Could not delete confirmation message:', deleteError.message);
                }
            }, 3000);

        } catch (error) {
            console.error('Error toggling autonomous trading:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating autonomous trading settings.');
        }
    }

    async handleTradeSettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*💰 Trade Settings*

Configure your default trading parameters:

*Current Settings:*
• Default Slippage: ${settings?.default_slippage || 1}%
• Max Trade Amount: ${settings?.max_trade_amount || 'Unlimited'}
• Min Trade Amount: ${settings?.min_trade_amount || '$10'}
• Max Daily Trades: ${settings?.max_daily_trades || 10}
• Auto-confirm Trades: ${settings?.auto_confirm ? 'On' : 'Off'}

Select a setting to modify:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Default Slippage', callback_data: 'slippage_presets' },
                        { text: '💵 Max Trade Amount', callback_data: 'set_max_trade_amount' }
                    ],
                    [
                        { text: '💰 Min Trade Amount', callback_data: 'set_min_trade_amount' },
                        { text: '🔢 Max Daily Trades', callback_data: 'set_max_daily_trades' }
                    ],
                    [
                        { text: '⚡️ Auto-confirm Toggle', callback_data: 'toggle_auto_confirm' },
                        { text: '🔔 Notification Settings', callback_data: 'notification_settings' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing trade settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading trade settings.');
        }
    }

    async handleNotificationSettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*🔔 Notification Settings*

Configure when and how you receive notifications:

*Current Settings:*
• Trade Notifications: ${settings?.notify_on_trade ? 'On' : 'Off'}
• Profit/Loss Alerts: ${settings?.notify_on_pnl ? 'On' : 'Off'}
• Rule Triggers: ${settings?.notify_on_rule_trigger ? 'On' : 'Off'}
• Market Alerts: ${settings?.notify_on_market_alerts ? 'On' : 'Off'}
• Price Alerts: ${settings?.notify_on_price_alerts ? 'On' : 'Off'}
• System Updates: ${settings?.notify_on_system_updates ? 'On' : 'Off'}

Select notification types to toggle:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: `${settings?.notify_on_trade ? '🔕' : '🔔'} Trade Notifications`, callback_data: 'toggle_trade_notifications' },
                        { text: `${settings?.notify_on_pnl ? '🔕' : '🔔'} P&L Alerts`, callback_data: 'toggle_pnl_notifications' }
                    ],
                    [
                        { text: `${settings?.notify_on_rule_trigger ? '🔕' : '🔔'} Rule Triggers`, callback_data: 'toggle_rule_notifications' },
                        { text: `${settings?.notify_on_market_alerts ? '🔕' : '🔔'} Market Alerts`, callback_data: 'toggle_market_notifications' }
                    ],
                    [
                        { text: `${settings?.notify_on_price_alerts ? '🔕' : '🔔'} Price Alerts`, callback_data: 'toggle_price_notifications' },
                        { text: `${settings?.notify_on_system_updates ? '🔕' : '🔔'} System Updates`, callback_data: 'toggle_system_notifications' }
                    ],
                    [
                        { text: '🔕 Disable All', callback_data: 'disable_all_notifications' },
                        { text: '🔔 Enable All', callback_data: 'enable_all_notifications' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing notification settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading notification settings.');
        }
    }

    async handleRiskSettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*⚠️ Risk Management Settings*

Configure your risk management parameters:

*Current Settings:*
• Default Stop Loss: ${settings?.default_stop_loss || 10}%
• Default Take Profit: ${settings?.default_take_profit || 25}%
• Trailing Stop: ${settings?.trailing_stop_enabled ? 'Enabled' : 'Disabled'}
• Trailing Threshold: ${settings?.trailing_stop_threshold || 5}%
• Max Position Size: ${settings?.max_position_size || 'No limit'}
• Risk Per Trade: ${settings?.risk_per_trade || 2}%

*Portfolio Limits:*
• Daily Loss Limit: ${settings?.daily_loss_limit || 'No limit'}
• Monthly Loss Limit: ${settings?.monthly_loss_limit || 'No limit'}
• Emergency Stop: ${settings?.emergency_stop_enabled ? 'Enabled' : 'Disabled'}

Select a setting to modify:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📉 Default Stop Loss', callback_data: 'set_stop_loss' },
                        { text: '📈 Default Take Profit', callback_data: 'set_take_profit' }
                    ],
                    [
                        { text: '🔄 Trailing Stop', callback_data: 'toggle_trailing_stop' },
                        { text: '📊 Trailing Threshold', callback_data: 'set_trailing_threshold' }
                    ],
                    [
                        { text: '💰 Max Position Size', callback_data: 'set_max_position_size' },
                        { text: '⚠️ Risk Per Trade', callback_data: 'set_risk_per_trade' }
                    ],
                    [
                        { text: '🚨 Daily Loss Limit', callback_data: 'set_daily_loss_limit' },
                        { text: '🛑 Emergency Stop', callback_data: 'toggle_emergency_stop' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing risk settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading risk settings.');
        }
    }

    async handleStrategySettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*📊 Strategy Settings*

Configure default strategy parameters:

*Algorithm Settings:*
• Strategy Aggressiveness: ${settings?.strategy_aggressiveness || 'Medium'}
• Market Analysis Depth: ${settings?.analysis_depth || 'Standard'}
• Signal Confidence Threshold: ${settings?.signal_threshold || 70}%
• Multi-timeframe Analysis: ${settings?.multi_timeframe ? 'Enabled' : 'Disabled'}

*Execution Settings:*
• Order Type: ${settings?.default_order_type || 'Market'}
• Execution Speed: ${settings?.execution_speed || 'Fast'}
• Partial Fill Handling: ${settings?.partial_fill_handling || 'Allow'}
• Retry Failed Orders: ${settings?.retry_failed_orders ? 'Enabled' : 'Disabled'}

Select a setting to configure:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🎯 Strategy Aggressiveness', callback_data: 'set_strategy_aggressiveness' },
                        { text: '🔍 Analysis Depth', callback_data: 'set_analysis_depth' }
                    ],
                    [
                        { text: '📊 Signal Threshold', callback_data: 'set_signal_threshold' },
                        { text: '⏰ Multi-timeframe', callback_data: 'toggle_multi_timeframe' }
                    ],
                    [
                        { text: '📋 Order Type', callback_data: 'set_order_type' },
                        { text: '⚡️ Execution Speed', callback_data: 'set_execution_speed' }
                    ],
                    [
                        { text: '🔄 Retry Orders', callback_data: 'toggle_retry_orders' },
                        { text: '📈 Performance Metrics', callback_data: 'view_performance_metrics' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing strategy settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading strategy settings.');
        }
    }

    async handleAdvancedSettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*🔧 Advanced Settings*

Configure advanced bot features:

*API & Performance:*
• API Rate Limiting: ${settings?.api_rate_limiting ? 'Enabled' : 'Disabled'}
• Cache Duration: ${settings?.cache_duration || 30} seconds
• Concurrent Requests: ${settings?.max_concurrent_requests || 5}
• Request Timeout: ${settings?.request_timeout || 10} seconds

*Security:*
• Two-Factor Authentication: ${settings?.tfa_enabled ? 'Enabled' : 'Disabled'}
• Session Timeout: ${settings?.session_timeout || 24} hours
• IP Whitelist: ${settings?.ip_whitelist_enabled ? 'Enabled' : 'Disabled'}
• Encryption Level: ${settings?.encryption_level || 'AES-256'}

*Debug & Logs:*
• Verbose Logging: ${settings?.verbose_logging ? 'Enabled' : 'Disabled'}
• Trade Logging: ${settings?.trade_logging ? 'Enabled' : 'Disabled'}
• Error Reporting: ${settings?.error_reporting ? 'Enabled' : 'Disabled'}

⚠️ *Warning:* Only modify these settings if you understand their impact.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔒 Security Settings', callback_data: 'advanced_security_settings' },
                        { text: '⚡️ Performance Settings', callback_data: 'advanced_performance_settings' }
                    ],
                    [
                        { text: '📝 Logging Settings', callback_data: 'advanced_logging_settings' },
                        { text: '🔧 API Settings', callback_data: 'advanced_api_settings' }
                    ],
                    [
                        { text: '🔄 Reset to Defaults', callback_data: 'reset_advanced_settings' },
                        { text: '📊 System Diagnostics', callback_data: 'system_diagnostics' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing advanced settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading advanced settings.');
        }
    }

    async handleInterfaceSettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*📱 Interface Settings*

Customize your bot interface:

*Display Settings:*
• Theme: ${settings?.theme || 'Default'}
• Language: ${settings?.language || 'English'}
• Timezone: ${settings?.timezone || 'UTC'}
• Number Format: ${settings?.number_format || 'US'}

*Message Settings:*
• Message Length: ${settings?.message_length || 'Standard'}
• Show Emojis: ${settings?.show_emojis ? 'Yes' : 'No'}
• Show Advanced Info: ${settings?.show_advanced_info ? 'Yes' : 'No'}
• Auto-delete Messages: ${settings?.auto_delete_messages ? 'Enabled' : 'Disabled'}

*Keyboard Layout:*
• Button Size: ${settings?.button_size || 'Medium'}
• Quick Actions: ${settings?.quick_actions_enabled ? 'Enabled' : 'Disabled'}
• Keyboard Layout: ${settings?.keyboard_layout || 'Standard'}

Select an option to customize:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🎨 Theme Settings', callback_data: 'set_theme' },
                        { text: '🌍 Language & Region', callback_data: 'set_language_region' }
                    ],
                    [
                        { text: '💬 Message Settings', callback_data: 'set_message_settings' },
                        { text: '⌨️ Keyboard Layout', callback_data: 'set_keyboard_layout' }
                    ],
                    [
                        { text: '⚡️ Quick Actions', callback_data: 'configure_quick_actions' },
                        { text: '🕒 Auto-delete Timer', callback_data: 'set_auto_delete_timer' }
                    ],
                    [
                        { text: '🔄 Reset Interface', callback_data: 'reset_interface_settings' },
                        { text: '👀 Preview Changes', callback_data: 'preview_interface' }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing interface settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading interface settings.');
        }
    }

    // Settings value handlers
    async handleDefaultSlippage(chatId, telegramId) {
        console.log('🚀 handleDefaultSlippage called for user:', telegramId);
        try {
            // Initialize userStates if it doesn't exist
            if (!this.bot.userStates) {
                console.log('🔍 Initializing userStates Map');
                this.bot.userStates = new Map();
            }
            
            console.log('🔍 Setting user state to waiting_default_slippage');
            this.bot.userStates.set(telegramId, { state: 'waiting_default_slippage' });
            console.log('🔍 User state set:', this.bot.userStates.get(telegramId));
            
            const currentSlippage = await this.getCurrentSlippage(telegramId);
            console.log('🔍 Current slippage:', currentSlippage);
            
            const message = `*📊 Set Default Slippage*\n\nEnter your preferred default slippage percentage (e.g. 0.5, 1, 2):\n\n💡 *Tips:*\n• Lower slippage (0.1-0.5%): Better price execution, higher chance of failed trades\n• Higher slippage (1-3%): More reliable execution, potentially worse prices\n• Very high slippage (>5%): Only for highly volatile tokens\n\n*Current slippage:* ${currentSlippage}%`;
            
            console.log('🔍 Sending slippage setup message');
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log('✅ Slippage setup message sent successfully');
        } catch (error) {
            console.error('❌ Error in handleDefaultSlippage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up slippage configuration.');
        }
    }

    async handleMaxTradeAmount(chatId, telegramId) {
        console.log('🚀 handleMaxTradeAmount called for user:', telegramId);
        try {
            if (!this.bot.userStates) {
                console.log('🔍 Initializing userStates Map');
                this.bot.userStates = new Map();
            }
            
            console.log('🔍 Setting user state to waiting_max_trade_amount');
            this.bot.userStates.set(telegramId, { state: 'waiting_max_trade_amount' });
            console.log('🔍 User state set:', this.bot.userStates.get(telegramId));
            
            const message = `*💵 Set Maximum Trade Amount*\n\nEnter your maximum trade amount in SOL (e.g. 1, 5, 10):`;
            
            console.log('🔍 Sending max trade amount setup message');
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log('✅ Max trade amount setup message sent successfully');
        } catch (error) {
            console.error('❌ Error in handleMaxTradeAmount:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up trade amount configuration.');
        }
    }

    async handleMinTradeAmount(chatId, telegramId) {
        console.log('🚀 handleMinTradeAmount called for user:', telegramId);
        try {
            if (!this.bot.userStates) {
                console.log('🔍 Initializing userStates Map');
                this.bot.userStates = new Map();
            }
            
            console.log('🔍 Setting user state to waiting_min_trade_amount');
            this.bot.userStates.set(telegramId, { state: 'waiting_min_trade_amount' });
            console.log('🔍 User state set:', this.bot.userStates.get(telegramId));
            
            const message = `*💰 Set Minimum Trade Amount*\n\nEnter your minimum trade amount in SOL (e.g. 0.1, 1):`;
            
            console.log('🔍 Sending min trade amount setup message');
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log('✅ Min trade amount setup message sent successfully');
        } catch (error) {
            console.error('❌ Error in handleMinTradeAmount:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up trade amount configuration.');
        }
    }

    async handleMaxDailyTrades(chatId, telegramId) {
        console.log('🚀 handleMaxDailyTrades called for user:', telegramId);
        try {
            if (!this.bot.userStates) {
                console.log('🔍 Initializing userStates Map');
                this.bot.userStates = new Map();
            }
            
            console.log('🔍 Setting user state to waiting_max_daily_trades');
            this.bot.userStates.set(telegramId, { state: 'waiting_max_daily_trades' });
            console.log('🔍 User state set:', this.bot.userStates.get(telegramId));
            
            const message = `*🔢 Set Maximum Daily Trades*\n\nEnter your maximum number of trades per day (e.g. 5, 10, 20):`;
            
            console.log('🔍 Sending max daily trades setup message');
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log('✅ Max daily trades setup message sent successfully');
        } catch (error) {
            console.error('❌ Error in handleMaxDailyTrades:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up daily trades configuration.');
        }
    }

    async handleAutoConfirmToggle(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.auto_confirm;
            await this.db.updateUserSettings(user.id, { auto_confirm: newStatus });
            const message = `\n*⚡️ Auto-confirm Trades ${newStatus ? 'Enabled' : 'Disabled'}*\n\n${newStatus ? '✅ Trades will now be executed automatically without confirmation prompts.' : '❌ You will now be asked to confirm each trade before execution.'}\n\n${newStatus ? '⚠️ Make sure your risk management settings are properly configured.' : '💡 This gives you more control but may slow down execution in fast markets.'}`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '◀️ Back to Settings', callback_data: 'settings' }
                    ]
                ]
            };
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (error) {
            console.error('Error toggling auto-confirm:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating auto-confirm settings.');
        }
    }

    // Quick slippage presets
    async handleSlippagePresets(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const currentSlippage = settings?.default_slippage || 1;

            const message = `*📊 Quick Slippage Presets*\n\nCurrent slippage: ${currentSlippage}%\n\nChoose a preset or select 'Custom' to enter your own value:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🟢 Low (0.5%)', callback_data: 'preset_slippage_0.5' },
                        { text: '🔵 Standard (1%)', callback_data: 'preset_slippage_1' }
                    ],
                    [
                        { text: '🟡 Medium (2%)', callback_data: 'preset_slippage_2' },
                        { text: '🟠 High (3%)', callback_data: 'preset_slippage_3' }
                    ],
                    [
                        { text: '🔴 Very High (5%)', callback_data: 'preset_slippage_5' },
                        { text: '⚙️ Custom', callback_data: 'set_default_slippage' }
                    ],
                    [
                        { text: '◀️ Back to Trade Settings', callback_data: 'trade_settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing slippage presets:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading slippage presets.');
        }
    }

    // Handler for custom slippage input (triggered by 'set_default_slippage' callback)
    async handleSetDefaultSlippage(chatId, telegramId) {
        try {
            if (!this.bot.userStates) {
                this.bot.userStates = new Map();
            }
            this.bot.userStates.set(telegramId, { state: 'waiting_default_slippage' });
            const message = `*📊 Enter Custom Slippage*\n\nPlease enter your preferred slippage percentage (e.g. 0.5, 1, 2):`;
            await this.sendAndStoreMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error in handleSetDefaultSlippage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up custom slippage input.');
        }
    }

    // Handle slippage preset selection
    async handleSlippagePreset(chatId, telegramId, slippageValue) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            await this.db.updateUserSettings(user.id, { default_slippage: slippageValue });
            
            let slippageAdvice = '';
            if (slippageValue < 0.5) {
                slippageAdvice = '\n\n💡 *Low slippage* - Better prices but trades may fail in volatile markets.';
            } else if (slippageValue <= 2) {
                slippageAdvice = '\n\n✅ *Standard slippage* - Good balance of price execution and success rate.';
            } else if (slippageValue <= 5) {
                slippageAdvice = '\n\n⚠️ *High slippage* - More reliable execution but potentially worse prices.';
            } else {
                slippageAdvice = '\n\n🚨 *Very high slippage* - Use only for highly volatile tokens. Monitor your trades carefully.';
            }

            await this.sendAndStoreMessage(chatId, `✅ Default slippage set to ${slippageValue}%.${slippageAdvice}`);
            
            // Return to trade settings after 2 seconds
            setTimeout(async () => {
                await this.handleTradeSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('Error setting slippage preset:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting the slippage preset.');
        }
    }

    // Helper method to get current slippage
    async getCurrentSlippage(telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            return settings?.default_slippage || 1;
        } catch (error) {
            console.error('Error getting current slippage:', error);
            return 1; // Default fallback
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        return await TelegramErrorHandler.sendMessage(this.bot, chatId, message, options, this.lastMessageIds);
    }

    // Notification toggle handlers
    async handleTradeNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handleTradeNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_trade;
            
            console.log('🔍 Current trade notification status:', settings?.notify_on_trade);
            console.log('🔍 New trade notification status:', newStatus);
            
            await this.db.updateUserSettings(user.id, { notify_on_trade: newStatus });
            
            const message = `✅ Trade notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
            
            console.log('✅ Trade notifications toggle completed successfully');
        } catch (error) {
            console.error('❌ Error toggling trade notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating trade notification settings.');
        }
    }

    async handlePnlNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handlePnlNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_pnl;
            
            await this.db.updateUserSettings(user.id, { notify_on_pnl: newStatus });
            
            const message = `✅ P&L notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error toggling P&L notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating P&L notification settings.');
        }
    }

    async handleRuleNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handleRuleNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_rule_trigger;
            
            await this.db.updateUserSettings(user.id, { notify_on_rule_trigger: newStatus });
            
            const message = `✅ Rule trigger notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error toggling rule notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating rule notification settings.');
        }
    }

    async handleMarketNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handleMarketNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_market_alerts;
            
            await this.db.updateUserSettings(user.id, { notify_on_market_alerts: newStatus });
            
            const message = `✅ Market alert notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error toggling market notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating market notification settings.');
        }
    }

    async handlePriceNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handlePriceNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_price_alerts;
            
            await this.db.updateUserSettings(user.id, { notify_on_price_alerts: newStatus });
            
            const message = `✅ Price alert notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error toggling price notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating price notification settings.');
        }
    }

    async handleSystemNotificationsToggle(chatId, telegramId) {
        console.log('🚀 handleSystemNotificationsToggle called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);
            const newStatus = !settings?.notify_on_system_updates;
            
            await this.db.updateUserSettings(user.id, { notify_on_system_updates: newStatus });
            
            const message = `✅ System update notifications ${newStatus ? 'enabled' : 'disabled'}.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error toggling system notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating system notification settings.');
        }
    }

    async handleDisableAllNotifications(chatId, telegramId) {
        console.log('🚀 handleDisableAllNotifications called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            
            await this.db.updateUserSettings(user.id, {
                notify_on_trade: false,
                notify_on_pnl: false,
                notify_on_rule_trigger: false,
                notify_on_market_alerts: false,
                notify_on_price_alerts: false,
                notify_on_system_updates: false
            });
            
            const message = `🔕 All notifications disabled.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error disabling all notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while disabling notifications.');
        }
    }

    async handleEnableAllNotifications(chatId, telegramId) {
        console.log('🚀 handleEnableAllNotifications called for user:', telegramId);
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            
            await this.db.updateUserSettings(user.id, {
                notify_on_trade: true,
                notify_on_pnl: true,
                notify_on_rule_trigger: true,
                notify_on_market_alerts: true,
                notify_on_price_alerts: true,
                notify_on_system_updates: true
            });
            
            const message = `🔔 All notifications enabled.`;
            await this.sendAndStoreMessage(chatId, message);
            
            // Return to notification settings after 2 seconds
            setTimeout(async () => {
                await this.handleNotificationSettings(chatId, telegramId);
            }, 2000);
        } catch (error) {
            console.error('❌ Error enabling all notifications:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while enabling notifications.');
        }
    }
}

module.exports = SettingsHandlers;
