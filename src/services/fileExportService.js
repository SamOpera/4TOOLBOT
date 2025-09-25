const fs = require('fs-extra');
const path = require('path');
const { Parser } = require('json2csv');
const pdf = require('html-pdf-node');

class FileExportService {
    constructor(config, db) {
        this.config = config;
        this.db = db;
        this.exportDir = path.join(__dirname, '../../exports');
        this.ensureExportDirExists();
    }

    async ensureExportDirExists() {
        try {
            await fs.ensureDir(this.exportDir);
        } catch (error) {
            console.error('Error creating export directory:', error);
        }
    }

    /**
     * Generate real portfolio data for export using the same logic as portfolioHandlers
     * @param {Object} user - User object with id
     * @returns {Object} Formatted portfolio data with real holdings and transactions
     */
    async generatePortfolioData(user) {
        const timestamp = new Date().toISOString();
        
        try {
            // Get user's wallets
            const wallets = await this.db.getWalletsByUserId(user.id);
            if (!wallets || wallets.length === 0) {
                return this.generateEmptyPortfolioData(user, timestamp);
            }

            // Import required services
            const PortfolioService = require('./portfolioService');
            const TokenDataService = require('./tokenDataService');
            const { PortfolioOperations } = require('../database/operations');
            
            const portfolioService = new PortfolioService(this.config);
            const tokenDataService = new TokenDataService(this.config);
            const portfolioOps = new PortfolioOperations(this.db);

            let allHoldings = {};
            let solTotal = 0;
            let solPrice = 0;
            let recentTrades = [];

            // Fetch SOL price (Dexscreener)
            try {
                const { fetchSolUsdPrice } = require('../utils/solPrice');
                solPrice = await fetchSolUsdPrice();
            } catch (e) {
                console.error('Error fetching SOL price:', e);
            }

            // Process all wallets
            for (const wallet of wallets) {
                const walletBalance = await portfolioService.getWalletBalance(wallet.public_key);
                solTotal += walletBalance.sol;

                // Process SPL tokens
                for (const t of walletBalance.tokens) {
                    if (!allHoldings[t.mint]) {
                        let symbol = t.mint.slice(0, 6) + '...' + t.mint.slice(-4);
                        let price = 0;
                        let name = `Token (${t.mint.slice(0, 8)}...)`;
                        
                        try {
                            // Try Jupiter first
                            const axios = require('axios');
                            const url = `https://lite-api.jup.ag/tokens/v2/search?query=${t.mint}`;
                            const resp = await axios.get(url, { headers: { 'Accept': 'application/json' } });
                            
                            if (Array.isArray(resp.data) && resp.data.length > 0) {
                                // First try to find exact match
                                let meta = resp.data.find(token => 
                                    token.id === t.mint || 
                                    token.address === t.mint || 
                                    token.mint === t.mint
                                );
                                
                                // If no exact match, try partial match or use first result
                                if (!meta) {
                                    meta = resp.data.find(token => 
                                        token.id?.toLowerCase().includes(t.mint.toLowerCase()) ||
                                        token.address?.toLowerCase().includes(t.mint.toLowerCase()) ||
                                        token.mint?.toLowerCase().includes(t.mint.toLowerCase())
                                    ) || resp.data[0];
                                }
                                
                                if (meta) {
                                    if (meta.symbol && meta.symbol !== 'UNKNOWN') symbol = meta.symbol;
                                    if (meta.name && meta.name !== 'Unknown Token') name = meta.name;
                                    if (meta.usdPrice) price = meta.usdPrice;
                                }
                            }
                            
                            // If Jupiter didn't provide good data, try DexScreener
                            if (symbol === t.mint.slice(0, 6) + '...' + t.mint.slice(-4) || name === `Token (${t.mint.slice(0, 8)}...)`) {
                                const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${t.mint}`;
                                const dexscreenerResp = await axios.get(dexscreenerUrl, { 
                                    headers: { 'Accept': 'application/json' },
                                    timeout: 5000 
                                });
                                
                                if (dexscreenerResp.data && dexscreenerResp.data.pairs && dexscreenerResp.data.pairs.length > 0) {
                                    const pair = dexscreenerResp.data.pairs[0];
                                    if (pair.baseToken?.symbol) symbol = pair.baseToken.symbol;
                                    if (pair.baseToken?.name) name = pair.baseToken.name;
                                    if (pair.priceUsd) price = pair.priceUsd;
                                }
                            }
                        } catch (e) {
                            console.error(`Error fetching token data for ${t.mint}:`, e);
                        }
                        
                        allHoldings[t.mint] = { 
                            amount: 0, 
                            symbol, 
                            name,
                            price,
                            mint: t.mint 
                        };
                    }
                    allHoldings[t.mint].amount += t.amount;
                }

                // Fetch recent trades for this wallet
                if (portfolioService.getRecentWalletTrades) {
                    try {
                        const trades = await portfolioService.getRecentWalletTrades(wallet.public_key);
                        if (Array.isArray(trades)) {
                            recentTrades.push(...trades.map(tr => ({...tr, wallet: wallet.public_key})));
                        }
                    } catch (e) {
                        console.error(`Error fetching trades for wallet ${wallet.public_key}:`, e);
                    }
                }
            }

            // Add SOL as a holding
            allHoldings['SOL'] = { 
                amount: solTotal, 
                symbol: 'SOL', 
                name: 'Solana', 
                price: solPrice,
                mint: 'SOL' 
            };

            // Calculate total value
            const totalValue = Object.values(allHoldings).reduce((sum, h) => sum + (h.amount * (h.price || 0)), 0);

            // Save snapshot for 24h change
            await portfolioOps.savePortfolioSnapshot(user.id, totalValue);

            // Fetch value 24h ago and calculate change
            let change24h = 0;
            const value24hAgo = await portfolioOps.getPortfolioValue24hAgo(user.id);
            if (value24hAgo && value24hAgo > 0) {
                change24h = ((totalValue - value24hAgo) / value24hAgo) * 100;
            }

            // Get trade statistics
            const stats = this.db.getTradeStatsByUser ? this.db.getTradeStatsByUser(user.id) : {
                total_trades: 0, 
                buy_trades: 0, 
                sell_trades: 0, 
                total_pnl: 0 
            };

            // Format holdings for export
            const holdings = Object.values(allHoldings)
                .filter(h => h.amount > 0)
                .map(h => ({
                    token: h.symbol,
                    name: h.name,
                    amount: h.amount,
                    price: h.price || 0,
                    value: (h.amount * (h.price || 0)),
                    mint: h.mint,
                    change24h: 0 // TODO: Implement 24h change calculation per token
                }));

            // Format transactions for export
            const transactions = recentTrades
                .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
                .slice(0, 50) // Limit to last 50 transactions
                .map(tx => ({
                    date: new Date(tx.timestamp || Date.now()).toISOString(),
                    type: tx.side || tx.type || 'TRADE',
                    token: tx.token || tx.token_address || tx.symbol || 'Unknown',
                    amount: tx.amount || 0,
                    price: tx.price || 0,
                    hash: tx.hash || tx.signature || 'N/A',
                    wallet: tx.wallet || 'Unknown'
                }));

            const portfolioData = {
                wallet: {
                    address: wallets[0]?.public_key || 'Unknown',
                    balance: totalValue,
                    created: wallets[0]?.created_at || timestamp,
                    totalWallets: wallets.length
                },
                summary: {
                    totalValue: totalValue,
                    totalTokens: holdings.length,
                    change24h: change24h,
                    change7d: 0, // TODO: Implement 7d change
                    change30d: 0, // TODO: Implement 30d change
                    totalTrades: stats.total_trades,
                    buyTrades: stats.buy_trades,
                    sellTrades: stats.sell_trades,
                    totalPnl: stats.total_pnl || 0
                },
                holdings: holdings,
                transactions: transactions,
                wallets: wallets.map(w => ({
                    address: w.public_key,
                    created: w.created_at,
                    isActive: w.is_active
                })),
                exportInfo: {
                    timestamp,
                    version: '1.0.0',
                    generated_by: '4T-Bot Portfolio Export',
                    user_id: user.id
                }
            };

            return portfolioData;

        } catch (error) {
            console.error('Error generating portfolio data:', error);
            return this.generateEmptyPortfolioData(user, timestamp);
        }
    }

    /**
     * Generate empty portfolio data when no wallets are found
     */
    generateEmptyPortfolioData(user, timestamp) {
        return {
            wallet: {
                address: 'No wallet found',
                balance: 0.00,
                created: timestamp,
                totalWallets: 0
            },
            summary: {
                totalValue: 0.00,
                totalTokens: 0,
                change24h: 0.00,
                change7d: 0.00,
                change30d: 0.00,
                totalTrades: 0,
                buyTrades: 0,
                sellTrades: 0,
                totalPnl: 0
            },
            holdings: [],
            transactions: [],
            wallets: [],
            exportInfo: {
                timestamp,
                version: '1.0.0',
                generated_by: '4T-Bot Portfolio Export',
                user_id: user.id
            }
        };
    }

    /**
     * Export portfolio data as CSV
     * @param {Object} user - User object
     * @returns {Object} Export result with file path
     */
    async exportToCSV(user) {
        try {
            const portfolioData = await this.generatePortfolioData(user);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `portfolio_${user.id}_${timestamp}.csv`;
            const filePath = path.join(this.exportDir, fileName);

            // Prepare data for CSV export
            const csvData = [];

            // Add summary information
            csvData.push({
                Type: 'Summary',
                Item: 'Wallet Address',
                Value: portfolioData.wallet.address,
                Details: ''
            });
            csvData.push({
                Type: 'Summary',
                Item: 'Total Value (USD)',
                Value: portfolioData.summary.totalValue.toFixed(2),
                Details: ''
            });
            csvData.push({
                Type: 'Summary',
                Item: 'Total Tokens',
                Value: portfolioData.summary.totalTokens,
                Details: ''
            });
            csvData.push({
                Type: 'Summary',
                Item: '24h Change (%)',
                Value: portfolioData.summary.change24h.toFixed(2),
                Details: ''
            });
            csvData.push({
                Type: 'Summary',
                Item: 'Total Trades',
                Value: portfolioData.summary.totalTrades,
                Details: ''
            });
            csvData.push({
                Type: 'Summary',
                Item: 'Total P&L',
                Value: portfolioData.summary.totalPnl.toFixed(2),
                Details: ''
            });

            // Add holdings
            if (portfolioData.holdings.length > 0) {
                portfolioData.holdings.forEach(holding => {
                    csvData.push({
                        Type: 'Holding',
                        Item: holding.name || holding.token,
                        Value: holding.amount,
                        Details: `Price: $${holding.price.toFixed(6)}, Value: $${holding.value.toFixed(2)}, Symbol: ${holding.symbol}`
                    });
                });
            } else {
                csvData.push({
                    Type: 'Holding',
                    Item: 'No holdings found',
                    Value: 0,
                    Details: 'Portfolio is empty'
                });
            }

            // Add transactions
            if (portfolioData.transactions.length > 0) {
                portfolioData.transactions.forEach(tx => {
                    csvData.push({
                        Type: 'Transaction',
                        Item: `${tx.type} ${tx.token}`,
                        Value: tx.amount,
                        Details: `Price: $${tx.price}, Date: ${tx.date}, Hash: ${tx.hash}`
                    });
                });
            } else {
                csvData.push({
                    Type: 'Transaction',
                    Item: 'No transactions found',
                    Value: 0,
                    Details: 'No trading history'
                });
            }

            // Convert to CSV
            const parser = new Parser({
                fields: ['Type', 'Item', 'Value', 'Details']
            });
            const csv = parser.parse(csvData);

            // Write to file
            await fs.writeFile(filePath, csv);

            return {
                success: true,
                filePath,
                fileName,
                size: (await fs.stat(filePath)).size,
                rowCount: csvData.length
            };

        } catch (error) {
            console.error('Error exporting to CSV:', error);
            throw new Error('Failed to generate CSV export');
        }
    }

    /**
     * Export portfolio data as JSON
     * @param {Object} user - User object
     * @returns {Object} Export result with file path
     */
    async exportToJSON(user) {
        try {
            const portfolioData = await this.generatePortfolioData(user);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `portfolio_${user.id}_${timestamp}.json`;
            const filePath = path.join(this.exportDir, fileName);

            // Write to file with pretty formatting
            await fs.writeFile(filePath, JSON.stringify(portfolioData, null, 2));

            return {
                success: true,
                filePath,
                fileName,
                size: (await fs.stat(filePath)).size,
                recordCount: {
                    holdings: portfolioData.holdings.length,
                    transactions: portfolioData.transactions.length,
                    wallets: portfolioData.wallets.length
                }
            };

        } catch (error) {
            console.error('Error exporting to JSON:', error);
            throw new Error('Failed to generate JSON export');
        }
    }

    /**
     * Export portfolio data as PDF
     * @param {Object} user - User object
     * @returns {Object} Export result with file path
     */
    async exportToPDF(user) {
        try {
            const portfolioData = await this.generatePortfolioData(user);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `portfolio_${user.id}_${timestamp}.pdf`;
            const filePath = path.join(this.exportDir, fileName);

            // Generate HTML content for PDF
            const htmlContent = this.generatePDFHTML(portfolioData);

            // PDF generation options
            const options = {
                format: 'A4',
                border: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            };

            // Generate PDF
            const file = { content: htmlContent };
            const pdfBuffer = await pdf.generatePdf(file, options);

            // Write to file
            await fs.writeFile(filePath, pdfBuffer);

            return {
                success: true,
                filePath,
                fileName,
                size: (await fs.stat(filePath)).size,
                pageCount: 1
            };

        } catch (error) {
            console.error('Error exporting to PDF:', error);
            throw new Error('Failed to generate PDF export');
        }
    }

    /**
     * Generate HTML content for PDF export
     * @param {Object} portfolioData - Portfolio data
     * @returns {String} HTML content
     */
    generatePDFHTML(portfolioData) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>4T-Bot Portfolio Report</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    line-height: 1.6;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #4CAF50;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .header h1 {
                    color: #4CAF50;
                    margin: 0;
                    font-size: 28px;
                }
                .header p {
                    margin: 5px 0;
                    color: #666;
                }
                .section {
                    margin-bottom: 30px;
                    padding: 20px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background-color: #f9f9f9;
                }
                .section h2 {
                    color: #4CAF50;
                    border-bottom: 2px solid #4CAF50;
                    padding-bottom: 10px;
                    margin-top: 0;
                }
                .wallet-info {
                    background-color: #e8f5e8;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                }
                .wallet-address {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    word-break: break-all;
                    background-color: white;
                    padding: 10px;
                    border-radius: 3px;
                    border: 1px solid #ddd;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .summary-item {
                    background-color: white;
                    padding: 15px;
                    border-radius: 5px;
                    border: 1px solid #ddd;
                    text-align: center;
                }
                .summary-item h3 {
                    margin: 0 0 10px 0;
                    color: #4CAF50;
                    font-size: 18px;
                }
                .summary-item p {
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                }
                .table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }
                .table th, .table td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }
                .table th {
                    background-color: #4CAF50;
                    color: white;
                    font-weight: bold;
                }
                .table tr:nth-child(even) {
                    background-color: #f2f2f2;
                }
                .empty-state {
                    text-align: center;
                    padding: 40px;
                    color: #666;
                    font-style: italic;
                }
                .footer {
                    margin-top: 50px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    padding-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🚀 4T-Bot Portfolio Report</h1>
                <p>Generated on ${new Date(portfolioData.exportInfo.timestamp).toLocaleDateString()}</p>
                <p>Wallet Analysis & Trading Summary</p>
            </div>

            <div class="section">
                <h2>💼 Wallet Information</h2>
                <div class="wallet-info">
                    <strong>Wallet Address:</strong>
                    <div class="wallet-address">${portfolioData.wallet.address}</div>
                    <div style="margin-top: 10px;">
                        <strong>Created:</strong> ${new Date(portfolioData.wallet.created).toLocaleDateString()}
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>📊 Portfolio Summary</h2>
                <div class="summary-grid">
                    <div class="summary-item">
                        <h3>Total Value</h3>
                        <p>$${portfolioData.summary.totalValue.toFixed(2)}</p>
                    </div>
                    <div class="summary-item">
                        <h3>Total Tokens</h3>
                        <p>${portfolioData.summary.totalTokens}</p>
                    </div>
                    <div class="summary-item">
                        <h3>24h Change</h3>
                        <p>${portfolioData.summary.change24h.toFixed(2)}%</p>
                    </div>
                    <div class="summary-item">
                        <h3>7d Change</h3>
                        <p>${portfolioData.summary.change7d.toFixed(2)}%</p>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>💎 Current Holdings</h2>
                ${portfolioData.holdings.length > 0 ? `
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Token</th>
                                <th>Amount</th>
                                <th>Price</th>
                                <th>Value</th>
                                <th>24h Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${portfolioData.holdings.map(holding => `
                                <tr>
                                    <td><strong>${holding.name || holding.token}</strong></td>
                                    <td>${holding.amount}</td>
                                    <td>$${holding.price.toFixed(2)}</td>
                                    <td>$${holding.value.toFixed(2)}</td>
                                    <td style="color: ${holding.change24h >= 0 ? '#4CAF50' : '#f44336'}">
                                        ${holding.change24h >= 0 ? '+' : ''}${holding.change24h.toFixed(2)}%
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="empty-state">
                        <p>📭 No holdings found</p>
                        <p>Your portfolio is currently empty. Start trading to see your holdings here!</p>
                    </div>
                `}
            </div>

            <div class="section">
                <h2>📈 Recent Transactions</h2>
                ${portfolioData.transactions.length > 0 ? `
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Token</th>
                                <th>Amount</th>
                                <th>Price</th>
                                <th>Transaction Hash</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${portfolioData.transactions.map(tx => `
                                <tr>
                                    <td>${new Date(tx.date).toLocaleDateString()}</td>
                                    <td style="color: ${tx.type === 'BUY' ? '#4CAF50' : '#f44336'}">
                                        <strong>${tx.type}</strong>
                                    </td>
                                    <td>${tx.token}</td>
                                    <td>${tx.amount}</td>
                                    <td>$${tx.price.toFixed(2)}</td>
                                    <td style="font-family: monospace; font-size: 10px;">
                                        ${tx.hash.slice(0, 20)}...
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div class="empty-state">
                        <p>📊 No transactions found</p>
                        <p>No trading history available for this wallet.</p>
                    </div>
                `}
            </div>

            <div class="footer">
                <p>Generated by 4T-Bot v${portfolioData.exportInfo.version}</p>
                <p>This report was generated automatically and reflects data at the time of export.</p>
                <p>For real-time data, please check your portfolio directly in the bot.</p>
            </div>
        </body>
        </html>
        `;

        return html;
    }

    /**
     * Get file download URL for Telegram
     * @param {String} filePath - Path to the exported file
     * @returns {String} File path for Telegram bot to send
     */
    getFileForTelegram(filePath) {
        return filePath;
    }

    /**
     * Clean up old export files (optional)
     * @param {Number} maxAgeHours - Maximum age of files to keep (default: 24 hours)
     */
    async cleanupOldFiles(maxAgeHours = 24) {
        try {
            const files = await fs.readdir(this.exportDir);
            const now = new Date();
            const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds

            for (const file of files) {
                const filePath = path.join(this.exportDir, file);
                const stats = await fs.stat(filePath);
                const fileAge = now - stats.mtime;

                if (fileAge > maxAge) {
                    await fs.unlink(filePath);
                    console.log(`Cleaned up old export file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Error cleaning up old files:', error);
        }
    }
}

module.exports = FileExportService;
