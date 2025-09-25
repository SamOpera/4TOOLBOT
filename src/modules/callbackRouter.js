// Callback Router - Centralized callback handling for Telegram Bot
class CallbackRouter {
    constructor(bot, handlers) {
        this.bot = bot;
        this.handlers = handlers;
        this.lastMessageIds = new Map();
    }

    async handleCallbackQuery(ctx) {
        try {
            // Validate the context object
            if (!ctx || !ctx.chat || !ctx.chat.id || !ctx.from || !ctx.from.id || !ctx.callbackQuery || !ctx.callbackQuery.data) {
                console.error('Invalid callback query context:', {
                    hasCtx: !!ctx,
                    hasChat: !!(ctx && ctx.chat),
                    hasChatId: !!(ctx && ctx.chat && ctx.chat.id),
                    hasFrom: !!(ctx && ctx.from),
                    hasFromId: !!(ctx && ctx.from && ctx.from.id),
                    hasCallbackQuery: !!(ctx && ctx.callbackQuery),
                    hasData: !!(ctx && ctx.callbackQuery && ctx.callbackQuery.data),
                    ctx: ctx
                });
                return;
            }
            
            const chatId = ctx.chat.id;
            const telegramId = ctx.from.id.toString();
            const callbackData = ctx.callbackQuery.data;

            // Log the callback data for debugging
            console.log('Processing callback query:', {
                chatId,
                telegramId,
                callbackData,
                timestamp: new Date().toISOString()
            });

            // Handle rule configuration callbacks
            if (callbackData.startsWith('rule_config_')) {
                const configType = callbackData.replace('rule_config_', '');
                switch (configType) {
                    case 'market_cap':
                        await this.handlers.ruleHandlers.handleRuleConfigMarketCap(chatId, telegramId);
                        return;
                    case 'price_range':
                        await this.handlers.ruleHandlers.handleRuleConfigPriceRange(chatId, telegramId);
                        return;
                    case 'liquidity':
                        await this.handlers.ruleHandlers.handleRuleConfigLiquidity(chatId, telegramId);
                        return;
                    case 'volume':
                        await this.handlers.ruleHandlers.handleRuleConfigVolume(chatId, telegramId);
                        return;
                    case 'category':
                        await this.handlers.ruleHandlers.handleRuleConfigCategory(chatId, telegramId);
                        return;
                    case 'timeframe':
                        await this.handlers.ruleHandlers.handleRuleConfigTimeframe(chatId, telegramId);
                        return;
                    case 'volume_spike':
                        await this.handlers.ruleHandlers.handleRuleConfigVolumeSpike(chatId, telegramId);
                        return;
                    case 'dip_buy':
                        await this.handlers.ruleHandlers.handleRuleConfigDipBuy(chatId, telegramId);
                        return;
                    case 'narrative':
                        await this.handlers.ruleHandlers.handleRuleConfigNarrative(chatId, telegramId);
                        return;
                    case 'momentum':
                        await this.handlers.ruleHandlers.handleRuleConfigMomentum(chatId, telegramId);
                        return;
                    case 'volatility':
                        await this.handlers.ruleHandlers.handleRuleConfigVolatility(chatId, telegramId);
                        return;
                    case 'copy_trade':
                        await this.handlers.ruleHandlers.handleRuleConfigCopyTrade(chatId, telegramId);
                        return;
                }
            }

            // Handle rule value selection callbacks
            if (callbackData.startsWith('rule_') && 
                (callbackData.startsWith('rule_mcap_') || 
                 callbackData.startsWith('rule_price_') || 
                 callbackData.startsWith('rule_liquidity_') || 
                 callbackData.startsWith('rule_volume_') || 
                 callbackData.startsWith('rule_category_') || 
                 callbackData.startsWith('rule_timeframe_') || 
                 callbackData.startsWith('rule_volume_spike_') || 
                 callbackData.startsWith('rule_dip_buy_') || 
                 callbackData.startsWith('rule_narrative_') || 
                 callbackData.startsWith('rule_momentum_') || 
                 callbackData.startsWith('rule_volatility_') || 
                 callbackData.startsWith('rule_copy_trade_'))) {
                await this.handlers.ruleHandlers.handleRuleValueSelection(chatId, telegramId, callbackData);
                return;
            }

            // Handle rule save strategy callback
            if (callbackData === 'rule_save_strategy') {
                await this.handlers.ruleHandlers.handleRuleSaveStrategy(chatId, telegramId);
                return;
            }

            // Handle rules-related callbacks (check these BEFORE strategy callbacks to avoid conflicts)
            // Exclude rule edit callbacks as they are handled separately below
            if (
                callbackData === 'rules' ||
                callbackData.startsWith('rules_') ||
                (callbackData.startsWith('rule_') && 
                 !callbackData.includes('_edit_') && 
                 !callbackData.includes('_toggle_') && 
                 !callbackData.includes('_stats_') && 
                 !callbackData.includes('_delete_') &&
                 !callbackData.includes('_add_condition_') &&
                 !callbackData.includes('_remove_condition_')) ||
                (callbackData.startsWith('settings_') && !callbackData.includes('rule_')) ||
                callbackData.startsWith('rule_type_') ||
                callbackData.startsWith('category_') ||
                callbackData.startsWith('mcap_') ||
                callbackData.startsWith('price_') ||
                callbackData.startsWith('volume_') ||
                callbackData.startsWith('timeframe_') ||
                callbackData.startsWith('direction_') ||
                callbackData.startsWith('liquidity_') ||
                (callbackData.startsWith('add_condition_') && !callbackData.includes('rule_')) ||
                callbackData.startsWith('set_condition_') ||
                callbackData === 'confirm_rule' ||
                callbackData === 'confirm_rule_final' ||
                callbackData === 'strategy_validation_error' ||
                callbackData === 'mcap_select' ||
                callbackData === 'price_select' ||
                callbackData === 'liquidity_select' ||
                callbackData === 'volume_select' ||
                callbackData === 'category_select' ||
                callbackData === 'timeframe_select' ||
                callbackData === 'volume_spike_select' ||
                callbackData === 'dip_buy_select' ||
                callbackData === 'narrative_select' ||
                callbackData === 'momentum_select' ||
                callbackData === 'volatility_select' ||
                callbackData === 'copy_trade_select' ||
                callbackData === 'price_change_select' ||
                callbackData === 'volume_change_select' ||
                callbackData === 'take_profit_select' ||
                callbackData === 'trailing_stop_select' ||
                callbackData === 'stop_loss_select' ||
                callbackData === 'buy_amount_select' ||
                callbackData.startsWith('rule_buy_amount_') ||
                callbackData.startsWith('copy_trade_') ||
                callbackData.startsWith('volume_spike_') ||
                callbackData.startsWith('dip_buy_') ||
                callbackData.startsWith('narrative_') ||
                callbackData.startsWith('momentum_') ||
                callbackData.startsWith('volatility_') ||
                callbackData.startsWith('take_profit_') ||
                callbackData.startsWith('trailing_stop_') ||
                callbackData.startsWith('stop_loss_') ||
                callbackData === 'price_change_increase' ||
                callbackData === 'price_change_decrease' ||
                callbackData === 'volume_change_increase' ||
                callbackData === 'volume_change_decrease' ||
                callbackData === 'trading_mode_autonomous' ||
                callbackData === 'trading_mode_manual' ||
                callbackData === 'autonomous_create_strategy' ||
                callbackData === 'manual_token_management') {
                await this.handlers.rulesCommand.handleCallbackQuery(ctx);
                return;
            }

            // Handle strategies button - show Trading Rules interface
            if (callbackData === 'strategies') {
                await this.handlers.bot.handleStrategies(chatId, telegramId);
                return;
            }

            // Handle all strategy-related callbacks (after rules to avoid conflicts)
            if (callbackData.startsWith('strategy_') || 
                callbackData === 'copy_trade_activate' ||
                callbackData === 'copy_trade_deactivate' ||
                callbackData.startsWith('volume_spike_') ||
                callbackData.startsWith('dip_buy_') ||
                callbackData.startsWith('narrative_') ||
                callbackData.startsWith('momentum_') ||
                callbackData.startsWith('volatility_')) {
                // Delegate all strategy-related callbacks to StrategyHandlers
                await this.handlers.strategyHandlers.handleStrategyCallback(chatId, telegramId, callbackData);
                return;
            }

            // Handle external wallet callbacks
            if (callbackData === 'add_external_wallet') {
                await this.handleAddExternalWallet(chatId, telegramId);
                return;
            }

            if (callbackData.startsWith('copy_trade_toggle_')) {
                const walletId = callbackData.split('_')[3];
                await this.toggleCopyTradeWallet(chatId, telegramId, walletId);
                return;
            }

            // Handle copy trade strategy actions
            if (callbackData === 'copy_trade_active') {
                await this.showActiveCopyTrades(chatId, telegramId);
                return;
            }
            if (callbackData === 'copy_trade_settings') {
                await this.showCopyTradeSettings(chatId, telegramId);
                return;
            }

            // Handle copy trade actions
            if (callbackData.startsWith('copy_trade_')) {
                if (callbackData === 'copy_trade_select') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeSelect(chatId, telegramId);
                    return;
                }
                // Handle copy trade type selections
                if (callbackData === 'copy_trade_top_traders') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeTypeSelection(chatId, telegramId, 'top_traders');
                    return;
                }
                if (callbackData === 'copy_trade_whales') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeTypeSelection(chatId, telegramId, 'whales');
                    return;
                }
                if (callbackData === 'copy_trade_smart_money') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeTypeSelection(chatId, telegramId, 'smart_money');
                    return;
                }
                if (callbackData === 'copy_trade_bots') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeTypeSelection(chatId, telegramId, 'bots');
                    return;
                }
                if (callbackData === 'copy_trade_custom_wallet') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeCustomWallet(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_advanced') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeAdvancedSettings(chatId, telegramId);
                    return;
                }
                // Handle copy trade advanced setting callbacks
                if (callbackData === 'copy_trade_save_config') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeSaveConfig(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_trade_size') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeTradeSize(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_slippage') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeSlippage(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_delay') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeDelay(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_positions') {
                    await this.handlers.copyTradeHandlers.handleCopyTradePositions(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_risk') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeRisk(chatId, telegramId);
                    return;
                }
                if (callbackData === 'copy_trade_criteria') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeCriteria(chatId, telegramId);
                    return;
                }
                if (callbackData.startsWith('copy_trade_wallet_')) {
                    const walletId = callbackData.replace('copy_trade_wallet_', '');
                    await this.handlers.copyTradeHandlers.handleCopyTradeWalletSelection(chatId, telegramId, walletId);
                    return;
                }
                if (callbackData === 'copy_trade_confirm') {
                    await this.handlers.copyTradeHandlers.handleCopyTradeConfirmation(chatId, telegramId);
                    return;
                }
                if (callbackData.startsWith('copy_trade_execute_')) {
                    const [_, outputMint, amount] = callbackData.split('_');
                    await this.handlers.copyTradeHandlers.handleCopyTradeExecution(chatId, telegramId, outputMint, amount);
                    return;
                }
            }

            // Handle main menu actions
            if (callbackData === 'main_menu') {
                await this.handlers.bot.showMainMenu(chatId);
                return;
            }

            // Handle view portfolio action
            if (callbackData === 'view_portfolio') {
                await this.handlers.portfolioHandlers.handleViewPortfolio(chatId, telegramId);
                return;
            }

            // Handle enhanced view portfolio action
            if (callbackData === 'enhanced_view_portfolio') {
                await this.handlers.portfolioHandlers.handleEnhancedViewPortfolio(chatId, telegramId);
                return;
            }

            // Handle detailed portfolio analysis action
            if (callbackData === 'portfolio_detailed_analysis') {
                await this.handlers.portfolioHandlers.handleDetailedAnalysis(chatId, telegramId);
                return;
            }

            // Handle refresh portfolio action
            if (callbackData === 'refresh_portfolio') {
                await this.handlers.portfolioHandlers.handleRefreshPortfolio(chatId, telegramId);
                return;
            }

            // Handle trade history action
            if (callbackData === 'trade_history') {
                await this.handlers.portfolioHandlers.handleTradeHistory(chatId, telegramId);
                return;
            }

            // Handle export portfolio action
            if (callbackData === 'export_portfolio') {
                await this.handlers.portfolioHandlers.handleExportPortfolio(chatId, telegramId);
                return;
            }

            // Handle export analysis action
            if (callbackData === 'export_analysis') {
                await this.handlers.portfolioHandlers.handleExportAnalysis(chatId, telegramId);
                return;
            }

            // Handle portfolio analytics action
            if (callbackData === 'portfolio_analytics') {
                await this.handlers.portfolioHandlers.handlePortfolioAnalytics(chatId, telegramId);
                return;
            }

            // Handle export format actions
            if (callbackData === 'export_csv') {
                await this.handlers.exportHandlers.handleExportCSV(chatId, telegramId);
                return;
            }

            if (callbackData === 'export_json') {
                await this.handlers.exportHandlers.handleExportJSON(chatId, telegramId);
                return;
            }

            if (callbackData === 'export_pdf') {
                await this.handlers.exportHandlers.handleExportPDF(chatId, telegramId);
                return;
            }

            if (callbackData === 'export_email') {
                await this.handlers.exportHandlers.handleExportEmail(chatId, telegramId);
                return;
            }

            // Handle wallet management separately (should show wallet management menu)
            if (callbackData === 'wallet_management') {
                await this.handlers.bot.showWalletManagement(chatId, telegramId);
                return;
            }

            // Handle security-related wallet actions
            if (callbackData === 'wallet_security' ||
                callbackData === 'wallet_passphrase' ||
                callbackData.startsWith('security_wallet_') ||
                callbackData.startsWith('passphrase_wallet_') ||
                callbackData.startsWith('unlock_wallet_') ||
                callbackData.startsWith('lock_wallet_')) {
                await this.handlers.securityHandlers.handleSecurityActions(ctx);
                return;
            }

            // Handle other wallet actions
            if (callbackData === 'create_wallet' ||
                callbackData === 'import_wallet' ||
                callbackData === 'export_keys' ||
                callbackData === 'switch_wallet' ||
                callbackData === 'delete_export_message' ||
                callbackData === 'keys_saved' ||
                callbackData.startsWith('export_wallet_') ||
                callbackData.startsWith('confirm_export_') ||
                callbackData.startsWith('wallet_') ||
                callbackData.startsWith('switch_to_')) {
                await this.handlers.walletHandlers.handleWalletActions(ctx);
                return;
            }

            // Handle trade actions (exclude rules-specific buy_amount callbacks)
            if (callbackData === 'trade' ||
                callbackData === 'buy_token' ||
                callbackData === 'retry_last_buy' ||
                callbackData === 'sell_token' ||
                callbackData === 'check_token' ||
                callbackData === 'token_report' ||
                callbackData === 'refresh_holdings' ||
                callbackData.startsWith('trade_') ||
                callbackData.startsWith('buy_token_') ||
                (callbackData.startsWith('buy_amount_') && 
                 callbackData !== 'buy_amount_select' && 
                 !callbackData.startsWith('rule_buy_amount_')) ||
                callbackData.startsWith('confirm_buy_execute_') ||
                callbackData.startsWith('confirm_buy_') ||
                callbackData.startsWith('sell_token_') ||
                callbackData.startsWith('sell_percent_') || // e.g., sell_percent_25_<tokenAddress>
                callbackData.startsWith('sell_custom_') ||  // e.g., sell_custom_<tokenAddress>
                callbackData.startsWith('custom_buy_') || // Use only 'custom_buy_' for custom buy amount
                callbackData.startsWith('confirm_sell_execute_') ||
                callbackData.startsWith('confirm_sell_') ||
                callbackData.startsWith('token_details_') ||
                callbackData.startsWith('token_info_') || // Token info callbacks
                callbackData.startsWith('rug_check_') || // Rug check callbacks
                callbackData.startsWith('price_chart_') || // Price chart callbacks
                callbackData === 'cancel_buy' ||
                callbackData === 'cancel_sell') {
                // sell_percent_ and sell_custom_ are routed to tradingHandlers.handleTradeActions
                await this.handlers.tradingHandlers.handleTradeActions(ctx);
                return;
            }

            // Handle settings actions
            if (callbackData === 'settings') {
                await this.handlers.settingsHandlers.handleSettings(chatId, telegramId);
                return;
            }

            // Handle autonomous mode toggle
            if (callbackData === 'toggle_autonomous') {
                const messageId = ctx.callbackQuery.message.message_id;
                await this.handlers.settingsHandlers.handleAutonomousToggle(chatId, telegramId, messageId);
                return;
            }

            // Handle trade settings
            if (callbackData === 'trade_settings') {
                await this.handlers.settingsHandlers.handleTradeSettings(chatId, telegramId);
                return;
            }

            // Handle notification settings
            if (callbackData === 'notification_settings') {
                await this.handlers.settingsHandlers.handleNotificationSettings(chatId, telegramId);
                return;
            }

            // Handle risk settings
            if (callbackData === 'risk_settings') {
                await this.handlers.settingsHandlers.handleRiskSettings(chatId, telegramId);
                return;
            }

            // Handle strategy settings
            if (callbackData === 'strategy_settings') {
                await this.handlers.settingsHandlers.handleStrategySettings(chatId, telegramId);
                return;
            }

            // Handle advanced settings
            if (callbackData === 'advanced_settings') {
                await this.handlers.settingsHandlers.handleAdvancedSettings(chatId, telegramId);
                return;
            }

            // Handle interface settings
            if (callbackData === 'interface_settings') {
                await this.handlers.settingsHandlers.handleInterfaceSettings(chatId, telegramId);
                return;
            }

            // Handle trading setting callbacks
            if (callbackData === 'set_default_slippage') {
                console.log('🚀 CallbackRouter: Handling set_default_slippage for user:', telegramId);
                await this.handlers.settingsHandlers.handleDefaultSlippage(chatId, telegramId);
                console.log('✅ CallbackRouter: set_default_slippage handled');
                return;
            }
            
            if (callbackData === 'set_max_trade_amount') {
                console.log('🚀 CallbackRouter: Handling set_max_trade_amount for user:', telegramId);
                await this.handlers.settingsHandlers.handleMaxTradeAmount(chatId, telegramId);
                console.log('✅ CallbackRouter: set_max_trade_amount handled');
                return;
            }
            
            if (callbackData === 'set_min_trade_amount') {
                console.log('🚀 CallbackRouter: Handling set_min_trade_amount for user:', telegramId);
                await this.handlers.settingsHandlers.handleMinTradeAmount(chatId, telegramId);
                console.log('✅ CallbackRouter: set_min_trade_amount handled');
                return;
            }
            
            if (callbackData === 'set_max_daily_trades') {
                console.log('🚀 CallbackRouter: Handling set_max_daily_trades for user:', telegramId);
                await this.handlers.settingsHandlers.handleMaxDailyTrades(chatId, telegramId);
                console.log('✅ CallbackRouter: set_max_daily_trades handled');
                return;
            }
            
            // Handle notification toggle callbacks
            if (callbackData === 'toggle_trade_notifications') {
                await this.handlers.settingsHandlers.handleTradeNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'toggle_pnl_notifications') {
                await this.handlers.settingsHandlers.handlePnlNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'toggle_rule_notifications') {
                await this.handlers.settingsHandlers.handleRuleNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'toggle_market_notifications') {
                await this.handlers.settingsHandlers.handleMarketNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'toggle_price_notifications') {
                await this.handlers.settingsHandlers.handlePriceNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'toggle_system_notifications') {
                await this.handlers.settingsHandlers.handleSystemNotificationsToggle(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'disable_all_notifications') {
                await this.handlers.settingsHandlers.handleDisableAllNotifications(chatId, telegramId);
                return;
            }
            
            if (callbackData === 'enable_all_notifications') {
                await this.handlers.settingsHandlers.handleEnableAllNotifications(chatId, telegramId);
                return;
            }
            
            if (callbackData.startsWith('set_') ||
                callbackData.startsWith('toggle_') ||
                callbackData.includes('trade_amount') ||
                callbackData.includes('daily_trades') ||
                callbackData.includes('auto_confirm')) {
                // Delegate remaining setting callbacks to the settings handlers
                if (callbackData.includes('auto_confirm')) {
                    await this.handlers.settingsHandlers.handleAutoConfirmToggle(chatId, telegramId);
                }
                return;
            }

            // Handle help callback
            if (callbackData === 'help') {
                await this.handlers.bot.handleHelp(chatId);
                return;
            }

            // Handle autonomous mode toggle
            if (callbackData === 'toggle_autonomous') {
                this.handlers.bot.ruleEngine.isAutonomousMode = !this.handlers.bot.ruleEngine.isAutonomousMode;
                // Reset the flag to allow showing the success message
                this.handlers.bot._autonomousModeJustToggled = false;
                await this.handlers.bot.showMainMenu(chatId);
                return;
            }

            // Handle toggle copy trade wallet
            if (callbackData === 'toggle_copy_trade_wallet') {
                await this.handlers.bot.showCopyTradeWalletToggleMenu(chatId, telegramId);
                return;
            }

            // Handle additional rule management callbacks that should be delegated to RuleHandlers
            if (callbackData === 'toggle_all_rules' ||
                callbackData === 'delete_rules_menu' ||
                callbackData === 'delete_all_rules' ||
                callbackData === 'confirm_delete_all_rules' ||
                callbackData === 'rules_stats' ||
                callbackData === 'rules_settings' ||
                callbackData === 'rule_reset' ||
                callbackData === 'rule_performance' ||
                callbackData.startsWith('delete_rule_') ||
                callbackData.startsWith('confirm_delete_rule_') ||
                callbackData.startsWith('rule_') ||
                callbackData.startsWith('edit_condition_') ||
                callbackData.startsWith('remove_condition_') ||
                callbackData.startsWith('update_condition_') ||
                callbackData.startsWith('add_condition_') ||
                callbackData.startsWith('set_condition_') ||
                callbackData.startsWith('settings_') && (
                    callbackData.includes('rule_') ||
                    callbackData.includes('notifications') ||
                    callbackData.includes('alerts') ||
                    callbackData.includes('frequency') ||
                    callbackData.includes('threshold')
                )) {
                // Delegate all rule-related callbacks to RuleHandlers
                if (callbackData === 'toggle_all_rules') {
                    await this.handlers.ruleHandlers.handleToggleAllRules(chatId, telegramId);
                } else if (callbackData === 'delete_rules_menu') {
                    await this.handlers.ruleHandlers.handleDeleteRulesMenu(chatId, telegramId);
                } else if (callbackData === 'delete_all_rules') {
                    await this.handlers.ruleHandlers.handleDeleteAllRules(chatId, telegramId);
                } else if (callbackData === 'confirm_delete_all_rules') {
                    await this.handlers.ruleHandlers.handleConfirmDeleteAllRules(chatId, telegramId);
                } else if (callbackData.startsWith('delete_rule_')) {
                    const ruleId = callbackData.replace('delete_rule_', '');
                    await this.handlers.ruleHandlers.handleDeleteRule(chatId, telegramId, ruleId);
                } else if (callbackData.startsWith('confirm_delete_rule_')) {
                    const ruleId = callbackData.replace('confirm_delete_rule_', '');
                    await this.handlers.ruleHandlers.handleConfirmDeleteRule(chatId, telegramId, ruleId);
                } else if (callbackData === 'rules_stats') {
                    await this.handlers.ruleHandlers.handleRulesStats(chatId, telegramId);
                } else if (callbackData === 'rules_settings') {
                    await this.handlers.ruleHandlers.handleRulesSettings(chatId, telegramId);
                } else if (callbackData.startsWith('rule_')) {
                    // Handle individual rule callbacks
                    if (callbackData.includes('_toggle_')) {
                        const ruleId = callbackData.replace('rule_toggle_', '');
                        await this.handlers.ruleHandlers.handleRuleToggle(chatId, telegramId, ruleId);
                    } else if (callbackData.includes('_stats_')) {
                        const ruleId = callbackData.replace('rule_stats_', '');
                        await this.handlers.ruleHandlers.handleRuleStats(chatId, telegramId, ruleId);
                    } else if (callbackData.includes('_edit_')) {
                        if (callbackData.includes('_name_')) {
                            const ruleId = callbackData.replace('rule_edit_name_', '');
                            await this.handlers.ruleHandlers.handleRuleEditName(chatId, telegramId, ruleId);
                        } else if (callbackData.includes('_conditions_')) {
                            const ruleId = callbackData.replace('rule_edit_conditions_', '');
                            await this.handlers.ruleHandlers.handleRuleEditConditions(chatId, telegramId, ruleId);
                        } else if (callbackData.includes('_condition_')) {
                            const ruleId = callbackData.replace('rule_edit_condition_', '');
                            await this.handlers.ruleHandlers.handleRuleEditCondition(chatId, telegramId, ruleId);
                        } else {
                            const ruleId = callbackData.replace('rule_edit_', '');
                            await this.handlers.ruleHandlers.handleRuleEdit(chatId, telegramId, ruleId);
                        }
                    } else if (callbackData.includes('_delete_')) {
                        if (callbackData.includes('_confirm_')) {
                            const ruleId = callbackData.replace('rule_delete_confirm_', '');
                            await this.handlers.ruleHandlers.handleConfirmDeleteRule(chatId, telegramId, ruleId);
                        } else {
                            const ruleId = callbackData.replace('rule_delete_', '');
                            await this.handlers.ruleHandlers.handleDeleteRule(chatId, telegramId, ruleId);
                        }
                    } else if (callbackData.includes('_add_condition_')) {
                        const ruleId = callbackData.replace('rule_add_condition_', '');
                        await this.handlers.ruleHandlers.handleRuleAddCondition(chatId, telegramId, ruleId);
                    } else if (callbackData.includes('_remove_condition_')) {
                        const ruleId = callbackData.replace('rule_remove_condition_', '');
                        await this.handlers.ruleHandlers.handleRuleRemoveCondition(chatId, telegramId, ruleId);
                    } else {
                        // Generic rule selection
                        const ruleId = callbackData.replace('rule_', '');
                        await this.handlers.ruleHandlers.handleRuleSelection(chatId, telegramId, ruleId);
                    }
                } else if (callbackData.startsWith('settings_') && (
                    callbackData.includes('rule_') || 
                    callbackData.includes('notifications') || 
                    callbackData.includes('alerts') ||
                    callbackData.includes('frequency') ||
                    callbackData.includes('threshold'))) {
                    // Handle rule-related settings callbacks
                    if (callbackData.startsWith('settings_rule_')) {
                        const ruleId = callbackData.replace('settings_rule_', '');
                        // For now, show rule details instead of settings
                        await this.handlers.ruleHandlers.handleRuleSelection(chatId, telegramId, ruleId);
                    } else if (callbackData === 'settings_global_notifications') {
                        await this.handlers.settingsHandlers.handleNotificationSettings(chatId, telegramId);
                    } else if (callbackData === 'settings_global_timeouts') {
                        // Route to trade settings for now
                        await this.handlers.settingsHandlers.handleTradeSettings(chatId, telegramId);
                    } else {
                        // For other rule settings, show a placeholder message
                        await this.sendMessage(chatId, '⚙️ Rule-specific settings are being developed. For now, use the main Settings menu.', {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '⚙️ Main Settings', callback_data: 'settings' }],
                                    [{ text: '🔙 Back', callback_data: 'rules' }]
                                ]
                            }
                        });
                    }
                } else if (callbackData.startsWith('add_condition_')) {
                    // Handle adding conditions with specific types
                    const parts = callbackData.split('_');
                    const conditionType = parts[2]; // e.g., 'market_cap', 'price', etc.
                    const ruleId = parts[parts.length - 1]; // last part is rule ID
                    await this.handlers.ruleHandlers.handleAddSpecificCondition(chatId, telegramId, ruleId, conditionType);
                } else if (callbackData.startsWith('remove_condition_')) {
                    // Handle removing specific conditions
                    const parts = callbackData.split('_');
                    const conditionId = parts[2];
                    const ruleId = parts[3];
                    await this.handlers.ruleHandlers.handleRemoveSpecificCondition(chatId, telegramId, ruleId, conditionId);
                } else if (callbackData.startsWith('edit_condition_')) {
                    // Handle editing specific conditions
                    const parts = callbackData.split('_');
                    const conditionId = parts[2];
                    const ruleId = parts[3];
                    await this.handlers.ruleHandlers.handleEditSpecificCondition(chatId, telegramId, ruleId, conditionId);
                } else if (callbackData.startsWith('update_condition_')) {
                    // Handle updating condition values
                    await this.handlers.ruleHandlers.handleUpdateCondition(chatId, telegramId, callbackData);
                } else if (callbackData.startsWith('custom_')) {
                    // Handle custom condition input requests
                    const parts = callbackData.split('_');
                    const conditionType = parts[1]; // e.g., 'take', 'stop', 'trailing'
                    let subType = parts[2]; // e.g., 'profit', 'loss', 'stop'
                    let conditionId, ruleId;
                    
                    if (parts.length === 5) {
                        // Format: custom_take_profit_conditionId_ruleId
                        conditionId = parts[3];
                        ruleId = parts[4];
                        conditionType = `${conditionType}_${subType}`; // 'take_profit', 'stop_loss', etc.
                    } else {
                        // Format: custom_trailing_stop_conditionId_ruleId
                        conditionId = parts[3];
                        ruleId = parts[4];
                        conditionType = `${conditionType}_${subType}`; // 'trailing_stop'
                    }
                    
                    await this.handlers.ruleHandlers.handleCustomConditionInput(chatId, telegramId, conditionType, conditionId, ruleId);
                } else if (callbackData.startsWith('set_condition_')) {
                    // Handle setting condition values
                    await this.handlers.ruleHandlers.handleSetConditionValue(chatId, telegramId, callbackData);
                } else {
                    // Fallback for any other rule-related callbacks
                    await this.handlers.ruleHandlers.handleRuleCallback(chatId, telegramId, callbackData);
                }
                return;
            }

            if (callbackData === 'toggle_all_strategies') {
                await this.handlers.strategyHandlers.handleToggleAllStrategies(chatId, telegramId);
                return;
            }

            // Handle individual strategy toggle callbacks
            if (callbackData.startsWith('toggle_strategy_')) {
                const strategyType = callbackData.replace('toggle_strategy_', '');
                await this.handlers.strategyHandlers.handleStrategyToggle(chatId, telegramId, strategyType);
                return;
            }

            // Handle configure strategy callbacks
            if (callbackData.startsWith('configure_strategy_')) {
                const strategyType = callbackData.replace('configure_strategy_', '');
                switch (strategyType) {
                    case 'volume_spike':
                        await this.handlers.strategyHandlers.handleVolumeSpikeStrategy(chatId, telegramId);
                        break;
                    case 'dip_buy':
                        await this.handlers.strategyHandlers.handleDipBuyStrategy(chatId, telegramId);
                        break;
                    case 'narrative':
                        await this.handlers.strategyHandlers.handleNarrativeStrategy(chatId, telegramId);
                        break;
                    case 'momentum':
                        await this.handlers.strategyHandlers.handleMomentumStrategy(chatId, telegramId);
                        break;
                    case 'volatility':
                        await this.handlers.strategyHandlers.handleVolatilityStrategy(chatId, telegramId);
                        break;
                    case 'copy_trade':
                        await this.handlers.strategyHandlers.handleCopyTradeStrategy(chatId, telegramId);
                        break;
                    default:
                        await this.sendAndStoreMessage(chatId, 'Unknown strategy type. Please try again.');
                }
                return;
            }

            // Handle deactivate all strategies callback
            if (callbackData === 'deactivate_all_strategies') {
                await this.handlers.strategyHandlers.handleDeactivateAllStrategies(chatId, telegramId);
                return;
            }

            if (callbackData === 'strategy_performance') {
                await this.handlers.strategyHandlers.handleStrategyPerformance(chatId, telegramId);
                return;
            }

            // Handle remaining copy trade setting callbacks
            if (callbackData.startsWith('copy_trade_max_amount_') ||
                callbackData.startsWith('copy_trade_min_amount_') ||
                callbackData.startsWith('copy_trade_max_daily_') ||
                callbackData.startsWith('copy_trade_delay_') ||
                callbackData.startsWith('copy_trade_slippage_') ||
                callbackData.startsWith('copy_trade_positions_') ||
                callbackData.startsWith('copy_trade_size_') ||
                callbackData.startsWith('copy_trade_success_') ||
                callbackData.startsWith('copy_trade_drawdown_') ||
                callbackData.startsWith('copy_trade_setting_')) {
                await this.handlers.copyTradeHandlers.handleCopyTradeSettingCallback(chatId, telegramId, callbackData);
                return;
            }

            // Handle strategy configuration callbacks
            if (callbackData.startsWith('dip_buy_')) {
                await this.handlers.strategyHandlers.handleStrategyCallback(chatId, telegramId, callbackData);
                return;
            }

            // Handle trading setting callbacks
            if (callbackData.startsWith('trading_setting_')) {
                await this.handlers.tradingHandlers.handleTradingSettings(chatId, telegramId, callbackData);
                return;
            }

            // Handle remaining utility callbacks
            if (callbackData === 'market_overview') {
                await this.handlers.bot.handleMarketOverview(chatId);
                return;
            }

            if (callbackData === 'generate_wallet') {
                await this.handlers.walletHandlers.handleCreateWallet(chatId, telegramId);
                return;
            }

            if (callbackData === 'confirm_claim') {
                await this.handlers.bot.handleClaimRewards(chatId, telegramId);
                return;
            }

            if (callbackData === 'refresh_market') {
                await this.handlers.bot.handleMarketOverview(chatId);
                return;
            }

            if (callbackData === 'portfolio_rebalance') {
                await this.handlers.portfolioHandlers.handlePortfolioRebalance(chatId, telegramId);
                return;
            }

            if (callbackData === 'risk_management') {
                await this.handlers.settingsHandlers.handleRiskSettings(chatId, telegramId);
                return;
            }

            if (callbackData === 'security_settings') {
                await this.handlers.securityHandlers.handleSecuritySettings(chatId, telegramId);
                return;
            }

            if (callbackData === 'trading_settings') {
                await this.handlers.settingsHandlers.handleTradeSettings(chatId, telegramId);
                return;
            }

            if (callbackData === 'show_active_copy_trades') {
                await this.handlers.copyTradeHandlers.handleShowActiveCopyTrades(chatId, telegramId);
                return;
            }

            if (callbackData === 'event_triggers') {
                await this.handlers.ruleHandlers.handleEventTriggers(chatId, telegramId);
                return;
            }

            if (callbackData === 'limit_orders' || callbackData === 'market_orders') {
                await this.handlers.tradingHandlers.handleOrderTypes(chatId, telegramId, callbackData);
                return;
            }

            // Handle slippage preset callbacks
            if (callbackData === 'slippage_presets') {
                await this.handlers.settingsHandlers.handleSlippagePresets(chatId, telegramId);
                return;
            }
            if (callbackData.startsWith('preset_slippage_')) {
                const slippageValue = parseFloat(callbackData.replace('preset_slippage_', ''));
                await this.handlers.settingsHandlers.handleSlippagePreset(chatId, telegramId, slippageValue);
                return;
            }

            // If no handler found, log and notify user
            console.warn('Unhandled callback action:', callbackData);
            try {
                await this.bot.sendMessage(chatId, 'Sorry, this action is not supported. Please try again.');
            } catch (sendError) {
                console.error('Error sending unhandled callback message:', sendError);
            }

        } catch (error) {
            console.error('Error handling callback query:', error);
            try {
                await this.bot.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }
}

module.exports = CallbackRouter;
