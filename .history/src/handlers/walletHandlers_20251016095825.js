const crypto = require('crypto');
const bs58Module = require('bs58');
const bs58 = bs58Module.default || bs58Module;
const TelegramErrorHandler = require('../utils/telegramErrorHandler');

class WalletHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.lastMessageIds = new Map();
        this.lastWalletMessageId = null;
    }

    // Handle input messages for wallet-related waiting states
    async handleMessage(ctx, userState) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const message = ctx.message.text;

        try {
            // Get user state from bot if not provided
            if (!userState) {
                userState = this.bot.userStates.get(telegramId);
            }
            
            if (userState && userState.state) {
                switch (userState.state) {
                    case 'waiting_external_wallet': {
                        const walletAddress = message.trim();
                        if (!this.validateWalletAddress(walletAddress)) {
                            await this.sendAndStoreMessage(chatId, 'Invalid wallet address. Please enter a valid Solana address.');
                            return true;
                        }
                        await this.handleExternalWalletInput(chatId, telegramId, walletAddress);
                        return { handled: true, clearState: true };
                    }
                    case 'awaiting_private_key': {
                        if (message && message.trim().length > 0) {
                            await this.handlePrivateKeyImport(chatId, telegramId, message);
                        } else {
                            await this.sendAndStoreMessage(chatId, 'Please send a valid private key.');
                        }
                        return { handled: true, clearState: true };
                    }
                    default:
                        return false; // Not handled by wallet handlers
                }
            }
            return false;
        } catch (error) {
            console.error('Error in walletHandlers.handleMessage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your wallet input.');
            return true;
        }
    }

    async handleExternalWalletInput(chatId, telegramId, walletAddress) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            
            try {
                // Skip validation and directly add the wallet address
                await this.db.addExternalWallet(user.id, walletAddress);
                
                const message = `
*✅ External Wallet Added*

Wallet address: \`${walletAddress}\`

The wallet has been added to your monitored list. You can now enable copy trading for this wallet.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔄 Back to Copy Trade', callback_data: 'strategy_copy_trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

            } catch (error) {
                if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    await this.sendAndStoreMessage(chatId, 'This wallet address is already being monitored.');
                } else {
                    throw error;
                }
            }

        } catch (error) {
            console.error('Error handling external wallet input:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error adding the external wallet.');
        }
    }

    async handleCreateWallet(chatId, telegramId) {
    try {
        const wallet = await this.generateWallet();
        const encryptedKey = this.encryptPrivateKey(JSON.stringify(wallet.privateKey), telegramId);
        
        const user = await this.db.getUserByTelegramId(telegramId);
        await this.db.createWallet(user.id, wallet.publicKey, encryptedKey, {
            is_locked: false,
            is_active: true
        });

        // Create the base58 version for wallet import
        const privateKeyBase58 = bs58.encode(Uint8Array.from(wallet.privateKey));

        const message = `
*🎉 New Wallet Created!*

*Public Key:*

\`${wallet.publicKey}\`

*Private Key (Base58, for Phantom/Sollet/Backpack):*

\`${privateKeyBase58}\`

⚠️ *IMPORTANT:* 
- Use the Base58 key above to import into wallets like Phantom, Sollet, Backpack, etc.
- Save your private key securely
- Never share it with anyone
- It cannot be recovered if lost
- Keep it in a safe place`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ I\'ve Saved My Keys', callback_data: 'keys_saved' }
                ]
            ]
        };

        const sentMessage = await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        this.lastWalletMessageId = sentMessage.message_id;
    } catch (error) {
        console.error('Error creating wallet:', error);
        await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while creating your wallet.');
    }
}

    async handleImportWallet(chatId, telegramId) {
        try {
            this.bot.userStates.set(telegramId, {
                state: 'awaiting_private_key',
                data: {}
            });

            const message = `
*📝 Import Existing Wallet*

Please send your private key in one of these formats:

🔑 *Supported Formats:*
• **Base58** (87-88 characters) - Most common for Solana
• **Base64** (88 characters) - Standard encoding
• **Hex** (128 characters) - With or without 0x prefix
• **Array** ([n1,n2,n3...]) - 64 comma-separated numbers

📋 *Example formats:*
• Base58: \`4NwwCJ...\`
• Base64: \`dGVzdC1wcml2YXRlLWtleQ==\`
• Hex: \`0123456789abcdef...\` (128 chars)
• Hex with 0x: \`0x0123456789abcdef...\`
• Array: \`[123,45,67,89,...]\`

⚠️ *Security Tips:*
• Send the private key in a new message
• Delete the message after importing
• Never share your private key with anyone
• Make sure you're in a private chat

*To cancel:* Send /cancel`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '❌ Cancel', callback_data: 'wallet_management' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in import wallet setup:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up wallet import.');
        }
    }

    async handlePrivateKeyImport(chatId, telegramId, privateKeyInput) {
        try {
            if (!this.bot.userStates.get(telegramId) || this.bot.userStates.get(telegramId).state !== 'awaiting_private_key') {
                await this.sendAndStoreMessage(chatId, 'Please use the import wallet option from the wallet management menu.');
                return;
            }

            console.log('Importing private key...');
            const cleanInput = privateKeyInput.trim();
            console.log('Private key length:', cleanInput.length);
            console.log('Private key preview:', cleanInput.substring(0, 10) + '...');
            
            let privateKeyBuffer;
            let originalFormat = '';
            
            // 1. Try base58 format (most common for Solana private keys)
            if (!originalFormat && cleanInput.length >= 87 && cleanInput.length <= 88) {
                try {
                    console.log('Attempting base58 decode...');
                    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanInput)) {
                        privateKeyBuffer = bs58.decode(cleanInput);
                        console.log('Base58 decode successful, buffer length:', privateKeyBuffer.length);
                        if (privateKeyBuffer.length === 64) {
                            originalFormat = 'base58';
                            console.log('✅ Detected base58 format');
                        } else {
                            console.log('❌ Base58 decode successful but wrong length:', privateKeyBuffer.length);
                            privateKeyBuffer = null;
                        }
                    } else {
                        console.log('❌ String contains invalid base58 characters');
                    }
                } catch (e) {
                    console.log('❌ Base58 decode failed:', e.message);
                }
            }
            
            // 2. Try base64 format
            if (!originalFormat && cleanInput.length === 88) {
                try {
                    console.log('Attempting base64 decode...');
                    const testBuffer = Buffer.from(cleanInput, 'base64');
                    console.log('Base64 decode successful, buffer length:', testBuffer.length);
                    if (testBuffer.length === 64) {
                        privateKeyBuffer = testBuffer;
                        originalFormat = 'base64';
                        console.log('✅ Detected base64 format');
                    } else {
                        console.log('❌ Base64 decode successful but wrong length:', testBuffer.length);
                    }
                } catch (e) {
                    console.log('❌ Base64 decode failed:', e.message);
                }
            }
            
            // 3. Try hex format (128 characters for 64-byte private key)
            if (!originalFormat && /^[0-9a-fA-F]{128}$/.test(cleanInput)) {
                try {
                    console.log('Attempting hex decode...');
                    privateKeyBuffer = Buffer.from(cleanInput, 'hex');
                    originalFormat = 'hex';
                    console.log('✅ Detected hex format');
                } catch (e) {
                    console.log('❌ Hex decode failed:', e.message);
                }
            }
            
            // 4. Try hex format with 0x prefix
            if (!originalFormat && /^0x[0-9a-fA-F]{128}$/.test(cleanInput)) {
                try {
                    console.log('Attempting hex decode with 0x prefix...');
                    privateKeyBuffer = Buffer.from(cleanInput.slice(2), 'hex');
                    originalFormat = 'hex';
                    console.log('✅ Detected hex format with 0x prefix');
                } catch (e) {
                    console.log('❌ Hex decode with 0x prefix failed:', e.message);
                }
            }
            
            // 5. Try array format (comma separated numbers)
            if (!originalFormat && cleanInput.startsWith('[') && cleanInput.endsWith(']')) {
                try {
                    console.log('Attempting array format decode...');
                    const arrayString = cleanInput.slice(1, -1);
                    const numbers = arrayString.split(',').map(s => parseInt(s.trim()));
                    if (numbers.length === 64 && numbers.every(n => n >= 0 && n <= 255)) {
                        privateKeyBuffer = Buffer.from(numbers);
                        originalFormat = 'array';
                        console.log('✅ Detected array format');
                    } else {
                        console.log('❌ Array format invalid - length:', numbers.length);
                    }
                } catch (e) {
                    console.log('❌ Array format decode failed:', e.message);
                }
            }
            
            if (!originalFormat || !privateKeyBuffer) {
                console.log('❌ No valid format detected');
                throw new Error('Invalid private key format. Supported formats:\n• Base58 (87-88 characters)\n• Base64 (88 characters)\n• Hex (128 characters, with or without 0x prefix)\n• Array format [n1,n2,...]');
            }
            
            console.log('✅ Format detection successful:', originalFormat);
            console.log('Decoded private key buffer length:', privateKeyBuffer.length);
            
            if (privateKeyBuffer.length !== 64) {
                throw new Error(`Invalid private key length: ${privateKeyBuffer.length}, expected 64 bytes`);
            }
            
            const { Keypair } = require('@solana/web3.js');
            let keypair;
            try {
                keypair = Keypair.fromSecretKey(privateKeyBuffer);
            } catch (error) {
                throw new Error('Invalid private key: Could not create keypair');
            }
            
            const publicKey = keypair.publicKey.toString();
            
            console.log('✅ Successfully imported Solana wallet!');
            console.log('Public Key:', publicKey);
            console.log('Original format:', originalFormat);
            
            const encryptedKey = this.encryptPrivateKey(JSON.stringify(Array.from(privateKeyBuffer)), telegramId);
            const user = await this.db.getUserByTelegramId(telegramId);

            if (!user) {
                throw new Error('User not found. Please try again.');
            }
            
            try {
                await this.db.createWallet(user.id, publicKey, encryptedKey, {
                    is_locked: false,
                    is_active: true
                });
            } catch (error) {
                if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    const message = `
*⚠️ Wallet Already Exists*

A wallet with this public key is already imported:
\`${publicKey}\`

Would you like to switch to this wallet?`;

                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '✅ Switch to Wallet', callback_data: `switch_to_${publicKey}` },
                                { text: '❌ Cancel', callback_data: 'wallet_management' }
                            ]
                        ]
                    };

                    await this.sendAndStoreMessage(chatId, message, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                    return;
                }
                throw error;
            }

            this.bot.userStates.delete(telegramId);

            const message = `
*✅ Wallet Imported Successfully!*

*Public Key:*
\`${publicKey}\`

*Format Detected:* ${originalFormat.toUpperCase()}

Your wallet has been imported and is ready to use.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '⚡️ Trade', callback_data: 'trade' }
                    ],
                    [
                        { text: '🏠 Go to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            try {
                await this.bot.deleteMessage(chatId, this.lastMessageIds.get(chatId));
            } catch (error) {
                console.error('Error deleting private key message:', error);
            }
        } catch (error) {
            console.error('Error importing wallet:', error);
            let errorMessage = 'Sorry, there was an error importing your wallet.';
            if (error.message.includes('Invalid private key format')) {
                errorMessage = `❌ Invalid private key format.\n\nPlease ensure your private key is in one of these formats:\n• Base58 (87-88 characters)\n• Base64 (88 characters)\n• Hex (128 characters, with or without 0x prefix)\n• Array format [n1,n2,n3...]`;
            } else if (error.message.includes('Invalid private key length')) {
                errorMessage = '❌ Invalid private key length. Please check your private key and try again.';
            } else if (error.message.includes('Invalid private key')) {
                errorMessage = '❌ Invalid private key. Please check your private key and try again.';
            } else if (error.message.includes('User not found')) {
                errorMessage = '❌ User not found. Please try again or contact support.';
            } else {
                errorMessage = `❌ Error: ${error.message}`;
            }
            
            await this.sendAndStoreMessage(chatId, errorMessage);
            this.bot.userStates.delete(telegramId);
        }
    }

    async handleExportKeys(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (wallets.length === 0) {
                await this.sendAndStoreMessage(chatId, 'No wallets found to export.');
                return;
            }

            const message = `
