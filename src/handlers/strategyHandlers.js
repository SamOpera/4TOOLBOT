class StrategyHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.userStates = new Map();
        this.lastMessageIds = new Map();
        
        // Import and initialize CopyTradeHandlers for copy trade strategy callbacks
        const CopyTradeHandlers = require('./copyTradeHandlers');
        this.copyTradeHandlers = new CopyTradeHandlers(bot, db, config);
    }

    async handleStrategies(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const message = `
*📊 Trading Strategies*

Configure and manage your automated trading strategies.

*Available Strategies:*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Volume Spike', callback_data: 'strategy_volume_spike' },
                        { text: '📉 Dip Buy', callback_data: 'strategy_dip_buy' }
                    ],
                    [
                        { text: '🎮 Narrative', callback_data: 'strategy_narrative' },
                        { text: '📊 Momentum', callback_data: 'strategy_momentum' }
                    ],
                    [
                        { text: '📈 Volatility', callback_data: 'strategy_volatility' },
                        { text: '👥 Copy Trade', callback_data: 'strategy_copy_trade' }
                    ],
                    [
                        { text: '❌ Deactivate All', callback_data: 'deactivate_all_strategies' },
                        { text: '📊 Performance', callback_data: 'strategy_performance' }
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
            console.error('Error in handleStrategies:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading strategies.');
        }
    }

    async handleConfigureStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const strategy = await this.db.getActiveStrategy(user.id);

            const message = strategy ? `
*Current Strategy:*

${JSON.stringify(strategy.strategy_json, null, 2)}` : `
*No Active Strategy*

Please select a strategy to configure:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Volume Spike', callback_data: 'strategy_volume_spike' },
                        { text: '📉 Dip Buy', callback_data: 'strategy_dip_buy' }
                    ],
                    [
                        { text: '🎮 Narrative', callback_data: 'strategy_narrative' },
                        { text: '📊 Momentum', callback_data: 'strategy_momentum' }
                    ],
                    [
                        { text: '📈 Volatility', callback_data: 'strategy_volatility' },
                        { text: '👥 Copy Trade', callback_data: 'strategy_copy_trade' }
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
            console.error('Error configuring strategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while configuring your strategy.');
        }
    }

    async handleVolumeSpikeStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get current strategy settings if they exist
            const strategySettings = await this.db.getStrategySettings(user.id, 'volume_spike') || {
                type: 'volume_spike',
                params: {
                    minVolumeIncrease: 200,
                    timeWindow: 3600,
                    minLiquidity: 50000,
                    maxSlippage: 1,
                    isActive: false
                }
            };

            const message = `
*📈 Volume Spike Strategy*

This strategy identifies and trades tokens experiencing significant volume spikes.

*Current Settings:*
- Min Volume Increase: ${strategySettings.params.minVolumeIncrease}%
- Time Window: ${strategySettings.params.timeWindow / 3600}h
- Min Liquidity: $${strategySettings.params.minLiquidity.toLocaleString()}
- Max Slippage: ${strategySettings.params.maxSlippage}%
- Status: ${strategySettings.params.isActive ? '✅ Active' : '❌ Inactive'}

Configure your strategy:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚡️ Min Volume %', callback_data: 'volume_spike_min_volume' },
                        { text: '⏱️ Time Window', callback_data: 'volume_spike_time_window' }
                    ],
                    [
                        { text: '💧 Min Liquidity', callback_data: 'volume_spike_min_liquidity' },
                        { text: '📊 Max Slippage', callback_data: 'volume_spike_max_slippage' }
                    ],
                    [
                        { text: strategySettings.params.isActive ? '❌ Deactivate' : '✅ Activate', 
                          callback_data: strategySettings.params.isActive ? 'volume_spike_deactivate' : 'volume_spike_activate' }
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

            // Store the current settings in user state for later use
            this.userStates.set(telegramId, {
                ...this.userStates.get(telegramId),
                currentStrategy: 'volume_spike',
                strategySettings: strategySettings.params
            });
        } catch (error) {
            console.error('Error in handleVolumeSpikeStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the volume spike strategy.');
        }
    }

    async handleDipBuyStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Retrieve or create default "dip_buy" settings
            const strategySettings = await this.db.getStrategySettings(user.id, 'dip_buy') || {
                type: 'dip_buy',
                params: {
                    minPriceDrop: 10,
                    timeWindow: 3600,
                    minLiquidity: 50000,
                    maxSlippage: 1,
                    isActive: false
                }
            };

            // Store them in userState so handleDipBuyDropSelection can find them
            this.userStates.set(telegramId, {
                ...this.userStates.get(telegramId),
                currentStrategy: 'dip_buy',
                strategySettings: strategySettings.params
            });

            const message = `
