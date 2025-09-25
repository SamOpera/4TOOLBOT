const TelegramUtils = require('./telegramUtils');

class RulesManager {
    constructor(bot, db, messageManager, rulesCommand) {
        this.bot = bot;
        this.db = db;
        this.messageManager = messageManager;
        this.rulesCommand = rulesCommand;
    }

    async handleStrategies(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.messageManager.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            // Get user's rules only
            const rules = await this.db.getRulesByUserId(user.id);

            // Count active rules
            const activeRules = rules.filter(r => r.is_active).length;

            let message = `
*📋 Trading Rules*

*📊 Total Rules:* ${rules.length}
*✅ Active Rules:* ${activeRules}
*⏸️ Inactive Rules:* ${rules.length - activeRules}

`;

            // Display rules only
            if (rules.length > 0) {
                message += `*📋 Your Rules:*\n`;
                rules.forEach((rule, index) => {
                    const status = rule.is_active ? '✅' : '⏸️';
                    const classification = this.rulesCommand.getRuleClassification(rule);
                    message += `${index + 1}. ${classification.emoji} ${rule.name} ${status}\n`;
                });
                message += '\n';
            } else {
                message += `*📋 Your Rules:* No rules created yet\n\n`;
            }

            message += `*📝 Rule Management:*\n_Create and manage your trading rules_`;

            const keyboard = {
                inline_keyboard: [
                    // Rule management
                    [
                        { text: '📝 Create Rule', callback_data: 'rules_create' },
                        { text: '📋 Manage Rules', callback_data: 'rules_list' }
                    ],
                    // Rule actions if rules exist
                    ...(rules.length > 0 ? [[
                        { text: '🗑️ Delete Rules', callback_data: 'delete_rules_menu' }
                    ]] : []),
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleStrategies:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading rules.');
        }
    }

    async handleToggleAllRules(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.messageManager.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                return;
            }

            const rules = await this.db.getRulesByUserId(user.id);
            if (rules.length === 0) {
                await this.messageManager.sendAndStoreMessage(chatId, 'No rules found to toggle.');
                return;
            }

            // Determine current state - if majority are active, deactivate all, otherwise activate all
            const activeRules = rules.filter(rule => rule.is_active);
            const shouldActivate = activeRules.length < rules.length / 2;

            // Update all rules
            for (const rule of rules) {
                // Convert boolean to integer for SQLite (0 = false, 1 = true)
                await this.db.updateRuleStatus(rule.id, shouldActivate ? 1 : 0);
            }

            const message = `
*${shouldActivate ? '✅' : '⏸️'} All Rules ${shouldActivate ? 'Activated' : 'Deactivated'}*

${shouldActivate ? 'Activated' : 'Deactivated'} ${rules.length} rule(s) successfully.

Your rules are now ${shouldActivate ? 'actively monitoring the market' : 'paused'}.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 View Rules', callback_data: 'rules' },
                        { text: '📊 Strategies', callback_data: 'strategies' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error toggling all rules:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error toggling the rules.');
        }
    }

    async handleDeleteRulesMenu(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.messageManager.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                return;
            }

            const rules = await this.db.getRulesByUserId(user.id);
            if (rules.length === 0) {
                await this.messageManager.sendAndStoreMessage(chatId, 'No rules found to delete.');
                return;
            }

            let message = `
*🗑️ Delete Rules*

Select a rule to delete:

`;

            // Display rules with status
            rules.forEach((rule, index) => {
                const status = rule.is_active ? '✅' : '⏸️';
                const classification = this.rulesCommand.getRuleClassification(rule);
                message += `${index + 1}. ${classification.emoji} ${rule.name} ${status}\n`;
            });

            // Create buttons for each rule (2 per row)
            const ruleButtons = [];
            for (let i = 0; i < rules.length; i += 2) {
                const row = [];
                // First rule
                const rule1 = rules[i];
                row.push({
                    text: `${i + 1}. ${rule1.name.length > 15 ? rule1.name.substring(0, 15) + '...' : rule1.name}`,
                    callback_data: `delete_rule_${rule1.id}`
                });
                
                // Second rule (if exists)
                if (i + 1 < rules.length) {
                    const rule2 = rules[i + 1];
                    row.push({
                        text: `${i + 2}. ${rule2.name.length > 15 ? rule2.name.substring(0, 15) + '...' : rule2.name}`,
                        callback_data: `delete_rule_${rule2.id}`
                    });
                }
                ruleButtons.push(row);
            }

            const keyboard = {
                inline_keyboard: [
                    ...ruleButtons,
                    [
                        { text: '◀️ Back to Strategies', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing delete rules menu:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error loading the rules.');
        }
    }

    async handleDeleteRule(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.messageManager.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            const message = `
*⚠️ Confirm Rule Deletion*

Are you sure you want to delete this rule?

*Rule:* ${rule.name}
*Type:* ${this.rulesCommand.getRuleClassification(rule).emoji} ${this.rulesCommand.getRuleClassification(rule).text}
*Status:* ${rule.is_active ? '✅ Active' : '⏸️ Inactive'}
*Created:* ${new Date(rule.created_at).toLocaleDateString()}

**This action cannot be undone.**`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Delete Rule', callback_data: `confirm_delete_rule_${ruleId}` }
                    ],
                    [
                        { text: '◀️ Cancel', callback_data: 'delete_rules_menu' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing delete rule confirmation:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error processing your request.');
        }
    }

    async handleConfirmDeleteRule(chatId, telegramId, ruleId) {
        try {
            const rule = await this.db.getRuleById(ruleId);
            if (!rule) {
                await this.messageManager.sendAndStoreMessage(chatId, 'Rule not found.');
                return;
            }

            // Delete rule settings first (if they exist)
            try {
                await this.db.deleteRuleSettings(ruleId);
            } catch (e) {
                // Settings might not exist, continue
            }
            
            // Delete the rule (this also deletes rule conditions automatically)
            await this.db.deleteRule(ruleId);

            const message = `
*✅ Rule Deleted Successfully*

Rule "${rule.name}" has been permanently deleted.

All associated settings and conditions have been removed.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 View Remaining Rules', callback_data: 'rules' },
                        { text: '📝 Create New Rule', callback_data: 'rules_create' }
                    ],
                    [
                        { text: '📊 Back to Strategies', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error deleting rule:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error deleting the rule. Please try again.');
        }
    }