*🔑 Export Wallet Keys*

Select a wallet to export its private key:

⚠️ *Security Warning:*
- Only export in a secure environment
- Never share your private keys
- Delete exported messages after saving`;

            const keyboard = {
                inline_keyboard: [
                    ...wallets.map(wallet => [
                        { 
                            text: `📱 ${wallet.public_key.slice(0, 8)}...${wallet.public_key.slice(-8)}${wallet.is_active ? ' (Active)' : ''}`, 
                            callback_data: `export_wallet_${wallet.id}` 
                        }
                    ]),
                    [
                        { text: '◀️ Back', callback_data: 'wallet_management' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleExportKeys:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading wallets.');
        }
    }

    async handleWalletExport(chatId, telegramId, walletId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallet = await this.db.getWalletById(walletId, user.id);

            if (!wallet) {
                await this.sendAndStoreMessage(chatId, 'Wallet not found.');
                return;
            }

            const message = `
*⚠️ Export Private Key Warning*

You are about to export the private key for:
\`${wallet.public_key}\`

*SECURITY RISKS:*
- Anyone with this key can access your funds
- Never share or store it insecurely
- This action cannot be undone

Are you sure you want to proceed?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Yes, Export Key', callback_data: `confirm_export_${walletId}` },
                        { text: '❌ Cancel', callback_data: 'export_keys' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleWalletExport:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing the export.');
        }
    }

    async handleConfirmExport(chatId, telegramId, walletId) {
    try {
        const user = await this.db.getUserByTelegramId(telegramId);
        const wallet = await this.db.getWalletById(walletId, user.id);

        if (!wallet) {
            await this.sendAndStoreMessage(chatId, 'Wallet not found.');
            return;
        }

        // Decrypt the private key
        const privateKeyStr = this.decryptPrivateKey(wallet.encrypted_private_key, telegramId);
        let privateKeyArray;

        try {
            privateKeyArray = JSON.parse(privateKeyStr);
        } catch (e) {
            const Buffer = require('buffer').Buffer;
            let buf = null;
            if (/^[A-Za-z0-9+/=]+$/.test(privateKeyStr) && privateKeyStr.length === 88) {
                buf = Buffer.from(privateKeyStr, 'base64');
            } else if (/^\d+(,\d+)*$/.test(privateKeyStr)) {
                buf = Buffer.from(privateKeyStr.split(',').map(n => parseInt(n.trim())));
            } else {
                throw new Error("Unknown private key format! Contact support.");
            }
            privateKeyArray = Array.from(buf);
        }

        if (!privateKeyArray || privateKeyArray.length !== 64) {
            throw new Error("Private key is not 64 bytes long. Cannot export.");
        }

        const privateKeyBase58 = bs58.encode(Uint8Array.from(privateKeyArray));

        const message = `
