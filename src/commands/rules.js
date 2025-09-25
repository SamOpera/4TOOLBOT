const RuleEngine = require('../services/ruleEngine');

class RulesCommand {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.ruleEngine = new RuleEngine(db, config);
        this.userStates = new Map();
        this.lastMessageIds = new Map();
    }

    async sendMessage(chatId, message, options = {}) {
        // Delete previous message if it exists
        const lastMessageId = this.lastMessageIds.get(chatId);
        if (lastMessageId) {
            try {
                await this.bot.deleteMessage(chatId, lastMessageId);
            } catch (error) {
                // Only log if it's not a "message not found" error
                if (!error.message.includes('message to delete not found')) {
                    console.error('Error deleting previous message:', error);
                }
            }
        }

        // Send new message and store its ID
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }

    async handleRulesCommand(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        const message = `
*📋 Rules Management*

*Create and manage your trading rules and strategies*

*Available Features:*
- Create custom trading rules
- Set token filters (category, market cap, etc.)
- Define entry conditions
- Monitor rule performance
- View rule history`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📝 Create Rule', callback_data: 'rules_create' },
                    { text: '📋 List Rules', callback_data: 'rules_list' }
                ],
                [
                    { text: '📊 Rule Stats', callback_data: 'rules_stats' },
                    { text: '⚙️ Settings', callback_data: 'rules_settings' }
                ],
                [
                    { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleCallbackQuery(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const action = ctx.callbackQuery.data;

        try {
            // Handle main menu actions
            if (action === 'rules') {
                await this.handleRulesCommand(ctx);
                return;
            }
            // Handle rule creation start
            if (action === 'rules_create') {
                await this.startRuleCreation(ctx);
                return;
            }
            
            // Handle trading mode selection
            if (action === 'trading_mode_autonomous') {
                await this.handleTradingModeSelection(ctx, 'autonomous');
                return;
            }
            if (action === 'trading_mode_manual') {
                await this.handleTradingModeSelection(ctx, 'manual');
                return;
            }
            
            // Handle autonomous mode strategy creation
            if (action === 'autonomous_create_strategy') {
                await this.handleAutonomousStrategyCreation(ctx);
                return;
            }
            
            // Handle manual mode management rules
            if (action === 'manual_token_management') {
                await this.handleManualTokenManagement(ctx);
                return;
            }
            
            // Handle rule category selection
            if (action === 'rule_type_buy_rules') {
                await this.handleRuleCategorySelection(ctx, 'buy_rules');
                return;
            }
            if (action === 'rule_type_management_rules') {
                await this.handleRuleCategorySelection(ctx, 'management_rules');
                return;
            }
            if (action === 'rules_unified_options') {
                await this.showUnifiedRuleOptions(ctx);
                return;
            }
            if (action === 'rules_list') {
                await this.listRules(ctx);
                return;
            }
            if (action === 'rules_stats') {
                await this.showRuleStats(ctx);
                return;
            }
            if (action === 'rules_settings') {
                await this.showRuleSettings(ctx);
                return;
            }
            // Handle rule reset
            if (action === 'rule_reset') {
                await this.handleRuleReset(ctx);
                return;
            }

            // Handle strategy-related callbacks for Price and Volume Change only
            if (action === 'strategy_price' || action === 'strategy_volume') {
                const type = action.replace('strategy_', '');
                await this.handleStrategySelection(ctx, type);
                return;
            }
            
            if (action === 'price_change_increase' || action === 'price_change_decrease') {
                const direction = action.replace('price_change_', '');
                await this.handlePriceChangeDirection(ctx, direction);
                return;
            }
            if (action === 'volume_change_increase' || action === 'volume_change_decrease') {
                const direction = action.replace('volume_change_', '');
                await this.handleVolumeChangeDirection(ctx, direction);
                return;
            }

            // Handle filter selection callbacks
            if (action === 'mcap_select') {
                await this.showMarketCapOptions(ctx);
                return;
            }
            if (action === 'price_select') {
                await this.showPriceOptions(ctx);
                return;
            }
            if (action === 'liquidity_select') {
                await this.showLiquidityOptions(ctx);
                return;
            }
            if (action === 'volume_select') {
                await this.showVolumeOptions(ctx);
                return;
            }
            if (action === 'category_select') {
                await this.showCategoryOptions(ctx);
                return;
            }
            if (action === 'timeframe_select') {
                const userState = this.userStates.get(userId);
                if (userState) {
                    await this.showTimeframeOptions(ctx, userState.step.includes('price') ? 'price' : 'volume');
                }
                return;
            }
            if (action === 'buy_amount_select') {
                await this.showBuyAmountOptions(ctx);
                return;
            }

            // Handle advanced strategy rule selection callbacks
            if (action === 'volume_spike_select') {
                await this.showVolumeSpikeRuleOptions(ctx);
                return;
            }
            if (action === 'dip_buy_select') {
                await this.showDipBuyRuleOptions(ctx);
                return;
            }
            if (action === 'narrative_select') {
                await this.showNarrativeRuleOptions(ctx);
                return;
            }
            if (action === 'momentum_select') {
                await this.showMomentumRuleOptions(ctx);
                return;
            }
            if (action === 'volatility_select') {
                await this.showVolatilityRuleOptions(ctx);
                return;
            }
            if (action === 'copy_trade_select') {
                await this.showCopyTradeRuleOptions(ctx);
                return;
            }
            if (action === 'price_change_select') {
                await this.showPriceChangeRuleOptions(ctx);
                return;
            }
            if (action === 'volume_change_select') {
                await this.showVolumeChangeRuleOptions(ctx);
                return;
            }

            // Handle management rule selection callbacks
            if (action === 'take_profit_select') {
                await this.showTakeProfitRuleOptions(ctx);
                return;
            }
            if (action === 'trailing_stop_select') {
                await this.showTrailingStopRuleOptions(ctx);
                return;
            }
            if (action === 'stop_loss_select') {
                await this.showStopLossRuleOptions(ctx);
                return;
            }

            // Handle timeframe selection FIRST (more specific patterns)
            if (action.startsWith('timeframe_') || action.startsWith('volume_timeframe_') || action.startsWith('price_timeframe_') || action.startsWith('volume_change_timeframe_')) {
                await this.handleTimeframeSelection(ctx, action);
                return;
            }

            // Handle market cap selection
            if (action.startsWith('mcap_')) {
                await this.handleMarketCapSelection(ctx, action);
                return;
            }

            // Handle price selection (excluding timeframe patterns)
            if (action.startsWith('price_') && !action.includes('timeframe_')) {
                await this.handlePriceSelection(ctx, action);
                return;
            }

            // Handle liquidity selection
            if (action.startsWith('liquidity_')) {
                await this.handleLiquiditySelection(ctx, action);
                return;
            }

            // Handle volume selection (excluding timeframe patterns)
            if (action.startsWith('volume_') && !action.includes('timeframe_')) {
                await this.handleVolumeSelection(ctx, action);
                return;
            }

            // Handle category selection
            if (action.startsWith('category_')) {
                await this.handleCategorySelection(ctx, action);
                return;
            }

            // Handle buy amount selection
            if (action.startsWith('rule_buy_amount_')) {
                await this.handleBuyAmountSelection(ctx, action);
                return;
            }

            // Handle volume spike rule callbacks
            if (action.startsWith('volume_spike_')) {
                await this.handleVolumeSpikeSelection(ctx, action);
                return;
            }

            // Handle dip buy rule callbacks
            if (action.startsWith('dip_buy_')) {
                await this.handleDipBuySelection(ctx, action);
                return;
            }

            // Handle narrative rule callbacks
            if (action.startsWith('narrative_')) {
                // Handle narrative category selections
                if (action.startsWith('narrative_cat_')) {
                    await this.handleNarrativeCategoryToggle(ctx, action);
                    return;
                } else if (action === 'narrative_categories_done') {
                    await this.showUnifiedRuleOptions(ctx);
                    return;
                } else {
                    await this.handleNarrativeSelection(ctx, action);
                    return;
                }
            }

            // Handle momentum rule callbacks
            if (action.startsWith('momentum_')) {
                await this.handleMomentumSelection(ctx, action);
                return;
            }

            // Handle volatility rule callbacks
            if (action.startsWith('volatility_')) {
                await this.handleVolatilitySelection(ctx, action);
                return;
            }

            // Handle copy trade rule callbacks
            if (action.startsWith('copy_trade_')) {
                await this.handleCopyTradeSelection(ctx, action);
                return;
            }

            // Handle management rule callbacks
            if (action.startsWith('take_profit_')) {
                await this.handleTakeProfitSelection(ctx, action);
                return;
            }

            if (action.startsWith('trailing_stop_')) {
                await this.handleTrailingStopSelection(ctx, action);
                return;
            }

            if (action.startsWith('stop_loss_')) {
                await this.handleStopLossSelection(ctx, action);
                return;
            }

            // Handle rule selection and management
            if (action.startsWith('rule_')) {
                if (action.includes('_toggle_')) {
                    const ruleId = action.replace('rule_toggle_', '');
                    await this.handleRuleToggle(ctx, ruleId);
                } else if (action.includes('_delete_')) {
                    if (action.includes('_confirm_')) {
                        const confirmRuleId = action.replace('rule_delete_confirm_', '');
                        await this.handleRuleDeleteConfirm(ctx, confirmRuleId);
                    } else {
                        const deleteRuleId = action.replace('rule_delete_', '');
                        await this.handleRuleDelete(ctx, deleteRuleId);
                    }
                } else if (action.includes('_stats_')) {
                    const statsRuleId = action.replace('rule_stats_', '');
                    await this.handleRuleStats(ctx, statsRuleId);
                } else if (action.includes('_edit_')) {
                    const editRuleId = action.replace('rule_edit_', '');
                    await this.handleRuleEdit(ctx, editRuleId);
                } else {
                    const ruleId = action.replace('rule_', '');
                    await this.handleRuleSelection(ctx, ruleId);
                }
                return;
            }

            // Handle settings actions
            if (action.startsWith('settings_')) {
                if (action.startsWith('settings_rule_')) {
                    const ruleId = action.replace('settings_rule_', '');
                    await this.handleRuleSettings(ctx, ruleId);
                } else if (action.startsWith('settings_notifications_')) {
                    const ruleId = action.replace('settings_notifications_', '');
                    await this.handleNotificationsSettings(ctx, ruleId);
                } else if (action.startsWith('settings_alerts_')) {
                    const ruleId = action.replace('settings_alerts_', '');
                    await this.handleAlertsSettings(ctx, ruleId);
                } else if (action.startsWith('settings_frequency_')) {
                    if (action.includes('_immediate_')) {
                        const ruleId = action.replace('settings_frequency_immediate_', '');
                        await this.updateFrequency(ctx, ruleId, 'immediate');
                    } else if (action.includes('_hourly_')) {
                        const ruleId = action.replace('settings_frequency_hourly_', '');
                        await this.updateFrequency(ctx, ruleId, 'hourly');
                    } else if (action.includes('_daily_')) {
                        const ruleId = action.replace('settings_frequency_daily_', '');
                        await this.updateFrequency(ctx, ruleId, 'daily');
                    } else if (action.includes('_weekly_')) {
                        const ruleId = action.replace('settings_frequency_weekly_', '');
                        await this.updateFrequency(ctx, ruleId, 'weekly');
                    } else {
                        const ruleId = action.replace('settings_frequency_', '');
                        await this.handleFrequencySettings(ctx, ruleId);
                    }
                } else if (action.startsWith('settings_threshold_')) {
                    if (action.includes('_50_')) {
                        const ruleId = action.replace('settings_threshold_50_', '');
                        await this.updateThreshold(ctx, ruleId, 50);
                    } else if (action.includes('_100_')) {
                        const ruleId = action.replace('settings_threshold_100_', '');
                        await this.updateThreshold(ctx, ruleId, 100);
                    } else if (action.includes('_200_')) {
                        const ruleId = action.replace('settings_threshold_200_', '');
                        await this.updateThreshold(ctx, ruleId, 200);
                    } else if (action.includes('_500_')) {
                        const ruleId = action.replace('settings_threshold_500_', '');
                        await this.updateThreshold(ctx, ruleId, 500);
                    } else {
                        const ruleId = action.replace('settings_threshold_', '');
                        await this.handleThresholdSettings(ctx, ruleId);
                    }
                } else if (action.startsWith('settings_toggle_notifications_')) {
                    const ruleId = action.replace('settings_toggle_notifications_', '');
                    await this.toggleNotifications(ctx, ruleId);
                } else if (action.startsWith('settings_toggle_alerts_')) {
                    const ruleId = action.replace('settings_toggle_alerts_', '');
                    await this.toggleAlerts(ctx, ruleId);
                }
                return;
            }

            // Handle rule confirmation
            if (action === 'confirm_rule') {
                await this.handleRuleConfirmation(ctx);
                return;
            }
            if (action === 'confirm_rule_final') {
                await this.createRuleAndShowSuccess(ctx);
                return;
            }

            // Handle strategy validation error
            if (action === 'strategy_validation_error') {
                await this.handleStrategyValidationError(ctx);
                return;
            }

            // Handle navigation
            if (action === 'main_menu') {
                await this.handleRulesCommand(ctx);
                return;
            }

            // If no handler found, log and notify user
            console.warn('Unhandled callback action:', action);
            await this.sendMessage(chatId, 'Sorry, this action is not supported. Please try again.');

        } catch (error) {
            console.error('Error handling callback query:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
        }
    }

    async handleRuleCreationCallbacks(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Handle rule type selection
        if (action === 'rule_type_filter') {
            await this.handleRuleTypeSelection(ctx, 'filter');
            return;
        }
        if (action === 'rule_type_strategy') {
            await this.handleRuleTypeSelection(ctx, 'strategy');
            return;
        }

        // Handle strategy selection
        if (action === 'strategy_price') {
            await this.handleStrategySelection(ctx, 'price');
            return;
        }
        if (action === 'strategy_volume') {
            await this.handleStrategySelection(ctx, 'volume');
            return;
        }

        // Handle price change direction
        if (action === 'price_change_increase') {
            await this.handlePriceChangeDirection(ctx, 'increase');
            return;
        }
        if (action === 'price_change_decrease') {
            await this.handlePriceChangeDirection(ctx, 'decrease');
            return;
        }

        // Handle volume change direction
        if (action === 'volume_change_increase') {
            await this.handleVolumeChangeDirection(ctx, 'increase');
            return;
        }
        if (action === 'volume_change_decrease') {
            await this.handleVolumeChangeDirection(ctx, 'decrease');
            return;
        }

        // Handle filter options
        if (action === 'filter_options') {
            await this.showUnifiedRuleOptions(ctx);
            return;
        }
        if (action === 'mcap_select') {
            await this.showMarketCapOptions(ctx);
            return;
        }
        if (action === 'price_select') {
            await this.showPriceOptions(ctx);
            return;
        }
        if (action === 'liquidity_select') {
            await this.showLiquidityOptions(ctx);
            return;
        }
        if (action === 'volume_select') {
            await this.showVolumeOptions(ctx);
            return;
        }
        if (action === 'category_select') {
            await this.showCategoryOptions(ctx);
            return;
        }
        if (action === 'timeframe_select') {
            const userState = this.userStates.get(userId);
            if (userState) {
                await this.showTimeframeOptions(ctx, userState.step.includes('price') ? 'price' : 'volume');
            }
            return;
        }

        // Handle timeframe selection (check this BEFORE price to avoid conflicts)
        if (action.startsWith('timeframe_') || action.startsWith('volume_timeframe_') || action.startsWith('price_timeframe_') || action.startsWith('volume_change_timeframe_')) {
            await this.handleTimeframeSelection(ctx, action);
            return;
        }

        // Handle market cap selection
        if (action.startsWith('mcap_')) {
            await this.handleMarketCapSelection(ctx, action);
            return;
        }

        // Handle price selection (excluding timeframe patterns)
        if (action.startsWith('price_') && !action.includes('timeframe_')) {
            await this.handlePriceSelection(ctx, action);
            return;
        }

        // Handle liquidity selection
        if (action.startsWith('liquidity_')) {
            await this.handleLiquiditySelection(ctx, action);
            return;
        }

        // Handle volume selection (exclude timeframe_ to avoid conflicts)
        if (action.startsWith('volume_') && !action.includes('timeframe_')) {
            await this.handleVolumeSelection(ctx, action);
            return;
        }

        // Handle category selection
        if (action.startsWith('category_')) {
            await this.handleCategorySelection(ctx, action);
            return;
        }

        // Handle done action
        if (action === 'done') {
            await this.handleRuleConfirmation(ctx);
            return;
        }

        // Handle rule selection and management
        if (action.startsWith('rule_')) {
            if (action.includes('_toggle_')) {
                const ruleId = action.replace('rule_toggle_', '');
                await this.handleRuleToggle(ctx, ruleId);
            } else if (action.includes('_delete_')) {
                if (action.includes('_confirm_')) {
                    const confirmRuleId = action.replace('rule_delete_confirm_', '');
                    await this.handleRuleDeleteConfirm(ctx, confirmRuleId);
                } else {
                    const deleteRuleId = action.replace('rule_delete_', '');
                    await this.handleRuleDelete(ctx, deleteRuleId);
                }
            } else if (action.includes('_stats_')) {
                const statsRuleId = action.replace('rule_stats_', '');
                await this.handleRuleStats(ctx, statsRuleId);
            } else {
                const ruleId = action.replace('rule_', '');
                await this.handleRuleSelection(ctx, ruleId);
            }
            return;
        }

        // Handle rule confirmation
        if (action === 'confirm_rule') {
            await this.handleRuleConfirmation(ctx);
            return;
        }

        // Handle rule creation success
        if (action === 'create_rule') {
            await this.createRuleAndShowSuccess(ctx);
            return;
        }

        // If we get here, the action is not supported
        console.error('Unhandled callback action:', action);
        await this.sendMessage(chatId, 'Invalid action. Please try again.');
    }

    async showMarketCapOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📊 Market Cap Range*

Select the market cap range for your filter:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Micro (<$1M)', callback_data: 'mcap_micro' },
                    { text: 'Small ($1M-$10M)', callback_data: 'mcap_small' }
                ],
                [
                    { text: 'Medium ($10M-$100M)', callback_data: 'mcap_medium' },
                    { text: 'Large ($100M-$1B)', callback_data: 'mcap_large' }
                ],
                [
                    { text: 'Mega (>$1B)', callback_data: 'mcap_mega' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showPriceOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*💰 Price Range*

Select the price range for your filter:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '<$0.01', callback_data: 'price_0_01' },
                    { text: '$0.01-$0.1', callback_data: 'price_0_1' }
                ],
                [
                    { text: '$0.1-$1', callback_data: 'price_1' },
                    { text: '$1-$10', callback_data: 'price_10' }
                ],
                [
                    { text: '>$10', callback_data: 'price_10_plus' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showLiquidityOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*💧 Liquidity Range*

Select the liquidity range for your filter:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Low (<$10K)', callback_data: 'liquidity_low' },
                    { text: 'Medium ($10K-$100K)', callback_data: 'liquidity_medium' }
                ],
                [
                    { text: 'High ($100K-$1M)', callback_data: 'liquidity_high' },
                    { text: 'Very High (>$1M)', callback_data: 'liquidity_very_high' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showVolumeOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Volume Range*

Select the volume range for your filter:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Low (<$10K)', callback_data: 'volume_low' },
                    { text: 'Medium ($10K-$100K)', callback_data: 'volume_medium' }
                ],
                [
                    { text: 'High ($100K-$1M)', callback_data: 'volume_high' },
                    { text: 'Very High (>$1M)', callback_data: 'volume_very_high' }
                ],
                [
                    { text: 'Custom', callback_data: 'volume_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showCategoryOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*🏷️ Token Category*

Select the token category for your filter:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'DeFi', callback_data: 'category_defi' },
                    { text: 'NFT', callback_data: 'category_nft' }
                ],
                [
                    { text: 'Gaming', callback_data: 'category_gaming' },
                    { text: 'Metaverse', callback_data: 'category_metaverse' }
                ],
                [
                    { text: 'Infrastructure', callback_data: 'category_infrastructure' },
                    { text: '📝 Custom Category', callback_data: 'category_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showBuyAmountOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*💵 Buy Amount Per Trade*

Set the amount to use for each trade:

*Current Selection:* ${userState.data.buyAmount ? 
    `${userState.data.buyAmount.value}${userState.data.buyAmount.unit}` : 
    'Not configured'}

Select buy amount:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '0.01 SOL', callback_data: 'rule_buy_amount_0_01_sol' },
                    { text: '0.05 SOL', callback_data: 'rule_buy_amount_0_05_sol' }
                ],
                [
                    { text: '0.1 SOL', callback_data: 'rule_buy_amount_0_1_sol' },
                    { text: '0.25 SOL', callback_data: 'rule_buy_amount_0_25_sol' }
                ],
                [
                    { text: '0.5 SOL', callback_data: 'rule_buy_amount_0_5_sol' },
                    { text: '1 SOL', callback_data: 'rule_buy_amount_1_sol' }
                ],
                [
                    { text: '2 SOL', callback_data: 'rule_buy_amount_2_sol' },
                    { text: '5 SOL', callback_data: 'rule_buy_amount_5_sol' }
                ],
                [
                    { text: '📝 Custom Amount', callback_data: 'rule_buy_amount_custom' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async startRuleCreation(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        console.log('[RulesCommand.startRuleCreation] Creating user state for:', userId);

        // Initialize user state for trading mode selection
        this.userStates.set(userId, {
            step: 'trading_mode_selection',
            data: {
                tradingMode: null, // 'autonomous' or 'manual'
                type: null,
                ruleCategory: null,
                name: null,
                conditions: {},
                discoveryRules: {},
                managementRules: {},
                // Discovery Rules
                marketCap: null,
                price: null,
                volume: null,
                liquidity: null,
                category: null,
                timeframe: null,
                copyTrade: null,
                narrative: null,
                // Buy Rules (Discovery)
                volumeSpike: null,
                dipBuy: null,
                priceChange: null,
                volumeChange: null,
                // Management Rules
                momentum: null,
                volatility: null,
                takeProfit: null,
                trailingStop: null,
                stopLoss: null
            }
        });

        console.log('[RulesCommand.startRuleCreation] User state created. Current states:', Array.from(this.userStates.keys()));

        const message = `
*🎯 Create New Trading Rule*

*Choose your trading mode:*

*🤖 Autonomous Mode*
Create strategies with combined Discovery & Management rules
- Discovery rules find tokens to buy
- Management rules handle position exits
- Both rules work together as one strategy

*✋ Manual Mode*
Set general management rules for manual trades
- Token management for all manual trades
- Universal TP/SL settings
- Applied to manual trades only

*Which trading mode?*`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🤖 Autonomous Mode', callback_data: 'trading_mode_autonomous' },
                    { text: '✋ Manual Mode', callback_data: 'trading_mode_manual' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleCategorySelection(ctx, category) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        let userState = this.userStates.get(userId);

        // Auto-initialize userState with full structure if missing
        if (!userState) {
            userState = {
                step: 'rule_type_selection',
                data: {
                    type: null,
                    ruleCategory: null, // 'buy_rules' or 'management_rules'
                    name: null,
                    conditions: {},
                    // Filter criteria
                    marketCap: null,
                    price: null,
                    volume: null,
                    liquidity: null,
                    category: null,
                    timeframe: null,
                    // Strategy conditions
                    volumeSpike: null,
                    dipBuy: null,
                    narrative: null,
                    momentum: null,
                    volatility: null,
                    copyTrade: null,
                    priceChange: null,
                    volumeChange: null,
                    // Management rules
                    takeProfit: null,
                    trailingStop: null,
                    stopLoss: null
                }
            };
            this.userStates.set(userId, userState);
        }

        // Update user state with selected category
        userState.data.ruleCategory = category;
        
        // Map rule category to rule type for validation
        // Buy rules and Management rules are both strategy types in the validation system
        userState.data.type = 'strategy';
        
        userState.step = 'rule_name';

        const categoryName = category === 'buy_rules' ? 'Buy Rules' : 'Management Rules';
     

        const message = `
*📝 Rule Name*

Please enter a name for your ${type} rule:
- Use only letters, numbers, underscores, and hyphens
- Maximum 50 characters
- Example: ${type === 'filter' ? 'High\\_Volume\\_Tokens' : 'Price\\_Increase\\_Alert'}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '◀️ Back', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showStrategyOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }


        const message = `
*📊 ${type === 'price' ? 'Price' : 'Volume'} Change Direction*

Select the direction of change you want to monitor:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Increase', callback_data: `${type}_change_increase` },
                    { text: '📉 Decrease', callback_data: `${type}_change_decrease` }
                ],
                [
                    { text: '◀️ Back', callback_data: 'strategy_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handlePriceChangeDirection(ctx, direction) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize price change data
        userState.data.priceChange = {
            direction: direction,
            threshold: null,
            timeframe: null
        };

        userState.step = 'price_change_threshold';
        const message = `
*📈 Price Change Threshold*

Enter the percentage threshold for price change:
- Example: 10 for 10% change
- Must be a positive number`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '◀️ Back', callback_data: 'strategy_price' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleVolumeChangeDirection(ctx, direction) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize volume change data
        userState.data.volumeChange = {
            direction: direction,
            threshold: null,
            timeframe: null
        };

        userState.step = 'volume_change_threshold';
        const message = `
*📊 Volume Change Threshold*

Enter the percentage threshold for volume change:
- Example: 50 for 50% change
- Must be a positive number`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '◀️ Back', callback_data: 'strategy_volume' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handlePriceChangeThreshold(ctx, threshold) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState || !userState.data.priceChange) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Validate threshold
        const thresholdNum = parseFloat(threshold);
        if (isNaN(thresholdNum) || thresholdNum <= 0) {
            await this.sendMessage(chatId, 'Please enter a valid positive number for the threshold.');
            return;
        }

        userState.data.priceChange.threshold = thresholdNum;
        userState.step = 'price_change_timeframe';
        
        const message = `
*⏰ Price Change Timeframe*

Select the timeframe for price change:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '1h', callback_data: 'timeframe_1h' },
                    { text: '4h', callback_data: 'timeframe_4h' }
                ],
                [
                    { text: '24h', callback_data: 'timeframe_24h' },
                    { text: '7d', callback_data: 'timeframe_7d' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'strategy_timeframe' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleVolumeChangeThreshold(ctx, threshold) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState || !userState.data.volumeChange) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Validate threshold
        const thresholdNum = parseFloat(threshold);
        if (isNaN(thresholdNum) || thresholdNum <= 0) {
            await this.sendMessage(chatId, 'Please enter a valid positive number for the threshold.');
            return;
        }

        userState.data.volumeChange.threshold = thresholdNum;
        userState.step = 'volume_change_timeframe';
        
        const message = `
*⏰ Volume Change Timeframe*

Select the timeframe for volume change:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '1h', callback_data: 'volume_change_timeframe_1h' },
                    { text: '4h', callback_data: 'volume_change_timeframe_4h' }
                ],
                [
                    { text: '24h', callback_data: 'volume_change_timeframe_24h' },
                    { text: '7d', callback_data: 'volume_change_timeframe_7d' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'strategy_volume' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showUnifiedRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Check trading mode and redirect accordingly
        const tradingMode = userState.data.tradingMode;
        
        if (tradingMode === 'autonomous') {
            await this.showAutonomousStrategyOptions(ctx);
            return;
        } else if (tradingMode === 'manual') {
            await this.showManualManagementOptions(ctx);
            return;
        }

        // Fallback to legacy behavior for existing rules
        const selections = this.getCurrentSelections(userState.data);
        
        const ruleCategory = userState.data.ruleCategory;
        const categoryName = ruleCategory === 'buy_rules' ? 'Buy Rules' : 'Management Rules';
        
        // Strategy buttons based on rule category
        let strategyButtons = [];
        
        if (ruleCategory === 'buy_rules') {
            strategyButtons = [
                [
                    { text: '👥 Copy Trade', callback_data: 'copy_trade_select' }
                ],
                [
                    // { text: '📈 Price Change', callback_data: 'price_change_select' },
                    // { text: '📊 Volume Change', callback_data: 'volume_change_select' }
                ]
            ];
        } else if (ruleCategory === 'management_rules') {
            strategyButtons = [
                [
                    { text: '📊 Momentum', callback_data: 'momentum_select' },
                    // { text: '📈 Volatility', callback_data: 'volatility_select' }
                ],
                [
                    { text: '💰 Take Profit', callback_data: 'take_profit_select' },
                    { text: '📉 Trailing Stop', callback_data: 'trailing_stop_select' }
                ],
                [
                    { text: '🛑 Stop Loss', callback_data: 'stop_loss_select' }
                ]
            ];
        }

        // Combine all buttons
        const keyboard = {
            inline_keyboard: [
                ...filterButtons,
                ...strategyButtons,
                [
                    { text: '✅ Done', callback_data: 'confirm_rule' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    getCurrentSelections(data) {
        if (!data) {
            return '*Current Selections:*\nNo criteria selected yet\n';
        }

        let selections = '*Current Selections:*\n';
        
        // Filter criteria
        let hasFilters = false;
        
        if (data.marketCap) {
            const range = data.marketCap.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Market Cap: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
                hasFilters = true;
            }
        }
        
        if (data.price) {
            const range = data.price.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Price: $${range.min.toFixed(4)} - $${range.max === Infinity ? '∞' : range.max.toFixed(4)}\n`;
                hasFilters = true;
            }
        }
        
        if (data.volume) {
            const range = data.volume.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Volume: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
                hasFilters = true;
            }
        }
        
        if (data.liquidity) {
            const range = data.liquidity.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Liquidity: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
                hasFilters = true;
            }
        }
        
        if (data.category) {
            selections += `- Category: ${data.category.charAt(0).toUpperCase() + data.category.slice(1)}\n`;
            hasFilters = true;
        }
        
        if (data.timeframe) {
            selections += `- Timeframe: ${data.timeframe}\n`;
            hasFilters = true;
        }

        // Strategy conditions
        let hasStrategies = false;
        
        if (data.priceChange) {
            selections += `- Price Change: ${data.priceChange.direction === 'increase' ? '📈 Increase' : '📉 Decrease'} ${data.priceChange.threshold}% in ${data.priceChange.timeframe}\n`;
            hasStrategies = true;
        }
        
        if (data.volumeChange) {
            selections += `- Volume Change: ${data.volumeChange.direction === 'increase' ? '📈 Increase' : '📉 Decrease'} ${data.volumeChange.threshold}% in ${data.volumeChange.timeframe}\n`;
            hasStrategies = true;
        }
        
        if (data.volumeSpike) {
            selections += `- Volume Spike: ${data.volumeSpike.threshold}% increase in ${data.volumeSpike.timeWindow}h\n`;
            hasStrategies = true;
        }
        
        if (data.dipBuy) {
            selections += `- Dip Buy: ${data.dipBuy.minDrop}% drop in ${data.dipBuy.timeWindow}h\n`;
            hasStrategies = true;
        }
        
        if (data.narrative && data.narrative.categories && data.narrative.categories.length > 0) {
            selections += `- Narrative: ${data.narrative.categories.join(', ')}\n`;
            hasStrategies = true;
        }
        
        if (data.momentum) {
            selections += `- Momentum: ${data.momentum.minChange}% over ${data.momentum.lookbackPeriod}h\n`;
            hasStrategies = true;
        }
        
        if (data.volatility) {
            selections += `- Volatility: Min ${data.volatility.minVolatility}% over ${data.volatility.lookbackPeriod}h\n`;
            hasStrategies = true;
        }
        
        if (data.copyTrade && data.copyTrade.enabled) {
            selections += `- Copy Trade: Following ${data.copyTrade.traders?.length || 0} trader(s)\n`;
            hasStrategies = true;
        }

        // Management rules
        if (data.takeProfit) {
            selections += `- Take Profit: ${data.takeProfit.percentage}%\n`;
            hasStrategies = true;
        }
        
        if (data.trailingStop) {
            selections += `- Trailing Stop: ${data.trailingStop.percentage}%\n`;
            hasStrategies = true;
        }
        
        if (data.stopLoss) {
            selections += `- Stop Loss: ${data.stopLoss.percentage}%\n`;
            hasStrategies = true;
        }

        // Buy amount configuration
        if (data.buyAmount) {
            selections += `- Buy Amount: ${data.buyAmount.value}${data.buyAmount.unit}\n`;
            hasStrategies = true;
        }

        if (!hasFilters && !hasStrategies) {
            selections += 'No criteria selected yet\n';
        }

        return selections;
    }

    async handleRuleConfirmation(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState || !userState.data) {
            await this.sendMessage(chatId, 'Error: No rule data found. Please start over.');
            return;
        }

        try {
            // Show confirmation message with all selected options
            const selections = this.getCurrentSelections(userState.data);
            let confirmMessage = '';
            let ruleTypeDisplay = '';

            if (userState.data.tradingMode === 'autonomous') {
                ruleTypeDisplay = '🤖 Autonomous Strategy';
                confirmMessage = `
*📝 Autonomous Strategy Summary*

*Strategy Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${selections}

*How it works:*
🟦 **Discovery Phase:** Scans tokens based on your criteria
🟩 **Management Phase:** Automatically manages positions with your exit rules

*Would you like to create this autonomous strategy?*`;
            } else if (userState.data.tradingMode === 'manual') {
                ruleTypeDisplay = '✋ Manual Trading Management';
                confirmMessage = `
*📝 Manual Trading Rules Summary*

*Rule Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${selections}

*How it works:*
🟩 **Universal Application:** These rules apply to ALL your manual trades
💰 **Automatic Management:** TP/SL executed automatically on manual positions

*Would you like to create these manual trading rules?*`;
            } else {
                // Legacy confirmation
                ruleTypeDisplay = '🔧 Trading Rule';
                confirmMessage = `
*📝 Rule Summary*

*Rule Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${selections}

*Would you like to create this rule?*`;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Create Rule', callback_data: 'confirm_rule_final' },
                        { text: '✏️ Edit', callback_data: 'edit_rule' }
                    ],
                    [
                        { text: '❌ Cancel', callback_data: 'rules_create' },
                        { text: '🔄 Reset', callback_data: 'rule_reset' }
                    ]
                ]
            };

            await this.sendMessage(chatId, confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule confirmation:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
        }
    }

    async createRule(userId, ruleData) {
        try {
            // Validate and sanitize rule data
            const validation = this.validateRuleConfig(ruleData);
            if (!validation.isValid) {
                throw new Error(`Rule validation failed: ${validation.errors.join(', ')}`);
            }

            const sanitizedData = this.sanitizeRuleData(ruleData);

            // Determine rule type based on trading mode
            let ruleType = sanitizedData.type;
            if (sanitizedData.tradingMode === 'autonomous') {
                ruleType = 'autonomous_strategy';
            } else if (sanitizedData.tradingMode === 'manual') {
                ruleType = 'manual_management';
            }

            // First, create the rule using DatabaseManager's createRule method
            const ruleResult = await this.db.createRule(userId, {
                name: sanitizedData.name,
                type: ruleType,
                description: this.generateRuleDescription(sanitizedData)
            });

            // Create default settings for the rule with proper SQLite types
            await this.db.createRuleSettings(ruleResult.lastInsertRowid, {
                notifications_enabled: 1,
                alerts_enabled: 1,
                notification_frequency: 'immediate',
                alert_threshold: 100
            });

            // Then, create rule conditions based on rule type and trading mode
            if (sanitizedData.tradingMode === 'autonomous') {
                // For autonomous strategies, store both discovery and management rules
                await this.createAutonomousStrategyConditions(ruleResult.lastInsertRowid, sanitizedData);
            } else if (sanitizedData.tradingMode === 'manual') {
                // For manual management, store only management rules
                await this.createManualManagementConditions(ruleResult.lastInsertRowid, sanitizedData);
            } else {
                // Legacy rule creation
                await this.createLegacyRuleConditions(ruleResult.lastInsertRowid, sanitizedData);
            }

            return ruleResult.lastInsertRowid;
        } catch (error) {
            console.error('Error creating rule:', error);
            throw error;
        }
    }

    async createAutonomousStrategyConditions(ruleId, ruleData) {
        // Store buy amount for autonomous trading
        if (ruleData.buyAmount) {
            await this.db.createRuleCondition(ruleId, 'buy_amount', JSON.stringify(ruleData.buyAmount));
        }

        // Store discovery rules (token selection criteria)
        if (ruleData.marketCap) {
            await this.db.createRuleCondition(ruleId, 'discovery_market_cap', JSON.stringify(ruleData.marketCap.value));
        }
        if (ruleData.price) {
            await this.db.createRuleCondition(ruleId, 'discovery_price', JSON.stringify(ruleData.price.value));
        }
        if (ruleData.volume) {
            await this.db.createRuleCondition(ruleId, 'discovery_volume', JSON.stringify(ruleData.volume.value));
        }
        if (ruleData.liquidity) {
            await this.db.createRuleCondition(ruleId, 'discovery_liquidity', JSON.stringify(ruleData.liquidity.value));
        }
        if (ruleData.category) {
            await this.db.createRuleCondition(ruleId, 'discovery_category', ruleData.category);
        }
        if (ruleData.timeframe) {
            await this.db.createRuleCondition(ruleId, 'discovery_timeframe', ruleData.timeframe);
        }
        if (ruleData.copyTrade && ruleData.copyTrade.enabled) {
            await this.db.createRuleCondition(ruleId, 'discovery_copy_trade', JSON.stringify(ruleData.copyTrade));
        }
        if (ruleData.narrative && ruleData.narrative.categories) {
            await this.db.createRuleCondition(ruleId, 'discovery_narrative', JSON.stringify(ruleData.narrative));
        }

        // Store advanced discovery strategies
        if (ruleData.volumeSpike) {
            await this.db.createRuleCondition(ruleId, 'discovery_volume_spike', JSON.stringify(ruleData.volumeSpike));
        }
        if (ruleData.dipBuy) {
            await this.db.createRuleCondition(ruleId, 'discovery_dip_buy', JSON.stringify(ruleData.dipBuy));
        }
        if (ruleData.priceChange) {
            await this.db.createRuleCondition(ruleId, 'discovery_price_change', JSON.stringify(ruleData.priceChange));
        }
        if (ruleData.volumeChange) {
            await this.db.createRuleCondition(ruleId, 'discovery_volume_change', JSON.stringify(ruleData.volumeChange));
        }

        // Store management rules (exit strategies)
        if (ruleData.takeProfit) {
            await this.db.createRuleCondition(ruleId, 'management_take_profit', JSON.stringify(ruleData.takeProfit));
        }
        if (ruleData.stopLoss) {
            await this.db.createRuleCondition(ruleId, 'management_stop_loss', JSON.stringify(ruleData.stopLoss));
        }
        if (ruleData.trailingStop) {
            await this.db.createRuleCondition(ruleId, 'management_trailing_stop', JSON.stringify(ruleData.trailingStop));
        }
        if (ruleData.momentum) {
            await this.db.createRuleCondition(ruleId, 'management_momentum', JSON.stringify(ruleData.momentum));
        }
        if (ruleData.volatility) {
            await this.db.createRuleCondition(ruleId, 'management_volatility', JSON.stringify(ruleData.volatility));
        }
    }

    async createManualManagementConditions(ruleId, ruleData) {
        // Store only management rules for manual trading
        if (ruleData.takeProfit) {
            await this.db.createRuleCondition(ruleId, 'manual_take_profit', JSON.stringify(ruleData.takeProfit));
        }
        if (ruleData.stopLoss) {
            await this.db.createRuleCondition(ruleId, 'manual_stop_loss', JSON.stringify(ruleData.stopLoss));
        }
        if (ruleData.trailingStop) {
            await this.db.createRuleCondition(ruleId, 'manual_trailing_stop', JSON.stringify(ruleData.trailingStop));
        }
    }

    async createLegacyRuleConditions(ruleId, ruleData) {
        // Legacy rule creation logic
        if (ruleData.type === 'strategy') {
            if (ruleData.priceChange) {
                const priceChangeData = {
                    direction: ruleData.priceChange.direction,
                    threshold: parseFloat(ruleData.priceChange.threshold),
                    timeframe: ruleData.priceChange.timeframe
                };
                await this.db.createRuleCondition(ruleId, 'price_change', JSON.stringify(priceChangeData));
            }
            if (ruleData.volumeChange) {
                const volumeChangeData = {
                    direction: ruleData.volumeChange.direction,
                    threshold: parseFloat(ruleData.volumeChange.threshold),
                    timeframe: ruleData.volumeChange.timeframe
                };
                await this.db.createRuleCondition(ruleId, 'volume_change', JSON.stringify(volumeChangeData));
            }
        } else {
            const conditions = this.prepareRuleConditions(ruleData);
            for (const condition of conditions) {
                let conditionValue;
                if (condition.type === 'category' || condition.type === 'timeframe') {
                    conditionValue = condition.value; // Store the string directly
                } else {
                    // For other types (market_cap, price, volume, liquidity)
                    conditionValue = {
                        min: parseFloat(condition.value.min),
                        max: condition.value.max === Infinity ? null : parseFloat(condition.value.max)
                    };
                }
                await this.db.createRuleCondition(ruleId, condition.type, JSON.stringify(conditionValue));
            }
        }
    }

    prepareRuleConditions(ruleData) {
        const conditions = [];

        if (ruleData.marketCap) {
            conditions.push({
                type: 'market_cap',
                value: {
                    min: parseFloat(ruleData.marketCap.value.min),
                    max: ruleData.marketCap.value.max === Infinity ? null : parseFloat(ruleData.marketCap.value.max)
                },
                operator: ruleData.marketCap.operator
            });
        }

        if (ruleData.price) {
            conditions.push({
                type: 'price',
                value: {
                    min: parseFloat(ruleData.price.value.min),
                    max: ruleData.price.value.max === Infinity ? null : parseFloat(ruleData.price.value.max)
                },
                operator: ruleData.price.operator
            });
        }

        if (ruleData.volume) {
            conditions.push({
                type: 'volume',
                value: {
                    min: parseFloat(ruleData.volume.value.min),
                    max: ruleData.volume.value.max === Infinity ? null : parseFloat(ruleData.volume.value.max)
                },
                operator: ruleData.volume.operator
            });
        }

        if (ruleData.liquidity) {
            conditions.push({
                type: 'liquidity',
                value: {
                    min: parseFloat(ruleData.liquidity.value.min),
                    max: ruleData.liquidity.value.max === Infinity ? null : parseFloat(ruleData.liquidity.value.max)
                },
                operator: ruleData.liquidity.operator
            });
        }

        if (ruleData.category) {
            conditions.push({
                type: 'category',
                value: ruleData.category,
                operator: '='
            });
        }

        if (ruleData.timeframe) {
            conditions.push({
                type: 'timeframe',
                value: ruleData.timeframe,
                operator: '='
            });
        }

        return conditions;
    }

    formatRuleSummary(data) {
        if (data.type === 'filter') {
            return this.formatFilterSummary(data);
        } else {
            return this.formatStrategySummary(data);
        }
    }

    formatFilterSummary(data) {
        let summary = '';
        if (data.marketCap) {
            summary += `- Market Cap: ${data.marketCap.operator} ${data.marketCap.value}\n`;
        }
        if (data.price) {
            summary += `- Price: ${data.price.operator} ${data.price.value}\n`;
        }
        if (data.volume) {
            summary += `- Volume: ${data.volume.operator} ${data.volume.value}\n`;
        }
        if (data.category) {
            summary += `- Category: ${data.category}\n`;
        }
        return summary;
    }

    formatStrategySummary(data) {
        let summary = '';
        if (data.volumeChange) {
            summary += `- Volume Change: ${data.volumeChange.direction} ${data.volumeChange.threshold}% in ${data.volumeChange.timeframe}\n`;
        }
        if (data.priceChange) {
            summary += `- Price Change: ${data.priceChange.direction} ${data.priceChange.threshold}% in ${data.priceChange.timeframe}\n`;
        }
        return summary;
    }

    generateRuleName(data) {
        const criteria = [];
        
        if (data.marketCap) {
            const range = data.marketCap.value;
            if (range.max === Infinity) {
                criteria.push(`MCap>${this.formatNumber(range.min)}`);
            } else {
                criteria.push(`MCap${range.min}-${this.formatNumber(range.max)}`);
            }
        }
        
        if (data.price) {
            const range = data.price.value;
            if (range.max === Infinity) {
                criteria.push(`Price>${range.min.toFixed(2)}`);
            } else {
                criteria.push(`Price${range.min.toFixed(2)}-${range.max.toFixed(2)}`);
            }
        }
        
        if (data.volume) {
            const range = data.volume.value;
            if (range.max === Infinity) {
                criteria.push(`Vol>${this.formatNumber(range.min)}`);
            } else {
                criteria.push(`Vol${this.formatNumber(range.min)}-${this.formatNumber(range.max)}`);
            }
        }
        
        if (data.liquidity) {
            const range = data.liquidity.value;
            if (range.max === Infinity) {
                criteria.push(`Liq>${this.formatNumber(range.min)}`);
            } else {
                criteria.push(`Liq${this.formatNumber(range.min)}-${this.formatNumber(range.max)}`);
            }
        }
        
        if (data.category) {
            criteria.push(data.category.charAt(0).toUpperCase() + data.category.slice(1));
        }
        
        if (data.timeframe) {
            criteria.push(data.timeframe);
        }

        const timestamp = new Date().toISOString().slice(0, 10);
        return criteria.length > 0 ? `${criteria.join('_')}_${timestamp}` : `Custom_Rule_${timestamp}`;
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K`;
        }
        return num.toString();
    }

    generateRuleDescription(data) {
        if (data.type === 'filter') {
            return `Filter rule for ${data.category || 'custom'} tokens`;
        } else {
            return `Strategy rule for ${data.volumeChange ? 'volume' : 'price'} changes`;
        }
    }

    async listRules(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            const rules = await this.getUserRules(userId);
            
            if (rules.length === 0) {
                await this.sendMessage(chatId, 'No rules found. Create a new rule to get started.');
                return;
            }

            let message = `*📋 Your Rules*\n\n`;
            rules.forEach((rule, index) => {
                message += `${index + 1}. *${rule.name}*\n`;
                message += `   Type: ${rule.type === 'filter' ? '🔍 Filter' : '📊 Strategy'}\n`;
                message += `   Status: ${rule.is_active ? '✅ Active' : '⏸️ Paused'}\n`;
                message += `   Created: ${new Date(rule.created_at).toLocaleDateString()}\n\n`;
            });

            const keyboard = {
                inline_keyboard: [
                    ...rules.map(rule => [{
                        text: `${rule.name} ${rule.is_active ? '✅' : '⏸️'}`,
                        callback_data: `rule_${rule.id}`
                    }]),
                    [
                        { text: '📝 Create New Rule', callback_data: 'rules_create' },
                        { text: '🔄 Refresh', callback_data: 'rules_list' }
                    ],
                    [
                        { text: '◀️ Back to Rules', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error listing rules:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error fetching your rules.');
        }
    }

    async getUserRules(userId) {
        try {
            // Get the database user ID from the telegram ID
            const user = await this.db.getUserByTelegramId(userId);
            if (!user) {
                return [];
            }
            // Use the DatabaseManager's method to get rules
            return await this.db.getRulesByUserId(user.id);
        } catch (error) {
            console.error('Error getting user rules:', error);
            return [];
        }
    }

    async showRuleStats(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const user = await this.db.getUserByTelegramId(telegramId);
        const rules = await this.db.getRulesByUserId(user.id);
        const stats = this.calculateRuleStats(rules);

        // Delete previous message if it exists
        if (ctx.message) {
            try {
                await this.bot.deleteMessage(chatId, ctx.message.message_id);
            } catch (error) {
                // Ignore error if message is already deleted or not found
                console.log('Could not delete previous message:', error.message);
            }
        }

        const message = `
📊 *Rule Statistics*

Total Rules: ${stats.totalRules}
Active Rules: ${stats.activeRules}
Success Rate: ${stats.successRate}%

*Top Performing Rules:*
${stats.topRules.length > 0 ? stats.topRules.join('\n') : 'No top rules yet'}

*Recent Activity:*
${stats.recentActivity.length > 0 ? stats.recentActivity.join('\n') : 'No recent activity'}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'rules_stats' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    calculateRuleStats(rules) {
        const totalRules = rules.length;
        const activeRules = rules.filter(rule => rule.is_active).length;
        const successRate = this.calculateSuccessRate(rules);
        const topRules = this.getTopPerformingRules(rules);
        const recentActivity = this.getRecentActivity(rules);

        return {
            totalRules,
            activeRules,
            successRate,
            topRules: topRules.map((rule, index) => 
                `${index + 1}. ${rule.name} (${rule.successRate}%)`
            ),
            recentActivity
        };
    }

    calculateSuccessRate(rules) {
        const totalTriggers = rules.reduce((sum, rule) => sum + rule.success_count + rule.failure_count, 0);
        const totalSuccess = rules.reduce((sum, rule) => sum + rule.success_count, 0);
        return totalTriggers > 0 ? Math.round((totalSuccess / totalTriggers) * 100) : 0;
    }

    getTopPerformingRules(rules) {
        return rules
            .filter(rule => rule.success_count > 0 || rule.failure_count > 0)
            .map(rule => ({
                ...rule,
                successRate: rule.success_count + rule.failure_count > 0 
                    ? Math.round((rule.success_count / (rule.success_count + rule.failure_count)) * 100)
                    : 0
            }))
            .sort((a, b) => b.successRate - a.successRate)
            .slice(0, 5);
    }

    getRecentActivity(rules) {
        return rules
            .filter(rule => rule.last_check)
            .sort((a, b) => new Date(b.last_check) - new Date(a.last_check))
            .slice(0, 5)
            .map(rule => `${rule.name}: Last checked ${this.formatTimeAgo(rule.last_check)}`);
    }

    formatTimeAgo(timestamp) {
        if (!timestamp) return 'Never';
        const now = new Date();
        const then = new Date(timestamp);
        const diffInSeconds = Math.floor((now - then) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    async handleMessage(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const text = ctx.message.text;
        const userState = this.userStates.get(userId);

        console.log('[RulesCommand.handleMessage] Debug:', {
            chatId,
            userId,
            text,
            userState,
            userStatesKeys: Array.from(this.userStates.keys()),
            hasUserState: !!userState
        });

        // If user is not in a rules state, ignore the message
        if (!userState) {
            console.log('[RulesCommand.handleMessage] No user state found, ignoring message');
            return;
        }

        try {
            // Handle custom input waiting states
            if (userState.waitingFor) {
                switch (userState.waitingFor) {
                    case 'custom_stop_loss':
                        const stopLossPercentage = parseFloat(text);
                        if (isNaN(stopLossPercentage) || stopLossPercentage <= 0 || stopLossPercentage > 100) {
                            await this.sendMessage(chatId, '❌ Please enter a valid stop loss percentage between 1 and 100.');
                            return;
                        }
                        
                        userState.data.stopLoss = {
                            percentage: stopLossPercentage,
                            enabled: true
                        };
                        userState.waitingFor = null; // Clear waiting state
                        userState.step = null; // Clear step
                        
                        await this.sendMessage(chatId, `✅ Custom stop loss set to ${stopLossPercentage}%`);
                        await this.showUnifiedRuleOptions(ctx);
                        return;

                    case 'custom_take_profit':
                        const takeProfitPercentage = parseFloat(text);
                        if (isNaN(takeProfitPercentage) || takeProfitPercentage <= 0 || takeProfitPercentage > 1000) {
                            await this.sendMessage(chatId, '❌ Please enter a valid take profit percentage between 1 and 1000.');
                            return;
                        }
                        
                        userState.data.takeProfit = {
                            percentage: takeProfitPercentage,
                            enabled: true
                        };
                        userState.waitingFor = null; // Clear waiting state
                        userState.step = null; // Clear step
                        
                        await this.sendMessage(chatId, `✅ Custom take profit set to ${takeProfitPercentage}%`);
                        await this.showUnifiedRuleOptions(ctx);
                        return;

                    case 'custom_trailing_stop':
                        const trailingStopPercentage = parseFloat(text);
                        if (isNaN(trailingStopPercentage) || trailingStopPercentage <= 0 || trailingStopPercentage > 50) {
                            await this.sendMessage(chatId, '❌ Please enter a valid trailing stop percentage between 1 and 50.');
                            return;
                        }
                        
                        userState.data.trailingStop = {
                            percentage: trailingStopPercentage,
                            enabled: true
                        };
                        userState.waitingFor = null; // Clear waiting state
                        userState.step = null; // Clear step
                        
                        await this.sendMessage(chatId, `✅ Custom trailing stop set to ${trailingStopPercentage}%`);
                        await this.showUnifiedRuleOptions(ctx);
                        return;

                    case 'custom_category':
                        // Validate and set custom category
                        const customCategory = text.trim();
                        if (customCategory.length === 0) {
                            await this.sendMessage(chatId, '❌ Please enter a valid category name.');
                            return;
                        }
                        if (customCategory.length > 50) {
                            await this.sendMessage(chatId, '❌ Category name is too long. Please enter a name under 50 characters.');
                            return;
                        }
                        
                        userState.data.category = customCategory;
                        userState.waitingFor = null; // Clear waiting state
                        
                        await this.sendMessage(chatId, `✅ Custom category set to: ${customCategory}`);
                        await this.showUnifiedRuleOptions(ctx);
                        return;

                    case 'custom_buy_amount':
                        // Parse the buy amount input
                        let amountText = text.trim().toLowerCase();
                        
                        // Remove 'sol' suffix if present
                        if (amountText.endsWith(' sol')) {
                            amountText = amountText.replace(' sol', '');
                        } else if (amountText.endsWith('sol')) {
                            amountText = amountText.replace('sol', '');
                        }
                        
                        const buyAmount = parseFloat(amountText);
                        if (isNaN(buyAmount) || buyAmount <= 0 || buyAmount > 100) {
                            await this.sendMessage(chatId, '❌ Please enter a valid buy amount between 0.001 and 100 SOL.');
                            return;
                        }
                        
                        // Set the buy amount
                        userState.data.buyAmount = {
                            value: buyAmount,
                            unit: ' SOL'
                        };
                        userState.waitingFor = null; // Clear waiting state
                        userState.step = null; // Clear step
                        
                        await this.sendMessage(chatId, `✅ Custom buy amount set to ${buyAmount} SOL`);
                        
                        // Return to appropriate options based on trading mode
                        if (userState.data.tradingMode === 'autonomous') {
                            await this.showAutonomousStrategyOptions(ctx);
                        } else {
                            await this.showUnifiedRuleOptions(ctx);
                        }
                        return;
                }
            }

            // Handle different steps of rule creation
            switch (userState.step) {
                case 'autonomous_strategy_creation':
                    // Validate strategy name
                    if (text.length > 50) {
                        await this.sendMessage(chatId, 'Strategy name is too long. Please enter a name under 50 characters.');
                        return;
                    }
                    if (!/^[a-zA-Z0-9_\s-]+$/.test(text)) {
                        await this.sendMessage(chatId, 'Invalid strategy name. Please use only letters, numbers, underscores, and hyphens.');
                        return;
                    }
                    
                    // Update user state with strategy name
                    userState.data.name = text;
                    userState.data.type = 'autonomous_strategy';
                    userState.step = 'autonomous_configuration';
                    
                    // Show autonomous strategy configuration options
                    await this.showAutonomousStrategyOptions(ctx);
                    break;

                case 'manual_management_creation':
                    // Validate management rule name
                    if (text.length > 50) {
                        await this.sendMessage(chatId, 'Rule name is too long. Please enter a name under 50 characters.');
                        return;
                    }
                    if (!/^[a-zA-Z0-9_\s-]+$/.test(text)) {
                        await this.sendMessage(chatId, 'Invalid rule name. Please use only letters, numbers, underscores, and hyphens.');
                        return;
                    }
                    
                    // Update user state with rule name
                    userState.data.name = text;
                    userState.data.type = 'manual_management';
                    userState.step = 'manual_configuration';
                    
                    // Show manual management configuration options
                    await this.showManualManagementOptions(ctx);
                    break;

                case 'rule_name':
                    // Validate rule name
                    if (text.length > 50) {
                        await this.sendMessage(chatId, 'Rule name is too long. Please enter a name under 50 characters.');
                        return;
                    }
                    if (!/^[a-zA-Z0-9_\s-]+$/.test(text)) {
                        await this.sendMessage(chatId, 'Invalid rule name. Please use only letters, numbers, underscores, and hyphens.');
                        return;
                    }
                    
                    // Update user state with rule name
                    userState.data.name = text;
                    
                    // Show unified rule options for the merged interface
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'price_change_threshold':
                    const priceThreshold = parseFloat(text);
                    if (isNaN(priceThreshold) || priceThreshold <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the price change threshold.');
                        return;
                    }
                    userState.data.priceChange.threshold = priceThreshold;
                    userState.step = 'price_change_timeframe';
                    await this.showTimeframeOptions(ctx, 'price');
                    break;

                case 'volume_change_threshold':
                    const volumeThreshold = parseFloat(text);
                    if (isNaN(volumeThreshold) || volumeThreshold <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the volume change threshold.');
                        return;
                    }
                    userState.data.volumeChange.threshold = volumeThreshold;
                    userState.step = 'volume_change_timeframe';
                    await this.showTimeframeOptions(ctx, 'volume');
                    break;

                case 'volume_spike_custom_input':
                    const spikeThreshold = parseFloat(text);
                    if (isNaN(spikeThreshold) || spikeThreshold <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the volume spike threshold.');
                        return;
                    }
                    userState.data.volumeSpike.threshold = spikeThreshold;
                    userState.step = 'volume_spike_timewindow';
                    await this.sendMessage(chatId, 'Please enter the time window in hours (e.g., 1, 2, 4):');
                    return;

                case 'dip_buy_custom_input':
                    const dipThreshold = parseFloat(text);
                    if (isNaN(dipThreshold) || dipThreshold <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the dip buy threshold.');
                        return;
                    }
                    userState.data.dipBuy.threshold = dipThreshold;
                    userState.step = 'dip_buy_timewindow';
                    await this.sendMessage(chatId, 'Please enter the time window in hours (e.g., 1, 2, 4):');
                    return;

                case 'volume_spike_timewindow':
                    const spikeTimeWindow = parseInt(text);
                    if (isNaN(spikeTimeWindow) || spikeTimeWindow <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the time window.');
                        return;
                    }
                    userState.data.volumeSpike.timeWindow = spikeTimeWindow + 'h';
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'dip_buy_timewindow':
                    const dipTimeWindow = parseInt(text);
                    if (isNaN(dipTimeWindow) || dipTimeWindow <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the time window.');
                        return;
                    }
                    userState.data.dipBuy.timeWindow = dipTimeWindow + 'h';
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volume_custom_input':
                    // Parse custom volume range input in the format: min-max
                    const volumeInput = text.trim();
                    const volumeRangeMatch = volumeInput.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);

                    if (!volumeRangeMatch) {
                        await this.sendMessage(chatId, '❌ Please enter volume range in format: min-max (e.g., 50000-500000)');
                        return;
                    }

                    const minVolume = parseFloat(volumeRangeMatch[1]);
                    const maxVolume = parseFloat(volumeRangeMatch[2]);

                    if (isNaN(minVolume) || isNaN(maxVolume) || minVolume < 0 || maxVolume <= minVolume) {
                        await this.sendMessage(chatId, '❌ Invalid volume range. Min must be ≥ 0 and max must be > min');
                        return;
                    }

                    userState.data.volume = {
                        value: { min: minVolume, max: maxVolume },
                        operator: 'between'
                    };
                    userState.step = null; // Clear step

                    await this.sendMessage(chatId, `✅ Custom volume range set: $${minVolume.toLocaleString()} - $${maxVolume.toLocaleString()}`);
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volatility_custom_input':
                    const volatilityThreshold = parseFloat(text);
                    if (isNaN(volatilityThreshold) || volatilityThreshold <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the volatility threshold.');
                        return;
                    }
                    userState.data.volatility = { level: 'custom', threshold: volatilityThreshold };
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'copy_trade_custom_input':
                    const walletAddress = text.trim();
                    if (walletAddress.length < 32) {
                        await this.sendMessage(chatId, 'Please enter a valid wallet address.');
                        return;
                    }
                    userState.data.copyTrade = { walletType: 'custom', walletAddress: walletAddress, enabled: true };
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                // Volume Spike input cases
                case 'volume_spike_threshold_input':
                    const spikeThr = parseFloat(text);
                    if (isNaN(spikeThr) || spikeThr <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the volume spike threshold.');
                        return;
                    }
                    userState.data.volumeSpike.threshold = spikeThr;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volume_spike_timewindow_input':
                    const spikeTime = parseInt(text);
                    if (isNaN(spikeTime) || spikeTime <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the time window.');
                        return;
                    }
                    userState.data.volumeSpike.timeWindow = spikeTime;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volume_spike_liquidity_input':
                    const spikeLiquidity = parseFloat(text);
                    if (isNaN(spikeLiquidity) || spikeLiquidity <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum liquidity.');
                        return;
                    }
                    userState.data.volumeSpike.minLiquidity = spikeLiquidity;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volume_spike_slippage_input':
                    const spikeSlippage = parseFloat(text);
                    if (isNaN(spikeSlippage) || spikeSlippage <= 0 || spikeSlippage > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid slippage percentage (0-100).');
                        return;
                    }
                    userState.data.volumeSpike.maxSlippage = spikeSlippage;
                    userState.step = null;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                // Dip Buy input cases
                case 'dip_buy_min_drop_input':
                    const dipDrop = parseFloat(text);
                    if (isNaN(dipDrop) || dipDrop <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum drop percentage.');
                        return;
                    }
                    userState.data.dipBuy.minDrop = dipDrop;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'dip_buy_timewindow_input':
                    const dipTime = parseInt(text);
                    if (isNaN(dipTime) || dipTime <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for the time window.');
                        return;
                    }
                    userState.data.dipBuy.timeWindow = dipTime;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'dip_buy_liquidity_input':
                    const dipLiquidity = parseFloat(text);
                    if (isNaN(dipLiquidity) || dipLiquidity <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum liquidity.');
                        return;
                    }
                    userState.data.dipBuy.minLiquidity = dipLiquidity;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'dip_buy_slippage_input':
                    const dipSlippage = parseFloat(text);
                    if (isNaN(dipSlippage) || dipSlippage <= 0 || dipSlippage > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid slippage percentage (0-100).');
                        return;
                    }
                    userState.data.dipBuy.maxSlippage = dipSlippage;
                    userState.step = null;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                // Narrative input cases
                case 'narrative_min_score_input':
                    const narrativeScore = parseInt(text);
                    if (isNaN(narrativeScore) || narrativeScore < 1 || narrativeScore > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid score between 1 and 100.');
                        return;
                    }
                    userState.data.narrative.minScore = narrativeScore;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'narrative_min_volume_input':
                    const narrativeVolume = parseFloat(text);
                    if (isNaN(narrativeVolume) || narrativeVolume <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum volume.');
                        return;
                    }
                    userState.data.narrative.minVolume = narrativeVolume;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'narrative_slippage_input':
                    const narrativeSlippage = parseFloat(text);
                    if (isNaN(narrativeSlippage) || narrativeSlippage <= 0 || narrativeSlippage > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid slippage percentage (0-100).');
                        return;
                    }
                    userState.data.narrative.maxSlippage = narrativeSlippage;
                    userState.step = null;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                // Momentum input cases
                case 'momentum_lookback_input':
                    const momentumLookback = parseInt(text);
                    if (isNaN(momentumLookback) || momentumLookback <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for lookback period.');
                        return;
                    }
                    userState.data.momentum.lookbackPeriod = momentumLookback;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'momentum_min_change_input':
                    const momentumChange = parseFloat(text);
                    if (isNaN(momentumChange) || momentumChange <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum change percentage.');
                        return;
                    }
                    userState.data.momentum.minChange = momentumChange;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'momentum_min_volume_input':
                    const momentumVolume = parseFloat(text);
                    if (isNaN(momentumVolume) || momentumVolume <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum volume.');
                        return;
                    }
                    userState.data.momentum.minVolume = momentumVolume;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'momentum_slippage_input':
                    const momentumSlippage = parseFloat(text);
                    if (isNaN(momentumSlippage) || momentumSlippage <= 0 || momentumSlippage > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid slippage percentage (0-100).');
                        return;
                    }
                    userState.data.momentum.maxSlippage = momentumSlippage;
                    userState.step = null;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                // Volatility input cases
                case 'volatility_min_vol_input':
                    const volatilityMin = parseFloat(text);
                    if (isNaN(volatilityMin) || volatilityMin <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum volatility.');
                        return;
                    }
                    userState.data.volatility.minVolatility = volatilityMin;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volatility_lookback_input':
                    const volatilityLookback = parseInt(text);
                    if (isNaN(volatilityLookback) || volatilityLookback <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for lookback period.');
                        return;
                    }
                    userState.data.volatility.lookbackPeriod = volatilityLookback;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volatility_liquidity_input':
                    const volatilityLiquidity = parseFloat(text);
                    if (isNaN(volatilityLiquidity) || volatilityLiquidity <= 0) {
                        await this.sendMessage(chatId, 'Please enter a valid positive number for minimum liquidity.');
                        return;
                    }
                    userState.data.volatility.minLiquidity = volatilityLiquidity;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                case 'volatility_slippage_input':
                    const volatilitySlippage = parseFloat(text);
                    if (isNaN(volatilitySlippage) || volatilitySlippage <= 0 || volatilitySlippage > 100) {
                        await this.sendMessage(chatId, 'Please enter a valid slippage percentage (0-100).');
                        return;
                    }
                    userState.data.volatility.maxSlippage = volatilitySlippage;
                    userState.step = null;
                    await this.showUnifiedRuleOptions(ctx);
                    break;

                default:
                    // Unknown state, clear it
                    this.userStates.delete(userId);
                    await this.sendMessage(chatId, 'Please start over with /rules command.');
            }
        } catch (error) {
            console.error('Error handling message:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error processing your input. Please try again.');
        }
    }

    async handleTimeframeSelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            // Extract the timeframe value from the callback data
            let timeframeValue = value;
            let changeType = null;

            // Determine the type of timeframe selection
            if (value.startsWith('volume_change_timeframe_')) {
                timeframeValue = value.replace('volume_change_timeframe_', '');
                changeType = 'volume';
            } else if (value.startsWith('volume_timeframe_')) {
                timeframeValue = value.replace('volume_timeframe_', '');
                changeType = 'volume';
            } else if (value.startsWith('price_timeframe_')) {
                timeframeValue = value.replace('price_timeframe_', '');
                changeType = 'price';
            } else {
                timeframeValue = value.replace('timeframe_', '');
            }
            
            // Validate timeframe value
            const validTimeframes = ['1h', '4h', '24h', '1d', '7d', '1w'];
            if (!validTimeframes.includes(timeframeValue)) {
                throw new Error('Invalid timeframe value');
            }

            // Update user state based on rule type and change type
            if (userState.data.type === 'strategy') {
                if (changeType === 'volume' && userState.data.volumeChange) {
                    userState.data.volumeChange.timeframe = timeframeValue;
                } else if (changeType === 'price' && userState.data.priceChange) {
                    userState.data.priceChange.timeframe = timeframeValue;
                } else {
                    throw new Error('Invalid strategy change type');
                }
            } else {
                // For filter rules, update the general timeframe
                userState.data.timeframe = timeframeValue;
            }

            // Show appropriate next screen based on rule type
            if (userState.data.type === 'strategy') {
                // For strategy rules, check if all required fields are set
                const changeData = changeType === 'volume' ? userState.data.volumeChange : userState.data.priceChange;
                if (changeData && changeData.direction && changeData.threshold && changeData.timeframe) {
                    await this.handleRuleConfirmation(ctx);
                } else {
                    // If not all fields are set, go back to the appropriate strategy screen
                    await this.showStrategyOptions(ctx);
                }
            } else {
                // For filter rules, show updated unified options
                await this.showUnifiedRuleOptions(ctx);
            }
        } catch (error) {
            console.error('Error handling timeframe selection:', error);
            await this.sendMessage(chatId, 'Invalid timeframe selected. Please try again.');
            
            // Return to appropriate screen based on rule type
            if (userState.data.type === 'strategy') {
                await this.showStrategyOptions(ctx);
            } else {
                await this.showUnifiedRuleOptions(ctx);
            }
        }
    }

    async showTimeframeOptions(ctx, type) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*⏰ Timeframe Selection*

Select the timeframe for ${type === 'price' ? 'price' : 'volume'} change monitoring:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '1 Hour', callback_data: `${type}_timeframe_1h` },
                    { text: '4 Hours', callback_data: `${type}_timeframe_4h` }
                ],
                [
                    { text: '1 Day', callback_data: `${type}_timeframe_1d` },
                    { text: '1 Week', callback_data: `${type}_timeframe_1w` }
                ],
                [
                    { text: '◀️ Back', callback_data: type === 'price' ? 'strategy_price' : 'strategy_volume' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleMarketCapSelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            const mcapRanges = {
                'micro': { min: 0, max: 1000000 },
                'small': { min: 1000000, max: 10000000 },
                'medium': { min: 10000000, max: 100000000 },
                'large': { min: 100000000, max: 1000000000 },
                'mega': { min: 1000000000, max: Infinity }
            };

            // Extract the market cap range value from the callback data
            const mcapValue = value.replace('mcap_', '');
            
            if (!mcapRanges[mcapValue]) {
                console.error('Invalid market cap range value:', mcapValue, 'Available ranges:', Object.keys(mcapRanges));
                throw new Error(`Invalid market cap range: ${mcapValue}`);
            }

            userState.data.marketCap = {
                value: mcapRanges[mcapValue],
                operator: 'between'
            };

            await this.showUnifiedRuleOptions(ctx);
        } catch (error) {
            console.error('Error handling market cap selection:', error);
            console.error('Callback data received:', value);
            await this.sendMessage(chatId, 'Invalid market cap range selected. Please try again.');
        }
    }

    async handleCategorySelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            // Extract the category value from the callback data
            const categoryValue = value.replace('category_', '');
            
            if (categoryValue === 'custom') {
                // Set user state to await custom category input
                userState.waitingFor = 'custom_category';
                this.userStates.set(userId, userState);

                const message = `
*📝 Custom Category Name*

Please enter your custom category name:

Examples:
• Meme Coins
• Privacy Coins
• Layer 2
• AI & Machine Learning
• Real World Assets

💡 *Tip:* Use clear, descriptive names for your categories.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '❌ Cancel', callback_data: 'category_select' }
                        ]
                    ]
                };

                await this.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }
            
            // Validate category value only for predefined categories
            const validCategories = ['defi', 'nft', 'gaming', 'metaverse', 'infrastructure', 'other'];
            
            // If it's not a predefined category, treat it as a custom category
            if (!validCategories.includes(categoryValue)) {
                // Assume it's a custom category - this case shouldn't happen normally
                // since custom categories are handled above, but keeping for safety
                userState.data.category = categoryValue;
            } else {
                // Update user state with predefined category selection
                userState.data.category = categoryValue;
            }

            // Show updated unified options
            await this.showUnifiedRuleOptions(ctx);
        } catch (error) {
            console.error('Error handling category selection:', error);
            console.error('Callback data received:', value);
            await this.sendMessage(chatId, 'Invalid category selected. Please try again.');
        }
    }

    async handleVolumeSelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            // Extract the volume value from the callback data
            const volumeValue = value.replace('volume_', '');
            
            // Define volume ranges
            const volumeRanges = {
                'low': { min: 0, max: 10000 },
                'medium': { min: 10000, max: 100000 },
                'high': { min: 100000, max: 1000000 },
                'very_high': { min: 1000000, max: Infinity }
            };

            // Handle custom volume option
            if (volumeValue === 'custom') {
                await this.sendMessage(chatId, 'Please enter a custom volume range in the format: min-max (e.g., 50000-500000)');
                userState.step = 'volume_custom_input';
                return;
            }

            // Validate volume range
            if (!volumeRanges[volumeValue]) {
                console.error('Invalid volume range value:', volumeValue, 'Available ranges:', Object.keys(volumeRanges));
                throw new Error(`Invalid volume range: ${volumeValue}`);
            }

            // Update user state with volume selection
            userState.data.volume = {
                value: volumeRanges[volumeValue],
                operator: 'between'
            };

            // Show updated unified options
            await this.showUnifiedRuleOptions(ctx);
        } catch (error) {
            console.error('Error handling volume selection:', error);
            console.error('Callback data received:', value);
            await this.sendMessage(chatId, 'Invalid volume range selected. Please try again.');
        }
    }

    async handleBuyAmountSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'rule_buy_amount_custom') {
            // Set user state to await custom buy amount input
            userState.waitingFor = 'custom_buy_amount';
            userState.step = 'buy_amount_custom_input';
            this.userStates.set(userId, userState);

            const message = `
*📝 Custom Buy Amount*

Please enter your desired buy amount:

*Examples:*
• 0.15 SOL
• 0.75 SOL
• 1.5 SOL
• 10 SOL

*Format:* Enter amount followed by SOL (e.g., "0.25 SOL" or just "0.25")

💡 *Tip:* Consider your risk tolerance and portfolio size when setting buy amounts.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'buy_amount_select' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            return;
        }

        // Handle predefined amounts
        const amountMapping = {
            'rule_buy_amount_0_01_sol': { value: 0.01, unit: ' SOL' },
            'rule_buy_amount_0_05_sol': { value: 0.05, unit: ' SOL' },
            'rule_buy_amount_0_1_sol': { value: 0.1, unit: ' SOL' },
            'rule_buy_amount_0_25_sol': { value: 0.25, unit: ' SOL' },
            'rule_buy_amount_0_5_sol': { value: 0.5, unit: ' SOL' },
            'rule_buy_amount_1_sol': { value: 1, unit: ' SOL' },
            'rule_buy_amount_2_sol': { value: 2, unit: ' SOL' },
            'rule_buy_amount_5_sol': { value: 5, unit: ' SOL' }
        };

        const buyAmountConfig = amountMapping[action];
        if (buyAmountConfig) {
            userState.data.buyAmount = buyAmountConfig;

            await this.sendMessage(chatId, `✅ Buy amount set to ${buyAmountConfig.value}${buyAmountConfig.unit}`);
            
            // Return to the unified rule options
            if (userState.data.tradingMode === 'autonomous') {
                await this.showAutonomousStrategyOptions(ctx);
            } else {
                await this.showUnifiedRuleOptions(ctx);
            }
        } else {
            console.error('Unknown buy amount action:', action);
            await this.sendMessage(chatId, 'Invalid buy amount selection. Please try again.');
            await this.showBuyAmountOptions(ctx);
        }
    }

    async handlePriceSelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            // Extract the price value from the callback data
            const priceValue = value.replace('price_', '');
            
            // Define price ranges
            const priceRanges = {
                '0_01': { min: 0, max: 0.01 },
                '0_1': { min: 0.01, max: 0.1 },
                '1': { min: 0.1, max: 1 },
                '10': { min: 1, max: 10 },
                '10_plus': { min: 10, max: Infinity }
            };

            // Validate price range
            if (!Object.keys(priceRanges).includes(priceValue)) {
                console.error('Invalid price range value:', priceValue, 'Available ranges:', Object.keys(priceRanges));
                throw new Error(`Invalid price range: ${priceValue}`);
            }

            // Update user state with price selection
            userState.data.price = {
                value: priceRanges[priceValue],
                operator: 'between'
            };

            // Show updated unified options
            await this.showUnifiedRuleOptions(ctx);
        } catch (error) {
            console.error('Error handling price selection:', error);
            console.error('Callback data received:', value);
            await this.sendMessage(chatId, 'Invalid price range selected. Please try again.');
        }
    }

    async handleLiquiditySelection(ctx, value) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Initialize data object if it doesn't exist
        userState.data = userState.data || {};

        try {
            // Extract the liquidity value from the callback data
            const liquidityValue = value.replace('liquidity_', '');
            
            // Define liquidity ranges
            const liquidityRanges = {
                'low': { min: 0, max: 10000 },
                'medium': { min: 10000, max: 100000 },
                'high': { min: 100000, max: 1000000 },
                'very_high': { min: 1000000, max: Infinity }
            };

            // Validate liquidity range
            if (!liquidityRanges[liquidityValue]) {
                console.error('Invalid liquidity range value:', liquidityValue, 'Available ranges:', Object.keys(liquidityRanges));
                throw new Error(`Invalid liquidity range: ${liquidityValue}`);
            }

            // Update user state with liquidity selection
            userState.data.liquidity = {
                value: liquidityRanges[liquidityValue],
                operator: 'between'
            };

            // Show updated unified options
            await this.showUnifiedRuleOptions(ctx);
        } catch (error) {
            console.error('Error handling liquidity selection:', error);
            console.error('Callback data received:', value);
            await this.sendMessage(chatId, 'Invalid liquidity range selected. Please try again.');
        }
    }

    async showRuleSettings(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        // Get user's rules
        const user = await this.db.getUserByTelegramId(userId);
        if (!user) {
            await this.sendMessage(chatId, 'User not found. Please try again.');
            return;
        }

        const rules = await this.db.getRulesByUserId(user.id);

        if (rules.length === 0) {
            await this.sendMessage(chatId, 'No rules found. Create a new rule to configure settings.');
            return;
        }

        const message = `
*⚙️ Rule Settings*

Select a rule to configure its settings:`;

        // Create keyboard with rule buttons
        const keyboard = {
            inline_keyboard: [
                ...rules.map(rule => [{
                    text: `${rule.name} ${rule.is_active ? '✅' : '⏸️'}`,
                    callback_data: `settings_rule_${rule.id}`
                }]),
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleSettings(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            // Get rule and its settings
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendMessage(chatId, 'Rule not found. Please try again.');
                return;
            }

            let settings = await this.db.getRuleSettings(ruleId);
            if (!settings) {
                // Create default settings if they don't exist
                await this.db.createRuleSettings(ruleId, {
                    notifications_enabled: 1,  // Convert true to 1
                    alerts_enabled: 1,        // Convert true to 1
                    notification_frequency: 'immediate',
                    alert_threshold: 100
                });
                settings = await this.db.getRuleSettings(ruleId);
            }

            const message = `
*⚙️ Settings for ${rule.name}*

*Current Settings:*
- Notifications: ${settings.notifications_enabled ? '✅ Enabled' : '❌ Disabled'}
- Alerts: ${settings.alerts_enabled ? '✅ Enabled' : '❌ Disabled'}
- Notification Frequency: ${settings.notification_frequency || 'Immediate'}
- Alert Threshold: ${settings.alert_threshold || 100}%

Select an option to configure:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔔 Notifications', callback_data: `settings_notifications_${ruleId}` },
                        { text: '📊 Alerts', callback_data: `settings_alerts_${ruleId}` }
                    ],
                    [
                        { text: '⏰ Frequency', callback_data: `settings_frequency_${ruleId}` },
                        { text: '📈 Threshold', callback_data: `settings_threshold_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Settings', callback_data: 'rules_settings' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule settings:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error loading the rule settings.');
        }
    }

    async handleNotificationsSettings(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);

        const message = `
*🔔 Notification Settings*

Configure notification preferences:
- Enable/disable notifications
- Set notification frequency
- Choose notification types`;

        const keyboard = {
            inline_keyboard: [
                [
                    { 
                        text: settings?.notifications_enabled ? '❌ Disable Notifications' : '✅ Enable Notifications',
                        callback_data: `settings_toggle_notifications_${ruleId}`
                    }
                ],
                [
                    { text: '⏰ Set Frequency', callback_data: `settings_frequency_${ruleId}` }
                ],
                [
                    { text: '◀️ Back', callback_data: `settings_rule_${ruleId}` }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleAlertsSettings(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);

        const message = `
*📊 Alert Settings*

Configure alert preferences:
- Enable/disable alerts
- Set alert threshold
- Choose alert types`;

        const keyboard = {
            inline_keyboard: [
                [
                    { 
                        text: settings?.alerts_enabled ? '❌ Disable Alerts' : '✅ Enable Alerts',
                        callback_data: `settings_toggle_alerts_${ruleId}`
                    }
                ],
                [
                    { text: '📈 Set Threshold', callback_data: `settings_threshold_${ruleId}` }
                ],
                [
                    { text: '◀️ Back', callback_data: `settings_rule_${ruleId}` }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleFrequencySettings(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);

        const message = `
*⏰ Notification Frequency*

Select how often you want to receive notifications:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⚡️ Immediate', callback_data: `settings_frequency_immediate_${ruleId}` },
                    { text: '🕐 Hourly', callback_data: `settings_frequency_hourly_${ruleId}` }
                ],
                [
                    { text: '📅 Daily', callback_data: `settings_frequency_daily_${ruleId}` },
                    { text: '📊 Weekly', callback_data: `settings_frequency_weekly_${ruleId}` }
                ],
                [
                    { text: '◀️ Back', callback_data: `settings_rule_${ruleId}` }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleThresholdSettings(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);

        const message = `
*📈 Alert Threshold*

Select the threshold percentage for alerts:
- Current: ${settings?.alert_threshold || 100}%`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '50%', callback_data: `settings_threshold_50_${ruleId}` },
                    { text: '100%', callback_data: `settings_threshold_100_${ruleId}` }
                ],
                [
                    { text: '200%', callback_data: `settings_threshold_200_${ruleId}` },
                    { text: '500%', callback_data: `settings_threshold_500_${ruleId}` }
                ],
                [
                    { text: '◀️ Back', callback_data: `settings_rule_${ruleId}` }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async toggleNotifications(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);
        
        await this.db.updateRuleSettings(ruleId, {
            notifications_enabled: settings?.notifications_enabled ? 0 : 1
        });

        await this.handleNotificationsSettings(ctx, ruleId);
    }

    async toggleAlerts(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const settings = await this.db.getRuleSettings(ruleId);
        
        await this.db.updateRuleSettings(ruleId, {
            alerts_enabled: settings?.alerts_enabled ? 0 : 1
        });

        await this.handleAlertsSettings(ctx, ruleId);
    }

    async updateFrequency(ctx, ruleId, frequency) {
        const chatId = ctx.chat.id;
        
        await this.db.updateRuleSettings(ruleId, {
            notification_frequency: frequency
        });

        await this.handleFrequencySettings(ctx, ruleId);
    }

    async updateThreshold(ctx, ruleId, threshold) {
        const chatId = ctx.chat.id;
        
        await this.db.updateRuleSettings(ruleId, {
            alert_threshold: parseInt(threshold)
        });

        await this.handleThresholdSettings(ctx, ruleId);
    }

    async createRuleAndShowSuccess(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const userState = this.userStates.get(telegramId);

        if (!userState || !userState.data) {
            await this.sendMessage(chatId, 'Error: No rule data found. Please start over.');
            return;
        }

        try {
            // Get the database user ID
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                // Create user if they don't exist
                await this.db.createUser(telegramId);
                const newUser = await this.db.getUserByTelegramId(telegramId);
                if (!newUser) {
                    throw new Error('Failed to create user');
                }
                user = newUser;
            }

            // Create rule in database with the correct user ID
            const ruleId = await this.createRule(user.id, userState.data);

            // Generate success message based on trading mode
            let message = '';
            let ruleTypeDisplay = '';
            
            if (userState.data.tradingMode === 'autonomous') {
                ruleTypeDisplay = '🤖 Autonomous Strategy';
                message = `
*✅ Autonomous Strategy Created Successfully!*

*Strategy Details:*
*Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${this.getCurrentSelections(userState.data)}

Your autonomous strategy is now active! It will:
- 🟦 **Discover tokens** based on your criteria
- 🟩 **Manage positions** automatically with your exit rules
- 📊 **Execute trades** when conditions are met

*Next Steps:*
- Monitor strategy performance in Rule Stats
- Adjust settings as needed
- Create additional strategies for diversification`;
            } else if (userState.data.tradingMode === 'manual') {
                ruleTypeDisplay = '✋ Manual Trading Rules';
                message = `
*✅ Manual Trading Rules Created Successfully!*

*Management Rules:*
*Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${this.getCurrentSelections(userState.data)}

Your universal manual trading rules are now active! They will:
- 🟩 **Apply to ALL manual trades** automatically
- 💰 **Manage Take Profit** settings
- 🛑 **Handle Stop Loss** execution
- 📉 **Control Trailing Stops**

*Next Steps:*
- Start manual trading with automatic rule management
- Monitor rule performance in Rule Stats
- Adjust settings as your strategy evolves`;
            } else {
                // Legacy rule type
                ruleTypeDisplay = '🔧 Trading Rule';
                message = `
*✅ Rule Created Successfully!*

*Rule Details:*
*Name:* ${userState.data.name}
*Type:* ${ruleTypeDisplay}

${this.getCurrentSelections(userState.data)}

The rule is now active and will monitor tokens based on your criteria.

*Next Steps:*
- Monitor rule performance in Rule Stats
- Adjust settings in Rule Settings
- Create more rules for different strategies`;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Stats', callback_data: 'rules_stats' },
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ],
                    [
                        { text: '➕ Create Another', callback_data: 'rules_create' },
                        { text: '⚙️ Settings', callback_data: 'rules_settings' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Clear user state
            this.userStates.delete(telegramId);
        } catch (error) {
            console.error('Error creating rule:', error);
            
            // Check if it's a validation error
            let errorMessage = 'Sorry, there was an error creating your rule. Please try again.';
            if (error.message && error.message.includes('Rule validation failed:')) {
                errorMessage = `❌ *Rule Validation Failed*\n\n${error.message.replace('Rule validation failed: ', '')}\n\nPlease fix these issues and try again.`;
            }
            
            await this.sendMessage(chatId, errorMessage, {
                parse_mode: 'Markdown'
            });
        }
    }

    async handleRuleSelection(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        // Get rule details
        const rule = await this.db.getRuleById(ruleId);
        if (!rule) {
            await this.sendMessage(chatId, 'Rule not found. Please try again.');
            return;
        }

        // Get rule conditions
        const conditions = await this.db.getRuleConditions(ruleId);
        
        // Get rule settings
        const settings = await this.db.getRuleSettings(ruleId);

        // Format rule details
        const message = `
*📋 Rule Details: ${rule.name}*

*Status:* ${rule.is_active ? '✅ Active' : '⏸️ Paused'}
*Type:* ${rule.type === 'filter' ? '🔍 Filter' : '📊 Strategy'}
*Created:* ${new Date(rule.created_at).toLocaleDateString()}

*Conditions:*
${this.formatRuleConditions(conditions)}

*Settings:*
- Notifications: ${settings?.notifications_enabled ? '✅' : '❌'}
- Alerts: ${settings?.alerts_enabled ? '✅' : '❌'}
- Frequency: ${settings?.notification_frequency || 'immediate'}
- Threshold: ${settings?.alert_threshold || 100}%

*Performance:*
- Success Rate: ${this.calculateRuleSuccessRate(rule)}%
- Total Triggers: ${rule.success_count + rule.failure_count}
- Last Check: ${rule.last_check ? this.formatTimeAgo(rule.last_check) : 'Never'}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { 
                        text: rule.is_active ? '⏸️ Pause Rule' : '▶️ Activate Rule',
                        callback_data: `rule_toggle_${ruleId}`
                    }
                ],
                [
                    { text: '⚙️ Settings', callback_data: `settings_rule_${ruleId}` },
                    { text: '📊 Stats', callback_data: `rule_stats_${ruleId}` }
                ],
                [
                    { text: '✏️ Edit', callback_data: `rule_edit_${ruleId}` },
                    { text: '🗑️ Delete', callback_data: `rule_delete_${ruleId}` }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_list' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    formatRuleConditions(conditions) {
        if (!conditions || conditions.length === 0) {
            return 'No conditions set';
        }

        return conditions.map(condition => {
            let value;
            try {
                value = typeof condition.condition_value === 'string' ? JSON.parse(condition.condition_value) : condition.condition_value;
            } catch (e) {
                value = condition.condition_value;
            }

            switch (condition.condition_type) {
                case 'market_cap':
                    return `- Market Cap: $${this.formatNumber(value?.min || 0)} - $${value?.max === null ? '∞' : this.formatNumber(value?.max || 0)}`;
                case 'price':
                    return `- Price: $${(value?.min || 0).toFixed(4)} - $${value?.max === null ? '∞' : (value?.max || 0).toFixed(4)}`;
                case 'volume':
                    return `- Volume: $${this.formatNumber(value?.min || 0)} - $${value?.max === null ? '∞' : this.formatNumber(value?.max || 0)}`;
                case 'liquidity':
                    return `- Liquidity: $${this.formatNumber(value?.min || 0)} - $${value?.max === null ? '∞' : this.formatNumber(value?.max || 0)}`;
                case 'category':
                    return `- Category: ${String(value).charAt(0).toUpperCase() + String(value).slice(1)}`;
                case 'timeframe':
                    return `- Timeframe: ${value}`;
                case 'price_change':
                    return `- Price Change: ${value?.direction === 'increase' ? '📈' : '📉'} ${value?.threshold || 0}% in ${value?.timeframe || '24h'}`;
                case 'volume_change':
                    return `- Volume Change: ${value?.direction === 'increase' ? '📈' : '📉'} ${value?.threshold || 0}% in ${value?.timeframe || '24h'}`;
                default:
                    // Safely handle JavaScript objects by converting them to readable strings
                    let displayValue;
                    if (typeof value === 'object' && value !== null) {
                        // Try to create a meaningful display string for objects
                        if (value.threshold !== undefined) {
                            displayValue = `${value.threshold}${value.unit === '%' ? '%' : (value.unit || '')}`;
                        } else if (value.min !== undefined || value.max !== undefined) {
                            displayValue = `${value.min || 0} - ${value.max === null ? '∞' : (value.max || 0)}`;
                        } else if (value.direction !== undefined) {
                            displayValue = `${value.direction} ${value.threshold || 0}% in ${value.timeframe || '24h'}`;
                        } else if (value.percentage !== undefined) {
                            // Handle percentage-based objects (like take profit, stop loss)
                            displayValue = `${value.percentage}%${value.enabled ? ' - enabled' : ' - disabled'}`;
                        } else {
                            // For other objects, show key properties in a safe format
                            displayValue = Object.keys(value).length > 0 
                                ? Object.entries(value).map(([k, v]) => `${k} ${v}`).join(', ')
                                : 'No configuration';
                        }
                    } else {
                        displayValue = String(value);
                    }
                    // Escape underscores in condition type names for Telegram Markdown
                    const safeConditionType = condition.condition_type.replace(/_/g, '\\_');
                    return `- ${safeConditionType}: ${displayValue}`;
            }
        }).join('\n');
    }

    calculateRuleSuccessRate(rule) {
        const totalTriggers = rule.success_count + rule.failure_count;
        const successRate = totalTriggers > 0 ? Math.round((rule.success_count / totalTriggers) * 100) : 0;

        // Check for specific conditions to adjust success rate
        if (rule.type === 'strategy') {
            if (rule.volumeChange) {
                // If volume change is part of the strategy, increase success rate if successful volume spikes are present
                if (rule.success_count > 0 && rule.volume_spike_success) {
                    return Math.min(successRate + 10, 100); // Cap at 100%
                }
            }
        }

        return successRate;
    }

    async handleRuleToggle(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            // Get current rule status
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                try {
                    await this.sendMessage(chatId, 'Rule not found. Please try again.');
                } catch (sendError) {
                    console.error('Error sending rule not found message:', sendError);
                }
                return;
            }

            // Toggle rule status
            // Convert boolean result to integer for SQLite (0 = false, 1 = true)
            const newStatus = rule.is_active ? 0 : 1;
            await this.db.updateRuleStatus(ruleId, newStatus);

            console.log(`✅ Rule ${ruleId} status successfully updated to ${newStatus ? 'active' : 'inactive'}`);

            // Check if this was an autonomous strategy rule being deactivated
            if (rule.type === 'autonomous_strategy' && newStatus === 0) {
                // Get user to access user_id
                const user = await this.db.getUserByTelegramId(userId);
                if (user) {
                    // Get all active autonomous strategy rules for this user
                    const allRules = await this.db.getRulesByUserId(user.id);
                    const activeAutonomousRules = allRules.filter(r => r.is_active && r.type === 'autonomous_strategy');
                    
                    if (activeAutonomousRules.length === 0) {
                        // No active autonomous strategy rules left, turn off autonomous mode
                        await this.db.updateUserSettings(user.id, { autonomous_enabled: false });
                        
                        console.log(`🤖 Autonomous mode automatically disabled for user ${user.id} - no active autonomous strategy rules`);
                        
                        // Send notification about autonomous mode being disabled
                        try {
                            const message = `
*⏸️ Rule Deactivated*

Rule "${rule.name}" has been deactivated successfully.

🤖 *Autonomous Mode Automatically Disabled*

No active autonomous strategy rules were found. 
Autonomous mode has been automatically turned off for your safety.

To re-enable autonomous mode, please create and activate at least one autonomous strategy rule.`;
                            
                            await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                            return;
                        } catch (notifyError) {
                            console.error('Error sending autonomous mode disabled notification:', notifyError);
                        }
                    }
                }
            }

            // Try to show updated rule details with network error handling
            try {
                await this.handleRuleSelection(ctx, ruleId);
            } catch (displayError) {
                console.error('Error displaying updated rule details:', displayError);
                
                // If there's a network error, try to send a simple confirmation instead
                try {
                    const statusText = newStatus ? 'activated' : 'paused';
                    const confirmMessage = `✅ Rule "${rule.name}" has been ${statusText} successfully.`;
                    await this.sendMessage(chatId, confirmMessage);
                } catch (confirmError) {
                    console.error('Error sending confirmation message:', confirmError);
                    // Log the success but don't throw - the database update was successful
                    console.log('Rule toggle completed successfully despite messaging error');
                }
            }
        } catch (error) {
            console.error('Error toggling rule:', error);
            
            // Check if it's a database error vs messaging error
            if (error.message && error.message.includes('database')) {
                try {
                    await this.sendMessage(chatId, 'Sorry, there was an error updating the rule status in the database.');
                } catch (sendError) {
                    console.error('Error sending database error message:', sendError);
                }
            } else {
                try {
                    await this.sendMessage(chatId, 'Rule status updated, but there was a display error. Please refresh to see changes.');
                } catch (sendError) {
                    console.error('Error sending general error message:', sendError);
                }
            }
        }
    }

    async handleRuleDelete(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        const message = `
*⚠️ Delete Rule*

Are you sure you want to delete this rule?
This action cannot be undone.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Yes, Delete', callback_data: `rule_delete_confirm_${ruleId}` },
                    { text: '❌ No, Cancel', callback_data: `rule_${ruleId}` }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleDeleteConfirm(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            // Get the rule before deleting it to check if it's an autonomous strategy rule
            const rule = await this.db.getRuleById(ruleId);
            const wasAutonomousStrategy = rule && rule.type === 'autonomous_strategy';
            
            // Delete rule settings first (if they exist)
            try {
                await this.db.deleteRuleSettings(ruleId);
            } catch (e) {
                // Settings might not exist, continue
            }
            
            // Delete the rule (this also deletes rule conditions automatically)
            await this.db.deleteRule(ruleId);

            // Check if this was an autonomous strategy rule and if it was the last one
            if (wasAutonomousStrategy) {
                // Get user to access user_id
                const user = await this.db.getUserByTelegramId(userId);
                if (user) {
                    // Get all active autonomous strategy rules for this user
                    const allRules = await this.db.getRulesByUserId(user.id);
                    const activeAutonomousRules = allRules.filter(r => r.is_active && r.type === 'autonomous_strategy');
                    
                    if (activeAutonomousRules.length === 0) {
                        // No active autonomous strategy rules left, turn off autonomous mode
                        await this.db.updateUserSettings(user.id, { autonomous_enabled: false });
                        
                        console.log(`🤖 Autonomous mode automatically disabled for user ${user.id} - no active autonomous strategy rules after deletion`);
                        
                        const message = `
*🗑️ Rule Deleted*

Rule "${rule.name}" has been deleted successfully.

🤖 *Autonomous Mode Automatically Disabled*

No active autonomous strategy rules were found. 
Autonomous mode has been automatically turned off for your safety.

To re-enable autonomous mode, please create and activate at least one autonomous strategy rule.`;
                        
                        await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                        
                        // Show updated rules list
                        await this.listRules(ctx);
                        return;
                    }
                }
            }

            await this.sendMessage(chatId, '✅ Rule has been deleted successfully.');
            
            // Show updated rules list
            await this.listRules(ctx);
        } catch (error) {
            console.error('Error deleting rule:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error deleting the rule.');
        }
    }

    async handleRuleStats(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendMessage(chatId, 'Rule not found. Please try again.');
                return;
            }

            const message = `
*📊 Rule Statistics: ${rule.name}*

*Performance Metrics:*
- Success Rate: ${this.calculateRuleSuccessRate(rule)}%
- Total Triggers: ${rule.success_count + rule.failure_count}
- Successful Triggers: ${rule.success_count}
- Failed Triggers: ${rule.failure_count}

*Activity:*
- Last Check: ${rule.last_check ? this.formatTimeAgo(rule.last_check) : 'Never'}
- Created: ${new Date(rule.created_at).toLocaleDateString()}
- Last Updated: ${new Date(rule.updated_at).toLocaleDateString()}

*Status:* ${rule.is_active ? '✅ Active' : '⏸️ Paused'}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: `rule_stats_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Rule', callback_data: `rule_${ruleId}` }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule stats:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error fetching rule statistics.');
        }
    }

    async handleRuleEdit(ctx, ruleId) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendMessage(chatId, 'Rule not found. Please try again.');
                return;
            }

            const message = `
*✏️ Edit Rule: ${rule.name}*

Choose what you want to modify:

*Available Options:*
• Change rule name
• Modify conditions  
• Update trigger settings
• Adjust risk parameters
• Configure notifications`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📝 Change Name', callback_data: `rule_edit_name_${ruleId}` },
                        { text: '⚙️ Modify Conditions', callback_data: `rule_edit_conditions_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Rule', callback_data: `rule_${ruleId}` }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule edit options:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error loading rule edit options.');
        }
    }

    async handleRuleReset(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();

        try {
            // Clear user state for rule creation
            this.userStates.delete(userId);

            const message = `
*🔄 Rule Creation Reset*

Your rule creation progress has been cleared. You can now start creating a new rule from scratch.

*What would you like to do next?*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📝 Create New Rule', callback_data: 'rules_create' },
                        { text: '📋 List Rules', callback_data: 'rules_list' }
                    ],
                    [
                        { text: '📊 Rule Stats', callback_data: 'rules_stats' },
                        { text: '⚙️ Settings', callback_data: 'rules_settings' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling rule reset:', error);
            await this.sendMessage(chatId, 'Sorry, there was an error resetting your rule creation. Please try again.');
        }
    }

    /**
     * Validate rule configuration data
     * @param {Object} ruleData - The rule data to validate
     * @returns {Object} - Validation result with isValid flag and errors array
     */
    validateRuleConfig(ruleData) {
        const errors = [];
        
        try {
            // Validate rule name
            if (!ruleData.name || typeof ruleData.name !== 'string') {
                errors.push('Rule name is required and must be a string');
            } else if (ruleData.name.length === 0 || ruleData.name.length > 50) {
                errors.push('Rule name must be between 1 and 50 characters');
            } else if (!/^[a-zA-Z0-9_\s-]+$/.test(ruleData.name)) {
                errors.push('Rule name can only contain letters, numbers, underscores, spaces, and hyphens');
            }

            // Validate rule type (includes new trading modes)
            const validTypes = ['filter', 'strategy', 'autonomous_strategy', 'manual_management'];
            if (!ruleData.type || !validTypes.includes(ruleData.type)) {
                errors.push(`Rule type must be one of: ${validTypes.join(', ')}`);
            }

            // Validate based on rule type or trading mode
            if (ruleData.tradingMode === 'autonomous' || ruleData.type === 'autonomous_strategy') {
                this.validateAutonomousStrategyConfig(ruleData, errors);
            } else if (ruleData.tradingMode === 'manual' || ruleData.type === 'manual_management') {
                this.validateManualManagementConfig(ruleData, errors);
            } else if (ruleData.type === 'filter') {
                this.validateFilterRuleConfig(ruleData, errors);
            } else if (ruleData.type === 'strategy') {
                this.validateStrategyRuleConfig(ruleData, errors);
            }

            return {
                isValid: errors.length === 0,
                errors: errors
            };
        } catch (error) {
            console.error('Error validating rule config:', error);
            return {
                isValid: false,
                errors: ['Validation error occurred']
            };
        }
    }

    /**
     * Validate autonomous strategy configuration
     * @param {Object} ruleData - The rule data
     * @param {Array} errors - Errors array to populate
     */
    validateAutonomousStrategyConfig(ruleData, errors) {
        // At least one discovery rule or one management rule should be present
        const hasDiscoveryRules = ruleData.marketCap || ruleData.price || ruleData.volume || 
                                 ruleData.liquidity || ruleData.category || ruleData.timeframe ||
                                 ruleData.copyTrade || ruleData.narrative || ruleData.volumeSpike ||
                                 ruleData.dipBuy || ruleData.priceChange || ruleData.volumeChange;

        const hasManagementRules = ruleData.takeProfit || ruleData.stopLoss || ruleData.trailingStop ||
                                  ruleData.momentum || ruleData.volatility;

        if (!hasDiscoveryRules && !hasManagementRules) {
            errors.push('Autonomous strategy must have at least one discovery rule or one management rule');
        }

        // REQUIRED: Take Profit and Stop Loss for autonomous strategies
        if (!ruleData.takeProfit) {
            errors.push('Take Profit is required for autonomous strategies to secure profits');
        }
        if (!ruleData.stopLoss) {
            errors.push('Stop Loss is required for autonomous strategies to limit losses');
        }

        // Validate specific rule types
        if (ruleData.marketCap) this.validateRangeValue(ruleData.marketCap, 'Market cap', errors);
        if (ruleData.price) this.validateRangeValue(ruleData.price, 'Price', errors);
        if (ruleData.volume) this.validateRangeValue(ruleData.volume, 'Volume', errors);
        if (ruleData.liquidity) this.validateRangeValue(ruleData.liquidity, 'Liquidity', errors);
        if (ruleData.priceChange) this.validateChangeCondition(ruleData.priceChange, 'Price change', errors);
        if (ruleData.volumeChange) this.validateChangeCondition(ruleData.volumeChange, 'Volume change', errors);
        if (ruleData.takeProfit) this.validatePercentageRule(ruleData.takeProfit, 'Take profit', errors);
        if (ruleData.stopLoss) this.validatePercentageRule(ruleData.stopLoss, 'Stop loss', errors);
        if (ruleData.trailingStop) this.validatePercentageRule(ruleData.trailingStop, 'Trailing stop', errors);
    }

    /**
     * Validate manual management configuration
     * @param {Object} ruleData - The rule data
     * @param {Array} errors - Errors array to populate
     */
    validateManualManagementConfig(ruleData, errors) {
        // At least one management rule should be present
        const hasManagementRules = ruleData.takeProfit || ruleData.stopLoss || ruleData.trailingStop;

        if (!hasManagementRules) {
            errors.push('Manual management rules must have at least one management rule (take profit, stop loss, or trailing stop)');
        }

        // Validate management rules
        if (ruleData.takeProfit) this.validatePercentageRule(ruleData.takeProfit, 'Take profit', errors);
        if (ruleData.stopLoss) this.validatePercentageRule(ruleData.stopLoss, 'Stop loss', errors);
        if (ruleData.trailingStop) this.validatePercentageRule(ruleData.trailingStop, 'Trailing stop', errors);
    }

    /**
     * Validate percentage-based rule
     * @param {Object} percentageRule - The percentage rule to validate
     * @param {string} fieldName - Name of the field for error messages
     * @param {Array} errors - Errors array to populate
     */
    validatePercentageRule(percentageRule, fieldName, errors) {
        if (!percentageRule.percentage || typeof percentageRule.percentage !== 'number') {
            errors.push(`${fieldName} must have a valid percentage value`);
            return;
        }

        if (percentageRule.percentage <= 0 || percentageRule.percentage > 100) {
            errors.push(`${fieldName} percentage must be between 0 and 100`);
        }
    }

    /**
     * Validate filter rule specific configuration
     * @param {Object} ruleData - The rule data
     * @param {Array} errors - Errors array to populate
     */
    validateFilterRuleConfig(ruleData, errors) {
        const hasAnyFilter = ruleData.marketCap || ruleData.price || ruleData.volume || 
                            ruleData.liquidity || ruleData.category || ruleData.timeframe;

        if (!hasAnyFilter) {
            errors.push('Filter rules must have at least one filter criteria (market cap, price, volume, liquidity, category, or timeframe)');
        }

        // Validate market cap
        if (ruleData.marketCap) {
            this.validateRangeValue(ruleData.marketCap, 'Market cap', errors);
        }

        // Validate price
        if (ruleData.price) {
            this.validateRangeValue(ruleData.price, 'Price', errors);
        }

        // Validate volume
        if (ruleData.volume) {
            this.validateRangeValue(ruleData.volume, 'Volume', errors);
        }

        // Validate liquidity
        if (ruleData.liquidity) {
            this.validateRangeValue(ruleData.liquidity, 'Liquidity', errors);
        }

        // Validate category
        if (ruleData.category) {
            const validCategories = ['defi', 'nft', 'gaming', 'metaverse', 'infrastructure', 'other'];
            if (!validCategories.includes(ruleData.category.toLowerCase())) {
                errors.push(`Category must be one of: ${validCategories.join(', ')}`);
            }
        }

        // Validate timeframe
        if (ruleData.timeframe) {
            const validTimeframes = ['1h', '4h', '12h', '24h', '7d'];
            if (!validTimeframes.includes(ruleData.timeframe)) {
                errors.push(`Timeframe must be one of: ${validTimeframes.join(', ')}`);
            }
        }
    }

    /**
     * Validate strategy rule specific configuration
     * @param {Object} ruleData - The rule data
     * @param {Array} errors - Errors array to populate
     */
    validateStrategyRuleConfig(ruleData, errors) {
        const hasAnyStrategy = ruleData.priceChange || ruleData.volumeChange;

        if (!hasAnyStrategy) {
            errors.push('Strategy rules must have at least one strategy condition (price change or volume change)');
        }

        // Validate price change
        if (ruleData.priceChange) {
            this.validateChangeCondition(ruleData.priceChange, 'Price change', errors);
        }

        // Validate volume change
        if (ruleData.volumeChange) {
            this.validateChangeCondition(ruleData.volumeChange, 'Volume change', errors);
        }
    }

    /**
     * Validate a range value (min/max)
     * @param {Object} rangeValue - The range value to validate
     * @param {string} fieldName - Name of the field for error messages
     * @param {Array} errors - Errors array to populate
     */
    validateRangeValue(rangeValue, fieldName, errors) {
        if (!rangeValue.value || typeof rangeValue.value !== 'object') {
            errors.push(`${fieldName} must have a value object with min and max properties`);
            return;
        }

        const { min, max } = rangeValue.value;

        if (typeof min !== 'number' || min < 0) {
            errors.push(`${fieldName} minimum value must be a non-negative number`);
        }

        if (max !== null && max !== Infinity && (typeof max !== 'number' || max < min)) {
            errors.push(`${fieldName} maximum value must be a number greater than or equal to minimum value`);
        }
    }

    /**
     * Validate a change condition (for price/volume changes)
     * @param {Object} changeCondition - The change condition to validate
     * @param {string} fieldName - Name of the field for error messages
     * @param {Array} errors - Errors array to populate
     */
    validateChangeCondition(changeCondition, fieldName, errors) {
        if (!changeCondition.direction || !['increase', 'decrease'].includes(changeCondition.direction)) {
            errors.push(`${fieldName} direction must be either "increase" or "decrease"`);
        }

        if (typeof changeCondition.threshold !== 'number' || changeCondition.threshold <= 0) {
            errors.push(`${fieldName} threshold must be a positive number`);
        }

        const validTimeframes = ['1h', '4h', '12h', '24h', '1d', '7d', '1w'];
        if (!changeCondition.timeframe || !validTimeframes.includes(changeCondition.timeframe)) {
            errors.push(`${fieldName} timeframe must be one of: ${validTimeframes.join(', ')}`);
        }
    }

    /**
     * Sanitize and normalize rule data before saving
     * @param {Object} ruleData - The rule data to sanitize
     * @returns {Object} - Sanitized rule data
     */
    sanitizeRuleData(ruleData) {
        const sanitized = { ...ruleData };

        // Sanitize rule name
        if (sanitized.name) {
            sanitized.name = sanitized.name.trim().replace(/\s+/g, ' ');
        }

        // Sanitize category to lowercase
        if (sanitized.category) {
            sanitized.category = sanitized.category.toLowerCase();
        }

        // Ensure numeric values are properly formatted
        if (sanitized.priceChange && sanitized.priceChange.threshold) {
            sanitized.priceChange.threshold = parseFloat(sanitized.priceChange.threshold);
        }

        if (sanitized.volumeChange && sanitized.volumeChange.threshold) {
            sanitized.volumeChange.threshold = parseFloat(sanitized.volumeChange.threshold);
        }

        return sanitized;
    }

    /**
     * Show Volume Spike rule configuration options
     */
    async showVolumeSpikeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Volume Spike Rule Configuration*

Configure volume spike detection parameters:

*Current Selection:* ${userState.data.volumeSpike ? 
    `Volume spike ${userState.data.volumeSpike.threshold}% in ${userState.data.volumeSpike.timeWindow}` : 
    'Not configured'}

Select volume spike threshold:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '100% Spike (2x)', callback_data: 'volume_spike_100' },
                    { text: '200% Spike (3x)', callback_data: 'volume_spike_200' }
                ],
                [
                    { text: '500% Spike (6x)', callback_data: 'volume_spike_500' },
                    { text: '1000% Spike (11x)', callback_data: 'volume_spike_1000' }
                ],
                [
                    { text: 'Custom %', callback_data: 'volume_spike_custom' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Dip Buy rule configuration options
     */
    async showDipBuyRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📉 Dip Buy Rule Configuration*

Configure dip buying parameters:

*Current Selection:* ${userState.data.dipBuy ? 
    `Buy on ${userState.data.dipBuy.threshold}% dip in ${userState.data.dipBuy.timeWindow}` : 
    'Not configured'}

Select dip threshold:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '10% Dip', callback_data: 'dip_buy_10' },
                    { text: '20% Dip', callback_data: 'dip_buy_20' }
                ],
                [
                    { text: '30% Dip', callback_data: 'dip_buy_30' },
                    { text: '50% Dip', callback_data: 'dip_buy_50' }
                ],
                [
                    { text: 'Custom %', callback_data: 'dip_buy_custom' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Narrative rule configuration options
     */
    async showNarrativeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*🔄 Narrative Rule Configuration*

Configure narrative-based trading parameters:

*Current Selection:* ${userState.data.narrative ? 
    `Categories: ${userState.data.narrative.categories?.join(', ') || 'None'}` : 
    'Not configured'}

Select narrative types to monitor:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔥 Trending Narratives', callback_data: 'narrative_trending' },
                    { text: '📰 News Based', callback_data: 'narrative_news' }
                ],
                [
                    { text: '🐦 Social Sentiment', callback_data: 'narrative_social' },
                    { text: '👑 Influencer Mentions', callback_data: 'narrative_influencer' }
                ],
                [
                    { text: '🎮 Gaming Tokens', callback_data: 'narrative_gaming' },
                    { text: '🤖 AI Tokens', callback_data: 'narrative_ai' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Momentum rule configuration options
     */
    async showMomentumRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📊 Momentum Rule Configuration*

Configure momentum indicators:

*Current Selection:* ${userState.data.momentum ? 
    `${userState.data.momentum.indicator} - ${userState.data.momentum.threshold}%` : 
    'Not configured'}

Select momentum indicator:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'RSI Oversold (<30)', callback_data: 'momentum_rsi_oversold' },
                    { text: 'RSI Overbought (>70)', callback_data: 'momentum_rsi_overbought' }
                ],
                [
                    { text: 'MACD Bullish Cross', callback_data: 'momentum_macd_bull' },
                    { text: 'MACD Bearish Cross', callback_data: 'momentum_macd_bear' }
                ],
                [
                    { text: 'Price > MA', callback_data: 'momentum_price_above_ma' },
                    { text: 'Price < MA', callback_data: 'momentum_price_below_ma' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Volatility rule configuration options
     */
    async showVolatilityRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Volatility Rule Configuration*

Configure volatility parameters:

*Current Selection:* ${userState.data.volatility ? 
    `${userState.data.volatility.level} volatility (${userState.data.volatility.threshold}%)` : 
    'Not configured'}

Select volatility level:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Low Volatility (<5%)', callback_data: 'volatility_low' },
                    { text: 'Medium Volatility (5-15%)', callback_data: 'volatility_medium' }
                ],
                [
                    { text: 'High Volatility (15-30%)', callback_data: 'volatility_high' },
                    { text: 'Extreme Volatility (>30%)', callback_data: 'volatility_extreme' }
                ],
                [
                    { text: 'Custom Range', callback_data: 'volatility_custom' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Copy Trade rule configuration options
     */
    async showCopyTradeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*👥 Copy Trade Rule Configuration*

Configure copy trading parameters:

*Current Selection:* ${userState.data.copyTrade ? 
    `Following ${userState.data.copyTrade.walletType} wallets` : 
    'Not configured'}

Select wallet type to copy:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🏆 Top Traders', callback_data: 'copy_trade_top_traders' },
                    { text: '🐋 Whale Wallets', callback_data: 'copy_trade_whales' }
                ],
                [
                    { text: '💎 Smart Money', callback_data: 'copy_trade_smart_money' },
                    { text: '🤖 Bot Wallets', callback_data: 'copy_trade_bots' }
                ],
                [
                    { text: 'Custom Wallet', callback_data: 'copy_trade_custom' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Price Change rule configuration options
     */
    async showPriceChangeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Price Change Rule Configuration*

Configure price change monitoring:

*Current Selection:* ${userState.data.priceChange ? 
    `${userState.data.priceChange.threshold}% ${userState.data.priceChange.direction} in ${userState.data.priceChange.timeframe}` : 
    'Not configured'}

Select price change direction:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Price Increase', callback_data: 'price_change_increase' },
                    { text: '📉 Price Decrease', callback_data: 'price_change_decrease' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show Volume Change rule configuration options
     */
    async showVolumeChangeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📊 Volume Change Rule Configuration*

Configure volume change monitoring:

*Current Selection:* ${userState.data.volumeChange ? 
    `${userState.data.volumeChange.threshold}% ${userState.data.volumeChange.direction} in ${userState.data.volumeChange.timeframe}` : 
    'Not configured'}

Select volume change direction:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Volume Increase', callback_data: 'volume_change_increase' },
                    { text: '📉 Volume Decrease', callback_data: 'volume_change_decrease' }
                ],
                [
                    { text: '◀️ Back to Rules', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Handle volume spike selection callbacks
     */
    async handleVolumeSpikeSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'volume_spike_100') {
            userState.data.volumeSpike = { threshold: 100, timeWindow: '1h' };
        } else if (action === 'volume_spike_200') {
            userState.data.volumeSpike = { threshold: 200, timeWindow: '1h' };
        } else if (action === 'volume_spike_500') {
            userState.data.volumeSpike = { threshold: 500, timeWindow: '1h' };
        } else if (action === 'volume_spike_1000') {
            userState.data.volumeSpike = { threshold: 1000, timeWindow: '1h' };
        } else if (action === 'volume_spike_custom') {
            userState.step = 'volume_spike_custom_input';
            await this.sendMessage(chatId, 'Please enter custom volume spike percentage (e.g., 300 for 300%):');
            return;
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Handle dip buy selection callbacks
     */
    async handleDipBuySelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'dip_buy_10') {
            userState.data.dipBuy = { threshold: 10, timeWindow: '1h' };
        } else if (action === 'dip_buy_20') {
            userState.data.dipBuy = { threshold: 20, timeWindow: '1h' };
        } else if (action === 'dip_buy_30') {
            userState.data.dipBuy = { threshold: 30, timeWindow: '1h' };
        } else if (action === 'dip_buy_50') {
            userState.data.dipBuy = { threshold: 50, timeWindow: '1h' };
        } else if (action === 'dip_buy_custom') {
            userState.step = 'dip_buy_custom_input';
            await this.sendMessage(chatId, 'Please enter custom dip percentage (e.g., 25 for 25% dip):');
            return;
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Handle narrative selection callbacks
     */
    async handleNarrativeSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.narrative) {
            userState.data.narrative = { categories: [] };
        }

        const narrativeMap = {
            'narrative_trending': 'trending',
            'narrative_news': 'news',
            'narrative_social': 'social',
            'narrative_influencer': 'influencer',
            'narrative_gaming': 'gaming',
            'narrative_ai': 'ai'
        };

        const category = narrativeMap[action];
        if (category) {
            if (!userState.data.narrative.categories.includes(category)) {
                userState.data.narrative.categories.push(category);
            }
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Handle momentum selection callbacks
     */
    async handleMomentumSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const momentumMap = {
            'momentum_rsi_oversold': { indicator: 'RSI', condition: 'oversold', threshold: 30 },
            'momentum_rsi_overbought': { indicator: 'RSI', condition: 'overbought', threshold: 70 },
            'momentum_macd_bull': { indicator: 'MACD', condition: 'bullish_cross', threshold: 0 },
            'momentum_macd_bear': { indicator: 'MACD', condition: 'bearish_cross', threshold: 0 },
            'momentum_price_above_ma': { indicator: 'MA', condition: 'price_above', threshold: 0 },
            'momentum_price_below_ma': { indicator: 'MA', condition: 'price_below', threshold: 0 }
        };

        const momentum = momentumMap[action];
        if (momentum) {
            userState.data.momentum = momentum;
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Handle volatility selection callbacks
     */
    async handleVolatilitySelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const volatilityMap = {
            'volatility_low': { level: 'low', threshold: 5 },
            'volatility_medium': { level: 'medium', threshold: 15 },
            'volatility_high': { level: 'high', threshold: 30 },
            'volatility_extreme': { level: 'extreme', threshold: 50 }
        };

        const volatility = volatilityMap[action];
        if (volatility) {
            userState.data.volatility = volatility;
        } else if (action === 'volatility_custom') {
            userState.step = 'volatility_custom_input';
            await this.sendMessage(chatId, 'Please enter custom volatility threshold percentage (e.g., 20 for 20%):');
            return;
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Show copy trade rule configuration options
     */
    async showCopyTradeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*👥 Copy Trade Configuration*

Select which type of traders to copy:

- 🏆 Top Traders - Copy traders with high success rates
- 🐋 Whales - Copy large wallet holders
- 🧠 Smart Money - Copy institutional-level traders
- 🤖 Bot Traders - Copy automated trading bots
- 📝 Custom - Enter specific wallet address`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🏆 Top Traders', callback_data: 'copy_trade_top_traders' },
                    { text: '🐋 Whales', callback_data: 'copy_trade_whales' }
                ],
                [
                    { text: '🧠 Smart Money', callback_data: 'copy_trade_smart_money' },
                    { text: '🤖 Bot Traders', callback_data: 'copy_trade_bots' }
                ],
                [
                    { text: '📝 Custom Wallet', callback_data: 'copy_trade_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show volume spike rule configuration options
     */
    async showVolumeSpikeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Volume Spike Configuration*

Configure volume spike detection parameters:

- 📊 Spike Threshold - Minimum volume increase percentage
- ⏰ Time Window - Time period to detect spike within
- 💧 Min Liquidity - Minimum liquidity requirement
- 📉 Max Slippage - Maximum acceptable slippage`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Spike Threshold', callback_data: 'volume_spike_threshold' },
                    { text: '⏰ Time Window', callback_data: 'volume_spike_timewindow' }
                ],
                [
                    { text: '💧 Min Liquidity', callback_data: 'volume_spike_liquidity' },
                    { text: '📉 Max Slippage', callback_data: 'volume_spike_slippage' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show dip buy rule configuration options
     */
    async showDipBuyRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📉 Dip Buy Configuration*

Configure dip buying parameters:

- 📉 Min Drop - Minimum price drop percentage
- ⏰ Time Window - Time period to detect dip within
- 💧 Min Liquidity - Minimum liquidity requirement
- 📈 Max Slippage - Maximum acceptable slippage`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📉 Min Drop %', callback_data: 'dip_buy_min_drop' },
                    { text: '⏰ Time Window', callback_data: 'dip_buy_timewindow' }
                ],
                [
                    { text: '💧 Min Liquidity', callback_data: 'dip_buy_liquidity' },
                    { text: '📈 Max Slippage', callback_data: 'dip_buy_slippage' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show narrative rule configuration options
     */
    async showNarrativeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*🔄 Narrative Trading Configuration*

Configure narrative-based trading parameters:

- 🏷️ Categories - Select trending categories to follow
- ⭐ Min Score - Minimum narrative score threshold
- 📊 Min Volume - Minimum daily volume requirement
- 📈 Max Slippage - Maximum acceptable slippage`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🏷️ Categories', callback_data: 'narrative_categories' },
                    { text: '⭐ Min Score', callback_data: 'narrative_min_score' }
                ],
                [
                    { text: '📊 Min Volume', callback_data: 'narrative_min_volume' },
                    { text: '📈 Max Slippage', callback_data: 'narrative_slippage' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show momentum rule configuration options
     */
    async showMomentumRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📊 Momentum Trading Configuration*

Configure momentum-based trading parameters:

- ⏰ Lookback Period - Time period to analyze momentum
- 📈 Min Change - Minimum price change percentage
- 📊 Min Volume - Minimum volume requirement
- 📉 Max Slippage - Maximum acceptable slippage`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '⏰ Lookback Period', callback_data: 'momentum_lookback' },
                    { text: '📈 Min Change %', callback_data: 'momentum_min_change' }
                ],
                [
                    { text: '📊 Min Volume', callback_data: 'momentum_min_volume' },
                    { text: '📉 Max Slippage', callback_data: 'momentum_slippage' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show volatility rule configuration options
     */
    async showVolatilityRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Volatility Trading Configuration*

Configure volatility-based trading parameters:

- 📊 Min Volatility - Minimum volatility percentage
- ⏰ Lookback Period - Time period to analyze volatility
- 💧 Min Liquidity - Minimum liquidity requirement
- 📉 Max Slippage - Maximum acceptable slippage`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Min Volatility %', callback_data: 'volatility_min_vol' },
                    { text: '⏰ Lookback Period', callback_data: 'volatility_lookback' }
                ],
                [
                    { text: '💧 Min Liquidity', callback_data: 'volatility_liquidity' },
                    { text: '📉 Max Slippage', callback_data: 'volatility_slippage' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show price change rule configuration options
     */
    async showPriceChangeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📈 Price Change Configuration*

Configure price change monitoring parameters:

- 📊 Change Direction - Increase or decrease
- 📈 Threshold - Minimum change percentage
- ⏰ Timeframe - Time period for change detection`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Price Increase', callback_data: 'price_change_increase' },
                    { text: '📉 Price Decrease', callback_data: 'price_change_decrease' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Show volume change rule configuration options
     */
    async showVolumeChangeRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*📊 Volume Change Configuration*

Configure volume change monitoring parameters:

- 📊 Change Direction - Increase or decrease
- 📈 Threshold - Minimum change percentage
- ⏰ Timeframe - Time period for change detection`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📈 Volume Increase', callback_data: 'volume_change_increase' },
                    { text: '📉 Volume Decrease', callback_data: 'volume_change_decrease' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Handle copy trade selection callbacks
     */
    async handleCopyTradeSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const copyTradeMap = {
            'copy_trade_top_traders': { walletType: 'top_traders', enabled: true },
            'copy_trade_whales': { walletType: 'whales', enabled: true },
            'copy_trade_smart_money': { walletType: 'smart_money', enabled: true },
            'copy_trade_bots': { walletType: 'bots', enabled: true }
        };

        const copyTrade = copyTradeMap[action];
        if (copyTrade) {
            userState.data.copyTrade = copyTrade;
        } else if (action === 'copy_trade_custom') {
            userState.step = 'copy_trade_custom_input';
            await this.sendMessage(chatId, 'Please enter the wallet address to copy:');
            return;
        }

        await this.showUnifiedRuleOptions(ctx);
    }

    /**
     * Handle volume spike selection callbacks
     */
    async handleVolumeSpikeSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.volumeSpike) {
            userState.data.volumeSpike = {};
        }

        if (action === 'volume_spike_threshold') {
            userState.step = 'volume_spike_threshold_input';
            await this.sendMessage(chatId, 'Enter the minimum volume spike percentage (e.g., 100 for 100%):');
        } else if (action === 'volume_spike_timewindow') {
            userState.step = 'volume_spike_timewindow_input';
            await this.sendMessage(chatId, 'Enter the time window in hours (e.g., 1, 4, 24):');
        } else if (action === 'volume_spike_liquidity') {
            userState.step = 'volume_spike_liquidity_input';
            await this.sendMessage(chatId, 'Enter the minimum liquidity in USD (e.g., 10000):');
        } else if (action === 'volume_spike_slippage') {
            userState.step = 'volume_spike_slippage_input';
            await this.sendMessage(chatId, 'Enter the maximum slippage percentage (e.g., 5 for 5%):');
        } else {
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    /**
     * Handle dip buy selection callbacks
     */
    async handleDipBuySelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.dipBuy) {
            userState.data.dipBuy = {};
        }

        if (action === 'dip_buy_min_drop') {
            userState.step = 'dip_buy_min_drop_input';
            await this.sendMessage(chatId, 'Enter the minimum price drop percentage (e.g., 20 for 20%):');
        } else if (action === 'dip_buy_timewindow') {
            userState.step = 'dip_buy_timewindow_input';
            await this.sendMessage(chatId, 'Enter the time window in hours (e.g., 1, 4, 24):');
        } else if (action === 'dip_buy_liquidity') {
            userState.step = 'dip_buy_liquidity_input';
            await this.sendMessage(chatId, 'Enter the minimum liquidity in USD (e.g., 10000):');
        } else if (action === 'dip_buy_slippage') {
            userState.step = 'dip_buy_slippage_input';
            await this.sendMessage(chatId, 'Enter the maximum slippage percentage (e.g., 5 for 5%):');
        } else {
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    /**
     * Handle narrative selection callbacks
     */
    async handleNarrativeSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.narrative) {
            userState.data.narrative = { categories: [] };
        }

        if (action === 'narrative_categories') {
            await this.showNarrativeCategorySelection(ctx);
        } else if (action === 'narrative_min_score') {
            userState.step = 'narrative_min_score_input';
            await this.sendMessage(chatId, 'Enter the minimum narrative score (1-100):');
        } else if (action === 'narrative_min_volume') {
            userState.step = 'narrative_min_volume_input';
            await this.sendMessage(chatId, 'Enter the minimum daily volume in USD (e.g., 100000):');
        } else if (action === 'narrative_slippage') {
            userState.step = 'narrative_slippage_input';
            await this.sendMessage(chatId, 'Enter the maximum slippage percentage (e.g., 5 for 5%):');
        } else {
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    /**
     * Handle momentum selection callbacks
     */
    async handleMomentumSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.momentum) {
            userState.data.momentum = {};
        }

        if (action === 'momentum_lookback') {
            userState.step = 'momentum_lookback_input';
            await this.sendMessage(chatId, 'Enter the lookback period in hours (e.g., 24, 168):');
        } else if (action === 'momentum_min_change') {
            userState.step = 'momentum_min_change_input';
            await this.sendMessage(chatId, 'Enter the minimum price change percentage (e.g., 10 for 10%):');
        } else if (action === 'momentum_min_volume') {
            userState.step = 'momentum_min_volume_input';
            await this.sendMessage(chatId, 'Enter the minimum volume in USD (e.g., 50000):');
        } else if (action === 'momentum_slippage') {
            userState.step = 'momentum_slippage_input';
            await this.sendMessage(chatId, 'Enter the maximum slippage percentage (e.g., 5 for 5%):');
        } else {
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    /**
     * Handle volatility selection callbacks
     */
    async handleVolatilitySelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.volatility) {
            userState.data.volatility = {};
        }

        if (action === 'volatility_min_vol') {
            userState.step = 'volatility_min_vol_input';
            await this.sendMessage(chatId, 'Enter the minimum volatility percentage (e.g., 20 for 20%):');
        } else if (action === 'volatility_lookback') {
            userState.step = 'volatility_lookback_input';
            await this.sendMessage(chatId, 'Enter the lookback period in hours (e.g., 24, 168):');
        } else if (action === 'volatility_liquidity') {
            userState.step = 'volatility_liquidity_input';
            await this.sendMessage(chatId, 'Enter the minimum liquidity in USD (e.g., 10000):');
        } else if (action === 'volatility_slippage') {
            userState.step = 'volatility_slippage_input';
            await this.sendMessage(chatId, 'Enter the maximum slippage percentage (e.g., 5 for 5%):');
        } else {
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    /**
     * Show narrative category selection
     */
    async showNarrativeCategorySelection(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        const message = `
*🏷️ Narrative Categories*

Select categories to follow for narrative trading:

Current: ${userState.data.narrative?.categories?.join(', ') || 'None selected'}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'DeFi', callback_data: 'narrative_cat_defi' },
                    { text: 'NFT', callback_data: 'narrative_cat_nft' }
                ],
                [
                    { text: 'Gaming', callback_data: 'narrative_cat_gaming' },
                    { text: 'AI', callback_data: 'narrative_cat_ai' }
                ],
                [
                    { text: 'Metaverse', callback_data: 'narrative_cat_metaverse' },
                    { text: 'RWA', callback_data: 'narrative_cat_rwa' }
                ],
                [
                    { text: '✅ Done', callback_data: 'narrative_categories_done' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'narrative_select' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Handle narrative category toggle
     */
    async handleNarrativeCategoryToggle(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (!userState.data.narrative) {
            userState.data.narrative = { categories: [] };
        }

        const category = action.replace('narrative_cat_', '');
        const categories = userState.data.narrative.categories || [];
        
        if (categories.includes(category)) {
            // Remove category
            userState.data.narrative.categories = categories.filter(c => c !== category);
        } else {
            // Add category
            userState.data.narrative.categories = [...categories, category];
        }

        // Show updated category selection
        await this.showNarrativeCategorySelection(ctx);
    }

    // Management rule handlers
    async showTakeProfitRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const message = `
*💰 Take Profit Configuration*

Configure your take profit parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '10%', callback_data: 'take_profit_10' },
                    { text: '20%', callback_data: 'take_profit_20' }
                ],
                [
                    { text: '30%', callback_data: 'take_profit_30' },
                    { text: '50%', callback_data: 'take_profit_50' }
                ],
                [
                    { text: '📝 Custom %', callback_data: 'take_profit_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showTrailingStopRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const message = `
*📉 Trailing Stop Configuration*

Configure your trailing stop parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '5%', callback_data: 'trailing_stop_5' },
                    { text: '10%', callback_data: 'trailing_stop_10' }
                ],
                [
                    { text: '15%', callback_data: 'trailing_stop_15' },
                    { text: '20%', callback_data: 'trailing_stop_20' }
                ],
                [
                    { text: '📝 Custom %', callback_data: 'trailing_stop_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showStopLossRuleOptions(ctx) {
        const chatId = ctx.chat.id;
        const message = `
*🛑 Stop Loss Configuration*

Configure your stop loss parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '5%', callback_data: 'stop_loss_5' },
                    { text: '10%', callback_data: 'stop_loss_10' }
                ],
                [
                    { text: '15%', callback_data: 'stop_loss_15' },
                    { text: '20%', callback_data: 'stop_loss_20' }
                ],
                [
                    { text: '📝 Custom %', callback_data: 'stop_loss_custom' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_unified_options' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleTakeProfitSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'take_profit_custom') {
            // Set user state to await custom take profit input
            userState.waitingFor = 'custom_take_profit';
            this.userStates.set(userId, userState);

            const message = `
*📝 Custom Take Profit Percentage*

Please enter your desired take profit percentage (1-1000):

Examples:
• 25 = 25% take profit
• 50 = 50% take profit
• 100 = 100% take profit (2x)
• 200 = 200% take profit (3x)

💡 *Tip:* Higher percentages offer more profit potential but may take longer to reach.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'take_profit_select' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            return;
        }

        const percentage = parseInt(action.replace('take_profit_', ''));
        if (percentage) {
            userState.data.takeProfit = {
                percentage: percentage,
                enabled: true
            };

            await this.sendMessage(chatId, `✅ Take profit set to ${percentage}%`);
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    async handleTrailingStopSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'trailing_stop_custom') {
            // Set user state to await custom trailing stop input
            userState.waitingFor = 'custom_trailing_stop';
            this.userStates.set(userId, userState);

            const message = `
*📝 Custom Trailing Stop Percentage*

Please enter your desired trailing stop percentage (1-50):

Examples:
• 5 = 5% trailing stop
• 8 = 8% trailing stop
• 12 = 12% trailing stop

💡 *Tip:* Trailing stops adjust as the price moves in your favor, locking in profits while protecting against reversals.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'trailing_stop_select' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            return;
        }

        const percentage = parseInt(action.replace('trailing_stop_', ''));
        if (percentage) {
            userState.data.trailingStop = {
                percentage: percentage,
                enabled: true
            };

            await this.sendMessage(chatId, `✅ Trailing stop set to ${percentage}%`);
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    async handleStopLossSelection(ctx, action) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        if (action === 'stop_loss_custom') {
            // Set user state to await custom stop loss input
            userState.waitingFor = 'custom_stop_loss';
            this.userStates.set(userId, userState);

            const message = `
*📝 Custom Stop Loss Percentage*

Please enter your desired stop loss percentage (1-100):

Examples:
• 5 = 5% stop loss
• 12.5 = 12.5% stop loss
• 25 = 25% stop loss

💡 *Tip:* Lower percentages provide better protection but may trigger more frequently.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'stop_loss_select' }
                    ]
                ]
            };

            await this.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            return;
        }

        const percentage = parseInt(action.replace('stop_loss_', ''));
        if (percentage) {
            userState.data.stopLoss = {
                percentage: percentage,
                enabled: true
            };

            await this.sendMessage(chatId, `✅ Stop loss set to ${percentage}%`);
            await this.showUnifiedRuleOptions(ctx);
        }
    }

    // Strategy Validation Handler
    async handleStrategyValidationError(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        
        const message = `
*⚠️ Strategy Validation Error*

**Required Management Rules Missing**

Autonomous strategies require both Take Profit and Stop Loss settings to ensure safe trading.

**Why these are required:**
💰 **Take Profit** - Locks in gains when target is reached
🛑 **Stop Loss** - Limits losses when trade goes against you

Please configure both management rules before creating your strategy.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💰 Configure Take Profit', callback_data: 'take_profit_select' },
                    { text: '🛑 Configure Stop Loss', callback_data: 'stop_loss_select' }
                ],
                [
                    { text: '◀️ Back to Strategy', callback_data: 'autonomous_create_strategy' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Trading Mode Selection Handlers
    async handleTradingModeSelection(ctx, mode) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        userState.data.tradingMode = mode;

        if (mode === 'autonomous') {
            await this.handleAutonomousStrategyCreation(ctx);
        } else if (mode === 'manual') {
            await this.handleManualTokenManagement(ctx);
        }
    }

    async handleAutonomousStrategyCreation(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        userState.step = 'autonomous_strategy_creation';

        const message = `
*🤖 Autonomous Trading Strategy*

Create a complete strategy with Discovery and Management rules.

Each strategy includes:
*🟦 Discovery Rules* - Find tokens to buy
*🟩 Management Rules* - Handle exits \(TP/SL)\

Please enter a name for your strategy:
- Use only letters, numbers, underscores, and hyphens
- Maximum 50 characters
- Example: High\\_Volume\\_Scalp\\_Strategy`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '◀️ Back to Trading Mode', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleManualTokenManagement(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        userState.step = 'manual_management_creation';
        userState.data.ruleCategory = 'manual_management';
        userState.data.type = 'manual_management';

        const message = `
*✋ Manual Trading Token Management*

Set universal rules that apply to ALL manual trades:
- Take Profit settings
- Stop Loss settings  
- Trailing Stop settings

These rules will NOT affect Autonomous Mode strategies.

Please enter a name for your manual management rules:
- Use only letters, numbers, underscores, and hyphens
- Maximum 50 characters
- Example: Manual_Trading_TP_SL_Rules`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '◀️ Back to Trading Mode', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showAutonomousStrategyOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Get current selections
        const selections = this.getCurrentSelections(userState.data);
        
        // Check if required management rules are configured
        const hasRequiredManagement = userState.data.takeProfit && userState.data.stopLoss;
        const managementStatus = hasRequiredManagement ? 
            '✅ **Management Rules Complete**' : 
            '⚠️ **Management Rules Required** (Take Profit & Stop Loss)';
        
        const message = `
*🤖 Configure Autonomous Strategy*

${selections}

*🟦 Discovery Rules (Token Selection):*
Choose criteria to find tokens to buy:
- Market Cap, Price Range, Liquidity, Volume
- Category, TimeFrame, Copy Trade, Narrative  
- Volume Spike, Dip Buy, Price/Volume Change

*🟩 Management Rules (Exit Strategy):*
${managementStatus}
**Required:** Take Profit & Stop Loss
**Optional:** Trailing Stop, Momentum, Volatility

*⚡ Buy Amount:*
Configure trade size per transaction

Choose an option to configure:`;

        const keyboard = {
            inline_keyboard: [
                // Discovery Rules Section
                [
                    { text: '💰 Market Cap', callback_data: 'mcap_select' },
                    { text: '💲 Price Range', callback_data: 'price_select' }
                ],
                [
                    { text: '💧 Liquidity', callback_data: 'liquidity_select' },
                    { text: '📊 Volume', callback_data: 'volume_select' }
                ],
                [
                    { text: '🏷️ Category', callback_data: 'category_select' },
                    { text: '⏰ Timeframe', callback_data: 'timeframe_select' }
                ],
                [
                    { text: '💵 Buy Amount/Trade', callback_data: 'buy_amount_select' }
                ],
                // Management Rules Section (Highlighted as required)
                [
                    { text: hasRequiredManagement ? '✅ Take Profit' : '⚠️ Take Profit (Required)', callback_data: 'take_profit_select' },
                    { text: hasRequiredManagement ? '✅ Stop Loss' : '⚠️ Stop Loss (Required)', callback_data: 'stop_loss_select' }
                ],
                [
                    { text: '📉 Trailing Stop', callback_data: 'trailing_stop_select' },
                    { text: '📊 Momentum', callback_data: 'momentum_select' }
                ],
                // Action buttons
                [
                    { text: hasRequiredManagement ? '✅ Create Strategy' : '❌ Create Strategy (Missing Required Rules)', callback_data: hasRequiredManagement ? 'confirm_rule' : 'strategy_validation_error' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async showManualManagementOptions(ctx) {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id.toString();
        const userState = this.userStates.get(userId);

        if (!userState) {
            await this.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }

        // Get current selections
        const selections = this.getCurrentSelections(userState.data);
        
        const message = `
*✋ Manual Trading Token Management*

${selections}

*🟩 Universal Management Rules:*
These settings apply to ALL manual trades only:

Configure your universal trading rules:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🟩 MANUAL MANAGEMENT RULES', callback_data: 'manual_management_section' }
                ],
                [
                    { text: '💰 Take Profit %', callback_data: 'take_profit_select' },
                    { text: '🛑 Stop Loss %', callback_data: 'stop_loss_select' }
                ],
                [
                    { text: '📉 Trailing Stop %', callback_data: 'trailing_stop_select' }
                ],
                [
                    { text: '✅ Save Manual Rules', callback_data: 'confirm_rule' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' },
                    { text: '🔄 Reset', callback_data: 'rule_reset' }
                ]
            ]
        };

        await this.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    /**
     * Get rule classification for display purposes
     * Maps rule types to emojis, text, and descriptions
     */
    getRuleClassification(rule) {
        const type = rule.type || 'strategy';
        
        switch (type) {
            case 'autonomous_strategy':
                return {
                    emoji: '🤖',
                    text: 'Autonomous Strategy',
                    description: 'Discovery + Management'
                };
            case 'manual_management':
                return {
                    emoji: '✋',
                    text: 'Manual Management',
                    description: 'Universal TP/SL Rules'
                };
            case 'filter':
                return {
                    emoji: '🔍',
                    text: 'Filter Rule',
                    description: 'Token Selection Criteria'
                };
            case 'strategy':
                return {
                    emoji: '📊',
                    text: 'Strategy Rule',
                    description: 'Price/Volume Monitoring'
                };
            default:
                return {
                    emoji: '🔧',
                    text: 'Trading Rule',
                    description: 'Custom Rule'
                };
        }
    }
}

module.exports = RulesCommand;