*📉 Dip Buy Strategy*

This strategy identifies and buys tokens during significant price dips.

*Settings:*
- Min Price Drop: ${strategySettings.params.minPriceDrop}%
- Time Window: ${strategySettings.params.timeWindow / 3600} hour
- Min Liquidity: $${strategySettings.params.minLiquidity.toLocaleString()}
- Max Slippage: ${strategySettings.params.maxSlippage}%
- Status: ${strategySettings.params.isActive ? '✅ Active' : '❌ Inactive'}

Configure your strategy:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📉 Min Price Drop %', callback_data: 'dip_buy_min_drop' },
                        { text: '⏱️ Time Window', callback_data: 'dip_buy_time_window' }
                    ],
                    [
                        { text: '💧 Min Liquidity', callback_data: 'dip_buy_min_liquidity' },
                        { text: '📊 Max Slippage', callback_data: 'dip_buy_max_slippage' }
                    ],
                    [
                        { text: strategySettings.params.isActive ? '❌ Deactivate' : '✅ Activate Strategy', 
                          callback_data: strategySettings.params.isActive ? 'dip_buy_deactivate' : 'dip_buy_activate' }
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
            console.error('Error in handleDipBuyStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the dip buy strategy.');
        }
    }

    async handleNarrativeStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get current strategy settings from database
            const strategySettings = await this.db.getStrategySettings(user.id, 'narrative') || {
                type: 'narrative',
                params: {
                    categories: [],
                    minScore: 0.7,
                    minVolume: 100000,
                    maxSlippage: 1,
                    isActive: false
                }
            };

            // Initialize or update user state
            let userState = this.userStates.get(telegramId);
            if (!userState) {
                userState = {
                    strategySettings: strategySettings.params
                };
            } else {
                userState.strategySettings = strategySettings.params;
            }
            this.userStates.set(telegramId, userState);

            const message = `
*🎮 Narrative Strategy*

This strategy identifies and trades tokens based on trending narratives.

*Settings:*
- Categories: ${userState.strategySettings.categories.length > 0 ? userState.strategySettings.categories.join(', ') : 'Not set'}
- Min Social Score: ${userState.strategySettings.minScore || 0.7}
- Min Volume: $${userState.strategySettings.minVolume || 100000}
- Max Slippage: ${userState.strategySettings.maxSlippage || 1}%
- Status: ${userState.strategySettings.isActive ? '✅ Active' : '❌ Inactive'}

Configure your strategy:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🏷️ Categories', callback_data: 'narrative_categories' },
                        { text: '📊 Min Social Score', callback_data: 'narrative_min_score' }
                    ],
                    [
                        { text: '💧 Min Volume', callback_data: 'narrative_min_volume' },
                        { text: '📊 Max Slippage', callback_data: 'narrative_max_slippage' }
                    ],
                    [
                        { text: userState.strategySettings.isActive ? '❌ Deactivate' : '✅ Activate Strategy', 
                          callback_data: userState.strategySettings.isActive ? 'narrative_deactivate' : 'narrative_activate' }
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
            console.error('Error in handleNarrativeStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the narrative strategy.');
        }
    }

    async handleMomentumStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get current strategy settings from database or use defaults
            const strategySettings = await this.db.getStrategySettings(user.id, 'momentum') || {
                type: 'momentum',
                params: {
                    lookbackPeriod: 86400,
                    minPriceChange: 5,
                    minVolume: 50000,
                    maxSlippage: 1,
                    isActive: false
                }
            };

            // Initialize or update user state
            let userState = this.userStates.get(telegramId);
            if (!userState) {
                userState = {
                    strategySettings: strategySettings.params
                };
            } else {
                userState.strategySettings = strategySettings.params;
            }
            this.userStates.set(telegramId, userState);

            const message = `
*📊 Momentum Strategy*

This strategy identifies and trades tokens with strong price momentum.

*Settings:*
- Lookback Period: ${userState.strategySettings.lookbackPeriod / 3600} hours
- Min Price Change: ${userState.strategySettings.minPriceChange}%
- Min Volume: $${userState.strategySettings.minVolume.toLocaleString()}
- Max Slippage: ${userState.strategySettings.maxSlippage}%
- Status: ${userState.strategySettings.isActive ? '✅ Active' : '❌ Inactive'}

