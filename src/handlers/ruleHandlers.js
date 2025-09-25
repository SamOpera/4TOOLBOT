class RuleHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.userStates = new Map();
        this.lastMessageIds = new Map();
        this.ruleCreationStates = new Map();
        this.activeRules = new Map();
    }

    async handleRules(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            const message = `
*🤖 Automated Trading Rules*

*Current Rules:* ${rules.length} active

Create intelligent trading rules to automate your strategy:

*🎯 Rule Categories:*
• Market Cap filtering
• Price range targeting  
• Liquidity requirements
• Volume spike detection
• Technical indicators
• Copy trading setups

Choose an option:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Create New Rule', callback_data: 'rules_create' },
                        { text: '📋 View All Rules', callback_data: 'rules_list' }
                    ],
                    [
                        { text: '📊 Rule Statistics', callback_data: 'rules_stats' },
                        { text: '⚙️ Rule Settings', callback_data: 'rules_settings' }
                    ],
                    [
                        { text: '🚀 Volume Spike', callback_data: 'rule_config_volume_spike' },
                        { text: '📉 Dip Buy', callback_data: 'rule_config_dip_buy' }
                    ],
                    [
                        { text: '🎮 Narrative', callback_data: 'rule_config_narrative' },
                        { text: '📈 Momentum', callback_data: 'rule_config_momentum' }
                    ],
                    [
                        { text: '📊 Volatility', callback_data: 'rule_config_volatility' },
                        { text: '👥 Copy Trade', callback_data: 'rule_config_copy_trade' }
                    ],
                    [
                        { text: '💾 Save Strategy', callback_data: 'rule_save_strategy' },
                        { text: '🔄 Reset', callback_data: 'rule_reset' }
                    ]
                ]
            };

            // Initialize rule creation state if not exists
            if (!this.ruleCreationStates) {
                this.ruleCreationStates = new Map();
            }

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rules:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rules.');
        }
    }

    async handleRulesCreate(chatId, telegramId) {
        try {
            const message = `
*➕ Create New Trading Rule*

Select the type of rule you want to create:

*📈 Buy Rules:* Automatically buy tokens when conditions are met
*📊 Management Rules:* Set stop-loss, take-profit, and position management

Choose a rule category:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💰 Market Cap Filter', callback_data: 'rule_config_market_cap' },
                        { text: '💰 Price Range', callback_data: 'rule_config_price_range' }
                    ],
                    [
                        { text: '💧 Liquidity Filter', callback_data: 'rule_config_liquidity' },
                        { text: '📊 Volume Filter', callback_data: 'rule_config_volume' }
                    ],
                    [
                        { text: '🏷️ Category Filter', callback_data: 'rule_config_category' },
                        { text: '⏰ Timeframe', callback_data: 'rule_config_timeframe' }
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
            console.error('Error showing rule creation:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up rule creation.');
        }
    }

    async handleRuleConfigMarketCap(chatId, telegramId) {
        const message = `
*💰 Market Cap Configuration*

Select the market cap range for filtering tokens:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Micro Cap (<$1M)', callback_data: 'rule_mcap_micro' },
                    { text: 'Small Cap ($1M-$10M)', callback_data: 'rule_mcap_small' }
                ],
                [
                    { text: 'Mid Cap ($10M-$100M)', callback_data: 'rule_mcap_mid' },
                    { text: 'Large Cap ($100M+)', callback_data: 'rule_mcap_large' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigPriceRange(chatId, telegramId) {
        const message = `
*💰 Price Range Configuration*

Select the price range for token filtering:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Ultra Low (<$0.001)', callback_data: 'rule_price_ultra_low' },
                    { text: 'Very Low ($0.001-$0.01)', callback_data: 'rule_price_very_low' }
                ],
                [
                    { text: 'Low ($0.01-$0.1)', callback_data: 'rule_price_low' },
                    { text: 'Medium ($0.1-$1)', callback_data: 'rule_price_medium' }
                ],
                [
                    { text: 'High ($1-$10)', callback_data: 'rule_price_high' },
                    { text: 'Very High ($10+)', callback_data: 'rule_price_very_high' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigLiquidity(chatId, telegramId) {
        const message = `
*💧 Liquidity Configuration*

Select the minimum liquidity requirement:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Very Low (<$10K)', callback_data: 'rule_liquidity_very_low' },
                    { text: 'Low ($10K-$50K)', callback_data: 'rule_liquidity_low' }
                ],
                [
                    { text: 'Medium ($50K-$200K)', callback_data: 'rule_liquidity_medium' },
                    { text: 'High ($200K-$1M)', callback_data: 'rule_liquidity_high' }
                ],
                [
                    { text: 'Very High (>$1M)', callback_data: 'rule_liquidity_very_high' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigVolume(chatId, telegramId) {
        const message = `
*📊 Volume Configuration*

Select the minimum 24h volume requirement:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Low (<$100K)', callback_data: 'rule_volume_low' },
                    { text: 'Medium ($100K-$1M)', callback_data: 'rule_volume_medium' }
                ],
                [
                    { text: 'High ($1M-$10M)', callback_data: 'rule_volume_high' },
                    { text: 'Very High (>$10M)', callback_data: 'rule_volume_very_high' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigCategory(chatId, telegramId) {
        const message = `
*🏷️ Category Configuration*

Select token categories to focus on:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎮 Gaming', callback_data: 'rule_category_gaming' },
                    { text: '🏦 DeFi', callback_data: 'rule_category_defi' }
                ],
                [
                    { text: '🎨 NFT', callback_data: 'rule_category_nft' },
                    { text: '⚡️ Layer 1', callback_data: 'rule_category_layer1' }
                ],
                [
                    { text: '🔗 Layer 2', callback_data: 'rule_category_layer2' },
                    { text: '💱 DEX', callback_data: 'rule_category_dex' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigTimeframe(chatId, telegramId) {
        const message = `
*⏰ Timeframe Configuration*

Select the monitoring timeframe:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '5m', callback_data: 'rule_timeframe_5m' },
                    { text: '15m', callback_data: 'rule_timeframe_15m' },
                    { text: '1h', callback_data: 'rule_timeframe_1h' }
                ],
                [
                    { text: '4h', callback_data: 'rule_timeframe_4h' },
                    { text: '24h', callback_data: 'rule_timeframe_24h' },
                    { text: '7d', callback_data: 'rule_timeframe_7d' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigVolumeSpike(chatId, telegramId) {
        const message = `
*🚀 Volume Spike Configuration*

Configure volume spike detection:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '2x Spike', callback_data: 'rule_volume_spike_2x' },
                    { text: '5x Spike', callback_data: 'rule_volume_spike_5x' }
                ],
                [
                    { text: '10x Spike', callback_data: 'rule_volume_spike_10x' },
                    { text: '20x Spike', callback_data: 'rule_volume_spike_20x' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigDipBuy(chatId, telegramId) {
        const message = `
*📉 Dip Buy Configuration*

Configure dip buying parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '5% Dip', callback_data: 'rule_dip_5_percent' },
                    { text: '10% Dip', callback_data: 'rule_dip_10_percent' }
                ],
                [
                    { text: '15% Dip', callback_data: 'rule_dip_15_percent' },
                    { text: '20% Dip', callback_data: 'rule_dip_20_percent' }
                ],
                [
                    { text: '25% Dip', callback_data: 'rule_dip_25_percent' },
                    { text: '30% Dip', callback_data: 'rule_dip_30_percent' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigNarrative(chatId, telegramId) {
        const message = `
*🎮 Narrative Configuration*

Select trending narratives to follow:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'AI & Machine Learning', callback_data: 'rule_narrative_ai' },
                    { text: 'Gaming & Metaverse', callback_data: 'rule_narrative_gaming' }
                ],
                [
                    { text: 'RWA (Real World Assets)', callback_data: 'rule_narrative_rwa' },
                    { text: 'Meme Coins', callback_data: 'rule_narrative_meme' }
                ],
                [
                    { text: 'Infrastructure', callback_data: 'rule_narrative_infra' },
                    { text: 'Privacy Coins', callback_data: 'rule_narrative_privacy' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigMomentum(chatId, telegramId) {
        const message = `
*📈 Momentum Configuration*

Configure momentum indicators:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'RSI Oversold (<30)', callback_data: 'rule_momentum_rsi_oversold' },
                    { text: 'RSI Overbought (>70)', callback_data: 'rule_momentum_rsi_overbought' }
                ],
                [
                    { text: 'MACD Bullish Cross', callback_data: 'rule_momentum_macd_bull' },
                    { text: 'MACD Bearish Cross', callback_data: 'rule_momentum_macd_bear' }
                ],
                [
                    { text: 'Price > MA', callback_data: 'rule_momentum_price_above_ma' },
                    { text: 'Price < MA', callback_data: 'rule_momentum_price_below_ma' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigVolatility(chatId, telegramId) {
        const message = `
*📊 Volatility Configuration*

Configure volatility parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Low Volatility (<5%)', callback_data: 'rule_volatility_low' },
                    { text: 'Medium Volatility (5-15%)', callback_data: 'rule_volatility_medium' }
                ],
                [
                    { text: 'High Volatility (15-30%)', callback_data: 'rule_volatility_high' },
                    { text: 'Extreme Volatility (>30%)', callback_data: 'rule_volatility_extreme' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleConfigCopyTrade(chatId, telegramId) {
        const message = `
*👥 Copy Trade Configuration*

Configure copy trading parameters:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: 'Mirror All Trades', callback_data: 'rule_copy_mirror_all' },
                    { text: 'Filter by Size', callback_data: 'rule_copy_filter_size' }
                ],
                [
                    { text: 'Filter by Token', callback_data: 'rule_copy_filter_token' },
                    { text: 'Percentage Copy', callback_data: 'rule_copy_percentage' }
                ],
                [
                    { text: '◀️ Back to Rule Creation', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleRuleSaveStrategy(chatId, telegramId) {
        try {
            const userState = this.ruleCreationStates.get(telegramId) || {};
            
            const message = `
*💾 Save Strategy*

*Current Strategy Configuration:*
${this.formatRuleSelections(userState)}

*Strategy Name:* Enter a name for your strategy
*Estimated Performance:* Analyzing...
*Risk Level:* Medium

Would you like to save this strategy?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Save Strategy', callback_data: 'confirm_rule' },
                        { text: '📝 Edit Strategy', callback_data: 'rules_create' }
                    ],
                    [
                        { text: '🔄 Reset All', callback_data: 'rule_reset' },
                        { text: '◀️ Back', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error saving strategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while saving the strategy.');
        }
    }

    async handleRulesList(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            if (rules.length === 0) {
                const message = `
*📋 Your Trading Rules*

No rules created yet.

Create your first automated trading rule to start earning while you sleep!`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '➕ Create First Rule', callback_data: 'rules_create' }
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
                return;
            }

            let message = `
*📋 Your Trading Rules (${rules.length})*

ℹ️ *Note:* Only one rule can be active at a time.

`;

            rules.forEach((rule, index) => {
                const status = rule.is_active ? '🟢 ACTIVE' : '⚪ INACTIVE';
                const profit = rule.total_profit || 0;
                const profitEmoji = profit > 0 ? '📈' : profit < 0 ? '📉' : '➖';
                const safeName = rule.name.replace(/_/g, '\\_');
                
                message += `${index + 1}. ${status} *${safeName}*
   ${profitEmoji} Profit: $${profit.toFixed(2)}
   🔄 Trades: ${rule.trade_count || 0}
   📅 Created: ${new Date(rule.created_at).toLocaleDateString()}

`;
            });

            const keyboard = {
                inline_keyboard: [
                    ...rules.map(rule => [
                        { 
                            text: `⚙️ ${rule.name}`, 
                            callback_data: `rule_${rule.id}` 
                        }
                    ]).slice(0, 10), // Limit to 10 rules for display
                    [
                        { text: '➕ Create New Rule', callback_data: 'rules_create' },
                        { text: '🗑️ Delete Rules', callback_data: 'delete_rules_menu' }
                    ],
                    [
                        { text: '🔄 Toggle All Rules', callback_data: 'toggle_all_rules' },
                        { text: '📊 Rule Stats', callback_data: 'rules_stats' }
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
            console.error('Error listing rules:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading your rules.');
        }
    }

    async handleRuleSelection(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const conditions = await this.db.getRuleConditions(ruleId);
            const settings = await this.db.getRuleSettings(ruleId);

            let conditionsText = '';
            if (conditions && conditions.length > 0) {
                conditionsText = conditions.map(c => {
                    const safeType = c.condition_type.replace(/_/g, '\\_');
                    const safeValue = this.formatConditionValueSafe(c.condition_type, c.condition_value);
                    return `• ${safeType}: ${safeValue}`;
                }).join('\n');
            } else {
                conditionsText = 'No conditions set';
            }

            const message = `
*⚙️ Rule: ${rule.name.replace(/_/g, '\\_')}*

*Status:* ${rule.is_active ? '✅ Active' : '❌ Inactive'}
*Type:* ${(rule.rule_type || 'General').replace(/_/g, '\\_')}
*Created:* ${new Date(rule.created_at).toLocaleDateString()}
*Last Check:* ${rule.last_check ? new Date(rule.last_check).toLocaleString() : 'Never'}

*Performance:*
• Total Trades: ${rule.trade_count || 0}
• Success Rate: ${rule.success_rate || 0}%
• Total Profit: $${rule.total_profit || 0}
• Average Profit: $${rule.avg_profit || 0}

*Conditions:*
${conditionsText}

*Settings:*
• Notifications: ${settings?.notifications_enabled ? 'On' : 'Off'}
• Alerts: ${settings?.alerts_enabled ? 'On' : 'Off'}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: rule.is_active ? '❌ Deactivate' : '✅ Activate', callback_data: `rule_toggle_${ruleId}` },
                        { text: '✏️ Edit', callback_data: `rule_edit_${ruleId}` },
                        { text: '📊 Stats', callback_data: `rule_stats_${ruleId}` }
                    ],
                    [
                        { text: '⚙️ Settings', callback_data: `settings_rule_${ruleId}` },
                        { text: '🗑️ Delete', callback_data: `rule_delete_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule details:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error loading the rule details.');
        }
    }

    async handleRuleValueSelection(chatId, telegramId, ruleId) {
        try {
            const userState = this.ruleCreationStates.get(telegramId) || {};
            
            // Parse the callback data and update user state
            if (ruleId.startsWith('rule_mcap_')) {
                userState.marketCap = ruleId.replace('rule_mcap_', '');
            } else if (ruleId.startsWith('rule_price_')) {
                userState.priceRange = ruleId.replace('rule_price_', '');
            } else if (ruleId.startsWith('rule_liquidity_')) {
                userState.liquidity = ruleId.replace('rule_liquidity_', '');
            } else if (ruleId.startsWith('rule_volume_')) {
                userState.volume = ruleId.replace('rule_volume_', '');
            } else if (ruleId.startsWith('rule_category_')) {
                userState.category = ruleId.replace('rule_category_', '');
            } else if (ruleId.startsWith('rule_timeframe_')) {
                userState.timeframe = ruleId.replace('rule_timeframe_', '');
            }
            
            this.ruleCreationStates.set(telegramId, userState);
            
            const message = `
*✅ Selection Updated*

${this.formatRuleSelections(userState)}

Continue configuring your rule or save the current strategy.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💾 Save Strategy', callback_data: 'rule_save_strategy' },
                        { text: '📝 Add More Rules', callback_data: 'rules_create' }
                    ],
                    [
                        { text: '🔄 Reset', callback_data: 'rule_reset' },
                        { text: '◀️ Back', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling rule value selection:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while updating the rule.');
        }
    }

    // Rule management helper methods
    async handleToggleAllRules(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);
            
            if (rules.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No rules found to toggle.');
                return;
            }
            
            // Check if any rules are active
            const hasActiveRules = rules.some(rule => rule.is_active);
            
            if (hasActiveRules) {
                // Deactivate all rules
                await this.db.deactivateAllRulesForUser(user.id);
                
                const message = `
*❌ All Rules Deactivated*

${rules.length} rules have been deactivated.

⏸️ All automated trading has been paused.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📋 View Rules', callback_data: 'rules_list' },
                            { text: '📊 Rule Stats', callback_data: 'rules_stats' }
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
            } else {
                // If no rules are active, show a message explaining the new behavior
                const message = `
*ℹ️ Rule Activation*

Since only one rule can be active at a time, please select a specific rule to activate.

Click on any rule below to activate it:`;

                const keyboard = {
                    inline_keyboard: [
                        ...rules.map(rule => [
                            { 
                                text: `📋 ${rule.name}`, 
                                callback_data: `rule_${rule.id}` 
                            }
                        ]).slice(0, 10),
                        [
                            { text: '📋 View All Rules', callback_data: 'rules_list' },
                            { text: '📊 Rule Stats', callback_data: 'rules_stats' }
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
            }
        } catch (error) {
            console.error('Error toggling all rules:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while toggling rules.');
        }
    }

    async handleDeleteRulesMenu(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            if (rules.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No rules found to delete.');
                return;
            }

            const message = `
*🗑️ Delete Trading Rules*

⚠️ *Warning:* This action cannot be undone.

Select rules to delete:`;

            const keyboard = {
                inline_keyboard: [
                    ...rules.map(rule => [
                        { 
                            text: `🗑️ ${rule.name}`, 
                            callback_data: `delete_rule_${rule.id}` 
                        }
                    ]).slice(0, 10),
                    [
                        { text: '❌ Delete All Rules', callback_data: 'delete_all_rules' }
                    ],
                    [
                        { text: '◀️ Back to Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing delete rules menu:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the delete menu.');
        }
    }

    async handleDeleteRule(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const message = `
*⚠️ Confirm Rule Deletion*

Are you sure you want to delete this rule?

*Rule:* ${rule.name}
*Type:* ${rule.rule_type || 'General'}
*Status:* ${rule.is_active ? 'Active' : 'Inactive'}
*Trades:* ${rule.trade_count || 0}

This action cannot be undone.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Yes, Delete', callback_data: `confirm_delete_rule_${ruleId}` },
                        { text: '❌ Cancel', callback_data: 'delete_rules_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error preparing rule deletion:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing the deletion.');
        }
    }

    async handleConfirmDeleteRule(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Check if this is an autonomous strategy rule before deleting
            const wasAutonomousStrategy = rule.type === 'autonomous_strategy';
            
            await this.db.deleteRule(ruleId);

            // Check if this was an autonomous strategy rule and if it was the last one
            if (wasAutonomousStrategy) {
                // Get user to access user_id
                const user = await this.db.getUserByTelegramId(telegramId);
                if (user) {
                    // Get all active autonomous strategy rules for this user
                    const allRules = await this.db.getRulesByUserId(user.id);
                    const activeAutonomousRules = allRules.filter(r => r.is_active && r.type === 'autonomous_strategy');
                    
                    if (activeAutonomousRules.length === 0) {
                        // No active autonomous strategy rules left, turn off autonomous mode
                        await this.db.updateUserSettings(user.id, { autonomous_enabled: false });
                        
                        const message = `
*✅ Rule Deleted Successfully*

The rule "${rule.name}" has been deleted.

All associated conditions and settings have been removed.

🤖 *Autonomous Mode Automatically Disabled*

No active autonomous strategy rules were found. 
Autonomous mode has been automatically turned off for your safety.

To re-enable autonomous mode, please create and activate at least one autonomous strategy rule.`;

                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: '📋 View Remaining Rules', callback_data: 'rules_list' },
                                    { text: '➕ Create New Rule', callback_data: 'rules_create' }
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
                        return;
                    }
                }
            }

            const message = `
*✅ Rule Deleted Successfully*

The rule "${rule.name}" has been deleted.

All associated conditions and settings have been removed.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 View Remaining Rules', callback_data: 'rules_list' },
                        { text: '➕ Create New Rule', callback_data: 'rules_create' }
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
            console.error('Error deleting rule:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while deleting the rule.');
        }
    }

    async handleDeleteAllRules(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            if (rules.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No rules found to delete.');
                return;
            }

            const message = `
*⚠️ Confirm Delete All Rules*

Are you sure you want to delete ALL ${rules.length} trading rules?

This will delete:
${rules.map(rule => `• ${rule.name} (${rule.is_active ? 'Active' : 'Inactive'})`).join('\n')}

⚠️ *This action cannot be undone!*
🤖 *Autonomous mode will be automatically disabled.*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Yes, Delete All', callback_data: 'confirm_delete_all_rules' },
                        { text: '❌ Cancel', callback_data: 'delete_rules_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error preparing delete all rules:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing the deletion.');
        }
    }

    async handleConfirmDeleteAllRules(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            if (rules.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No rules found to delete.');
                return;
            }

            const ruleCount = rules.length;
            
            // Delete all rules for the user
            for (const rule of rules) {
                await this.db.deleteRule(rule.id);
            }

            // Disable autonomous mode since all rules are deleted
            await this.db.updateUserSettings(user.id, { autonomous_enabled: false });

            const message = `
*✅ All Rules Deleted Successfully*

${ruleCount} trading rule${ruleCount > 1 ? 's have' : ' has'} been deleted.

🤖 *Autonomous Mode Disabled*

Autonomous mode has been automatically turned off since no rules remain.

To use autonomous trading again, please create new rules first.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '➕ Create New Rule', callback_data: 'rules_create' }
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
            console.error('Error deleting all rules:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while deleting all rules.');
        }
    }

    formatRuleSelections(data) {
        let output = '';
        
        if (data.marketCap) output += `• Market Cap: ${data.marketCap}\n`;
        if (data.priceRange) output += `• Price Range: ${data.priceRange}\n`;
        if (data.liquidity) output += `• Liquidity: ${data.liquidity}\n`;
        if (data.volume) output += `• Volume: ${data.volume}\n`;
        if (data.category) output += `• Category: ${data.category}\n`;
        if (data.timeframe) output += `• Timeframe: ${data.timeframe}\n`;
        
        return output || 'No configurations selected yet.';
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }

    // Additional rule management methods
    async handleRulesStats(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const rules = await this.db.getRulesByUserId(user.id);

            if (rules.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No rules found. Create your first rule to see statistics.');
                return;
            }

            // Calculate statistics
            const totalRules = rules.length;
            const activeRules = rules.filter(rule => rule.is_active).length;
            const totalTrades = rules.reduce((sum, rule) => sum + (rule.trade_count || 0), 0);
            const totalProfit = rules.reduce((sum, rule) => sum + (rule.total_profit || 0), 0);
            const avgSuccessRate = rules.reduce((sum, rule) => sum + (rule.success_rate || 0), 0) / totalRules;

            const message = `
*📊 Rules Statistics*

*Overview:*
• Total Rules: ${totalRules}
• Active Rules: ${activeRules}
• Inactive Rules: ${totalRules - activeRules}

*Performance:*
• Total Trades: ${totalTrades}
• Total Profit: $${totalProfit.toFixed(2)}
• Average Success Rate: ${avgSuccessRate.toFixed(1)}%
• Rules Profit Ratio: ${totalProfit > 0 ? '📈 Profitable' : totalProfit < 0 ? '📉 Loss' : '➖ Break-even'}

*Top Performing Rules:*
${this.getTopPerformingRules(rules)}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 View All Rules', callback_data: 'rules_list' },
                        { text: '➕ Create New Rule', callback_data: 'rules_create' }
                    ],
                    [
                        { text: '⚙️ Rule Settings', callback_data: 'rules_settings' },
                        { text: '◀️ Back to Rules', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rules stats:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rules statistics.');
        }
    }

    async handleRulesSettings(chatId, telegramId) {
        try {
            const message = `
*⚙️ Global Rules Settings*

Configure global settings for all your trading rules:

*Available Settings:*
• Default notifications for new rules
• Global rule execution timeouts
• Rule priority management
• Auto-deactivation on losses
• Performance monitoring`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔔 Default Notifications', callback_data: 'settings_global_notifications' },
                        { text: '⏱️ Execution Timeouts', callback_data: 'settings_global_timeouts' }
                    ],
                    [
                        { text: '📊 Priority Management', callback_data: 'settings_rule_priority' },
                        { text: '🛡️ Auto-deactivation', callback_data: 'settings_auto_deactivation' }
                    ],
                    [
                        { text: '📈 Performance Monitoring', callback_data: 'settings_performance_monitoring' }
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
            console.error('Error showing rules settings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rules settings.');
        }
    }

    async handleRuleToggle(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Get user to access user_id
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'User not found.');
                return;
            }

            // If the rule is currently inactive and we're activating it, deactivate all other rules first
            if (!rule.is_active) {
                // Deactivate all rules for this user
                await this.db.deactivateAllRulesForUser(user.id);
                // Then activate the selected rule
                await this.db.updateRuleStatus(ruleId, 1);
                
                const message = `
*✅ Rule Activated*

Rule "${rule.name}" has been activated successfully.

🔄 All other rules have been automatically deactivated.
✅ This rule is now the only active rule monitoring the market.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '⚙️ Rule Details', callback_data: `rule_${ruleId}` },
                            { text: '📋 All Rules', callback_data: 'rules_list' }
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
            } else {
                // If the rule is currently active, just deactivate it
                await this.db.updateRuleStatus(ruleId, 0);
                
                // Check if this was an autonomous strategy rule and if it was the last one
                if (rule.type === 'autonomous_strategy') {
                    // Get all active autonomous strategy rules for this user
                    const allRules = await this.db.getRulesByUserId(user.id);
                    const activeAutonomousRules = allRules.filter(r => r.is_active && r.type === 'autonomous_strategy');
                    
                    if (activeAutonomousRules.length === 0) {
                        // No active autonomous strategy rules left, turn off autonomous mode
                        await this.db.updateUserSettings(user.id, { autonomous_enabled: false });
                        
                        const message = `
*⏸️ Rule Deactivated*

Rule "${rule.name}" has been deactivated successfully.

🤖 *Autonomous Mode Automatically Disabled*

No active autonomous strategy rules were found. 
Autonomous mode has been automatically turned off for your safety.

To re-enable autonomous mode, please create and activate at least one autonomous strategy rule.`;

                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: '⚙️ Rule Details', callback_data: `rule_${ruleId}` },
                                    { text: '📋 All Rules', callback_data: 'rules_list' }
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
                        return;
                    }
                }
                
                const message = `
*⏸️ Rule Deactivated*

Rule "${rule.name}" has been deactivated successfully.

⏸️ Rule monitoring has been paused.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '⚙️ Rule Details', callback_data: `rule_${ruleId}` },
                            { text: '📋 All Rules', callback_data: 'rules_list' }
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
            }
        } catch (error) {
            console.error('Error toggling rule:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while toggling the rule.');
        }
    }

    async handleRuleStats(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const conditions = await this.db.getRuleConditions(ruleId);
            const recentTrades = await this.db.getRecentTradesByRule(ruleId, 10); // Get last 10 trades

            const message = `
*📊 Rule Statistics: ${rule.name}*

*Performance Metrics:*
• Success Rate: ${rule.success_rate || 0}%
• Total Trades: ${rule.trade_count || 0}
• Successful Trades: ${rule.success_count || 0}
• Failed Trades: ${rule.failure_count || 0}
• Total Profit: $${rule.total_profit || 0}
• Average Profit: $${rule.avg_profit || 0}

*Rule Activity:*
• Status: ${rule.is_active ? '✅ Active' : '❌ Inactive'}
• Last Triggered: ${rule.last_check ? new Date(rule.last_check).toLocaleString() : 'Never'}
• Created: ${new Date(rule.created_at).toLocaleDateString()}

*Conditions:* ${conditions.length} configured

${recentTrades.length > 0 ? '*Recent Activity:*\n' + recentTrades.map(trade => 
    `• ${trade.symbol}: ${trade.side} - ${trade.profit > 0 ? '📈' : '📉'} $${trade.profit}`
).join('\n') : '*No recent trades*'}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ Rule Details', callback_data: `rule_${ruleId}` },
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' },
                        { text: '◀️ Back to Rules', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule stats:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rule statistics.');
        }
    }

    async handleRuleEdit(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
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

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing rule edit options:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rule edit options.');
        }
    }

    async handleRuleEditName(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Set user state to expect name input
            this.userStates.set(telegramId, {
                editingRule: ruleId,
                waitingFor: 'ruleName',
                currentName: rule.name
            });

            const message = `
*📝 Change Rule Name*

*Current Name:* ${rule.name}

Please enter the new name for this rule:

💡 *Tip:* Use descriptive names that help you identify the rule's purpose (e.g., "High Volume DeFi Tokens", "Small Cap Momentum")`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: `rule_edit_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling rule name edit:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing name edit.');
        }
    }

    async handleRuleEditConditions(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const conditions = await this.db.getRuleConditions(ruleId);
            
            let conditionsText = '';
            if (conditions && conditions.length > 0) {
                conditionsText = conditions.map((c, index) => {
                    let value;
                    try {
                        // Try to parse as JSON first
                        value = typeof c.condition_value === 'string' && c.condition_value.startsWith('{') ? 
                            JSON.parse(c.condition_value) : c.condition_value;
                    } catch (e) {
                        // If parsing fails, use the raw value
                        value = c.condition_value;
                    }
                    return `${index + 1}. ${c.condition_type.replace(/_/g, '\\_')}: ${this.formatConditionValue(c.condition_type, value).replace(/_/g, '\\_')}`;
                }).join('\n');
            } else {
                conditionsText = 'No conditions set';
            }

            const message = `
*⚙️ Modify Rule Conditions: ${rule.name}*

*Current Conditions:*
${conditionsText}

Choose what you want to modify:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✏️ Edit Condition', callback_data: `rule_edit_condition_${ruleId}` }
                    ],
                    [
                        { text: '🗑️ Remove Condition', callback_data: `rule_remove_condition_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Edit Menu', callback_data: `rule_edit_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling rule conditions edit:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rule conditions.');
        }
    }

    async handleRuleAddCondition(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Set user state for adding condition
            this.userStates.set(telegramId, {
                editingRule: ruleId,
                addingCondition: true
            });

            const message = `
*➕ Add New Condition: ${rule.name}*

Select the type of condition to add:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💰 Market Cap', callback_data: `add_condition_market_cap_${ruleId}` },
                        { text: '💰 Price Range', callback_data: `add_condition_price_${ruleId}` }
                    ],
                    [
                        { text: '💧 Liquidity', callback_data: `add_condition_liquidity_${ruleId}` },
                        { text: '📊 Volume', callback_data: `add_condition_volume_${ruleId}` }
                    ],
                    [
                        { text: '🏷️ Category', callback_data: `add_condition_category_${ruleId}` },
                        { text: '⏰ Timeframe', callback_data: `add_condition_timeframe_${ruleId}` }
                    ],
                    [
                        { text: '📈 Price Change', callback_data: `add_condition_price_change_${ruleId}` },
                        { text: '⚡ Volume Spike', callback_data: `add_condition_volume_spike_${ruleId}` }
                    ],
                    [
                        { text: '🔒 Holder Count', callback_data: `add_condition_holders_${ruleId}` },
                        { text: '🎯 Age Filter', callback_data: `add_condition_age_${ruleId}` }
                    ],
                    [
                        { text: '🛒 Number of Buys', callback_data: `add_condition_num_buys_${ruleId}` },
                        { text: '💸 Number of Sells', callback_data: `add_condition_num_sells_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Back to Conditions', callback_data: `rule_edit_conditions_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling add condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing to add condition.');
        }
    }

    async handleRuleRemoveCondition(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const conditions = await this.db.getRuleConditions(ruleId);
            
            if (!conditions || conditions.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No conditions found to remove.');
                return;
            }

            const message = `
*🗑️ Remove Condition: ${rule.name}*

Select the condition to remove:

⚠️ *Warning:* This action cannot be undone.`;

            const keyboard = {
                inline_keyboard: [
                    ...conditions.map((condition, index) => [{
                        text: `${index + 1}. ${condition.condition_type}`,
                        callback_data: `remove_condition_${condition.id}_${ruleId}`
                    }]),
                    [
                        { text: '◀️ Back to Conditions', callback_data: `rule_edit_conditions_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling remove condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading conditions to remove.');
        }
    }

    async handleTextInput(chatId, telegramId, text) {
        try {
            const userState = this.userStates.get(telegramId);
            if (!userState) return false; // Not waiting for input

            if (userState.waitingFor === 'ruleName' && userState.editingRule) {
                await this.updateRuleName(chatId, telegramId, userState.editingRule, text);
                return true;
            }

            if (userState.waitingFor === 'customConditionValue') {
                await this.handleCustomConditionValue(chatId, telegramId, text);
                return true;
            }

            return false; // Input not handled
        } catch (error) {
            console.error('Error handling text input:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error processing your input.');
            return true;
        }
    }

    async updateRuleName(chatId, telegramId, ruleId, newName) {
        try {
            // Validate name
            if (!newName || newName.trim().length < 3) {
                await this.sendAndStoreMessage(chatId, 'Rule name must be at least 3 characters long. Please try again.');
                return;
            }

            if (newName.trim().length > 50) {
                await this.sendAndStoreMessage(chatId, 'Rule name must be less than 50 characters. Please try again.');
                return;
            }

            const trimmedName = newName.trim();
            
            // Update rule name in database
            await this.db.updateRule(ruleId, { name: trimmedName });
            
            // Clear user state
            this.userStates.delete(telegramId);

            const message = `
*✅ Rule Name Updated*

Rule name has been successfully changed to: *${trimmedName}*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ View Rule Details', callback_data: `rule_${ruleId}` },
                        { text: '✏️ Continue Editing', callback_data: `rule_edit_${ruleId}` }
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error updating rule name:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the rule name.');
        }
    }

    async handleRuleEditCondition(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const conditions = await this.db.getRuleConditions(ruleId);
            
            if (!conditions || conditions.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No conditions found to edit.');
                return;
            }

            const message = `
*✏️ Edit Condition: ${rule.name}*

Select the condition to edit:`;

            const keyboard = {
                inline_keyboard: [
                    ...conditions.map((condition, index) => [{
                        text: `${index + 1}. ${condition.condition_type}`,
                        callback_data: `edit_condition_${condition.id}_${ruleId}`
                    }]),
                    [
                        { text: '◀️ Back to Conditions', callback_data: `rule_edit_conditions_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling edit condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading conditions to edit.');
        }
    }

    async handleEditSpecificCondition(chatId, telegramId, ruleId, conditionId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const condition = await this.db.getRuleConditionById(conditionId);
            if (!condition) {
                await this.sendAndStoreMessage(chatId, 'Condition not found.');
                return;
            }

            // Set user state for editing condition
            this.userStates.set(telegramId, {
                editingRule: ruleId,
                editingCondition: conditionId,
                conditionType: condition.condition_type
            });

            let message = '';
            let keyboard = { inline_keyboard: [] };

            switch (condition.condition_type) {
                case 'market_cap':
                    message = `
*💰 Edit Market Cap Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new market cap range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Micro Cap (<$1M)', callback_data: `update_condition_mcap_micro_${conditionId}_${ruleId}` },
                                { text: 'Small Cap ($1M-$10M)', callback_data: `update_condition_mcap_small_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Mid Cap ($10M-$100M)', callback_data: `update_condition_mcap_mid_${conditionId}_${ruleId}` },
                                { text: 'Large Cap ($100M+)', callback_data: `update_condition_mcap_large_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'price':
                    message = `
*💰 Edit Price Range Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new price range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Ultra Low (<$0.001)', callback_data: `update_condition_price_ultra_low_${conditionId}_${ruleId}` },
                                { text: 'Very Low ($0.001-$0.01)', callback_data: `update_condition_price_very_low_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Low ($0.01-$0.1)', callback_data: `update_condition_price_low_${conditionId}_${ruleId}` },
                                { text: 'Medium ($0.1-$1)', callback_data: `update_condition_price_medium_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'High ($1-$10)', callback_data: `update_condition_price_high_${conditionId}_${ruleId}` },
                                { text: 'Very High ($10+)', callback_data: `update_condition_price_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'category':
                    message = `
*🏷️ Edit Category Condition*

Current: ${this.formatConditionValue(condition.condition_type, condition.condition_value)}

Select new category:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '🎮 Gaming', callback_data: `update_condition_category_gaming_${conditionId}_${ruleId}` },
                                { text: '🏦 DeFi', callback_data: `update_condition_category_defi_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '🎨 NFT', callback_data: `update_condition_category_nft_${conditionId}_${ruleId}` },
                                { text: '⚡️ Layer 1', callback_data: `update_condition_category_layer1_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '🔗 Layer 2', callback_data: `update_condition_category_layer2_${conditionId}_${ruleId}` },
                                { text: '💱 DEX', callback_data: `update_condition_category_dex_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'liquidity':
                    message = `
*💧 Edit Liquidity Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new liquidity range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Very Low (<$10K)', callback_data: `update_condition_liquidity_very_low_${conditionId}_${ruleId}` },
                                { text: 'Low ($10K-$50K)', callback_data: `update_condition_liquidity_low_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Medium ($50K-$200K)', callback_data: `update_condition_liquidity_medium_${conditionId}_${ruleId}` },
                                { text: 'High ($200K-$1M)', callback_data: `update_condition_liquidity_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Very High ($1M+)', callback_data: `update_condition_liquidity_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'volume':
                    message = `
*📊 Edit Volume Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new volume range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Low (<$100K)', callback_data: `update_condition_volume_low_${conditionId}_${ruleId}` },
                                { text: 'Medium ($100K-$1M)', callback_data: `update_condition_volume_medium_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'High ($1M-$10M)', callback_data: `update_condition_volume_high_${conditionId}_${ruleId}` },
                                { text: 'Very High ($10+)', callback_data: `update_condition_volume_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'timeframe':
                    message = `
*⏰ Edit Timeframe Condition*

Current: ${this.formatConditionValue(condition.condition_type, condition.condition_value)}

Select new timeframe:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1 Hour', callback_data: `update_condition_timeframe_1h_${conditionId}_${ruleId}` },
                                { text: '4 Hours', callback_data: `update_condition_timeframe_4h_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '24 Hours', callback_data: `update_condition_timeframe_24h_${conditionId}_${ruleId}` },
                                { text: '7 Days', callback_data: `update_condition_timeframe_7d_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '30 Days', callback_data: `update_condition_timeframe_30d_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'price_change':
                    message = `
*📈 Edit Price Change Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new price change threshold:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '+5% or more', callback_data: `update_condition_price_change_5_${conditionId}_${ruleId}` },
                                { text: '+10% or more', callback_data: `update_condition_price_change_10_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '+20% or more', callback_data: `update_condition_price_change_20_${conditionId}_${ruleId}` },
                                { text: '+50% or more', callback_data: `update_condition_price_change_50_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '+100% or more', callback_data: `update_condition_price_change_100_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'volume_spike':
                    message = `
*⚡ Edit Volume Spike Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new volume spike multiplier:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '2x Average', callback_data: `update_condition_volume_spike_2x_${conditionId}_${ruleId}` },
                                { text: '5x Average', callback_data: `update_condition_volume_spike_5x_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '10x Average', callback_data: `update_condition_volume_spike_10x_${conditionId}_${ruleId}` },
                                { text: '20x Average', callback_data: `update_condition_volume_spike_20x_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '50x Average', callback_data: `update_condition_volume_spike_50x_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'holders':
                    message = `
*🔒 Edit Holder Count Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new minimum holder count:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '100+ Holders', callback_data: `update_condition_holders_100_${conditionId}_${ruleId}` },
                                { text: '500+ Holders', callback_data: `update_condition_holders_500_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '1K+ Holders', callback_data: `update_condition_holders_1000_${conditionId}_${ruleId}` },
                                { text: '5K+ Holders', callback_data: `update_condition_holders_5000_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '10K+ Holders', callback_data: `update_condition_holders_10000_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'age':
                    message = `
*🎯 Edit Token Age Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new minimum token age:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1+ Hour', callback_data: `update_condition_age_1h_${conditionId}_${ruleId}` },
                                { text: '6+ Hours', callback_data: `update_condition_age_6h_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '1+ Day', callback_data: `update_condition_age_1d_${conditionId}_${ruleId}` },
                                { text: '3+ Days', callback_data: `update_condition_age_3d_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '1+ Week', callback_data: `update_condition_age_1w_${conditionId}_${ruleId}` },
                                { text: '1+ Month', callback_data: `update_condition_age_1m_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'management_take_profit':
                    message = `
*💰 Edit Take Profit Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new take profit percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '10% Profit', callback_data: `update_condition_take_profit_10_${conditionId}_${ruleId}` },
                                { text: '25% Profit', callback_data: `update_condition_take_profit_25_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '50% Profit', callback_data: `update_condition_take_profit_50_${conditionId}_${ruleId}` },
                                { text: '100% Profit', callback_data: `update_condition_take_profit_100_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '200% Profit', callback_data: `update_condition_take_profit_200_${conditionId}_${ruleId}` },
                                { text: '500% Profit', callback_data: `update_condition_take_profit_500_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_take_profit_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'management_stop_loss':
                    message = `
*🛑 Edit Stop Loss Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new stop loss percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '5% Loss', callback_data: `update_condition_stop_loss_5_${conditionId}_${ruleId}` },
                                { text: '10% Loss', callback_data: `update_condition_stop_loss_10_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '15% Loss', callback_data: `update_condition_stop_loss_15_${conditionId}_${ruleId}` },
                                { text: '20% Loss', callback_data: `update_condition_stop_loss_20_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '30% Loss', callback_data: `update_condition_stop_loss_30_${conditionId}_${ruleId}` },
                                { text: '50% Loss', callback_data: `update_condition_stop_loss_50_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_stop_loss_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'management_trailing_stop':
                    message = `
*📈 Edit Trailing Stop Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new trailing stop percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '5% Trail', callback_data: `update_condition_trailing_stop_5_${conditionId}_${ruleId}` },
                                { text: '10% Trail', callback_data: `update_condition_trailing_stop_10_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '15% Trail', callback_data: `update_condition_trailing_stop_15_${conditionId}_${ruleId}` },
                                { text: '20% Trail', callback_data: `update_condition_trailing_stop_20_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '25% Trail', callback_data: `update_condition_trailing_stop_25_${conditionId}_${ruleId}` },
                                { text: '30% Trail', callback_data: `update_condition_trailing_stop_30_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_trailing_stop_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'management_momentum':
                    message = `
*📊 Edit Momentum Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new momentum indicator:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'RSI Oversold (<30)', callback_data: `update_condition_momentum_rsi_oversold_${conditionId}_${ruleId}` },
                                { text: 'RSI Overbought (>70)', callback_data: `update_condition_momentum_rsi_overbought_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'MACD Bullish Cross', callback_data: `update_condition_momentum_macd_bull_${conditionId}_${ruleId}` },
                                { text: 'MACD Bearish Cross', callback_data: `update_condition_momentum_macd_bear_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Price Above MA', callback_data: `update_condition_momentum_price_above_ma_${conditionId}_${ruleId}` },
                                { text: 'Price Below MA', callback_data: `update_condition_momentum_price_below_ma_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'management_volatility':
                    message = `
*📈 Edit Volatility Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new volatility level:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Low Volatility (<5%)', callback_data: `update_condition_volatility_low_${conditionId}_${ruleId}` },
                                { text: 'Medium Volatility (5-15%)', callback_data: `update_condition_volatility_medium_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'High Volatility (15-30%)', callback_data: `update_condition_volatility_high_${conditionId}_${ruleId}` },
                                { text: 'Extreme Volatility (>30%)', callback_data: `update_condition_volatility_extreme_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                // Discovery condition types (same UI as regular conditions)
                case 'discovery_market_cap':
                    message = `
*💰 Edit Market Cap Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new market cap range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Micro Cap (<$1M)', callback_data: `update_condition_mcap_micro_${conditionId}_${ruleId}` },
                                { text: 'Small Cap ($1M-$10M)', callback_data: `update_condition_mcap_small_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Mid Cap ($10M-$100M)', callback_data: `update_condition_mcap_mid_${conditionId}_${ruleId}` },
                                { text: 'Large Cap ($100M+)', callback_data: `update_condition_mcap_large_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_price':
                    message = `
*💰 Edit Price Range Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new price range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Ultra Low (<$0.001)', callback_data: `update_condition_price_ultra_low_${conditionId}_${ruleId}` },
                                { text: 'Very Low ($0.001-$0.01)', callback_data: `update_condition_price_very_low_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Low ($0.01-$0.1)', callback_data: `update_condition_price_low_${conditionId}_${ruleId}` },
                                { text: 'Medium ($0.1-$1)', callback_data: `update_condition_price_medium_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'High ($1-$10)', callback_data: `update_condition_price_high_${conditionId}_${ruleId}` },
                                { text: 'Very High ($10+)', callback_data: `update_condition_price_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_liquidity':
                    message = `
*💧 Edit Liquidity Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new liquidity range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Very Low (<$10K)', callback_data: `update_condition_liquidity_very_low_${conditionId}_${ruleId}` },
                                { text: 'Low ($10K-$50K)', callback_data: `update_condition_liquidity_low_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Medium ($50K-$200K)', callback_data: `update_condition_liquidity_medium_${conditionId}_${ruleId}` },
                                { text: 'High ($200K-$1M)', callback_data: `update_condition_liquidity_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Very High ($1M+)', callback_data: `update_condition_liquidity_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_volume':
                    message = `
*📊 Edit Volume Condition*

Current: ${this.formatConditionValue(condition.condition_type, JSON.parse(condition.condition_value))}

Select new volume range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Low (<$100K)', callback_data: `update_condition_volume_low_${conditionId}_${ruleId}` },
                                { text: 'Medium ($100K-$1M)', callback_data: `update_condition_volume_medium_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'High ($1M-$10M)', callback_data: `update_condition_volume_high_${conditionId}_${ruleId}` },
                                { text: 'Very High ($10M+)', callback_data: `update_condition_volume_very_high_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_category':
                    message = `
*🏷️ Edit Category Condition*

Current: ${this.formatConditionValue(condition.condition_type, condition.condition_value)}

Select new category:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '🎮 Gaming', callback_data: `update_condition_category_gaming_${conditionId}_${ruleId}` },
                                { text: '🏦 DeFi', callback_data: `update_condition_category_defi_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '🎨 NFT', callback_data: `update_condition_category_nft_${conditionId}_${ruleId}` },
                                { text: '⚡️ Layer 1', callback_data: `update_condition_category_layer1_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '🔗 Layer 2', callback_data: `update_condition_category_layer2_${conditionId}_${ruleId}` },
                                { text: '💱 DEX', callback_data: `update_condition_category_dex_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_timeframe':
                    message = `
*⏰ Edit Timeframe Condition*

Current: ${this.formatConditionValue(condition.condition_type, condition.condition_value)}

Select new timeframe:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1 Hour', callback_data: `update_condition_timeframe_1h_${conditionId}_${ruleId}` },
                                { text: '4 Hours', callback_data: `update_condition_timeframe_4h_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '24 Hours', callback_data: `update_condition_timeframe_24h_${conditionId}_${ruleId}` },
                                { text: '7 Days', callback_data: `update_condition_timeframe_7d_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '30 Days', callback_data: `update_condition_timeframe_30d_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'discovery_copy_trade':
                    message = `
*👥 Edit Copy Trade Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new copy trade setting:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '🏆 Top Traders', callback_data: `update_condition_copy_trade_top_traders_${conditionId}_${ruleId}` },
                                { text: '🐋 Whale Wallets', callback_data: `update_condition_copy_trade_whales_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '💎 Smart Money', callback_data: `update_condition_copy_trade_smart_money_${conditionId}_${ruleId}` },
                                { text: '🤖 Bot Wallets', callback_data: `update_condition_copy_trade_bots_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: 'Custom Wallet', callback_data: `update_condition_copy_trade_custom_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                // Manual condition types (same UI as management conditions)
                case 'manual_take_profit':
                    message = `
*💰 Edit Take Profit Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new take profit percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '10% Profit', callback_data: `update_condition_take_profit_10_${conditionId}_${ruleId}` },
                                { text: '25% Profit', callback_data: `update_condition_take_profit_25_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '50% Profit', callback_data: `update_condition_take_profit_50_${conditionId}_${ruleId}` },
                                { text: '100% Profit', callback_data: `update_condition_take_profit_100_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '200% Profit', callback_data: `update_condition_take_profit_200_${conditionId}_${ruleId}` },
                                { text: '500% Profit', callback_data: `update_condition_take_profit_500_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_take_profit_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'manual_stop_loss':
                    message = `
*🛑 Edit Stop Loss Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new stop loss percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '5% Loss', callback_data: `update_condition_stop_loss_5_${conditionId}_${ruleId}` },
                                { text: '10% Loss', callback_data: `update_condition_stop_loss_10_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '15% Loss', callback_data: `update_condition_stop_loss_15_${conditionId}_${ruleId}` },
                                { text: '20% Loss', callback_data: `update_condition_stop_loss_20_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '30% Loss', callback_data: `update_condition_stop_loss_30_${conditionId}_${ruleId}` },
                                { text: '50% Loss', callback_data: `update_condition_stop_loss_50_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_stop_loss_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'manual_trailing_stop':
                    message = `
*📈 Edit Trailing Stop Condition*

Current: ${this.formatConditionValueSafe(condition.condition_type, condition.condition_value)}

Select new trailing stop percentage:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '5% Trail', callback_data: `update_condition_trailing_stop_5_${conditionId}_${ruleId}` },
                                { text: '10% Trail', callback_data: `update_condition_trailing_stop_10_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '15% Trail', callback_data: `update_condition_trailing_stop_15_${conditionId}_${ruleId}` },
                                { text: '20% Trail', callback_data: `update_condition_trailing_stop_20_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '25% Trail', callback_data: `update_condition_trailing_stop_25_${conditionId}_${ruleId}` },
                                { text: '30% Trail', callback_data: `update_condition_trailing_stop_30_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '📝 Custom %', callback_data: `custom_trailing_stop_${conditionId}_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_edit_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                default:
                    await this.sendAndStoreMessage(chatId, `Editing ${condition.condition_type} conditions is not yet implemented.`);
                    return;
            }

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling edit specific condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error preparing to edit the condition.');
        }
    }

    async handleCustomConditionInput(chatId, telegramId, conditionType, conditionId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Set user state to expect custom input
            this.userStates.set(telegramId, {
                editingRule: ruleId,
                editingCondition: conditionId,
                conditionType: conditionType,
                waitingFor: 'customConditionValue'
            });

            let message, inputInfo;
            
            switch (conditionType) {
                case 'take_profit':
                    message = `
*📝 Custom Take Profit Percentage*

Enter your desired take profit percentage:

*Examples:* 15, 75, 150, 300

*Range:* 1% - 1000%`;
                    inputInfo = 'Please enter a number between 1 and 1000:';
                    break;
                    
                case 'stop_loss':
                    message = `
*📝 Custom Stop Loss Percentage*

Enter your desired stop loss percentage:

*Examples:* 8, 12, 25

*Range:* 1% - 90%`;
                    inputInfo = 'Please enter a number between 1 and 90:';
                    break;
                    
                case 'trailing_stop':
                    message = `
*📝 Custom Trailing Stop Percentage*

Enter your desired trailing stop percentage:

*Examples:* 7, 18, 35

*Range:* 1% - 50%`;
                    inputInfo = 'Please enter a number between 1 and 50:';
                    break;
                    
                default:
                    await this.sendAndStoreMessage(chatId, 'Custom input not supported for this condition type.');
                    return;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: `edit_condition_${conditionId}_${ruleId}` }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, `${message}\n\n${inputInfo}`, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling custom condition input:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error setting up custom input.');
        }
    }

    async handleCustomConditionValue(chatId, telegramId, inputValue) {
        try {
            const userState = this.userStates.get(telegramId);
            if (!userState || userState.waitingFor !== 'customConditionValue') {
                return false;
            }

            const { editingRule: ruleId, editingCondition: conditionId, conditionType } = userState;

            // Validate input
            const numericValue = parseFloat(inputValue.trim());
            if (isNaN(numericValue) || numericValue <= 0) {
                await this.sendAndStoreMessage(chatId, 'Please enter a valid positive number.');
                return true;
            }

            // Validate ranges based on condition type
            let isValid = false;
            let errorMessage = '';
            
            switch (conditionType) {
                case 'take_profit':
                    isValid = numericValue >= 1 && numericValue <= 1000;
                    errorMessage = 'Take profit percentage must be between 1% and 1000%.';
                    break;
                case 'stop_loss':
                    isValid = numericValue >= 1 && numericValue <= 90;
                    errorMessage = 'Stop loss percentage must be between 1% and 90%.';
                    break;
                case 'trailing_stop':
                    isValid = numericValue >= 1 && numericValue <= 50;
                    errorMessage = 'Trailing stop percentage must be between 1% and 50%.';
                    break;
                default:
                    await this.sendAndStoreMessage(chatId, 'Invalid condition type.');
                    return true;
            }

            if (!isValid) {
                await this.sendAndStoreMessage(chatId, errorMessage);
                return true;
            }

            // Create condition value object
            let conditionValue;
            let conditionTypeName;
            
            switch (conditionType) {
                case 'take_profit':
                    conditionTypeName = 'management_take_profit';
                    conditionValue = JSON.stringify({ percentage: numericValue, action: 'sell' });
                    break;
                case 'stop_loss':
                    conditionTypeName = 'management_stop_loss';
                    conditionValue = JSON.stringify({ percentage: numericValue, action: 'sell' });
                    break;
                case 'trailing_stop':
                    conditionTypeName = 'management_trailing_stop';
                    conditionValue = JSON.stringify({ percentage: numericValue, action: 'trail' });
                    break;
            }

            // Update condition in database
            await this.db.updateRuleCondition(conditionId, conditionTypeName, conditionValue);

            const rule = await this.db.getRuleById(ruleId);
            const message = `
*✅ Custom Condition Updated*

Successfully updated ${conditionTypeName.replace('management_', '').replace('_', ' ')} condition in rule "${rule.name}".

*New Value:* ${numericValue}%`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ View Rule', callback_data: `rule_${ruleId}` },
                        { text: '✏️ Continue Editing', callback_data: `rule_edit_conditions_${ruleId}` }
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Clear user state
            this.userStates.delete(telegramId);
            return true;
        } catch (error) {
            console.error('Error handling custom condition value:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the condition.');
            return true;
        }
    }

    async handleEventTriggers(chatId, telegramId) {
        try {
            const message = `
*⚡️ Event Triggers*

Configure automatic trading triggers based on market events:

*Available Event Types:*
• Price movement alerts
• Volume spike detection
• News sentiment analysis
• Social media mentions
• Technical indicator signals

*Current Triggers:*
No event triggers configured

💡 Event triggers can automatically execute trades or send notifications when specific market conditions are met.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Price Triggers', callback_data: 'event_price_triggers' },
                        { text: '📊 Volume Triggers', callback_data: 'event_volume_triggers' }
                    ],
                    [
                        { text: '📰 News Triggers', callback_data: 'event_news_triggers' },
                        { text: '📱 Social Triggers', callback_data: 'event_social_triggers' }
                    ],
                    [
                        { text: '🔧 Technical Triggers', callback_data: 'event_technical_triggers' },
                        { text: '◀️ Back to Rules', callback_data: 'rules' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleEventTriggers:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading event triggers.');
        }
    }

    async handleAddSpecificCondition(chatId, telegramId, ruleId, conditionType) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Set user state for adding specific condition
            this.userStates.set(telegramId, {
                editingRule: ruleId,
                addingConditionType: conditionType
            });

            let message = '';
            let keyboard = { inline_keyboard: [] };

            switch (conditionType) {
                case 'market_cap':
                    message = `
*💰 Add Market Cap Condition*

Select the market cap range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Micro Cap (<$1M)', callback_data: `set_condition_mcap_micro_${ruleId}` },
                                { text: 'Small Cap ($1M-$10M)', callback_data: `set_condition_mcap_small_${ruleId}` }
                            ],
                            [
                                { text: 'Mid Cap ($10M-$100M)', callback_data: `set_condition_mcap_mid_${ruleId}` },
                                { text: 'Large Cap ($100M+)', callback_data: `set_condition_mcap_large_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'price':
                    message = `
*💰 Add Price Range Condition*

Select the price range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '<$0.001', callback_data: `set_condition_price_ultra_low_${ruleId}` },
                                { text: '$0.001-$0.01', callback_data: `set_condition_price_very_low_${ruleId}` }
                            ],
                            [
                                { text: '$0.01-$0.1', callback_data: `set_condition_price_low_${ruleId}` },
                                { text: '$0.1-$1', callback_data: `set_condition_price_medium_${ruleId}` }
                            ],
                            [
                                { text: '$1-$10', callback_data: `set_condition_price_high_${ruleId}` },
                                { text: '$10+', callback_data: `set_condition_price_very_high_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'liquidity':
                    message = `
*💧 Add Liquidity Condition*

Select the liquidity range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Very Low (<$10K)', callback_data: `set_condition_liquidity_very_low_${ruleId}` },
                                { text: 'Low ($10K-$50K)', callback_data: `set_condition_liquidity_low_${ruleId}` }
                            ],
                            [
                                { text: 'Medium ($50K-$200K)', callback_data: `set_condition_liquidity_medium_${ruleId}` },
                                { text: 'High ($200K-$1M)', callback_data: `set_condition_liquidity_high_${ruleId}` }
                            ],
                            [
                                { text: 'Very High ($1M+)', callback_data: `set_condition_liquidity_very_high_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'volume':
                    message = `
*📊 Add Volume Condition*

Select the volume range:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: 'Low (<$100K)', callback_data: `set_condition_volume_low_${ruleId}` },
                                { text: 'Medium ($100K-$1M)', callback_data: `set_condition_volume_medium_${ruleId}` }
                            ],
                            [
                                { text: 'High ($1M-$10M)', callback_data: `set_condition_volume_high_${ruleId}` },
                                { text: 'Very High ($10M+)', callback_data: `set_condition_volume_very_high_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'timeframe':
                    message = `
*⏰ Add Timeframe Condition*

Select the timeframe:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1 Hour', callback_data: `set_condition_timeframe_1h_${ruleId}` },
                                { text: '4 Hours', callback_data: `set_condition_timeframe_4h_${ruleId}` }
                            ],
                            [
                                { text: '24 Hours', callback_data: `set_condition_timeframe_24h_${ruleId}` },
                                { text: '7 Days', callback_data: `set_condition_timeframe_7d_${ruleId}` }
                            ],
                            [
                                { text: '30 Days', callback_data: `set_condition_timeframe_30d_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'category':
                    message = `
*🏷️ Add Category Condition*

Select the token category:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '🎮 Gaming', callback_data: `set_condition_category_gaming_${ruleId}` },
                                { text: '🏦 DeFi', callback_data: `set_condition_category_defi_${ruleId}` }
                            ],
                            [
                                { text: '🎨 NFT', callback_data: `set_condition_category_nft_${ruleId}` },
                                { text: '⚡️ Layer 1', callback_data: `set_condition_category_layer1_${ruleId}` }
                            ],
                            [
                                { text: '🔗 Layer 2', callback_data: `set_condition_category_layer2_${ruleId}` },
                                { text: '💱 DEX', callback_data: `set_condition_category_dex_${ruleId}` }
                            ],
                            [
                                { text: '🤖 AI/ML', callback_data: `set_condition_category_ai_${ruleId}` },
                                { text: '🌐 Web3', callback_data: `set_condition_category_web3_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'price_change':
                    message = `
*📈 Add Price Change Condition*

Select the price change threshold:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '+5% or more', callback_data: `set_condition_price_change_5_${ruleId}` },
                                { text: '+10% or more', callback_data: `set_condition_price_change_10_${ruleId}` }
                            ],
                            [
                                { text: '+20% or more', callback_data: `set_condition_price_change_20_${ruleId}` },
                                { text: '+50% or more', callback_data: `set_condition_price_change_50_${ruleId}` }
                            ],
                            [
                                { text: '+100% or more', callback_data: `set_condition_price_change_100_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'volume_spike':
                    message = `
*⚡ Add Volume Spike Condition*

Select the volume spike multiplier:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '2x Average', callback_data: `set_condition_volume_spike_2x_${ruleId}` },
                                { text: '5x Average', callback_data: `set_condition_volume_spike_5x_${ruleId}` }
                            ],
                            [
                                { text: '10x Average', callback_data: `set_condition_volume_spike_10x_${ruleId}` },
                                { text: '20x Average', callback_data: `set_condition_volume_spike_20x_${ruleId}` }
                            ],
                            [
                                { text: '50x Average', callback_data: `set_condition_volume_spike_50x_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'holders':
                    message = `
*🔒 Add Holder Count Condition*

Select the minimum holder count:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '100+ Holders', callback_data: `set_condition_holders_100_${ruleId}` },
                                { text: '500+ Holders', callback_data: `set_condition_holders_500_${ruleId}` }
                            ],
                            [
                                { text: '1K+ Holders', callback_data: `set_condition_holders_1000_${ruleId}` },
                                { text: '5K+ Holders', callback_data: `set_condition_holders_5000_${ruleId}` }
                            ],
                            [
                                { text: '10K+ Holders', callback_data: `set_condition_holders_10000_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'age':
                    message = `
*🎯 Add Token Age Condition*

Select the minimum token age:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1+ Hour', callback_data: `set_condition_age_1h_${ruleId}` },
                                { text: '6+ Hours', callback_data: `set_condition_age_6h_${ruleId}` }
                            ],
                            [
                                { text: '1+ Day', callback_data: `set_condition_age_1d_${ruleId}` },
                                { text: '3+ Days', callback_data: `set_condition_age_3d_${ruleId}` }
                            ],
                            [
                                { text: '1+ Week', callback_data: `set_condition_age_1w_${ruleId}` },
                                { text: '1+ Month', callback_data: `set_condition_age_1m_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'num_buys':
                    message = `\n*🛒 Add Number of Buys Condition*\n\nSelect the minimum number of buys:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1+', callback_data: `set_condition_num_buys_1_${ruleId}` },
                                { text: '5+', callback_data: `set_condition_num_buys_5_${ruleId}` }
                            ],
                            [
                                { text: '10+', callback_data: `set_condition_num_buys_10_${ruleId}` },
                                { text: '20+', callback_data: `set_condition_num_buys_20_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                case 'num_sells':
                    message = `\n*💸 Add Number of Sells Condition*\n\nSelect the minimum number of sells:`;
                    keyboard = {
                        inline_keyboard: [
                            [
                                { text: '1+', callback_data: `set_condition_num_sells_1_${ruleId}` },
                                { text: '5+', callback_data: `set_condition_num_sells_5_${ruleId}` }
                            ],
                            [
                                { text: '10+', callback_data: `set_condition_num_sells_10_${ruleId}` },
                                { text: '20+', callback_data: `set_condition_num_sells_20_${ruleId}` }
                            ],
                            [
                                { text: '◀️ Back', callback_data: `rule_add_condition_${ruleId}` }
                            ]
                        ]
                    };
                    break;

                default:
                    await this.sendAndStoreMessage(chatId, `Adding ${conditionType} conditions is not yet implemented.`);
                    return;
            }

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling add specific condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error preparing the condition.');
        }
    }

    async handleRemoveSpecificCondition(chatId, telegramId, ruleId, conditionId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Remove the condition from database
            await this.db.deleteRuleCondition(conditionId);

            const message = `
*✅ Condition Removed*

The condition has been successfully removed from rule "${rule.name}".`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ View Rule', callback_data: `rule_${ruleId}` },
                        { text: '✏️ Continue Editing', callback_data: `rule_edit_conditions_${ruleId}` }
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error removing specific condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error removing the condition.');
        }
    }

    async handleSetConditionValue(chatId, telegramId, callbackData) {
        try {
            // Parse callback data: set_condition_type_value_ruleId
            const parts = callbackData.split('_');
            const conditionType = parts[2]; // e.g., 'mcap', 'price', 'category'
            const value = parts[3]; // e.g., 'micro', 'small', 'gaming'
            const ruleId = parts[4];

            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            let conditionValue;
            let conditionTypeName;

            switch (conditionType) {
                case 'mcap':
                    conditionTypeName = 'market_cap';
                    const mcapRanges = {
                        'micro': { min: 0, max: 1000000 },
                        'small': { min: 1000000, max: 10000000 },
                        'mid': { min: 10000000, max: 100000000 },
                        'large': { min: 100000000, max: Infinity }
                    };
                    conditionValue = JSON.stringify(mcapRanges[value]);
                    break;

                case 'price':
                    conditionTypeName = 'price';
                    const priceRanges = {
                        'ultra_low': { min: 0, max: 0.001 },
                        'very_low': { min: 0.001, max: 0.01 },
                        'low': { min: 0.01, max: 0.1 },
                        'medium': { min: 0.1, max: 1 },
                        'high': { min: 1, max: 10 },
                        'very_high': { min: 10, max: Infinity }
                    };
                    conditionValue = JSON.stringify(priceRanges[value]);
                    break;

                case 'category':
                    conditionTypeName = 'category';
                    conditionValue = value; // Store as plain string
                    break;

                case 'liquidity':
                    conditionTypeName = 'liquidity';
                    const liquidityRanges = {
                        'very_low': { min: 0, max: 10000 },
                        'low': { min: 10000, max: 50000 },
                        'medium': { min: 50000, max: 200000 },
                        'high': { min: 200000, max: 1000000 },
                        'very_high': { min: 1000000, max: Infinity }
                    };
                    conditionValue = JSON.stringify(liquidityRanges[value]);
                    break;

                case 'volume':
                    if (parts[3] === 'spike') {
                        conditionTypeName = 'volume_spike';
                        const volumeSpikeMultipliers = {
                            '2x': { multiplier: 2 },
                            '5x': { multiplier: 5 },
                            '10x': { multiplier: 10 },
                            '20x': { multiplier: 20 },
                            '50x': { multiplier: 50 }
                        };
                        conditionValue = JSON.stringify(volumeSpikeMultipliers[parts[4]]);
                    } else {
                        conditionTypeName = 'volume';
                        const volumeRanges = {
                            'low': { min: 0, max: 100000 },
                            'medium': { min: 100000, max: 1000000 },
                            'high': { min: 1000000, max: 10000000 },
                            'very_high': { min: 10000000, max: Infinity }
                        };
                        conditionValue = JSON.stringify(volumeRanges[value]);
                    }
                    break;

                case 'timeframe':
                    conditionTypeName = 'timeframe';
                    conditionValue = value;
                    break;

                case 'price':
                    if (parts[3] === 'change') {
                        conditionTypeName = 'price_change';
                        const priceChangeThresholds = {
                            '5': { threshold: 5, operator: 'gte' },
                            '10': { threshold: 10, operator: 'gte' },
                            '20': { threshold: 20, operator: 'gte' },
                            '50': { threshold: 50, operator: 'gte' },
                            '100': { threshold: 100, operator: 'gte' }
                        };
                        conditionValue = JSON.stringify(priceChangeThresholds[parts[4]]);
                    }
                    break;

                case 'holders':
                    conditionTypeName = 'holders';
                    const holderThresholds = {
                        '100': { min: 100 },
                        '500': { min: 500 },
                        '1000': { min: 1000 },
                        '5000': { min: 5000 },
                        '10000': { min: 10000 }
                    };
                    conditionValue = JSON.stringify(holderThresholds[value]);
                    break;

                case 'age':
                    conditionTypeName = 'age';
                    const ageThresholds = {
                        '1h': { hours: 1 },
                        '6h': { hours: 6 },
                        '1d': { days: 1 },
                        '3d': { days: 3 },
                        '1w': { weeks: 1 },
                        '1m': { months: 1 }
                    };
                    conditionValue = JSON.stringify(ageThresholds[value]);
                    break;

                case 'take':
                    if (parts[3] === 'profit') {
                        conditionTypeName = 'management_take_profit';
                        const takeProfitPercentages = {
                            '10': { percentage: 10, action: 'sell' },
                            '25': { percentage: 25, action: 'sell' },
                            '50': { percentage: 50, action: 'sell' },
                            '100': { percentage: 100, action: 'sell' },
                            '200': { percentage: 200, action: 'sell' },
                            '500': { percentage: 500, action: 'sell' }
                        };
                        conditionValue = JSON.stringify(takeProfitPercentages[parts[4]]);
                    }
                    break;

                case 'stop':
                    if (parts[3] === 'loss') {
                        conditionTypeName = 'management_stop_loss';
                        const stopLossPercentages = {
                            '5': { percentage: 5, action: 'sell' },
                            '10': { percentage: 10, action: 'sell' },
                            '15': { percentage: 15, action: 'sell' },
                            '20': { percentage: 20, action: 'sell' },
                            '30': { percentage: 30, action: 'sell' },
                            '50': { percentage: 50, action: 'sell' }
                        };
                        conditionValue = JSON.stringify(stopLossPercentages[parts[4]]);
                    }
                    break;

                case 'trailing':
                    if (parts[3] === 'stop') {
                        conditionTypeName = 'management_trailing_stop';
                        const trailingStopPercentages = {
                            '5': { percentage: 5, action: 'trail' },
                            '10': { percentage: 10, action: 'trail' },
                            '15': { percentage: 15, action: 'trail' },
                            '20': { percentage: 20, action: 'trail' },
                            '25': { percentage: 25, action: 'trail' },
                            '30': { percentage: 30, action: 'trail' }
                        };
                        conditionValue = JSON.stringify(trailingStopPercentages[parts[4]]);
                    }
                    break;

                case 'momentum':
                    conditionTypeName = 'management_momentum';
                    let momentumValue = parts.slice(3).join('_'); // rsi_oversold, macd_bull, etc.
                    const momentumIndicators = {
                        'rsi_oversold': { indicator: 'rsi', threshold: 30, action: 'buy' },
                        'rsi_overbought': { indicator: 'rsi', threshold: 70, action: 'sell' },
                        'macd_bull': { indicator: 'macd', crossover: 'bullish', action: 'buy' },
                        'macd_bear': { indicator: 'macd', crossover: 'bearish', action: 'sell' },
                        'price_above_ma': { indicator: 'moving_average', position: 'above', action: 'buy' },
                        'price_below_ma': { indicator: 'moving_average', position: 'below', action: 'sell' }
                    };
                    conditionValue = JSON.stringify(momentumIndicators[momentumValue]);
                    break;

                case 'volatility':
                    conditionTypeName = 'management_volatility';
                    const volatilityLevels = {
                        'low': { level: 'low', threshold: 5, max: 5 },
                        'medium': { level: 'medium', threshold: 5, max: 15 },
                        'high': { level: 'high', threshold: 15, max: 30 },
                        'extreme': { level: 'extreme', threshold: 30, max: Infinity }
                    };
                    conditionValue = JSON.stringify(volatilityLevels[value]);
                    break;

                case 'num_buys':
                    conditionTypeName = 'num_buys';
                    conditionValue = JSON.stringify({ min: parseInt(value) });
                    break;

                case 'num_sells':
                    conditionTypeName = 'num_sells';
                    conditionValue = JSON.stringify({ min: parseInt(value) });
                    break;

                default:
                    await this.sendAndStoreMessage(chatId, `Unknown condition type: ${conditionType}`);
                    return;
            }

            // Add condition to database
            await this.db.createRuleCondition(ruleId, conditionTypeName, conditionValue);

            const formattedConditionValue = this.formatConditionValue(conditionTypeName, 
                typeof conditionValue === 'string' && conditionValue.startsWith('{') ? 
                JSON.parse(conditionValue) : conditionValue);

            const message = `
*✅ Condition Added*

Successfully added ${conditionTypeName.replace('management_', '').replace('_', ' ')} condition to rule "${rule.name}".

*Condition:* ${formattedConditionValue.replace(/_/g, '\\_')}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ View Rule', callback_data: `rule_${ruleId}` },
                        { text: '✏️ Continue Editing', callback_data: `rule_edit_conditions_${ruleId}` }
                    ],
                    [
                        { text: '➕ Add Another', callback_data: `rule_add_condition_${ruleId}` }
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Clear user state
            this.userStates.delete(telegramId);
        } catch (error) {
            console.error('Error setting condition value:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error adding the condition.');
        }
    }

    async handleRuleCallback(chatId, telegramId, callbackData) {
        try {
            console.log('Unhandled rule callback:', callbackData);
            await this.sendAndStoreMessage(chatId, `Callback "${callbackData}" is not yet implemented. Please use the main menu to navigate.`);
        } catch (error) {
            console.error('Error handling rule callback:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error processing your request.');
        }
    }

    async handleUpdateCondition(chatId, telegramId, callbackData) {
        try {
            // Parse callback data: update_condition_type_value_conditionId_ruleId
            const parts = callbackData.split('_');
            
            // Handle different callback formats
            let conditionType, value, conditionId, ruleId;
            
            // Management conditions: update_condition_take_profit_25_conditionId_ruleId
            if (parts[2] === 'take' || parts[2] === 'stop' || parts[2] === 'trailing' || 
                parts[2] === 'momentum' || parts[2] === 'volatility') {
                conditionType = parts[2]; // 'take', 'stop', 'trailing', etc.
                
                // Find the last two parts which are always conditionId and ruleId
                conditionId = parts[parts.length - 2];
                ruleId = parts[parts.length - 1];
                
                // For management conditions, everything between parts[2] and the last two parts is the value
                value = parts.slice(3, parts.length - 2).join('_');
            } else {
                // Regular conditions: update_condition_mcap_micro_conditionId_ruleId
                // Need to handle values with underscores like 'ultra_low', 'very_low', etc.
                conditionType = parts[2]; // 'mcap', 'price', 'category', etc.
                
                // Find the last two parts which are always conditionId and ruleId
                conditionId = parts[parts.length - 2];
                ruleId = parts[parts.length - 1];
                
                // Everything between parts[2] and the last two parts is the value
                value = parts.slice(3, parts.length - 2).join('_');
            }
            
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Get the existing condition to determine its actual type
            const existingCondition = await this.db.getRuleConditionById(conditionId);
            if (!existingCondition) {
                await this.sendAndStoreMessage(chatId, 'Condition not found.');
                return;
            }

            let conditionValue;
            let conditionTypeName = existingCondition.condition_type; // Use the actual condition type from database

            switch (conditionType) {
                case 'mcap':
                    // Keep the existing database condition type (could be 'market_cap' or 'discovery_market_cap')
                    const mcapRanges = {
                        'micro': { min: 0, max: 1000000 },
                        'small': { min: 1000000, max: 10000000 },
                        'mid': { min: 10000000, max: 100000000 },
                        'large': { min: 100000000, max: Infinity }
                    };
                    conditionValue = JSON.stringify(mcapRanges[value]);
                    break;

                case 'price':
                    // Keep the existing database condition type (could be 'price' or 'discovery_price')
                    const priceRanges = {
                        'ultra_low': { min: 0, max: 0.001 },
                        'very_low': { min: 0.001, max: 0.01 },
                        'low': { min: 0.01, max: 0.1 },
                        'medium': { min: 0.1, max: 1 },
                        'high': { min: 1, max: 10 },
                        'very_high': { min: 10, max: Infinity }
                    };
                    conditionValue = JSON.stringify(priceRanges[value]);
                    break;

                case 'category':
                    // conditionTypeName already set from database (could be 'category' or 'discovery_category')
                    conditionValue = value;
                    break;

                case 'liquidity':
                    // conditionTypeName already set from database (could be 'liquidity' or 'discovery_liquidity')
                    const liquidityRanges = {
                        'very_low': { min: 0, max: 10000 },
                        'low': { min: 10000, max: 50000 },
                        'medium': { min: 50000, max: 200000 },
                        'high': { min: 200000, max: 1000000 },
                        'very_high': { min: 1000000, max: Infinity }
                    };
                    conditionValue = JSON.stringify(liquidityRanges[value]);
                    break;

                case 'volume':
                    if (parts[3] === 'spike') {
                        // conditionTypeName already set from database
                        const volumeSpikeMultipliers = {
                            '2x': { multiplier: 2 },
                            '5x': { multiplier: 5 },
                            '10x': { multiplier: 10 },
                            '20x': { multiplier: 20 },
                            '50x': { multiplier: 50 }
                        };
                        conditionValue = JSON.stringify(volumeSpikeMultipliers[parts[4]]);
                    } else {
                        // conditionTypeName already set from database (could be 'volume' or 'discovery_volume')
                        const volumeRanges = {
                            'low': { min: 0, max: 100000 },
                            'medium': { min: 100000, max: 1000000 },
                            'high': { min: 1000000, max: 10000000 },
                            'very_high': { min: 10000000, max: Infinity }
                        };
                        conditionValue = JSON.stringify(volumeRanges[value]);
                    }
                    break;

                case 'timeframe':
                    conditionValue = value;
                    break;

                case 'copy':
                    if (parts[3] === 'trade') {
                        const copyTradeSettings = {
                            'top_traders': { type: 'top_traders', criteria: 'performance' },
                            'whales': { type: 'whale_wallets', min_size: 100000 },
                            'smart_money': { type: 'smart_money', criteria: 'alpha' },
                            'bots': { type: 'bot_wallets', criteria: 'automation' },
                            'custom': { type: 'custom_wallet', address: null }
                        };
                        const copyTradeValue = parts.slice(4, parts.length - 2).join('_');
                        conditionValue = JSON.stringify(copyTradeSettings[copyTradeValue]);
                    }
                    break;

                case 'change':
                    if (parts[2] === 'price') {
                        conditionTypeName = 'price_change';
                        const priceChangeThresholds = {
                            '5': { threshold: 5, operator: 'gte' },
                            '10': { threshold: 10, operator: 'gte' },
                            '20': { threshold: 20, operator: 'gte' },
                            '50': { threshold: 50, operator: 'gte' },
                            '100': { threshold: 100, operator: 'gte' }
                        };
                        conditionValue = JSON.stringify(priceChangeThresholds[parts[4]]);
                    }
                    break;

                case 'holders':
                    conditionTypeName = 'holders';
                    const holderThresholds = {
                        '100': { min: 100 },
                        '500': { min: 500 },
                        '1000': { min: 1000 },
                        '5000': { min: 5000 },
                        '10000': { min: 10000 }
                    };
                    conditionValue = JSON.stringify(holderThresholds[value]);
                    break;

                case 'age':
                    conditionTypeName = 'age';
                    const ageThresholds = {
                        '1h': { hours: 1 },
                        '6h': { hours: 6 },
                        '1d': { days: 1 },
                        '3d': { days: 3 },
                        '1w': { weeks: 1 },
                        '1m': { months: 1 }
                    };
                    conditionValue = JSON.stringify(ageThresholds[value]);
                    break;

                case 'take':
                    if (parts[3] === 'profit') {
                        conditionTypeName = 'management_take_profit';
                        const takeProfitPercentages = {
                            '10': { percentage: 10, action: 'sell' },
                            '25': { percentage: 25, action: 'sell' },
                            '50': { percentage: 50, action: 'sell' },
                            '100': { percentage: 100, action: 'sell' },
                            '200': { percentage: 200, action: 'sell' },
                            '500': { percentage: 500, action: 'sell' }
                        };
                        conditionValue = JSON.stringify(takeProfitPercentages[parts[4]]);
                    }
                    break;

                case 'stop':
                    if (parts[3] === 'loss') {
                        conditionTypeName = 'management_stop_loss';
                        const stopLossPercentages = {
                            '5': { percentage: 5, action: 'sell' },
                            '10': { percentage: 10, action: 'sell' },
                            '15': { percentage: 15, action: 'sell' },
                            '20': { percentage: 20, action: 'sell' },
                            '30': { percentage: 30, action: 'sell' },
                            '50': { percentage: 50, action: 'sell' }
                        };
                        conditionValue = JSON.stringify(stopLossPercentages[parts[4]]);
                    }
                    break;

                case 'trailing':
                    if (parts[3] === 'stop') {
                        conditionTypeName = 'management_trailing_stop';
                        const trailingStopPercentages = {
                            '5': { percentage: 5, action: 'trail' },
                            '10': { percentage: 10, action: 'trail' },
                            '15': { percentage: 15, action: 'trail' },
                            '20': { percentage: 20, action: 'trail' },
                            '25': { percentage: 25, action: 'trail' },
                            '30': { percentage: 30, action: 'trail' }
                        };
                        conditionValue = JSON.stringify(trailingStopPercentages[parts[4]]);
                    }
                    break;

                case 'momentum':
                    conditionTypeName = 'management_momentum';
                    let momentumValue = parts.slice(3).join('_'); // rsi_oversold, macd_bull, etc.
                    const momentumIndicators = {
                        'rsi_oversold': { indicator: 'rsi', threshold: 30, action: 'buy' },
                        'rsi_overbought': { indicator: 'rsi', threshold: 70, action: 'sell' },
                        'macd_bull': { indicator: 'macd', crossover: 'bullish', action: 'buy' },
                        'macd_bear': { indicator: 'macd', crossover: 'bearish', action: 'sell' },
                        'price_above_ma': { indicator: 'moving_average', position: 'above', action: 'buy' },
                        'price_below_ma': { indicator: 'moving_average', position: 'below', action: 'sell' }
                    };
                    conditionValue = JSON.stringify(momentumIndicators[momentumValue]);
                    break;

                case 'volatility':
                    conditionTypeName = 'management_volatility';
                    const volatilityLevels = {
                        'low': { level: 'low', threshold: 5, max: 5 },
                        'medium': { level: 'medium', threshold: 5, max: 15 },
                        'high': { level: 'high', threshold: 15, max: 30 },
                        'extreme': { level: 'extreme', threshold: 30, max: Infinity }
                    };
                    conditionValue = JSON.stringify(volatilityLevels[value]);
                    break;

                case 'num_buys':
                    conditionTypeName = 'num_buys';
                    conditionValue = JSON.stringify({ min: parseInt(value) });
                    break;

                case 'num_sells':
                    conditionTypeName = 'num_sells';
                    conditionValue = JSON.stringify({ min: parseInt(value) });
                    break;

                default:
                    await this.sendAndStoreMessage(chatId, `Unknown condition type: ${conditionType}`);
                    return;
            }

            // Validate that conditionValue is not undefined
            if (conditionValue === undefined) {
                await this.sendAndStoreMessage(chatId, 'Error: condition value is undefined');
                return;
            }

            // Update condition in database
            await this.db.updateRuleCondition(conditionId, conditionTypeName, conditionValue);

            const formattedValue = typeof conditionValue === 'string' && conditionValue.startsWith('{') ? 
                this.formatConditionValue(conditionTypeName, JSON.parse(conditionValue)) : 
                this.formatConditionValue(conditionTypeName, conditionValue);
            
            const message = `
*✅ Condition Updated*

Successfully updated ${conditionTypeName.replace(/_/g, '\\_')} condition in rule "${rule.name}".

*New Value:* ${formattedValue.replace(/_/g, '\\_')}`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ View Rule', callback_data: `rule_${ruleId}` },
                        { text: '✏️ Continue Editing', callback_data: `rule_edit_conditions_${ruleId}` }
                    ],
                    [
                        { text: '📋 All Rules', callback_data: 'rules_list' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Clear user state
            this.userStates.delete(telegramId);
        } catch (error) {
            console.error('Error updating condition:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error updating the condition.');
        }
    }

    formatConditionValueSafe(conditionType, conditionValue) {
        let formattedValue;
        try {
            // Try to parse as JSON if it's a string starting with '{'
            const value = typeof conditionValue === 'string' && conditionValue.startsWith('{') ? 
                JSON.parse(conditionValue) : conditionValue;
            formattedValue = this.formatConditionValue(conditionType, value);
        } catch (e) {
            // If parsing fails, use the raw value
            formattedValue = this.formatConditionValue(conditionType, conditionValue);
        }
        // Escape underscores for Telegram Markdown
        return formattedValue.replace(/_/g, '\\_');
    }

    formatConditionValue(conditionType, value) {
        switch (conditionType) {
            case 'market_cap':
            case 'discovery_market_cap':
                if (value && typeof value === 'object') {
                    const min = this.formatNumber(value.min || 0);
                    const max = value.max === null || value.max === Infinity || value.max === undefined ? '∞' : this.formatNumber(value.max);
                    return `$${min} - $${max}`;
                }
                return String(value);
                
            case 'price':
            case 'discovery_price':
                if (value && typeof value === 'object') {
                    const min = (value.min || 0).toFixed(4);
                    const max = value.max === null || value.max === Infinity || value.max === undefined ? '∞' : value.max.toFixed(4);
                    return `$${min} - $${max}`;
                }
                return String(value);
                
            case 'liquidity':
            case 'discovery_liquidity':
                if (value && typeof value === 'object') {
                    const min = this.formatNumber(value.min || 0);
                    const max = value.max === null || value.max === Infinity || value.max === undefined ? '∞' : this.formatNumber(value.max);
                    return `$${min} - $${max}`;
                }
                return String(value);
                
            case 'volume':
            case 'discovery_volume':
                if (value && typeof value === 'object') {
                    const min = this.formatNumber(value.min || 0);
                    const max = value.max === null || value.max === Infinity || value.max === undefined ? '∞' : this.formatNumber(value.max);
                    return `$${min} - $${max}`;
                }
                return String(value);
                
            case 'category':
            case 'discovery_category':
                return String(value).charAt(0).toUpperCase() + String(value).slice(1);
                
            case 'timeframe':
            case 'discovery_timeframe':
                return String(value);
                
            case 'price_change':
                if (value && typeof value === 'object') {
                    return `${value.threshold}% ${value.operator === 'gte' ? 'increase' : 'change'} in ${value.timeframe || 'unspecified time'}`;
                }
                return String(value);
                
            case 'volume_spike':
                if (value && typeof value === 'object') {
                    return `${value.multiplier}x volume spike`;
                }
                return String(value);
                
            case 'holders':
                if (value && typeof value === 'object') {
                    return `${value.min || 0}+ holders`;
                }
                return String(value);
                
            case 'age':
                if (value && typeof value === 'object') {
                    if (value.hours) return `${value.hours} hour${value.hours !== 1 ? 's' : ''}`;
                    if (value.days) return `${value.days} day${value.days !== 1 ? 's' : ''}`;
                    if (value.weeks) return `${value.weeks} week${value.weeks !== 1 ? 's' : ''}`;
                    if (value.months) return `${value.months} month${value.months !== 1 ? 's' : ''}`;
                }
                return String(value);

            case 'discovery_copy_trade':
                if (value && typeof value === 'object') {
                    return value.type || String(value);
                }
                return String(value);

            case 'management_take_profit':
                if (value && typeof value === 'object') {
                    return `Take profit at +${value.percentage}%`;
                }
                return String(value);
                
            case 'management_stop_loss':
                if (value && typeof value === 'object') {
                    return `Stop loss at -${value.percentage}%`;
                }
                return String(value);
                
            case 'management_trailing_stop':
                if (value && typeof value === 'object') {
                    return `Trailing stop at ${value.percentage}%`;
                }
                return String(value);
                
            case 'management_momentum':
                if (value && typeof value === 'object') {
                    if (value.indicator === 'rsi') {
                        return `RSI ${value.threshold > 50 ? 'overbought' : 'oversold'} (${value.threshold})`;
                    } else if (value.indicator === 'macd') {
                        return `MACD ${value.crossover} crossover`;
                    } else if (value.indicator === 'moving_average') {
                        return `Price ${value.position} moving average`;
                    }
                }
                return String(value);
                
            case 'management_volatility':
                if (value && typeof value === 'object') {
                    return `${value.level} volatility (${value.threshold}%-${value.max === Infinity ? '∞' : value.max + '%'})`;
                }
                return String(value);
                
            case 'num_buys':
                if (value && typeof value === 'object') {
                    return `${value.min || 0}+ buys`;
                }
                return String(value);

            case 'num_sells':
                if (value && typeof value === 'object') {
                    return `${value.min || 0}+ sells`;
                }
                return String(value);

            default:
                return String(value);
        }
    }

    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    getTopPerformingRules(rules) {
        // Sort rules by total profit and return top 3
        const sortedRules = rules
            .filter(rule => rule.total_profit !== undefined)
            .sort((a, b) => (b.total_profit || 0) - (a.total_profit || 0))
            .slice(0, 3);

        if (sortedRules.length === 0) {
            return 'No performance data available';
        }

        return sortedRules.map((rule, index) => {
            const profit = rule.total_profit || 0;
            const profitEmoji = profit > 0 ? '📈' : profit < 0 ? '📉' : '➖';
            return `${index + 1}. ${rule.name} ${profitEmoji} $${profit.toFixed(2)}`;
        }).join('\n');
    }
}

module.exports = RuleHandlers;
