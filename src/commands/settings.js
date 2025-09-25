const { Markup } = require('telegraf');
const DatabaseManager = require('../modules/database');
const AutonomousService = require('../services/autonomousService');

class SettingsCommand {
    constructor(config) {
        this.config = config;
        this.db = new DatabaseManager();
        this.autonomousService = new AutonomousService(config);
    }

    async handleSettings(ctx) {
        try {
            const userId = ctx.from.id;
            const settings = await this.db.getUserSettings(userId);
            
            if (!settings) {
                await ctx.reply('Please set up your settings first using /setup');
                return;
            }

            const keyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        `Autonomous Mode: ${settings.autonomous_mode ? '✅ ON' : '❌ OFF'}`,
                        'toggle_autonomous'
                    )
                ],
                [
                    Markup.button.callback('Trade Settings', 'trade_settings'),
                    Markup.button.callback('Notification Settings', 'notification_settings')
                ],
                [
                    Markup.button.callback('Risk Settings', 'risk_settings'),
                    Markup.button.callback('Strategy Settings', 'strategy_settings')
                ]
            ]);

            await ctx.reply(
                '*Settings Menu*\n\n' +
                'Configure your trading preferences and automation settings.',
                {
                    parse_mode: 'Markdown',
                    ...keyboard
                }
            );
        } catch (error) {
            console.error('Error handling settings:', error);
            await ctx.reply('An error occurred while loading settings. Please try again.');
        }
    }

    async handleCallback(ctx) {
        const action = ctx.match[1];
        const userId = ctx.from.id;

        try {
            switch (action) {
                case 'toggle_autonomous':
                    await this.handleAutonomousToggle(ctx, userId);
                    break;
                case 'trade_settings':
                    await this.showTradeSettings(ctx, userId);
                    break;
                case 'notification_settings':
                    await this.showNotificationSettings(ctx, userId);
                    break;
                case 'risk_settings':
                    await this.showRiskSettings(ctx, userId);
                    break;
                case 'strategy_settings':
                    await this.showStrategySettings(ctx, userId);
                    break;
                default:
                    await ctx.answerCbQuery('Invalid action');
            }
        } catch (error) {
            console.error('Error handling settings callback:', error);
            await ctx.reply('An error occurred. Please try again.');
        }
    }

    async handleAutonomousToggle(ctx, userId) {
        try {
            const result = await this.db.toggleAutonomousMode(userId);
            
            if (result.autonomous_mode) {
                await this.autonomousService.startAutonomousMode(userId);
            } else {
                await this.autonomousService.stopAutonomousMode(userId);
            }

            // Update the settings menu with new state
            await this.handleSettings(ctx);
            
            await ctx.answerCbQuery(
                `Autonomous mode ${result.autonomous_mode ? 'enabled' : 'disabled'}`
            );
        } catch (error) {
            console.error('Error toggling autonomous mode:', error);
            await ctx.answerCbQuery('Failed to toggle autonomous mode');
        }
    }

    async showTradeSettings(ctx, userId) {
        const settings = await this.db.getUserSettings(userId);
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    `Max Trade Amount: ${settings.max_trade_amount} SOL`,
                    'edit_max_trade'
                )
            ],
            [
                Markup.button.callback(
                    `Min Trade Amount: ${settings.min_trade_amount} SOL`,
                    'edit_min_trade'
                )
            ],
            [
                Markup.button.callback(
                    `Max Daily Trades: ${settings.max_daily_trades}`,
                    'edit_max_daily_trades'
                )
            ],
            [
                Markup.button.callback(
                    `Auto Confirm: ${settings.auto_confirm_trades ? '✅' : '❌'}`,
                    'toggle_auto_confirm'
                )
            ],
            [Markup.button.callback('Back to Settings', 'back_to_settings')]
        ]);

        await ctx.editMessageText(
            '*Trade Settings*\n\n' +
            'Configure your trading limits and preferences.',
            {
                parse_mode: 'Markdown',
                ...keyboard
            }
        );
    }

    async showNotificationSettings(ctx, userId) {
        const settings = await this.db.getUserSettings(userId);
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    `Trade Notifications: ${settings.notify_on_trade ? '✅' : '❌'}`,
                    'toggle_trade_notifications'
                )
            ],
            [Markup.button.callback('Back to Settings', 'back_to_settings')]
        ]);

        await ctx.editMessageText(
            '*Notification Settings*\n\n' +
            'Configure your notification preferences.',
            {
                parse_mode: 'Markdown',
                ...keyboard
            }
        );
    }

    async showRiskSettings(ctx, userId) {
        const settings = await this.db.getUserSettings(userId);
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(
                    `Default Stop Loss: ${settings.default_stop_loss}%`,
                    'edit_stop_loss'
                )
            ],
            [
                Markup.button.callback(
                    `Default Take Profit: ${settings.default_take_profit}%`,
                    'edit_take_profit'
                )
            ],
            [
                Markup.button.callback(
                    `Trailing Stop: ${settings.trailing_stop_enabled ? '✅' : '❌'}`,
                    'toggle_trailing_stop'
                )
            ],
            [
                Markup.button.callback(
                    `Trailing Threshold: ${settings.trailing_stop_threshold}%`,
                    'edit_trailing_threshold'
                )
            ],
            [Markup.button.callback('Back to Settings', 'back_to_settings')]
        ]);

        await ctx.editMessageText(
            '*Risk Settings*\n\n' +
            'Configure your risk management parameters.',
            {
                parse_mode: 'Markdown',
                ...keyboard
            }
        );
    }

    async showStrategySettings(ctx, userId) {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('Degen Strategy', 'strategy_degen'),
                Markup.button.callback('Defensive Strategy', 'strategy_defensive')
            ],
            [
                Markup.button.callback('Trend Strategy', 'strategy_trend'),
                Markup.button.callback('Custom Strategy', 'strategy_custom')
            ],
            [Markup.button.callback('Back to Settings', 'back_to_settings')]
        ]);

        await ctx.editMessageText(
            '*Strategy Settings*\n\n' +
            'Select your preferred trading strategy template.',
            {
                parse_mode: 'Markdown',
                ...keyboard
            }
        );
    }
}

module.exports = SettingsCommand; 