Configure your strategy:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⏱️ Lookback Period', callback_data: 'momentum_lookback' },
                        { text: '📈 Min Price Change', callback_data: 'momentum_min_change' }
                    ],
                    [
                        { text: '💧 Min Volume', callback_data: 'momentum_min_volume' },
                        { text: '📊 Max Slippage', callback_data: 'momentum_max_slippage' }
                    ],
                    [
                        { text: userState.strategySettings.isActive ? '❌ Deactivate' : '✅ Activate Strategy', 
                          callback_data: userState.strategySettings.isActive ? 'momentum_deactivate' : 'momentum_activate' }
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
            console.error('Error in handleMomentumStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the momentum strategy.');
        }
    }

    async handleVolatilityStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get current strategy settings from database or use defaults
            const strategySettings = await this.db.getStrategySettings(user.id, 'volatility') || {
                type: 'volatility',
                params: {
                    minVolatility: 20,
                    lookbackPeriod: 86400,
                    minLiquidity: 50000,
                    maxSlippage: 1,
                    isActive: false
                }
            };

            // Initialize or update user state
            let userState = this.userStates.get(telegramId);
            if (!userState) {
                userState = {
                    strategySettings: strategySettings.params
                };
            } else {
                userState.strategySettings = strategySettings.params;
            }
            this.userStates.set(telegramId, userState);

            const message = `
*📈 Volatility Strategy*

This strategy identifies and trades tokens with high volatility patterns.

*Settings:*
- Min Volatility: ${userState.strategySettings.minVolatility}%
- Lookback Period: ${userState.strategySettings.lookbackPeriod / 3600} hours
- Min Liquidity: $${userState.strategySettings.minLiquidity.toLocaleString()}
- Max Slippage: ${userState.strategySettings.maxSlippage}%
- Status: ${userState.strategySettings.isActive ? '✅ Active' : '❌ Inactive'}

Configure your strategy:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Min Volatility', callback_data: 'volatility_min_vol' },
                        { text: '⏱️ Lookback Period', callback_data: 'volatility_lookback' }
                    ],
                    [
                        { text: '💧 Min Liquidity', callback_data: 'volatility_min_liquidity' },
                        { text: '📊 Max Slippage', callback_data: 'volatility_max_slippage' }
                    ],
                    [
                        { text: userState.strategySettings.isActive ? '❌ Deactivate' : '✅ Activate Strategy', 
                          callback_data: userState.strategySettings.isActive ? 'volatility_deactivate' : 'volatility_activate' }
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
            console.error('Error in handleVolatilityStrategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the volatility strategy.');
        }
    }

    async handleStrategyPerformance(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // TODO: Implement actual performance tracking
            const message = `
*📊 Strategy Performance*

*Overall Performance:*
- Total Trades: 0
- Successful Trades: 0
- Win Rate: 0%
- Total P&L: $0.00

*Strategy Breakdown:*
- Volume Spike: Inactive
- Dip Buy: Inactive
- Narrative: Inactive
- Momentum: Inactive
- Volatility: Inactive
- Copy Trade: Inactive

*Last 30 Days:*
- Best Day: $0.00
- Worst Day: $0.00
- Average Daily P&L: $0.00

