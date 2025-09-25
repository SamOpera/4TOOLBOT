const winston = require('winston');
const DatabaseManager = require('../modules/database');
const { Connection, PublicKey } = require('@solana/web3.js');

class FeeService {
    constructor(config) {
        this.config = config;
        this.db = new DatabaseManager();
        this.connection = new Connection(config.rpcEndpoint);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
    }

    async collectTradeFee(tradeId, tradeValue) {
        try {
            const feeConfig = await this.db.getFeeConfiguration();
            const totalFee = tradeValue * (feeConfig.fee_percentage / 100);
            const teamShare = totalFee * (feeConfig.team_wallet_percentage / 100);
            const holdersShare = totalFee * (feeConfig.holders_percentage / 100);

            await this.db.createFee({
                trade_id: tradeId,
                total_fee: totalFee,
                team_wallet_share: teamShare,
                holders_share: holdersShare
            });

            // TODO: Implement actual fee transfer to team wallet
            // This would involve interacting with Solana program

            return {
                success: true,
                message: 'Trade fee collected successfully',
                data: {
                    total_fee: totalFee,
                    team_share: teamShare,
                    holders_share: holdersShare
                }
            };
        } catch (error) {
            this.logger.error(`Error collecting trade fee: ${error.message}`);
            throw error;
        }
    }

    async takeSnapshot() {
        try {
            const feeConfig = await this.db.getFeeConfig();
            const eligibleWallets = await this.getEligibleWallets(feeConfig.min_4tool_balance);
            
            // Create new snapshot
            const snapshotId = await this.db.createSnapshot({
                eligible_wallets: JSON.stringify(eligibleWallets)
            });

            return {
                success: true,
                message: 'Snapshot taken successfully',
                data: {
                    snapshot_id: snapshotId,
                    eligible_wallets_count: eligibleWallets.length
                }
            };
        } catch (error) {
            this.logger.error(`Error taking snapshot: ${error.message}`);
            throw error;
        }
    }

    async distributeFees(epochId) {
        try {
            const snapshot = await this.db.getSnapshot(epochId);
            if (!snapshot) {
                throw new Error('Snapshot not found');
            }

            const eligibleWallets = JSON.parse(snapshot.eligible_wallets);
            const totalHoldersShare = await this.calculateTotalHoldersShare(epochId);
            const sharePerWallet = totalHoldersShare / eligibleWallets.length;

            const distributionResults = [];
            for (const wallet of eligibleWallets) {
                if (await this.canClaimRewards(wallet)) {
                    await this.distributeToWallet(wallet, sharePerWallet);
                    await this.db.createClaim(wallet, epochId);
                    distributionResults.push({
                        wallet,
                        amount: sharePerWallet,
                        status: 'success'
                    });
                } else {
                    distributionResults.push({
                        wallet,
                        amount: 0,
                        status: 'skipped',
                        reason: 'Not eligible for claims'
                    });
                }
            }

            return {
                success: true,
                message: 'Fee distribution completed',
                data: {
                    total_distributed: totalHoldersShare,
                    distributions: distributionResults
                }
            };
        } catch (error) {
            this.logger.error(`Error distributing fees: ${error.message}`);
            throw error;
        }
    }

    async getEligibleWallets(minBalance) {
        try {
            // TODO: Implement logic to fetch wallets with minimum 4TOOL balance
            // This would involve querying the Solana program
            return [];
        } catch (error) {
            this.logger.error(`Error getting eligible wallets: ${error.message}`);
            throw error;
        }
    }

    async calculateTotalHoldersShare(epochId) {
        try {
            const fees = await this.db.getFeesForEpoch(epochId);
            return fees.reduce((total, fee) => total + fee.holders_share, 0);
        } catch (error) {
            this.logger.error(`Error calculating total holders share: ${error.message}`);
            throw error;
        }
    }

    async canClaimRewards(wallet) {
        try {
            // Check if wallet is blacklisted
            const isBlacklisted = await this.db.isWalletBlacklisted(wallet);
            if (isBlacklisted) {
                return false;
            }

            // Check if wallet has claimed in current epoch
            const hasClaimed = await this.db.hasClaimedInEpoch(wallet);
            if (hasClaimed) {
                return false;
            }

            // Check cooldown period
            const lastClaim = await this.db.getLastClaim(wallet);
            if (lastClaim) {
                const feeConfig = await this.db.getFeeConfig();
                const cooldownPeriod = feeConfig.claim_cooldown_hours * 60 * 60 * 1000; // Convert to milliseconds
                if (Date.now() - lastClaim.claimed_at < cooldownPeriod) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.logger.error(`Error checking claim eligibility: ${error.message}`);
            throw error;
        }
    }

    async distributeToWallet(wallet, amount) {
        try {
            // TODO: Implement actual distribution logic
            // This would involve interacting with Solana program
            return {
                success: true,
                message: 'Distribution successful',
                data: {
                    wallet,
                    amount
                }
            };
        } catch (error) {
            this.logger.error(`Error distributing to wallet: ${error.message}`);
            throw error;
        }
    }

    async blacklistWallet(wallet, reason) {
        try {
            await this.db.addBlacklistedWallet(wallet, reason);
            return {
                success: true,
                message: 'Wallet blacklisted successfully'
            };
        } catch (error) {
            this.logger.error(`Error blacklisting wallet: ${error.message}`);
            throw error;
        }
    }

    async removeFromBlacklist(wallet) {
        try {
            await this.db.removeBlacklistedWallet(wallet);
            return {
                success: true,
                message: 'Wallet removed from blacklist successfully'
            };
        } catch (error) {
            this.logger.error(`Error removing wallet from blacklist: ${error.message}`);
            throw error;
        }
    }

    async updateFeeConfiguration(config) {
        try {
            await this.db.updateFeeConfig(config);
            return {
                success: true,
                message: 'Fee configuration updated successfully'
            };
        } catch (error) {
            this.logger.error(`Error updating fee configuration: ${error.message}`);
            throw error;
        }
    }
}

module.exports = FeeService; 