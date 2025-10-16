const { PublicKey, Connection, LAMPORTS_PER_SOL, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');

// --- Helper: Fetch and cache Solana token list
let solanaTokenList = null;
async function getSolanaTokenList() {
    if (!solanaTokenList) {
        try {
            const resp = await axios.get('https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json');
            solanaTokenList = resp.data.tokens;
        } catch (e) {
            solanaTokenList = [];
        }
    }
    return solanaTokenList;
}

// --- Helper: Fetch Dexscreener token info
async function getTokenInfoFromDexscreener(mint) {
    try {
        const resp = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        if (resp.data && resp.data.pairs && resp.data.pairs.length > 0) {
            const token = resp.data.pairs[0].baseToken;
            return {
                symbol: token.symbol || mint.slice(0, 6),
                name: token.name || "",
                logoURI: token.logoURI || ""
            };
        }
    } catch (e) {
        // fail silently
    }
    return { symbol: mint.slice(0, 6), name: "", logoURI: "" };
}

class WithdrawHandlers {
        constructor(bot, db, messageManager, solanaConfig, botManager) {
        this.bot = bot;
        this.db = db;
        this.messageManager = messageManager;
        this.solanaConfig = solanaConfig;
        this.botManager = botManager; // save the bot manager reference
    }   

    // === Step 1: Start - list all tokens ===
    async handleWithdrawStart(chatId, telegramId) {
        const user = await this.db.getUserByTelegramId(telegramId);
        const wallet = await this.db.getActiveWallet(user.id);
        if (!wallet) {
            await this.messageManager.sendAndStoreMessage(chatId, 'No active wallet found. Please try again.');
            return;
        }

        let tokens = [];
        try {
            const connection = new Connection(this.solanaConfig.rpcUrl);
            const solBalance = await connection.getBalance(new PublicKey(wallet.public_key)) / LAMPORTS_PER_SOL;
            tokens.push({
                symbol: 'SOL',
                name: 'Solana',
                mint: 'So11111111111111111111111111111111111111112',
                amount: solBalance,
                decimals: 9
            });

            // Fetch SPL tokens using Helius or fallback to RPC
            const heliusApiKey = this.solanaConfig.heliusApiKey;
            let splTokens = [];
            if (heliusApiKey) {
                const url = `https://api.helius.xyz/v0/addresses/${wallet.public_key}/tokens?api-key=${heliusApiKey}`;
                const { data } = await axios.get(url);
                splTokens = (data.tokens || []).map(t => ({
                    symbol: t.tokenInfo?.symbol || '',
                    name: t.tokenInfo?.name || '',
                    mint: t.mint,
                    amount: Number(t.amount) / Math.pow(10, t.decimals),
                    decimals: t.decimals
                }));
            } else {
                const parsed = await connection.getParsedTokenAccountsByOwner(
                    new PublicKey(wallet.public_key),
                    { programId: TOKEN_PROGRAM_ID }
                );
                splTokens = parsed.value
                    .filter(i => i.account.data.parsed.info.tokenAmount.uiAmount > 0)
                    .map(i => ({
                        symbol: '',
                        name: '',
                        mint: i.account.data.parsed.info.mint,
                        amount: i.account.data.parsed.info.tokenAmount.uiAmount,
                        decimals: i.account.data.parsed.info.tokenAmount.decimals
                    }));
            }

            // Cross-reference with Solana Token List and Dexscreener
            const tokenList = await getSolanaTokenList();
            for (let i = 0; i < splTokens.length; i++) {
                let t = splTokens[i];
                let found = tokenList.find(token => token.address === t.mint);
                if (!found) {
                    // Fallback: fetch from Dexscreener if not in token list.
                    found = await getTokenInfoFromDexscreener(t.mint);
                }
                splTokens[i] = {
                    ...t,
                    symbol: found?.symbol || t.symbol || t.mint.slice(0,6),
                    name: found?.name || t.name || '',
                    logoURI: found?.logoURI
                };
            }

            tokens = tokens.concat(splTokens);
        } catch (err) {
            console.error("Withdraw: Token scan error", err);
            await this.messageManager.sendAndStoreMessage(chatId, 'Error scanning wallet tokens. Please try again later.');
            return;
        }

        if (tokens.length === 0) {
            await this.messageManager.sendAndStoreMessage(chatId, 'No tokens found in your wallet.');
            return;
        }

        // User-friendly button labels
        const keyboard = {
            inline_keyboard: tokens.slice(0,10).map(t => [
                { text: `${t.symbol}${t.name && t.symbol !== t.name ? ' ('+t.name+')' : ''}: ${t.amount}`, callback_data: `withdraw_token_${t.mint}` }
            ])
        };

        this.bot.userStates.set(telegramId, { state: 'awaiting_withdraw_token', tokens });

        await this.messageManager.sendAndStoreMessage(
            chatId,
            'Which token do you want to withdraw?\n\nTap a token below:',
            { reply_markup: keyboard }
        );
    }

    // === Step 2: Handle Token Selection ===
    async handleWithdrawToken(chatId, telegramId, tokenMint) {
        const userState = this.bot.userStates.get(telegramId);
        const token = (userState.tokens || []).find(t => t.mint === tokenMint);
        if (!token) {
            await this.messageManager.sendAndStoreMessage(chatId, 'Token not found. Please start again.');
            this.bot.userStates.delete(telegramId);
            return;
        }
        this.bot.userStates.set(telegramId, { state: 'awaiting_withdraw_amount', token });
        await this.messageManager.sendAndStoreMessage(
            chatId,
            `How much ${token.symbol} do you want to withdraw? (You have ${token.amount})`
        );
    }

    // === Step 3: Handle Amount Input ===
    async handleWithdrawAmount(chatId, telegramId, message) {
        const userState = this.bot.userStates.get(telegramId);
        const token = userState?.token;
        if (!token) {
            await this.messageManager.sendAndStoreMessage(chatId, 'Session expired. Start again.');
            this.bot.userStates.delete(telegramId);
            return;
        }
        const amount = parseFloat(message.replace(/,/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > token.amount) {
            await this.messageManager.sendAndStoreMessage(
                chatId,
                `❌ Invalid amount. Enter a number between 0 and ${token.amount} ${token.symbol}`
            );
            return;
        }
        this.bot.userStates.set(telegramId, { state: 'awaiting_withdraw_address', token, amount });
        await this.messageManager.sendAndStoreMessage(chatId, 'Enter the Solana address to withdraw to:');
    }

    // === Step 4: Handle Address Input ===
    async handleWithdrawAddress(chatId, telegramId, message) {
        const userState = this.bot.userStates.get(telegramId);
        const { token, amount } = userState || {};
        if (!token || !amount) {
            await this.messageManager.sendAndStoreMessage(chatId, 'Session expired. Start again.');
            this.bot.userStates.delete(telegramId);
            return;
        }
        const address = message.trim();
        let pubkey;
        try {
            pubkey = new PublicKey(address);
            if (!PublicKey.isOnCurve(pubkey)) throw new Error();
        } catch {
            await this.messageManager.sendAndStoreMessage(
                chatId,
                '❌ Invalid Solana address. Please enter a valid address.'
            );
            return;
        }
        this.bot.userStates.set(telegramId, { state: 'awaiting_withdraw_confirm', token, amount, address });
        await this.messageManager.sendAndStoreMessage(chatId,
            `✅ You are about to withdraw *${amount} ${token.symbol}* to address:\n\`${address}\`\n\nReply with "yes" to confirm or "cancel" to abort.`,
            { parse_mode: 'Markdown' }
        );
    }

    // === Step 5: Confirm and Process Withdrawal ===
    async handleWithdrawConfirm(chatId, telegramId, message) {
        const userState = this.bot.userStates.get(telegramId);
        const { token, amount, address } = userState || {};
        if (!token || !amount || !address) {
            await this.messageManager.sendAndStoreMessage(chatId, 'Session expired. Start again.');
            this.bot.userStates.delete(telegramId);
            return;
        }
        if (/^cancel$/i.test(message.trim())) {
            await this.messageManager.sendAndStoreMessage(chatId, 'Withdrawal cancelled.');
            this.bot.userStates.delete(telegramId);
            return;
        }
        if (!/^yes$/i.test(message.trim())) {
            await this.messageManager.sendAndStoreMessage(chatId, '❓ Reply "yes" to confirm or "cancel" to abort.');
            return;
        }
        // Withdraw
        const user = await this.db.getUserByTelegramId(telegramId);
        const wallet = await this.db.getActiveWallet(user.id);
        if (!wallet) {
            await this.messageManager.sendAndStoreMessage(chatId, 'No active wallet found.');
            this.bot.userStates.delete(telegramId);
            return;
        }

        // Inside handleWithdrawConfirm(chatId, telegramId, message)

        let privateKey;
        try {
            // Step 1: Get the wallet's owner from the DB (needed to retrieve the decryption key)
            const user = await this.db.getUserById(wallet.user_id); 
            
            // Step 2: Determine the decryption key (e.g., the user's Telegram ID, if that was used for encryption)
            // NOTE: This assumes the key was encrypted using the user's Telegram ID, which is a structural match.
            const decryptionKey = user.telegram_id.toString();

            if (!wallet.encrypted_private_key) {
                // Case 1: Key is stored raw (HIGHLY INSECURE, but handles compatibility if encryption was bypassed)
                privateKey = wallet.private_key; 
            } else {
                // Case 2: Key is encrypted. Call the utility function provided by the BotManager.
                // This assumes the decryption utility is correctly exposed via this.botManager.
                privateKey = this.botManager.decryptPrivateKey(
                    wallet.encrypted_private_key, 
                    decryptionKey
                );
            }
        } catch (err) {
            console.error("CRITICAL: Decryption/Access error:", err);
            // Delete the potentially stuck user state
            this.bot.userStates.delete(telegramId);
            
            await this.messageManager.sendAndStoreMessage(
                chatId, 
                '❌ Decryption Failed. Unable to access wallet for withdrawal. Please check your wallet status or contact support.'
            );
            return;
        }
        
        // The rest of your transaction logic continues here (Lines 258 onwards)
        const connection = new Connection(this.solanaConfig.rpcUrl);
        const senderKeypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));
        const toPubkey = new PublicKey(address);
        // ... (rest of your transaction logic)

        let signature;
        try {
            if (token.symbol === 'SOL') {
                // SOL transfer
                const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
                const tx = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: senderKeypair.publicKey,
                        toPubkey,
                        lamports
                    })
                );
                signature = await connection.sendTransaction(tx, [senderKeypair]);
                await connection.confirmTransaction(signature, 'confirmed');
            } else {
                // SPL transfer with ATA creation if needed
                const mint = new PublicKey(token.mint);
                const fromTokenAccount = await getAssociatedTokenAddress(mint, senderKeypair.publicKey);
                const toTokenAccount = await getAssociatedTokenAddress(mint, toPubkey);
                const decimals = token.decimals || 6;

                const tx = new Transaction();
                // Create destination ATA if it doesn't exist
                const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);
                if (!toTokenAccountInfo) {
                    tx.add(
                        createAssociatedTokenAccountInstruction(
                            senderKeypair.publicKey,
                            toTokenAccount,
                            toPubkey,
                            mint
                        )
                    );
                }
                tx.add(
                    createTransferInstruction(
                        fromTokenAccount,
                        toTokenAccount,
                        senderKeypair.publicKey,
                        Math.floor(amount * Math.pow(10, decimals))
                    )
                );
                signature = await connection.sendTransaction(tx, [senderKeypair]);
                await connection.confirmTransaction(signature, 'confirmed');
            }
        } catch (err) {
            console.error("SPL Withdrawal error:", err);
            await this.messageManager.sendAndStoreMessage(
                chatId,
                `❌ Withdrawal failed: ${err.message}`
            );
            this.bot.userStates.delete(telegramId);
            return;
        }

        // Log withdrawal in DB (optional)
        await this.db.insertWithdrawal({
            user_id: user.id,
            from_address: senderKeypair.publicKey.toString(),
            to_address: toPubkey.toString(),
            amount,
            token: token.symbol,
            token_mint: token.mint,
            tx_signature: signature,
            status: 'success',
            created_at: new Date()
        });

        // Notify user
        await this.messageManager.sendAndStoreMessage(
            chatId,
            `✅ Withdrawal successful!\n\n*${amount} ${token.symbol}* sent to \`${address}\`\n\n[View on Solana Explorer](https://solscan.io/tx/${signature})`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );

        // Optionally notify admin
        if (this.solanaConfig.adminChatId) {
            await this.bot.sendMessage(
                this.solanaConfig.adminChatId,
                `User ${user.username || telegramId} withdrew ${amount} ${token.symbol} to ${address}\nTx: ${signature}`
            );
        }

        this.bot.userStates.delete(telegramId);
    }

    // === Main message/callback router for withdrawal states ===
    async handleMessage(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const userState = this.bot.userStates.get(telegramId);

        if (!userState?.state) return false;

        switch (userState.state) {
            case 'awaiting_withdraw_token':
                if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('withdraw_token_')) {
                    const mint = ctx.callbackQuery.data.replace('withdraw_token_', '');
                    await this.handleWithdrawToken(chatId, telegramId, mint);
                    return true;
                }
                return false;
            case 'awaiting_withdraw_amount':
                await this.handleWithdrawAmount(chatId, telegramId, ctx.message.text);
                return true;
            case 'awaiting_withdraw_address':
                await this.handleWithdrawAddress(chatId, telegramId, ctx.message.text);
                return true;
            case 'awaiting_withdraw_confirm':
                await this.handleWithdrawConfirm(chatId, telegramId, ctx.message.text);
                return true;
            default:
                return false;
        }
    }

    // For callback_query routing from main bot
    async handleCallbackQuery(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('withdraw_token_')) {
            const mint = ctx.callbackQuery.data.replace('withdraw_token_', '');
            await this.handleWithdrawToken(chatId, telegramId, mint);
            return true;
        }
        return false;
    }
}

module.exports = WithdrawHandlers;