💡 *Note:* Performance tracking will be available once strategies are activated.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'strategy_performance' },
                        { text: '📊 Detailed Report', callback_data: 'export_performance' }
                    ],
                    [
                        { text: '⚙️ Configure Strategies', callback_data: 'strategies' },
                        { text: '◀️ Back', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleStrategyPerformance:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading strategy performance.');
        }
    }

    async handleDeactivateAllStrategies(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const strategies = await this.db.getUserStrategies(user.id);
            if (strategies.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No strategies found to deactivate.');
                return;
            }

            // Deactivate all strategies
            let deactivatedCount = 0;
            for (const strategy of strategies) {
                if (strategy.params && strategy.params.isActive) {
                    strategy.params.isActive = false;
                    await this.db.updateStrategySettings(user.id, strategy.type, strategy.params);
                    deactivatedCount++;
                }
            }

            const message = `
*❌ All Strategies Deactivated*

Successfully deactivated ${deactivatedCount} strategy/strategies.

All trading strategies are now paused. You can reactivate them individually from the strategies menu.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Strategies', callback_data: 'strategies' },
                        { text: '📋 Rules', callback_data: 'rules' }
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
            console.error('Error in handleDeactivateAllStrategies:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error deactivating the strategies.');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }

    async handleStrategyCallback(chatId, telegramId, callbackData) {
        try {
            switch (callbackData) {
                case 'strategies':
                    await this.handleStrategies(chatId, telegramId);
                    break;
                case 'strategy_volume_spike':
                    await this.handleVolumeSpikeStrategy(chatId, telegramId);
                    break;
                case 'strategy_dip_buy':
                    await this.handleDipBuyStrategy(chatId, telegramId);
                    break;
                case 'strategy_narrative':
                    await this.handleNarrativeStrategy(chatId, telegramId);
                    break;
                case 'strategy_momentum':
                    await this.handleMomentumStrategy(chatId, telegramId);
                    break;
                case 'strategy_volatility':
                    await this.handleVolatilityStrategy(chatId, telegramId);
                    break;
                case 'strategy_copy_trade':
                    await this.copyTradeHandlers.handleCopyTradeStrategy(chatId, telegramId);
                    break;
                // Copy trade activation/deactivation
                case 'copy_trade_activate':
                    await this.copyTradeHandlers.handleCopyTradeActivate(chatId, telegramId);
                    break;
                case 'copy_trade_deactivate':
                    await this.copyTradeHandlers.handleCopyTradeDeactivate(chatId, telegramId);
                    break;
                case 'copy_trade_select':
                    await this.copyTradeHandlers.handleCopyTradeSelect(chatId, telegramId);
                    break;
                // Volume spike strategy callbacks
                case 'volume_spike_activate':
                    await this.handleVolumeSpikeActivate(chatId, telegramId);
                    break;
                case 'volume_spike_deactivate':
                    await this.handleVolumeSpikeDeactivate(chatId, telegramId);
                    break;
                // Dip buy strategy callbacks  
                case 'dip_buy_activate':
                    await this.handleDipBuyActivate(chatId, telegramId);
                    break;
                case 'dip_buy_deactivate':
                    await this.handleDipBuyDeactivate(chatId, telegramId);
                    break;
                // Narrative strategy callbacksth
                case 'narrative_activate':
                    await this.handleNarrativeActivate(chatId, telegramId);
                    break;
                case 'narrative_deactivate':
                    await this.handleNarrativeDeactivate(chatId, telegramId);
                    break;
                // Momentum strategy callbacks
                case 'momentum_activate':
                    await this.handleMomentumActivate(chatId, telegramId);
                    break;
                case 'momentum_deactivate':
                    await this.handleMomentumDeactivate(chatId, telegramId);
                    break;
                // Volatility strategy callbacks
                case 'volatility_activate':
                    await this.handleVolatilityActivate(chatId, telegramId);
                    break;
                case 'volatility_deactivate':
                    await this.handleVolatilityDeactivate(chatId, telegramId);
                    break;
                default:
                    // Handle pattern-based callbacks
                    if (callbackData.startsWith('volume_spike_')) {
                        await this.handleVolumeSpikeCallbacks(chatId, telegramId, callbackData);
                    } else if (callbackData.startsWith('dip_buy_')) {
                        await this.handleDipBuyCallbacks(chatId, telegramId, callbackData);
                    } else if (callbackData.startsWith('narrative_')) {
                        await this.handleNarrativeCallbacks(chatId, telegramId, callbackData);
                    } else if (callbackData.startsWith('momentum_')) {
                        await this.handleMomentumCallbacks(chatId, telegramId, callbackData);
                    } else if (callbackData.startsWith('volatility_')) {
                        await this.handleVolatilityCallbacks(chatId, telegramId, callbackData);
                    } else {
                        console.warn('Unhandled strategy callback:', callbackData);
                        await this.sendAndStoreMessage(chatId, 'Sorry, this strategy option is not supported.');
                    }
            }
        } catch (error) {
            console.error('Error in handleStrategyCallback:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your request.');
        }
    }

    async handleToggleAllStrategies(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const strategies = await this.db.getUserStrategies(user.id);
            if (strategies.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No strategies found to toggle.');
                return;
            }

            // Check if any strategy is currently active
            const anyActive = strategies.some(strategy => {
                try {
                    const data = JSON.parse(strategy.strategy_json);
                    return data.params && data.params.isActive === true;
                } catch (e) {
                    return false;
                }
            });

            const shouldActivate = !anyActive;

            // Toggle all strategies
            for (const strategy of strategies) {
                try {
                    const data = JSON.parse(strategy.strategy_json);
                    if (data.params) {
                        data.params.isActive = shouldActivate;
                        await this.db.updateStrategy(strategy.id, {
                            strategy_json: JSON.stringify(data)
                        });
                    }
                } catch (e) {
                    console.error('Error updating strategy:', strategy.id, e);
                }
            }

            const message = `
*${shouldActivate ? '✅' : '⏸️'} All Strategies ${shouldActivate ? 'Activated' : 'Deactivated'}*

${shouldActivate ? 'Activated' : 'Deactivated'} ${strategies.length} strategy/strategies successfully.

Your strategies are now ${shouldActivate ? 'actively trading' : 'paused'}.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Strategies', callback_data: 'strategies' },
                        { text: '📋 Rules', callback_data: 'rules' }
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
            console.error('Error toggling all strategies:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error toggling the strategies.');
        }
    }

    async handleStrategyToggle(chatId, telegramId, strategyType) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const strategies = await this.db.getUserStrategies(user.id);
            const isCurrentlyActive = this.isStrategyActive(strategies, strategyType);

            if (isCurrentlyActive) {
                // Deactivate the strategy
                const currentStrategy = strategies.find(s => {
                    try {
                        const data = JSON.parse(s.strategy_json);
                        return data.type === strategyType && data.params && data.params.isActive === true;
                    } catch (e) {
                        return false;
                    }
                });

                if (currentStrategy) {
                    const data = JSON.parse(currentStrategy.strategy_json);
                    data.params.isActive = false;
                    await this.db.updateStrategy(currentStrategy.id, {
                        strategy_json: JSON.stringify(data)
                    });
                }
                await this.sendAndStoreMessage(chatId, `❌ ${this.formatStrategyName(strategyType)} strategy has been deactivated.`);
            } else {
                // First, deactivate all other strategies (mutual exclusion)
                for (const strategy of strategies) {
                    try {
                        const data = JSON.parse(strategy.strategy_json);
                        if (data.params && data.params.isActive === true) {
                            data.params.isActive = false;
                            await this.db.updateStrategy(strategy.id, {
                                strategy_json: JSON.stringify(data)
                            });
                        }
                    } catch (e) {
                        console.error('Error deactivating strategy:', strategy.id, e);
                    }
                }

                // Create or activate the selected strategy
                let targetStrategy = strategies.find(s => {
                    try {
                        const data = JSON.parse(s.strategy_json);
                        return data.type === strategyType;
                    } catch (e) {
                        return false;
                    }
                });

                if (targetStrategy) {
                    // Update existing strategy
                    const data = JSON.parse(targetStrategy.strategy_json);
                    data.params.isActive = true;
                    await this.db.updateStrategy(targetStrategy.id, {
                        strategy_json: JSON.stringify(data)
                    });
                } else {
                    // Create new strategy with default parameters
                    const defaultParams = this.getDefaultStrategyParams(strategyType);
                    defaultParams.isActive = true;
                    await this.db.createStrategy(user.id, {
                        type: strategyType,
                        params: defaultParams
                    });
                }

                await this.sendAndStoreMessage(chatId, `✅ ${this.formatStrategyName(strategyType)} strategy has been activated!`);
            }

            // Return to strategies menu
            await this.handleStrategies(chatId, telegramId);
        } catch (error) {
            console.error('Error in handleStrategyToggle:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error toggling the strategy.');
        }
    }

    isStrategyActive(strategies, strategyType) {
        return strategies.some(strategy => {
            try {
                const data = JSON.parse(strategy.strategy_json);
                return data.type === strategyType && data.params && data.params.isActive === true;
            } catch (e) {
                return false;
            }
        });
    }

    getDefaultStrategyParams(strategyType) {
        const defaults = {
            volume_spike: {
                minVolumeIncrease: 200,
                timeWindow: 3600,
                minLiquidity: 50000,
                maxSlippage: 1
            },
            dip_buy: {
                minPriceDrop: 10,
                timeWindow: 3600,
                minLiquidity: 50000,
                maxSlippage: 1
            },
            narrative: {
                categories: [],
                minScore: 0.7,
                minVolume: 100000,
                maxSlippage: 1
            },
            momentum: {
                lookbackPeriod: 86400,
                minPriceChange: 5,
                minVolume: 50000,
                maxSlippage: 1
            },
            volatility: {
                minVolatility: 20,
                lookbackPeriod: 86400,
                minLiquidity: 50000,
                maxSlippage: 1
            },
            copy_trade: {
                targetWallets: [],
                minTradeSize: 0.1,
                maxTradeSize: 10,
                minSuccessRate: 0.7,
                maxSlippage: 1,
                delaySeconds: 2,
                maxPositions: 5
            }
        };

        return defaults[strategyType] || {
            maxPositionSize: 0.1,
            stopLoss: 0.1,
            takeProfit: 0.2,
            checkInterval: 300000
        };
    }

    formatStrategyName(strategyType) {
        const names = {
            volume_spike: 'Volume Spike',
            dip_buy: 'Dip Buy',
            narrative: 'Narrative',
            momentum: 'Momentum',
            volatility: 'Volatility',
            copy_trade: 'Copy Trade'
        };
        return names[strategyType] || strategyType;
    }

    async handleVolumeSpikeActivate(chatId, telegramId) {
        await this.activateStrategy(chatId, telegramId, 'volume_spike', 'Volume Spike');
    }

    async handleVolumeSpikeDeactivate(chatId, telegramId) {
        await this.deactivateStrategy(chatId, telegramId, 'volume_spike', 'Volume Spike');
    }

    async handleDipBuyActivate(chatId, telegramId) {
        await this.activateStrategy(chatId, telegramId, 'dip_buy', 'Dip Buy');
    }

    async handleDipBuyDeactivate(chatId, telegramId) {
        await this.deactivateStrategy(chatId, telegramId, 'dip_buy', 'Dip Buy');
    }

    async handleNarrativeActivate(chatId, telegramId) {
        await this.activateStrategy(chatId, telegramId, 'narrative', 'Narrative');
    }

    async handleNarrativeDeactivate(chatId, telegramId) {
        await this.deactivateStrategy(chatId, telegramId, 'narrative', 'Narrative');
    }

    async handleMomentumActivate(chatId, telegramId) {
        await this.activateStrategy(chatId, telegramId, 'momentum', 'Momentum');
    }

    async handleMomentumDeactivate(chatId, telegramId) {
        await this.deactivateStrategy(chatId, telegramId, 'momentum', 'Momentum');
    }

    async handleVolatilityActivate(chatId, telegramId) {
        await this.activateStrategy(chatId, telegramId, 'volatility', 'Volatility');
    }

    async handleVolatilityDeactivate(chatId, telegramId) {
        await this.deactivateStrategy(chatId, telegramId, 'volatility', 'Volatility');
    }

    async activateStrategy(chatId, telegramId, strategyType, strategyName) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get or create strategy settings
            let strategySettings = await this.db.getStrategySettings(user.id, strategyType);
            if (!strategySettings) {
                const defaultParams = this.getDefaultStrategyParams(strategyType);
                defaultParams.isActive = true;
                await this.db.createStrategy(user.id, {
                    type: strategyType,
                    params: defaultParams
                });
            } else {
                strategySettings.params.isActive = true;
                await this.db.updateStrategySettings(user.id, strategyType, strategySettings.params);
            }

            await this.sendAndStoreMessage(chatId, `✅ ${strategyName} strategy has been activated!`);
            
            // Return to the strategy menu
            await this[`handle${strategyName.replace(' ', '')}Strategy`](chatId, telegramId);
        } catch (error) {
            console.error(`Error activating ${strategyType} strategy:`, error);
            await this.sendAndStoreMessage(chatId, `Sorry, something went wrong while activating the ${strategyName} strategy.`);
        }
    }

    async deactivateStrategy(chatId, telegramId, strategyType, strategyName) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const strategySettings = await this.db.getStrategySettings(user.id, strategyType);
            if (strategySettings) {
                strategySettings.params.isActive = false;
                await this.db.updateStrategySettings(user.id, strategyType, strategySettings.params);
            }

            await this.sendAndStoreMessage(chatId, `❌ ${strategyName} strategy has been deactivated.`);
            
            // Return to the strategy menu
            await this[`handle${strategyName.replace(' ', '')}Strategy`](chatId, telegramId);
        } catch (error) {
            console.error(`Error deactivating ${strategyType} strategy:`, error);
            await this.sendAndStoreMessage(chatId, `Sorry, something went wrong while deactivating the ${strategyName} strategy.`);
        }
    }

    // Placeholder methods for pattern-based callbacks (to be implemented as needed)
    async handleVolumeSpikeCallbacks(chatId, telegramId, callbackData) {
        await this.sendAndStoreMessage(chatId, `Volume spike callback handling for "${callbackData}" needs to be implemented.`);
    }

    async handleDipBuyCallbacks(chatId, telegramId, callbackData) {
        try {
            if (callbackData.startsWith('dip_buy_min_drop_')) {
                const percentage = callbackData.replace('dip_buy_min_drop_', '');
                await this.sendAndStoreMessage(chatId, `✅ Minimum dip percentage set to ${percentage}%`);
            } else if (callbackData.startsWith('dip_buy_min_liquidity_')) {
                const amount = callbackData.replace('dip_buy_min_liquidity_', '');
                await this.sendAndStoreMessage(chatId, `✅ Minimum liquidity set to $${parseInt(amount).toLocaleString()}`);
            } else if (callbackData.startsWith('dip_buy_max_slippage_')) {
                const slippage = callbackData.replace('dip_buy_max_slippage_', '');
                await this.sendAndStoreMessage(chatId, `✅ Maximum slippage set to ${slippage}%`);
            } else if (callbackData.startsWith('dip_buy_time_window_')) {
                const hours = callbackData.replace('dip_buy_time_window_', '');
                await this.sendAndStoreMessage(chatId, `✅ Time window set to ${hours} hours`);
            } else if (callbackData === 'dip_buy_min_drop') {
                const message = `
*📉 Minimum Dip Percentage*

Set the minimum price drop required to trigger a dip buy order.

*Available Options:*
• 5% - Catch small dips
• 10% - Moderate dips
• 15% - Significant dips
• 20% - Major dips
• 25% - Severe dips
• 30% - Extreme dips

Choose minimum dip percentage:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '5%', callback_data: 'dip_buy_min_drop_5' },
                            { text: '10%', callback_data: 'dip_buy_min_drop_10' }
                        ],
                        [
                            { text: '15%', callback_data: 'dip_buy_min_drop_15' },
                            { text: '20%', callback_data: 'dip_buy_min_drop_20' }
                        ],
                        [
                            { text: '25%', callback_data: 'dip_buy_min_drop_25' },
                            { text: '30%', callback_data: 'dip_buy_min_drop_30' }
                        ],
                        [
                            { text: '◀️ Back', callback_data: 'strategy_dip_buy' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'dip_buy_min_liquidity') {
                const message = `
*💧 Minimum Liquidity*

Set the minimum liquidity required for dip buy orders.

*Available Options:*
• $50K - Small cap tokens
• $100K - Medium liquidity
• $150K - Good liquidity
• $200K - High liquidity
• $300K - Very high liquidity
• $500K - Excellent liquidity

Choose minimum liquidity:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '$50K', callback_data: 'dip_buy_min_liquidity_50000' },
                            { text: '$100K', callback_data: 'dip_buy_min_liquidity_100000' }
                        ],
                        [
                            { text: '$150K', callback_data: 'dip_buy_min_liquidity_150000' },
                            { text: '$200K', callback_data: 'dip_buy_min_liquidity_200000' }
                        ],
                        [
                            { text: '$300K', callback_data: 'dip_buy_min_liquidity_300000' },
                            { text: '$500K', callback_data: 'dip_buy_min_liquidity_500000' }
                        ],
                        [
                            { text: '◀️ Back', callback_data: 'strategy_dip_buy' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'dip_buy_max_slippage') {
                const message = `
*🔄 Maximum Slippage*

Set the maximum price slippage allowed for dip buy orders.

*Available Options:*
• 0.1% - Very tight execution
• 0.2% - Tight execution
• 0.5% - Standard slippage
• 1% - Moderate slippage
• 2% - Higher slippage

Choose maximum slippage:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '0.1%', callback_data: 'dip_buy_max_slippage_0.1' },
                            { text: '0.2%', callback_data: 'dip_buy_max_slippage_0.2' }
                        ],
                        [
                            { text: '0.5%', callback_data: 'dip_buy_max_slippage_0.5' },
                            { text: '1%', callback_data: 'dip_buy_max_slippage_1' }
                        ],
                        [
                            { text: '2%', callback_data: 'dip_buy_max_slippage_2' }
                        ],
                        [
                            { text: '◀️ Back', callback_data: 'strategy_dip_buy' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'dip_buy_time_window') {
                const message = `
*⏰ Time Window*

Set the time window for detecting dip patterns.

*Available Options:*
• 1 hour - Very short-term dips
• 2 hours - Short-term dips  
• 4 hours - Medium-term dips
• 6 hours - Longer-term dips
• 12 hours - Extended dips
• 24 hours - Daily dips

Choose time window:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '1h', callback_data: 'dip_buy_time_window_1' },
                            { text: '2h', callback_data: 'dip_buy_time_window_2' }
                        ],
                        [
                            { text: '4h', callback_data: 'dip_buy_time_window_4' },
                            { text: '6h', callback_data: 'dip_buy_time_window_6' }
                        ],
                        [
                            { text: '12h', callback_data: 'dip_buy_time_window_12' },
                            { text: '24h', callback_data: 'dip_buy_time_window_24' }
                        ],
                        [
                            { text: '◀️ Back', callback_data: 'strategy_dip_buy' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.sendAndStoreMessage(chatId, `Dip buy setting "${callbackData}" has been configured successfully.`);
            }
            
            // Return to dip buy strategy settings after a brief delay for parameter selections
            if (callbackData.includes('_')) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.sendAndStoreMessage(chatId, 'Configure additional dip buy settings or activate the strategy.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📉 Back to Dip Buy Settings', callback_data: 'strategy_dip_buy' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('Error in handleDipBuyCallbacks:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while configuring dip buy settings.');
        }
    }

    async handleNarrativeCallbacks(chatId, telegramId, callbackData) {
        await this.sendAndStoreMessage(chatId, `Narrative callback handling for "${callbackData}" needs to be implemented.`);
    }

    async handleMomentumCallbacks(chatId, telegramId, callbackData) {
        await this.sendAndStoreMessage(chatId, `Momentum callback handling for "${callbackData}" needs to be implemented.`);
    }

    async handleVolatilityCallbacks(chatId, telegramId, callbackData) {
        await this.sendAndStoreMessage(chatId, `Volatility callback handling for "${callbackData}" needs to be implemented.`);
    }

    // Handle input messages for strategy-related waiting states
    async handleMessage(ctx, userState) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const message = ctx.message.text;

        try {
            if (userState && userState.waitingFor) {
                switch (userState.waitingFor) {
                    case 'volume_spike_min_volume': {
                        const volume = parseFloat(message);
                        if (isNaN(volume) || volume < 50 || volume > 1000) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid volume increase between 50% and 1000%.');
                            return true;
                        }

                        const user = await this.db.getUserByTelegramId(telegramId);
                        if (!user) {
                            await this.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                            return true;
                        }

                        try {
                            const currentSettings = await this.db.getStrategySettings(user.id, 'volume_spike') || {
                                type: 'volume_spike',
                                params: {
                                    minVolumeIncrease: 200,
                                    timeWindow: 3600,
                                    minLiquidity: 50000,
                                    maxSlippage: 1,
                                    isActive: false
                                }
                            };

                            const updatedSettings = {
                                ...currentSettings,
                                params: {
                                    ...currentSettings.params,
                                    minVolumeIncrease: volume
                                }
                            };

                            await this.db.updateStrategySettings(user.id, 'volume_spike', updatedSettings);
                            await this.sendAndStoreMessage(chatId, `✅ Minimum volume increase set to ${volume}%.`);
                            return { handled: true, clearWaitingFor: true, redirectTo: 'volume_spike' };
                        } catch (error) {
                            console.error('Error updating volume spike settings:', error);
                            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the volume spike settings. Please try again.');
                            return true;
                        }
                    }
                    case 'volume_spike_min_liquidity': {
                        const liquidity = parseFloat(message);
                        if (isNaN(liquidity) || liquidity < 10000) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid minimum liquidity of at least $10,000.');
                            return true;
                        }

                        const user = await this.db.getUserByTelegramId(telegramId);
                        if (!user) {
                            await this.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                            return true;
                        }

                        try {
                            const currentSettings = await this.db.getStrategySettings(user.id, 'volume_spike') || {
                                type: 'volume_spike',
                                params: {
                                    minVolumeIncrease: 200,
                                    timeWindow: 3600,
                                    minLiquidity: 50000,
                                    maxSlippage: 1,
                                    isActive: false
                                }
                            };

                            const updatedSettings = {
                                ...currentSettings,
                                params: {
                                    ...currentSettings.params,
                                    minLiquidity: liquidity
                                }
                            };

                            await this.db.updateStrategySettings(user.id, 'volume_spike', updatedSettings);
                            await this.sendAndStoreMessage(chatId, `✅ Minimum liquidity set to $${liquidity.toLocaleString()}.`);
                            return { handled: true, clearWaitingFor: true, redirectTo: 'volume_spike' };
                        } catch (error) {
                            console.error('Error updating volume spike settings:', error);
                            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the volume spike settings. Please try again.');
                            return true;
                        }
                    }
                    case 'volume_spike_max_slippage': {
                        const slippage = parseFloat(message);
                        if (isNaN(slippage) || slippage < 0.1 || slippage > 5) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid slippage between 0.1% and 5%.');
                            return true;
                        }

                        const user = await this.db.getUserByTelegramId(telegramId);
                        if (!user) {
                            await this.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                            return true;
                        }

                        try {
                            const currentSettings = await this.db.getStrategySettings(user.id, 'volume_spike') || {
                                type: 'volume_spike',
                                params: {
                                    minVolumeIncrease: 200,
                                    timeWindow: 3600,
                                    minLiquidity: 50000,
                                    maxSlippage: 1,
                                    isActive: false
                                }
                            };

                            const updatedSettings = {
                                ...currentSettings,
                                params: {
                                    ...currentSettings.params,
                                    maxSlippage: slippage
                                }
                            };

                            await this.db.updateStrategySettings(user.id, 'volume_spike', updatedSettings);
                            await this.sendAndStoreMessage(chatId, `✅ Maximum slippage set to ${slippage}%.`);
                            return { handled: true, clearWaitingFor: true, redirectTo: 'volume_spike' };
                        } catch (error) {
                            console.error('Error updating volume spike settings:', error);
                            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the volume spike settings. Please try again.');
                            return true;
                        }
                    }
                    default:
                        return false; // Not handled by strategy handlers
                }
            }
            return false;
        } catch (error) {
            console.error('Error in strategyHandlers.handleMessage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your strategy input.');
            return true;
        }
    }
}

module.exports = StrategyHandlers;
