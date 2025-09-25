class ExportHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        const FileExportService = require('../services/fileExportService');
        this.fileExportService = new FileExportService(config, db);
        this.lastMessageIds = new Map();
    }

    async handleExportCSV(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, 'No wallet found. Please create a wallet first.');
                return;
            }

            // Show processing message
            const processingMsg = await this.sendAndStoreMessage(chatId, '📊 *Generating CSV export...*\n\nPlease wait while we prepare your portfolio data...', {
                parse_mode: 'Markdown'
            });

            try {
                // Generate CSV file - pass user object instead of walletData
                const exportResult = await this.fileExportService.exportToCSV(user);

                if (exportResult.success) {
                    // Send the CSV file
                    await this.bot.sendDocument(chatId, exportResult.filePath, {
                        caption: `📊 *CSV Export Complete*\n\n*File Details:*\n- Format: CSV (Comma-separated values)\n- Size: ${(exportResult.size / 1024).toFixed(1)} KB\n- Rows: ${exportResult.rowCount}\n- Compatible with: Excel, Google Sheets\n\n*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\``,
                        parse_mode: 'Markdown'
                    });

                    // Send follow-up message with options
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📄 Export as JSON', callback_data: 'export_json' },
                                { text: '📋 Export as PDF', callback_data: 'export_pdf' }
                            ],
                            [
                                { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                                { text: '◀️ Back to Export', callback_data: 'export_portfolio' }
                            ]
                        ]
                    };

                    await this.sendAndStoreMessage(chatId, '✅ *CSV file sent successfully!*\n\nYou can now open this file in Excel, Google Sheets, or any spreadsheet application.', {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    throw new Error('Failed to generate CSV file');
                }
            } catch (exportError) {
                console.error('CSV export error:', exportError);
                await this.sendAndStoreMessage(chatId, '❌ *Export Failed*\n\nSorry, there was an error generating your CSV file. Please try again later.', {
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            console.error('Error exporting CSV:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while generating the CSV export.');
        }
    }

    async handleExportJSON(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, 'No wallet found. Please create a wallet first.');
                return;
            }

            // Show processing message
            await this.sendAndStoreMessage(chatId, '📄 *Generating JSON export...*\n\nProcessing portfolio data...', {
                parse_mode: 'Markdown'
            });

            try {
                // Generate JSON file - pass user object instead of walletData
                const exportResult = await this.fileExportService.exportToJSON(user);

                if (exportResult.success) {
                    // Send the JSON file
                    await this.bot.sendDocument(chatId, exportResult.filePath, {
                        caption: `📄 *JSON Export Complete*\n\n*File Details:*\n- Format: JSON (JavaScript Object Notation)\n- Size: ${(exportResult.size / 1024).toFixed(1)} KB\n- Holdings: ${exportResult.recordCount.holdings}\n- Transactions: ${exportResult.recordCount.transactions}\n- Use cases: APIs, data analysis, backups\n\n*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\``,
                        parse_mode: 'Markdown'
                    });

                    // Send follow-up message with options
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📊 Export as CSV', callback_data: 'export_csv' },
                                { text: '📋 Export as PDF', callback_data: 'export_pdf' }
                            ],
                            [
                                { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                                { text: '◀️ Back to Export', callback_data: 'export_portfolio' }
                            ]
                        ]
                    };

                    await this.sendAndStoreMessage(chatId, '✅ *JSON file sent successfully!*\n\nThis file contains your complete portfolio data in a structured format, perfect for data analysis or backup purposes.', {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    throw new Error('Failed to generate JSON file');
                }
            } catch (exportError) {
                console.error('JSON export error:', exportError);
                await this.sendAndStoreMessage(chatId, '❌ *Export Failed*\n\nSorry, there was an error generating your JSON file. Please try again later.', {
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            console.error('Error exporting JSON:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while generating the JSON export.');
        }
    }

    async handleExportPDF(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, 'No wallet found. Please create a wallet first.');
                return;
            }

            // Show processing message
            await this.sendAndStoreMessage(chatId, '📋 *Generating PDF report...*\n\nCreating formatted report...', {
                parse_mode: 'Markdown'
            });

            try {
                // Generate PDF file - pass user object instead of walletData
                const exportResult = await this.fileExportService.exportToPDF(user);

                if (exportResult.success) {
                    // Send the PDF file
                    await this.bot.sendDocument(chatId, exportResult.filePath, {
                        caption: `📋 *PDF Report Complete*\n\n*File Details:*\n- Format: PDF (Portable Document Format)\n- Size: ${(exportResult.size / 1024).toFixed(1)} KB\n- Pages: ${exportResult.pageCount}\n- Professional formatting with charts and analysis\n\n*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\``,
                        parse_mode: 'Markdown'
                    });

                    // Send follow-up message with options
                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '📊 Export as CSV', callback_data: 'export_csv' },
                                { text: '📄 Export as JSON', callback_data: 'export_json' }
                            ],
                            [
                                { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                                { text: '◀️ Back to Export', callback_data: 'export_portfolio' }
                            ]
                        ]
                    };

                    await this.sendAndStoreMessage(chatId, '✅ *PDF report sent successfully!*\n\nYour portfolio report is ready for viewing or printing.', {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    throw new Error('Failed to generate PDF file');
                }
            } catch (exportError) {
                console.error('PDF export error:', exportError);
                await this.sendAndStoreMessage(chatId, '❌ *Export Failed*\n\nSorry, there was an error generating your PDF report. Please try again later.', {
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            console.error('Error exporting PDF:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while generating the PDF report.');
        }
    }

    async handleExportEmail(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, 'No wallet found. Please create a wallet first.');
                return;
            }

            // Show processing message
            await this.sendAndStoreMessage(chatId, '📧 *Preparing email report...*', {
                parse_mode: 'Markdown'
            });

            await new Promise(resolve => setTimeout(resolve, 1700));

            // TODO: Implement actual email export functionality
            const message = `
*📧 Email Report Setup*

Your portfolio report can be sent directly to your email address.

*Email Options:*
- PDF attachment
- HTML formatted report
- CSV data file
- Weekly/Monthly schedule

*Current Status:*
- Email service: Not configured
- User email: Not set
- Report frequency: On-demand

*Security Features:*
- Encrypted transmission
- No sensitive keys included
- Secure attachment handling

*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\`

💡 *Note:* Email service configuration coming soon!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 CSV Export', callback_data: 'export_csv' },
                        { text: '📄 JSON Export', callback_data: 'export_json' }
                    ],
                    [
                        { text: '📋 PDF Report', callback_data: 'export_pdf' },
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' }
                    ],
                    [
                        { text: '◀️ Back to Export', callback_data: 'export_portfolio' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error setting up email export:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while setting up the email export.');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }
}

module.exports = ExportHandlers;