    async handleStrategyPerformance(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.messageManager.sendAndStoreMessage(chatId, 'User not found. Please try again.');
                return;
            }

            const rules = await this.db.getRulesByUserId(user.id);
            const strategies = await this.db.getUserStrategies(user.id);

            if (rules.length === 0 && strategies.length === 0) {
                await this.messageManager.sendAndStoreMessage(chatId, 'No rules or strategies found to analyze.');
                return;
            }

            let message = `
*📊 Strategy Performance Analysis*

`;

            // Rules performance
            if (rules.length > 0) {
                message += `*📋 Rules Performance:*\n`;
                
                let totalTriggers = 0;
                let totalSuccesses = 0;
                let activeRules = 0;

                rules.forEach((rule, index) => {
                    const triggers = (rule.success_count || 0) + (rule.failure_count || 0);
                    const successRate = triggers > 0 ? Math.round(((rule.success_count || 0) / triggers) * 100) : 0;
                    
                    if (rule.is_active) activeRules++;
                    totalTriggers += triggers;
                    totalSuccesses += (rule.success_count || 0);

                    const status = rule.is_active ? '✅' : '⏸️';
                    const classification = this.rulesCommand.getRuleClassification(rule);
                    
                    message += `${index + 1}. ${classification.emoji} ${rule.name} ${status}\n`;
                    message += `   Success Rate: ${successRate}% (${rule.success_count || 0}/${triggers})\n`;
                    message += `   Last Check: ${rule.last_check ? new Date(rule.last_check).toLocaleDateString() : 'Never'}\n\n`;
                });

                const overallSuccessRate = totalTriggers > 0 ? Math.round((totalSuccesses / totalTriggers) * 100) : 0;
                message += `*📈 Rules Summary:*\n`;
                message += `- Total Rules: ${rules.length}\n`;
                message += `- Active Rules: ${activeRules}\n`;
                message += `- Overall Success Rate: ${overallSuccessRate}%\n`;
                message += `- Total Triggers: ${totalTriggers}\n\n`;
            }

            // Strategies performance
            if (strategies.length > 0) {
                message += `*⚙️ Strategies Performance:*\n`;
                
                let activeStrategies = 0;
                
                strategies.forEach((strategy, index) => {
                    try {
                        const data = JSON.parse(strategy.strategy_json);
                        const isActive = data.params && data.params.isActive === true;
                        if (isActive) activeStrategies++;
                        
                        const status = isActive ? '✅' : '⏸️';
                        const type = data.type || 'strategy';
                        const icon = TelegramUtils.getStrategyIcon(type);
                        const name = TelegramUtils.formatStrategyName(type);
                        
                        message += `${index + 1}. ${icon} ${name} ${status}\n`;
                        message += `   Created: ${new Date(strategy.created_at).toLocaleDateString()}\n`;
                        if (strategy.last_executed) {
                            message += `   Last Executed: ${new Date(strategy.last_executed).toLocaleDateString()}\n`;
                        }
                        message += '\n';
                    } catch (e) {
                        message += `${index + 1}. ⚙️ Strategy ${strategy.id}\n`;
                        message += `   Status: Unknown\n\n`;
                    }
                });

                message += `*📈 Strategies Summary:*\n`;
                message += `- Total Strategies: ${strategies.length}\n`;
                message += `- Active Strategies: ${activeStrategies}\n`;
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'strategy_performance' },
                        { text: '📊 Strategies', callback_data: 'strategies' }
                    ],
                    [
                        { text: '📋 Rules', callback_data: 'rules' },
                        { text: '⚙️ Settings', callback_data: 'settings' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'strategies' }
                    ]
                ]
            };

            await this.messageManager.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing strategy performance:', error);
            await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error loading the performance data.');
        }
    }
}

module.exports = RulesManager;
