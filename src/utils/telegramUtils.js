const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

class TelegramUtils {
    /**
     * Base58 decode utility function
     */
    static base58Decode(str) {
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const base = alphabet.length;
        
        let decoded = 0n;
        let multi = 1n;
        
        // Decode base58 string to BigInt
        for (let i = str.length - 1; i >= 0; i--) {
            const char = str[i];
            const index = alphabet.indexOf(char);
            if (index === -1) {
                throw new Error(`Invalid base58 character: ${char}`);
            }
            decoded += BigInt(index) * multi;
            multi *= BigInt(base);
        }
        
        // Convert BigInt to hex string
        let hex = decoded.toString(16);
        
        // Pad with leading zeros if necessary
        if (hex.length % 2) {
            hex = '0' + hex;
        }
        
        // Handle leading zeros in original base58
        let leadingZeros = 0;
        for (let i = 0; i < str.length && str[i] === '1'; i++) {
            leadingZeros++;
        }
        
        // Convert to buffer
        const buffer = Buffer.from(hex, 'hex');
        
        // Add leading zero bytes
        if (leadingZeros > 0) {
            const result = Buffer.alloc(buffer.length + leadingZeros);
            buffer.copy(result, leadingZeros);
            return result;
        }
        
        return buffer;
    }

    /**
     * Generate a new Solana wallet
     */
    static generateWallet() {
        const keypair = Keypair.generate();
        return {
            publicKey: keypair.publicKey.toString(),
            privateKey: Buffer.from(keypair.secretKey).toString('base64')
        };
    }

    /**
     * Encrypt private key with password
     */
    static encryptPrivateKey(privateKey, password) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Store IV with encrypted data
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt private key with password
     */
    static decryptPrivateKey(encryptedData, password) {
        try {
            const [ivHex, encrypted] = encryptedData.split(':');
            if (!ivHex || !encrypted) {
                throw new Error('Invalid encrypted data format');
            }

            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(password, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Error decrypting private key:', error);
            throw new Error('Failed to decrypt private key');
        }
    }

    /**
     * Validate wallet address format
     */
    static validateWalletAddress(address) {
        try {
            // Check if it's a valid base58 string
            const decoded = bs58.decode(address);
            // Solana addresses are 32 bytes
            return decoded.length === 32;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get strategy icon by type
     */
    static getStrategyIcon(type) {
        const iconMap = {
            'volume_spike': '📈',
            'dip_buy': '📉',
            'narrative': '🔄',
            'momentum': '📊',
            'volatility': '📈',
            'copy_trade': '👥',
            'portfolio_rebalance': '⚖️',
            'narrative_rotation': '🔄',
            'event_trigger': '🎯',
            'risk_management': '🛡️'
        };
        return iconMap[type] || '⚙️';
    }

    /**
     * Format strategy name
     */
    static formatStrategyName(type) {
        const nameMap = {
            'volume_spike': 'Volume Spike',
            'dip_buy': 'Dip Buy',
            'narrative': 'Narrative',
            'momentum': 'Momentum',
            'volatility': 'Volatility',
            'copy_trade': 'Copy Trade',
            'portfolio_rebalance': 'Portfolio Rebalance',
            'narrative_rotation': 'Narrative Rotation',
            'event_trigger': 'Event Trigger',
            'risk_management': 'Risk Management'
        };
        return nameMap[type] || 'Strategy';
    }

    /**
     * Get default strategy parameters
     */
    static getDefaultStrategyParams(strategyType) {
        const defaults = {
            volume_spike: {
                minVolumeIncrease: 200,
                timeWindow: 3600,
                minLiquidity: 50000,
                maxSlippage: 1
            },
            dip_buy: {
                minPriceDrop: 10,
                timeWindow: 3600,
                minLiquidity: 50000,
                maxSlippage: 1
            },
            narrative: {
                categories: ['meme', 'gaming', 'ai'],
                maxPositionSize: 0.2,
                minLiquidity: 50000,
                maxSlippage: 1,
                minSocialScore: 0.6,
                minDeveloperScore: 0.5
            },
            momentum: {
                lookbackPeriod: 86400,
                topPerformers: 5,
                momentumThreshold: 0.1,
                volumeThreshold: 2,
                maxPositionSize: 0.2,
                minLiquidity: 100000,
                maxSlippage: 1,
                rsiOverbought: 70,
                rsiOversold: 30,
                macdSignalPeriod: 9
            },
            volatility: {
                volatilityThreshold: 10,
                timeWindow: 3600,
                meanReversionPeriod: 24,
                maxPositionSize: 0.1,
                minLiquidity: 50000,
                profitTarget: 0.05,
                stopLoss: 0.03
            },
            copy_trade: {
                targetWallets: [],
                minTradeSize: 0.1,
                maxTradeSize: 10,
                minSuccessRate: 0.7,
                maxSlippage: 1,
                delaySeconds: 2,
                maxPositions: 5,
                minLiquidity: 50000,
                minHoldTime: 3600,
                maxDrawdown: 0.1,
                minProfitFactor: 2
            }
        };

        return defaults[strategyType] || {};
    }

    /**
     * Check if strategy is active
     */
    static isStrategyActive(strategies, strategyType) {
        return strategies.some(strategy => {
            try {
                const data = JSON.parse(strategy.strategy_json);
                return data.type === strategyType && data.params && data.params.isActive === true;
            } catch (e) {
                return false;
            }
        });
    }
}

module.exports = TelegramUtils;
