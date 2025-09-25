class TokenAnalysis {
    constructor() {
        this.riskLevels = {
            LOW: '🟢 Low Risk',
            MEDIUM: '🟡 Medium Risk',
            HIGH: '🔴 High Risk',
            EXTREME: '⛔️ Extreme Risk'
        };
        this.riskIcons = {
            danger: '⚠️',
            warning: '⚡️',
            info: 'ℹ️',
            success: '✅'
        };
    }

    formatNumber(num) {
        if (!num) return '0';
        
        // Convert to number if it's a string
        num = Number(num);
        
        // Handle very large numbers
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        
        // For smaller numbers, use standard formatting
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0
        }).format(num);
    }

    formatAddress(address) {
        if (!address) return 'N/A';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    formatPrice(price) {
        if (!price) return '$0.00';
        
        // Convert to number if it's a string
        price = Number(price);
        
        // Handle very large numbers
        if (price >= 1e12) return '$' + (price / 1e12).toFixed(2) + 'T';
        if (price >= 1e9) return '$' + (price / 1e9).toFixed(2) + 'B';
        if (price >= 1e6) return '$' + (price / 1e6).toFixed(2) + 'M';
        if (price >= 1e3) return '$' + (price / 1e3).toFixed(2) + 'K';
        
        // For smaller numbers, use standard currency formatting
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(price);
    }

    formatPercentage(num) {
        if (!num) return '0%';
        // Convert to number if it's a string
        num = Number(num);
        return `${this.formatNumber(num)}%`;
    }

    getRiskLevel(score) {
        if (score === undefined || score === null) return this.riskLevels.LOW;
        // RugCheck visual score: lower numbers indicate safer tokens (e.g., 1/100 shown as "Good").
        // Adjust the mapping accordingly so our textual level matches RugCheck UI semantics.
        // 0-20   => Low Risk
        // 21-40  => Medium Risk
        // 41-60  => High Risk
        // 61-100 => Extreme Risk
        if (score <= 20) return this.riskLevels.LOW;
        if (score <= 40) return this.riskLevels.MEDIUM;
        if (score <= 60) return this.riskLevels.HIGH;
        return this.riskLevels.EXTREME;
    }

    formatRiskFactor(risk) {
        if (!risk) return '';
        const icon = this.riskIcons[risk.level] || 'ℹ️';
        return `${icon} ${risk.name}: ${risk.description}`;
    }

    async formatTokenInfo(tokenData) {
        try {
            const {
                mint,
                creator,
                creatorBalance,
                token,
                tokenMeta,
                topHolders,
                risks = [],
                score = 0,
                score_normalised = 0,
                markets = [],
                totalHolders = 0,
                price = 0,
                totalMarketLiquidity = 0,
                graphInsidersDetected = 0,
                insiderNetworks = []
            } = tokenData;

            // Calculate total percentage held by top holders
            const totalTopHolderPercentage = topHolders?.reduce((sum, holder) => sum + holder.pct, 0) || 0;

            // Get the first market's LP data if available
            const lpData = markets[0]?.lp;
            
            // Enhanced supply calculation with better accuracy
            const rawSupply = token?.supply ? Number(token.supply) : 0;
            const decimals = token?.decimals || 9;
            const actualSupply = rawSupply / Math.pow(10, decimals);
            
            // Round supply to match UI display (989M instead of 988.80M)
            const displaySupply = Math.round(actualSupply / 1000000) * 1000000; // Round to nearest million
            
            // Enhanced price calculation - prefer explicit USD token price fields
            // Avoid accidentally using the quote asset price (e.g., SOL ~$199) as the token price
            let accuratePrice = 0;
            const priceCandidates = [
                token?.priceUsd,
                tokenData.priceUsd,
                markets?.[0]?.priceUsd,
                lpData?.priceUsd,
                lpData?.basePriceUsd,
                lpData?.tokenPriceUsd,
                price
            ].filter((p) => typeof p === 'number' && isFinite(p) && p > 0);

            if (priceCandidates.length > 0) {
                accuratePrice = priceCandidates[0];
            } else if (lpData?.basePrice && (lpData?.baseMint === mint || lpData?.baseSymbol === tokenMeta?.symbol)) {
                // As a last resort, if LP base refers to the token itself, use its base price
                accuratePrice = lpData.basePrice;
            }
            
            // Enhanced market cap calculation
            let marketCap = 0;
            if (accuratePrice && actualSupply) {
                marketCap = actualSupply * accuratePrice;
            }
            
            // Enhanced liquidity calculation - aggregate from all sources
            let totalLiquidity = 0;
            let liquidityBreakdown = [];
            
            // Add LP locked liquidity
            if (lpData?.lpLockedUSD) {
                totalLiquidity += lpData.lpLockedUSD;
                liquidityBreakdown.push(`LP: ${this.formatPrice(lpData.lpLockedUSD)}`);
            }
            
            // Add total market liquidity
            if (totalMarketLiquidity) {
                totalLiquidity += totalMarketLiquidity;
                liquidityBreakdown.push(`Market: ${this.formatPrice(totalMarketLiquidity)}`);
            }
            
            // Add stable liquidity if available
            if (tokenData.totalStableLiquidity) {
                totalLiquidity += tokenData.totalStableLiquidity;
                liquidityBreakdown.push(`Stable: ${this.formatPrice(tokenData.totalStableLiquidity)}`);
            }
            
            // Calculate circulating supply (exclude locked tokens)
            let circulatingSupply = actualSupply;
            if (lpData?.lpLocked) {
                const lockedTokens = lpData.lpLocked / Math.pow(10, decimals);
                circulatingSupply = Math.max(0, actualSupply - lockedTokens);
            }
            
            // Calculate fully diluted market cap
            const fullyDilutedMarketCap = accuratePrice ? (actualSupply * accuratePrice) : 0;
            
            // Calculate circulating market cap
            const circulatingMarketCap = accuratePrice ? (circulatingSupply * accuratePrice) : 0;

            // Enhanced risk analysis
            const riskWarnings = [];
            
            // Check for high holder concentration
            if (totalTopHolderPercentage > 80) {
                riskWarnings.push(`🔴 **HIGH CONCENTRATION**: ${this.formatPercentage(totalTopHolderPercentage)} of supply held by top holders`);
            } else if (totalTopHolderPercentage > 60) {
                riskWarnings.push(`🟡 **MEDIUM CONCENTRATION**: ${this.formatPercentage(totalTopHolderPercentage)} of supply held by top holders`);
            }
            
            // Check for insider networks
            if (graphInsidersDetected > 0) {
                riskWarnings.push(`🔴 **INSIDER NETWORKS**: ${graphInsidersDetected} insider networks detected`);
            }
            
            // Check for low holder count
            if (totalHolders < 100) {
                riskWarnings.push(`🟡 **LOW HOLDER COUNT**: Only ${totalHolders} holders`);
            }
            
            // Check for creator selling
            if (!creatorBalance) {
                riskWarnings.push(`🔴 **CREATOR SOLD**: Creator has sold their tokens`);
            }
            
            // Check for active mint authority
            if (token?.mintAuthority) {
                riskWarnings.push(`🔴 **ACTIVE MINT**: Mint authority is still active - can create more tokens`);
            }

            // Format the message with enhanced risk analysis and accurate market data
            const message = `🔹 *${this.escapeMarkdown(tokenMeta?.name || 'Unknown Token')}* (${this.escapeMarkdown(tokenMeta?.symbol || 'N/A')})
📍 \`${mint}\`

⚠️ *Risk Analysis*
• Risk Score: ${score_normalised}/100
• Risk Level: ${this.getRiskLevel(score_normalised)}
${risks?.length > 0 ? `• Risk Factors: ${risks.length} identified` : ''}
${risks?.length > 0 ? risks.map(risk => `  ${this.formatRiskFactor(risk)}`).join('\n') : ''}

📊 *Token Overview*
• Supply: ${this.formatNumber(displaySupply)}
• Token Price: ${this.formatPrice(accuratePrice)}
• Market Cap: ${this.formatPrice(marketCap)}
• Circulating Supply: ${this.formatNumber(circulatingSupply)}
• Circulating Market Cap: ${this.formatPrice(circulatingMarketCap)}
• Mint Authority: ${token?.mintAuthority ? '✅ Active' : '❌ Disabled'}
• Decimals: ${decimals}


👥 *Top Holders*
• Total Concentration: ${this.formatPercentage(totalTopHolderPercentage)}
${topHolders?.slice(0, 3).map((holder, index) => 
    `${index + 1}\. ${this.formatAddress(holder.address)} • ${this.formatPercentage(holder.pct)}`
).join('\n') || 'No holder data available'}

📝 *Metadata*
• Name: ${this.escapeMarkdown(tokenMeta?.name || 'N/A')}
• Symbol: ${this.escapeMarkdown(tokenMeta?.symbol || 'N/A')}
• URI: ${tokenMeta?.uri ? '✅ Available' : '❌ Not Available'}
• Update Authority: ${this.formatAddress(tokenMeta?.updateAuthority)}`;

            return message;
        } catch (error) {
            console.error('Error formatting token info:', error);
            // Return a simple fallback message
            return `🔹 *Token Analysis*
📍 \`${tokenData.mint || 'Unknown'}\`

Unable to format full token information.
Basic data available but formatting failed.`;
        }
    }

    escapeMarkdown(text) {
        if (!text) return '';
        // Escape special markdown characters
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    getActionButtons(mint) {
        return {
            inline_keyboard: [
                [
                    { text: '🛒 Buy Now', callback_data: `buy_token_${mint}` },
                    // { text: '📊 More Info', callback_data: `token_details_${mint}` }
                ],
                [
                    { text: '🔄 Check Another Token', callback_data: 'buy_token' },
                    { text: '◀️ Back to Trade Menu', callback_data: 'trade' }
                ]
            ]
        };
    }
}

module.exports = TokenAnalysis; 