class SecurityHandlers {
    constructor(telegramBotManager, db, config) {
        this.telegramBotManager = telegramBotManager;
        this.bot = telegramBotManager.bot; // Access the actual bot instance for sending messages
        this.db = db;
        this.config = config;
        this.crypto = require('crypto');
        this.userStates = telegramBotManager.bot.userStates; // Use shared userStates from TelegramBotManager bot instance
        this.lastMessageIds = new Map();
        this.pendingUnlockWalletId = null;
    }

    // Handle input messages for security-related waiting states
    async handleMessage(ctx, userState) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const message = ctx.message.text;

        try {
            if (userState && userState.state) {
                switch (userState.state) {
                    case 'awaiting_new_passphrase': {
                        await this.handlePassphraseInput(chatId, telegramId, message);
                        return { handled: true, clearState: true };
                    }
                    case 'awaiting_passphrase': {
                        await this.handlePassphraseInput(chatId, telegramId, message);
                        return { handled: true, clearState: true };
                    }
                    default:
                        return false; // Not handled by security handlers
                }
            }
            return false;
        } catch (error) {
            console.error('Error in securityHandlers.handleMessage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your security input.');
            return true;
        }
    }

    async handleWalletSecurity(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (wallets.length === 0) {
                const message = `
*⚠️ No Wallets Found*

Please create or import a wallet first to manage security settings.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            const message = `
*🔒 Wallet Security*

Manage security settings for your wallets.

*🔐 Security Features:*
- Lock/Unlock wallets
- Set secure passphrases
- Monitor security status
- Emergency recovery options

Select a wallet to manage its security settings:`;

            // Group wallets into pairs for better display
            const walletButtons = [];
            for (let i = 0; i < wallets.length; i += 2) {
                const row = [];
                // First wallet in the pair
                const wallet1 = wallets[i];
                row.push({
                    text: `${wallet1.public_key.slice(0, 6)}...${wallet1.public_key.slice(-4)} ${wallet1.is_locked ? '🔒' : '🔓'}`,
                    callback_data: `security_wallet_${wallet1.id}`
                });
                
                // Second wallet in the pair (if exists)
                if (i + 1 < wallets.length) {
                    const wallet2 = wallets[i + 1];
                    row.push({
                        text: `${wallet2.public_key.slice(0, 6)}...${wallet2.public_key.slice(-4)} ${wallet2.is_locked ? '🔒' : '🔓'}`,
                        callback_data: `security_wallet_${wallet2.id}`
                    });
                }
                walletButtons.push(row);
            }

            const keyboard = {
                inline_keyboard: [
                    ...walletButtons,
                    [
                        { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing wallet security:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while accessing wallet security.');
        }
    }

    async handleSecurityWallet(chatId, telegramId, walletId) {
        try {
            const wallet = await this.db.getWalletById(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            const message = `
*🔒 Security Settings for Wallet*
\`${wallet.public_key}\`

*Current Status:* ${wallet.is_locked ? '🔒 Locked' : '🔓 Unlocked'}
${wallet.passphrase_hash ? '🔑 Passphrase Protected' : '⚠️ No Passphrase Set'}

Select an action:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { 
                            text: wallet.is_locked ? '🔓 Unlock Wallet' : '🔒 Lock Wallet',
                            callback_data: wallet.is_locked ? `unlock_wallet_${walletId}` : `lock_wallet_${walletId}`
                        }
                    ],
                    [
                        { 
                            text: wallet.passphrase_hash ? '🔑 Change Passphrase' : '🔑 Set Passphrase',
                            callback_data: `passphrase_wallet_${walletId}`
                        }
                    ],
                    [
                        { text: '◀️ Back to Security', callback_data: 'wallet_security' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing wallet security options:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while accessing wallet security options.');
        }
    }

    async handleLockWallet(chatId, telegramId, walletId) {
        try {
            const wallet = await this.db.getWalletById(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Lock the wallet
            await this.db.lockWallet(walletId);

            const message = `
*🔒 Wallet Locked Successfully*

*Wallet:* \`${wallet.public_key}\`
*Status:* 🔒 Locked

Your wallet is now locked and secure.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔓 Unlock Wallet', callback_data: `unlock_wallet_${walletId}` }
                    ],
                    [
                        { text: '◀️ Back to Security', callback_data: 'wallet_security' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Refresh main menu if this is the active wallet
            if (wallet.is_active) {
                await this.telegramBotManager.showMainMenu(chatId, { ...wallet, is_locked: true });
            }
        } catch (error) {
            console.error('Error locking wallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while locking the wallet.');
        }
    }

    async handleUnlockWallet(chatId, telegramId, walletId) {
        try {
            const wallet = await this.db.getWalletById(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (!wallet.passphrase_hash) {
                // If no passphrase is set, unlock directly
                await this.db.unlockWallet(walletId);
                
                const message = `
*🔓 Wallet Unlocked Successfully*

*Wallet:* \`${wallet.public_key}\`
*Status:* 🔓 Unlocked

Your wallet is now unlocked and ready to use.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔒 Lock Wallet', callback_data: `lock_wallet_${walletId}` }
                        ],
                        [
                            { text: '◀️ Back to Security', callback_data: 'wallet_security' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Refresh main menu if this is the active wallet
                if (wallet.is_active) {
                    await this.telegramBotManager.showMainMenu(chatId, { ...wallet, is_locked: false });
                }
                return;
            }

            // Set user state to await passphrase
            this.userStates.set(telegramId, {
                state: 'awaiting_passphrase',
                data: { walletId }
            });

            const message = `
*🔓 Unlock Wallet*

Please enter your passphrase to unlock the wallet:
\`${wallet.public_key}\`

*Note:* The passphrase is case-sensitive.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'wallet_security' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error unlocking wallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while unlocking the wallet.');
        }
    }

    async handleSetPassphrase(chatId, telegramId, walletId) {
        try {
            const wallet = await this.db.getWalletById(walletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Set user state to await passphrase
            this.userStates.set(telegramId, {
                state: 'awaiting_new_passphrase',
                data: { walletId }
            });

            const message = `
*🔑 Set Wallet Passphrase*

Please send your new passphrase.
It should be:
- At least 8 characters long
- Include numbers and special characters
- Be unique and memorable

⚠️ *IMPORTANT:*
- This passphrase will be required to unlock your wallet
- It cannot be recovered if lost
- Keep it in a secure location`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'wallet_security' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error setting up passphrase:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up passphrase.');
        }
    }

    async handlePassphraseInput(chatId, telegramId, passphrase) {
        try {
            const userState = this.userStates.get(telegramId);
            if (!userState) {
                throw new Error('No pending passphrase operation');
            }

            const { state, data } = userState;
            const { walletId } = data;

            if (!walletId) {
                throw new Error('No wallet specified for passphrase operation');
            }

            // Validate passphrase
            if (passphrase.length < 8) {
                throw new Error('Passphrase must be at least 8 characters long');
            }

            if (state === 'awaiting_new_passphrase') {
                // Hash the passphrase
                const passphraseHash = this.crypto.createHash('sha256').update(passphrase).digest('hex');

                // Update wallet with new passphrase
                await this.db.setWalletPassphrase(walletId, passphraseHash);

                const message = `
*✅ Passphrase Set Successfully*

Your wallet is now protected with a passphrase.
Remember to keep it safe!`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '◀️ Back to Security', callback_data: 'wallet_security' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (state === 'awaiting_passphrase') {
                // Hash the input passphrase
                const passphraseHash = this.crypto.createHash('sha256').update(passphrase).digest('hex');

                // Verify passphrase
                const isValid = await this.db.verifyWalletPassphrase(walletId, passphraseHash);
                if (!isValid) {
                    throw new Error('Invalid passphrase');
                }

                // Unlock the wallet
                await this.db.unlockWallet(walletId);

                const message = `
*✅ Wallet Unlocked Successfully*

Your wallet is now unlocked and ready to use.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                            { text: '⚡️ Trade', callback_data: 'trade' }
                        ],
                        [
                            { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

            // Clear the user state
            this.userStates.delete(telegramId);
        } catch (error) {
            console.error('Error handling passphrase:', error);
            await this.sendAndStoreMessage(chatId, `Sorry, ${error.message}. Please try again.`);
        }
    }

    async handleUnlockInput(chatId, telegramId, passphrase) {
        try {
            if (!this.pendingUnlockWalletId) {
                throw new Error('No pending wallet unlock');
            }

            const wallet = await this.db.getWalletById(this.pendingUnlockWalletId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            // Hash the input passphrase
            const passphraseHash = this.crypto.createHash('sha256').update(passphrase).digest('hex');

            // Verify passphrase
            const isValid = await this.db.verifyWalletPassphrase(this.pendingUnlockWalletId, passphraseHash);
            if (!isValid) {
                throw new Error('Invalid passphrase');
            }

            // Unlock the wallet
            await this.db.unlockWallet(this.pendingUnlockWalletId);

            const message = `
*✅ Wallet Unlocked Successfully*

*Wallet:* \`${wallet.public_key}\`
*Status:* 🔓 Unlocked

Your wallet is now unlocked and ready to use.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '⚡️ Trade', callback_data: 'trade' }
                    ],
                    [
                        { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            // Refresh main menu if this is the active wallet
            if (wallet.is_active) {
                await this.bot.showMainMenu(chatId, { ...wallet, is_locked: false });
            }

            // Clear the pending wallet ID
            this.pendingUnlockWalletId = null;
        } catch (error) {
            console.error('Error unlocking wallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, the passphrase is incorrect. Please try again.');
        }
    }

    async handleWalletPassphrase(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (wallets.length === 0) {
                const message = `
*⚠️ No Wallets Found*

Please create or import a wallet first to manage passphrases.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            const message = `
*🔑 Wallet Passphrase Management*

Manage passphrases for your wallets.
🔑 = Has Passphrase
⚠️ = No Passphrase

Select a wallet to manage its passphrase:`;

            // Group wallets into pairs for better display
            const walletButtons = [];
            for (let i = 0; i < wallets.length; i += 2) {
                const row = [];
                // First wallet in the pair
                const wallet1 = wallets[i];
                row.push({
                    text: `${wallet1.public_key.slice(0, 6)}...${wallet1.public_key.slice(-4)} ${wallet1.passphrase_hash ? '🔑' : '⚠️'}`,
                    callback_data: `passphrase_wallet_${wallet1.id}`
                });
                
                // Second wallet in the pair (if exists)
                if (i + 1 < wallets.length) {
                    const wallet2 = wallets[i + 1];
                    row.push({
                        text: `${wallet2.public_key.slice(0, 6)}...${wallet2.public_key.slice(-4)} ${wallet2.passphrase_hash ? '🔑' : '⚠️'}`,
                        callback_data: `passphrase_wallet_${wallet2.id}`
                    });
                }
                walletButtons.push(row);
            }

            const keyboard = {
                inline_keyboard: [
                    ...walletButtons,
                    [
                        { text: '◀️ Back to Wallet Management', callback_data: 'wallet_management' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error showing wallet passphrase options:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while accessing passphrase settings.');
        }
    }

    async handleSecuritySettings(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const settings = await this.db.getUserSettings(user.id);

            const message = `
*🔒 Security Settings*

Configure security features for your trading bot:

*Current Settings:*
• Two-Factor Authentication: ${settings?.tfa_enabled ? 'Enabled' : 'Disabled'}
• Wallet Encryption: Enabled
• Auto-Lock Timeout: ${settings?.auto_lock_timeout || 30} minutes
• Passphrase Protection: ${settings?.passphrase_protection ? 'Enabled' : 'Disabled'}

*Security Features:*
• Wallet locking and unlocking
• Encrypted private key storage
• Secure transaction signing
• Access control mechanisms`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔐 Wallet Security', callback_data: 'wallet_security' },
                        { text: '🔑 Passphrase Settings', callback_data: 'wallet_passphrase' }
                    ],
                    [
                        { text: '⏰ Auto-Lock Timer', callback_data: 'set_auto_lock_timer' },
                        { text: '🛡️ Advanced Security', callback_data: 'advanced_settings' }
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
            console.error('Error in handleSecuritySettings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading security settings.');
        }
    }

    // Handle security action callbacks - routes security-related callbacks to appropriate methods
    async handleSecurityActions(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const callbackData = ctx.callbackQuery.data;

        try {
            if (callbackData === 'wallet_security') {
                await this.handleWalletSecurity(chatId, telegramId);
                return;
            }

            if (callbackData === 'wallet_passphrase') {
                await this.handleWalletPassphrase(chatId, telegramId);
                return;
            }

            if (callbackData.startsWith('security_wallet_')) {
                const walletId = callbackData.replace('security_wallet_', '');
                await this.handleSecurityWallet(chatId, telegramId, walletId);
                return;
            }

            if (callbackData.startsWith('passphrase_wallet_')) {
                const walletId = callbackData.replace('passphrase_wallet_', '');
                await this.handleSetPassphrase(chatId, telegramId, walletId);
                return;
            }

            if (callbackData.startsWith('unlock_wallet_')) {
                const walletId = callbackData.replace('unlock_wallet_', '');
                await this.handleUnlockWallet(chatId, telegramId, walletId);
                return;
            }

            if (callbackData.startsWith('lock_wallet_')) {
                const walletId = callbackData.replace('lock_wallet_', '');
                await this.handleLockWallet(chatId, telegramId, walletId);
                return;
            }

            // If no specific handler found, log unhandled action
            console.warn('Unhandled security callback action:', callbackData);
            await this.sendAndStoreMessage(chatId, 'Sorry, this security action is not supported. Please try again.');

        } catch (error) {
            console.error('Error handling security action:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your security request. Please try again.');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }
}

module.exports = SecurityHandlers;