*🔑 Private Key Export*

*Wallet:* \`${wallet.public_key}\`

*Private Key (Base58, for Phantom/Sollet/Backpack):*
\`${privateKeyBase58}\`

*Advanced (Uint8Array/JSON, for developers):*
\`${JSON.stringify(privateKeyArray)}\`

⚠️ *IMPORTANT:*
- Save this key securely immediately
- Delete this message after saving
- Never share this key with anyone
- You are responsible for its security
`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🗑️ Delete This Message', callback_data: 'delete_export_message' }
                ],
                [
                    { text: '✅ I\'ve Saved It', callback_data: 'export_keys' }
                ]
            ]
        };

        const sentMessage = await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        // Optionally, auto-delete the message after 5 minutes
        setTimeout(async () => {
            try {
                await this.bot.deleteMessage(chatId, sentMessage.message_id);
            } catch (error) {
                console.error('Error auto-deleting export message:', error);
            }
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('Error in handleConfirmExport:', error);
        await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while exporting the key.');
    }
}

    async handleWalletSwitch(chatId, telegramId, walletId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            await this.db.deactivateAllWallets(user.id);
            await this.db.activateWallet(walletId, user.id);
            const wallet = await this.db.getWalletById(walletId, user.id);

            const message = `
*✅ Wallet Switched Successfully*

*Active Wallet:*
\`${wallet.public_key}\`

You can now trade with this wallet.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '⚡️ Trade', callback_data: 'trade' }
                    ],
                    [
                        { text: '🏠 Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleWalletSwitch:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while switching wallets.');
        }
    }

    async handleSwitchToWallet(chatId, telegramId, publicKey) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'User not found.');
                return;
            }

            const wallets = await this.db.getWalletsByUserId(user.id);
            const targetWallet = wallets.find(w => w.public_key === publicKey);
            
            if (!targetWallet) {
                await this.sendAndStoreMessage(chatId, 'Wallet not found.');
                return;
            }

            await this.db.setActiveWallet(user.id, targetWallet.id);

            const message = `
*✅ Wallet Activated Successfully!*

*Active Wallet:*
\`${targetWallet.public_key}\`

You can now use this wallet for trading.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '⚡️ Trade', callback_data: 'trade' }
                    ],
                    [
                        { text: '🏠 Go to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error switching to wallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error activating the wallet.');
        }
    }

    async handleWalletActions(ctx) {
    console.log('Entered handleWalletActions with callbackData:', callbackData);
    const chatId = ctx.chat.id;
    const telegramId = ctx.from.id.toString();
    const callbackData = ctx.callbackQuery.data;

    try {
        console.log('[DEBUG] Entered handleWalletActions with callbackData:', callbackData);

        if (callbackData === 'switch_wallet') {
            await this.handleSwitchWalletMenu(chatId, telegramId);
            return;
        }
        if (callbackData.startsWith('switch_wallet_')) {
            const walletId = callbackData.replace('switch_wallet_', '');
            console.log('[DEBUG] Handling switch_wallet_ for walletId:', walletId);
            await this.handleWalletSwitch(chatId, telegramId, walletId);
            return;
        }
        if (callbackData.startsWith('switch_to_')) {
            const walletId = callbackData.replace('switch_to_', '');
            if (walletId.length > 20) {
                await this.handleSwitchToWallet(chatId, telegramId, walletId);
            } else {
                await this.handleWalletSwitch(chatId, telegramId, walletId);
            }
            return;
        }
        if (callbackData === 'create_wallet') {
            await this.handleCreateWallet(chatId, telegramId);
            return;
        }
        if (callbackData === 'import_wallet') {
            await this.handleImportWallet(chatId, telegramId);
            return;
        }
        if (callbackData === 'export_keys') {
            await this.handleExportKeys(chatId, telegramId);
            return;
        }
        if (callbackData.startsWith('export_wallet_')) {
            const walletId = callbackData.replace('export_wallet_', '');
            await this.handleWalletExport(chatId, telegramId, walletId);
            return;
        }
        if (callbackData.startsWith('confirm_export_')) {
            const walletId = callbackData.replace('confirm_export_', '');
            await this.handleConfirmExport(chatId, telegramId, walletId);
            return;
        }
        if (callbackData.startsWith('security_wallet_') ||
            callbackData.startsWith('passphrase_wallet_') ||
            callbackData.startsWith('unlock_wallet_') ||
            callbackData.startsWith('lock_wallet_') ||
            callbackData === 'wallet_security' ||
            callbackData === 'wallet_passphrase') {
            console.log('Security-related wallet action should be handled by SecurityHandlers:', callbackData);
            return;
        }
        if (callbackData === 'delete_export_message') {
            try {
                const messageId = this.lastMessageIds.get(chatId);
                if (messageId) {
                    await this.bot.deleteMessage(chatId, messageId);
                }
            } catch (error) {
                console.error('Error deleting export message:', error);
            }
            return;
        }
        if (callbackData === 'keys_saved') {
            const message = `
*✅ Keys Saved Successfully!*

Your wallet is now ready to use. You can start trading or view your portfolio.

*What would you like to do next?*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '⚡️ Trade', callback_data: 'trade' }
                    ],
                    [
                        { text: '🏠 Go to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            try {
                if (this.lastWalletMessageId) {
                    await this.bot.deleteMessage(chatId, this.lastWalletMessageId);
                    this.lastWalletMessageId = null;
                }
            } catch (error) {
                console.error('Error deleting wallet creation message:', error);
            }
            return;
        }
        console.warn('Unhandled wallet action:', callbackData);
    } catch (error) {
        console.error('Error in handleWalletActions:', error);
        await this.sendAndStoreMessage(chatId, 'Sorry, there was an error processing your wallet request.');
    }
}

    validatePrivateKeyFormat(privateKey) {
        const cleaned = privateKey.trim();
        if (cleaned.length >= 87 && cleaned.length <= 88) {
            try {
                return /^[1-9A-HJ-NP-Za-km-z]+$/.test(cleaned);
            } catch {
                return false;
            }
        }
        return false;
    }

    validateWalletAddress(address) {
        try {
            const decoded = bs58.decode(address);
            return decoded.length === 32;
        } catch (error) {
            return false;
        }
    }

    async generateWallet() {
        const { Keypair } = require('@solana/web3.js');
        const keypair = Keypair.generate();
        return {
            publicKey: keypair.publicKey.toString(),
            privateKey: Array.from(keypair.secretKey)
        };
    }

    async handleSwitchWalletMenu(chatId, telegramId) {
    try {
        const user = await this.db.getUserByTelegramId(telegramId);
        if (!user) {
            await this.sendAndStoreMessage(chatId, 'User not found.');
            return;
        }
        const wallets = await this.db.getWalletsByUserId(user.id);

        if (!wallets || wallets.length === 0) {
            await this.sendAndStoreMessage(chatId, 'You have no wallets to switch.');
            return;
        }

        const message = `
*🔄 Switch Wallet*

Select a wallet to activate:`;

        const keyboard = {
            inline_keyboard: [
                ...wallets.map(wallet => [
                    {
                        text: `${wallet.public_key.slice(0, 8)}...${wallet.public_key.slice(-8)}${wallet.is_active ? ' (Active)' : ''}`,
                        callback_data: `switch_wallet_${wallet.id}`
                    }
                ]),
                [
                    { text: '◀️ Back', callback_data: 'wallet_management' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('Error in handleSwitchWalletMenu:', error);
        await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while showing your wallets.');
    }
}

    encryptPrivateKey(privateKey, userId) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decryptPrivateKey(encryptedKey, userId) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync(userId, 'salt', 32);
        const parts = encryptedKey.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        return await TelegramErrorHandler.sendMessage(this.bot, chatId, message, options, this.lastMessageIds);
    }
}

module.exports = WalletHandlers;