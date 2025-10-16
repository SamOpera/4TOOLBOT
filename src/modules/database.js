const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

class DatabaseManager {
    constructor() {
        this.db = new Database(path.join(__dirname, '../../db/4tool.db'));
        this.initializeTables();
    }

    initializeTables() {
        // Users table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Wallets table with is_active flag and locked status
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                public_key TEXT NOT NULL,
                encrypted_private_key TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 0,
                is_locked BOOLEAN DEFAULT 1,
                passphrase_hash TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, public_key)
            )
        `);

        // Strategies table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS strategies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                strategy_json TEXT NOT NULL,
                active BOOLEAN DEFAULT true,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Tokens tracked table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tokens_tracked (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_address TEXT NOT NULL,
                buy_price REAL,
                tp_price REAL,
                sl_price REAL,
                trailing_sl BOOLEAN DEFAULT false,
                active BOOLEAN DEFAULT true,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Trades table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_address TEXT NOT NULL,
                amount REAL NOT NULL,
                price REAL NOT NULL,
                side TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Fees table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS fees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER NOT NULL,
                total_fee REAL NOT NULL,
                team_wallet_share REAL NOT NULL,
                holders_share REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (trade_id) REFERENCES trades(id)
            )
        `);

        // Snapshots table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                epoch_id INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                eligible_wallets TEXT NOT NULL
            )
        `);

        // Claims table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS claims (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                epoch_id INTEGER NOT NULL,
                claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Rules table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT NOT NULL,
                is_active BOOLEAN DEFAULT true,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0,
                last_check TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        // Rule conditions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rule_conditions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                condition_type TEXT NOT NULL,
                condition_value TEXT NOT NULL,
                operator TEXT DEFAULT '>=',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id)
            )
        `);

        // Rule settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rule_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                notifications_enabled BOOLEAN DEFAULT true,
                alerts_enabled BOOLEAN DEFAULT true,
                notification_frequency TEXT DEFAULT 'immediate',
                alert_threshold INTEGER DEFAULT 100,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id)
            )
        `);

        // Rule history table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rule_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                token_address TEXT NOT NULL,
                token_name TEXT,
                trigger_price REAL,
                trigger_volume REAL,
                trigger_market_cap REAL,
                trigger_liquidity REAL,
                status TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id)
            )
        `);

        // Rule criteria table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rule_criteria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                criteria_type TEXT NOT NULL,
                operator TEXT NOT NULL,
                value TEXT NOT NULL,
                secondary_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
            )
        `);

        // Rule metrics table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rule_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                metric_type TEXT NOT NULL,
                threshold REAL NOT NULL,
                timeframe TEXT NOT NULL,
                direction TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
            )
        `);

        // External wallets table for copy trading
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS external_wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                wallet_address TEXT NOT NULL,
                name TEXT,
                is_active BOOLEAN DEFAULT true,
                last_trade_time TIMESTAMP,
                total_trades INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, wallet_address)
            )
        `);

        // User settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                max_trade_amount REAL,
                min_trade_amount REAL,
                max_daily_trades INTEGER,
                auto_confirm_trades BOOLEAN DEFAULT false,
                notify_on_trade BOOLEAN DEFAULT true,
                default_stop_loss REAL DEFAULT 10.0,
                default_take_profit REAL DEFAULT 20.0,
                trailing_stop_enabled BOOLEAN DEFAULT false,
                trailing_stop_threshold REAL DEFAULT 5.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id)
            )
        `);

        // Portfolio snapshots table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // --- Sold tokens table for manual management duplicate prevention ---
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sold_tokens (
                user_id INTEGER,
                token_address TEXT,
                sold_at INTEGER,
                PRIMARY KEY (user_id, token_address)
            )
        `);

        // Run migrations
        this.runMigrations();
    }

    runMigrations() {
        try {
            // Add name column to external_wallets if it doesn't exist
            this.db.exec(`
                ALTER TABLE external_wallets 
                ADD COLUMN name TEXT;
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column name')) {
                console.error('Migration error:', error);
            }
        }

        try {
            // Add total_trades column to external_wallets if it doesn't exist
            this.db.exec(`
                ALTER TABLE external_wallets 
                ADD COLUMN total_trades INTEGER DEFAULT 0;
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column name')) {
                console.error('Migration error:', error);
            }
        }

        try {
            // Add autonomous_enabled column to user_settings if it doesn't exist
            this.db.exec(`
                ALTER TABLE user_settings 
                ADD COLUMN autonomous_enabled BOOLEAN DEFAULT false;
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column name')) {
                console.error('Migration error:', error);
            }
        }

        try {
            // Add auto_confirm column to user_settings if it doesn't exist
            this.db.exec(`
                ALTER TABLE user_settings 
                ADD COLUMN auto_confirm BOOLEAN DEFAULT false;
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column name')) {
                console.error('Migration error:', error);
            }
        }

        try {
            // Add default_slippage column to user_settings if it doesn't exist
            this.db.exec(`
                ALTER TABLE user_settings 
                ADD COLUMN default_slippage REAL DEFAULT 1.0;
            `);
        } catch (error) {
            // Column might already exist, which is fine
            if (!error.message.includes('duplicate column name')) {
                console.error('Migration error:', error);
            }
        }

        // Add notification columns
        const notificationColumns = [
            'notify_on_pnl BOOLEAN DEFAULT true',
            'notify_on_rule_trigger BOOLEAN DEFAULT true',
            'notify_on_market_alerts BOOLEAN DEFAULT true',
            'notify_on_price_alerts BOOLEAN DEFAULT true',
            'notify_on_system_updates BOOLEAN DEFAULT true'
        ];

        notificationColumns.forEach(column => {
            try {
                this.db.exec(`ALTER TABLE user_settings ADD COLUMN ${column};`);
            } catch (error) {
                // Column might already exist, which is fine
                if (!error.message.includes('duplicate column name')) {
                    console.error('Migration error:', error);
                }
            }
        });
    }

    // User operations
    async createUser(telegramId) {
        // Make user creation idempotent to avoid UNIQUE constraint errors on telegram_id
        const stmt = this.db.prepare('INSERT OR IGNORE INTO users (telegram_id) VALUES (?)');
        stmt.run(telegramId);
        return this.getUserByTelegramId(telegramId);
    }

    async getUserByTelegramId(telegramId) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?');
        return stmt.get(telegramId);
    }

    async getAllUsers() {
        const stmt = this.db.prepare('SELECT * FROM users');
        return stmt.all();
    }

    // Wallet operations
    async createWallet(userId, publicKey, encryptedPrivateKey, options = {}) {
        // Default options
        const isActive = options.is_active !== undefined ? options.is_active : 
            !(await this.getActiveWallet(userId)); // Set as active if no other active wallet exists
        const isLocked = options.is_locked !== undefined ? options.is_locked : false;
        
        const stmt = this.db.prepare(`
            INSERT INTO wallets (user_id, public_key, encrypted_private_key, is_active, is_locked)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, publicKey, encryptedPrivateKey, isActive ? 1 : 0, isLocked ? 1 : 0);
    }

    async getWalletsByUserId(userId) {
        const stmt = this.db.prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY is_active DESC, created_at DESC');
        return stmt.all(userId);
    }

    async getActiveWallet(userId) {
        const stmt = this.db.prepare('SELECT * FROM wallets WHERE user_id = ? AND is_active = 1');
        return stmt.get(userId);
    }

    async getUserById(userId) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(userId);
    }

    async getWalletById(walletId, userId = null) {
        if (userId) {
            // If userId is provided, ensure the wallet belongs to that user
            const stmt = this.db.prepare('SELECT * FROM wallets WHERE id = ? AND user_id = ?');
            return stmt.get(walletId, userId);
        } else {
            // If no userId provided, get wallet by ID only (for backward compatibility)
            const stmt = this.db.prepare('SELECT * FROM wallets WHERE id = ?');
            return stmt.get(walletId);
        }
    }

    async setActiveWallet(userId, walletId) {
        // Start transaction
        const transaction = this.db.transaction(() => {
            // Set all user's wallets to inactive
            const updateAll = this.db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?');
            updateAll.run(userId);

            // Set the selected wallet as active
            const updateActive = this.db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ? AND user_id = ?');
            updateActive.run(walletId, userId);
        });

        // Execute transaction
        transaction();
    }

    async deactivateAllWallets(userId) {
        try {
            const stmt = this.db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?');
            const result = stmt.run(userId);
            console.log(`Deactivated all wallets for user ${userId}, affected rows: ${result.changes}`);
            return result;
        } catch (error) {
            console.error('Error deactivating all wallets:', error);
            throw error;
        }
    }

    async activateWallet(walletId, userId) {
        try {
            const stmt = this.db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ? AND user_id = ?');
            const result = stmt.run(walletId, userId);
            console.log(`Activated wallet ${walletId} for user ${userId}, affected rows: ${result.changes}`);
            return result;
        } catch (error) {
            console.error('Error activating wallet:', error);
            throw error;
        }
    }

    // Withdrawal operation: Logs a withdrawal transaction into the trades table
    async insertWithdrawal(withdrawalData) {
        // We log withdrawal as a distinct 'WITHDRAW' side in the trades table for tracking.
        
        const stmt = this.db.prepare(
            `INSERT INTO trades (user_id, token_address, amount, price, side, timestamp) 
             VALUES (?, ?, ?, ?, 'WITHDRAW', ?)`
        );
        
        const result = stmt.run(
            withdrawalData.user_id, 
            withdrawalData.token_mint, // Using mint as the token address
            withdrawalData.amount, 
            0, // Price is 0 as it's a transfer, not a trade execution
            new Date().toISOString()
        );
        return result;
    }


    // Strategy operations
    createStrategy(userId, strategyJson) {
        const stmt = this.db.prepare(
            'INSERT INTO strategies (user_id, strategy_json) VALUES (?, ?)'
        );
        return stmt.run(userId, JSON.stringify(strategyJson));
    }

    getActiveStrategy(userId) {
        const stmt = this.db.prepare(
            'SELECT * FROM strategies WHERE user_id = ? AND active = true'
        );
        return stmt.get(userId);
    }

    getUserStrategies(userId) {
        const stmt = this.db.prepare(
            'SELECT * FROM strategies WHERE user_id = ? ORDER BY created_at DESC'
        );
        return stmt.all(userId);
    }

    getActiveStrategies(userId) {
        const stmt = this.db.prepare(`
            SELECT * FROM strategies 
            WHERE user_id = ? AND active = true
        `);
        const strategies = stmt.all(userId);
        
        // Filter for strategies that are actually active in their JSON params
        return strategies.filter(strategy => {
            try {
                const strategyData = JSON.parse(strategy.strategy_json);
                return strategyData.params && strategyData.params.isActive === true;
            } catch (e) {
                return false;
            }
        });
    }

    updateStrategy(strategyId, updates) {
        const updateFields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            updateFields.push(`${key} = ?`);
            values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        }
        
        values.push(strategyId);

        const stmt = this.db.prepare(`
            UPDATE strategies 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `);

        return stmt.run(...values);
    }

    // Trade operations
    createTrade(userId, tokenAddress, amount, price, side) {
        const stmt = this.db.prepare(
            'INSERT INTO trades (user_id, token_address, amount, price, side) VALUES (?, ?, ?, ?, ?)'
        );
        return stmt.run(userId, tokenAddress, amount, price, side);
    }

    // Fee operations
    createFee(tradeId, totalFee, teamWalletShare, holdersShare) {
        const stmt = this.db.prepare(
            'INSERT INTO fees (trade_id, total_fee, team_wallet_share, holders_share) VALUES (?, ?, ?, ?)'
        );
        return stmt.run(tradeId, totalFee, teamWalletShare, holdersShare);
    }

    // Snapshot operations
    createSnapshot(epochId, eligibleWallets) {
        const stmt = this.db.prepare(
            'INSERT INTO snapshots (epoch_id, eligible_wallets) VALUES (?, ?)'
        );
        return stmt.run(epochId, JSON.stringify(eligibleWallets));
    }

    // Claim operations
    createClaim(userId, epochId) {
        const stmt = this.db.prepare(
            'INSERT INTO claims (user_id, epoch_id) VALUES (?, ?)'
        );
        return stmt.run(userId, epochId);
    }

    hasClaimedInEpoch(userId, epochId) {
        const stmt = this.db.prepare(
            'SELECT COUNT(*) as count FROM claims WHERE user_id = ? AND epoch_id = ?'
        );
        return stmt.get(userId, epochId).count > 0;
    }

    // Wallet security methods
    async setWalletPassphrase(walletId, passphraseHash) {
        const stmt = this.db.prepare(`
            UPDATE wallets 
            SET passphrase_hash = ?, is_locked = 1 
            WHERE id = ?
        `);
        return stmt.run(passphraseHash, walletId);
    }

    async unlockWallet(walletId) {
        const stmt = this.db.prepare(`
            UPDATE wallets 
            SET is_locked = 0 
            WHERE id = ?
        `);
        return stmt.run(walletId);
    }

    async lockWallet(walletId) {
        const stmt = this.db.prepare(`
            UPDATE wallets 
            SET is_locked = 1 
            WHERE id = ?
        `);
        return stmt.run(walletId);
    }

    async getWalletSecurityStatus(walletId) {
        const stmt = this.db.prepare(`
            SELECT is_locked, passphrase_hash 
            FROM wallets 
            WHERE id = ?
        `);
        return stmt.get(walletId);
    }

    async verifyWalletPassphrase(walletId, passphraseHash) {
        const stmt = this.db.prepare(`
            SELECT passphrase_hash 
            FROM wallets 
            WHERE id = ? AND passphrase_hash = ?
        `);
        return stmt.get(walletId, passphraseHash);
    }

    // Rules operations
    async createRule(userId, ruleData) {
        if (!ruleData.name) {
            throw new Error('Rule name is required');
        }

        // Handle new rule types properly
        const ruleType = ruleData.type || 'filter';
        
        const stmt = this.db.prepare(`
            INSERT INTO rules (user_id, name, type, description)
            VALUES (?, ?, ?, ?)
        `);
        
        const description = ruleData.description || `Rule: ${ruleData.name}`;
        const result = stmt.run(userId, ruleData.name, ruleType, description);
        const ruleId = result.lastInsertRowid;

        // Return the expected structure that RulesCommand expects
        return {
            lastInsertRowid: ruleId,
            ruleId: ruleId,
            success: true
        };
    }

    async getRulesByUserId(userId) {
        const stmt = this.db.prepare(`
            SELECT * FROM rules 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `);
        return stmt.all(userId);
    }

    async getRulesWithConditions(userId) {
        const stmt = this.db.prepare(`
            SELECT r.*, rc.condition_type, rc.condition_value, rc.operator
            FROM rules r
            LEFT JOIN rule_conditions rc ON r.id = rc.rule_id
            WHERE r.user_id = ? AND r.is_active = 1
            ORDER BY r.created_at DESC
        `);
        const results = stmt.all(userId);
        
        // Group conditions by rule
        const rulesMap = new Map();
        for (const row of results) {
            if (!rulesMap.has(row.id)) {
                rulesMap.set(row.id, {
                    id: row.id,
                    user_id: row.user_id,
                    name: row.name,
                    description: row.description,
                    type: row.type,
                    is_active: row.is_active,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    last_check_at: row.last_check_at,
                    success_count: row.success_count,
                    failure_count: row.failure_count,
                    conditions: {}
                });
            }
            
            if (row.condition_type) {
                const rule = rulesMap.get(row.id);
                try {
                    rule.conditions[row.condition_type] = JSON.parse(row.condition_value);
                } catch (e) {
                    rule.conditions[row.condition_type] = row.condition_value;
                }
            }
        }
        
        return Array.from(rulesMap.values());
    }

    async getRuleById(ruleId) {
        const stmt = this.db.prepare('SELECT * FROM rules WHERE id = ?');
        return stmt.get(ruleId);
    }

    async getRuleSettings(ruleId) {
        const stmt = this.db.prepare('SELECT * FROM rule_settings WHERE rule_id = ?');
        return stmt.get(ruleId);
    }

    async createRuleSettings(ruleId, settings = {}) {
        const defaultSettings = {
            notifications_enabled: true,
            alerts_enabled: true,
            notification_frequency: 'immediate',
            alert_threshold: 100
        };

        const finalSettings = { ...defaultSettings, ...settings };

        const stmt = this.db.prepare(`
            INSERT INTO rule_settings (
                rule_id,
                notifications_enabled,
                alerts_enabled,
                notification_frequency,
                alert_threshold
            ) VALUES (?, ?, ?, ?, ?)
        `);

        return stmt.run(
            ruleId,
            finalSettings.notifications_enabled,
            finalSettings.alerts_enabled,
            finalSettings.notification_frequency,
            finalSettings.alert_threshold
        );
    }

    async updateRuleSettings(ruleId, settings) {
        // First check if settings exist
        const existingSettings = await this.getRuleSettings(ruleId);
        
        if (!existingSettings) {
            // Create new settings if they don't exist
            return this.createRuleSettings(ruleId, settings);
        }

        // Build update query dynamically based on provided settings
        const updates = [];
        const values = [];
        
        for (const [key, value] of Object.entries(settings)) {
            updates.push(`${key} = ?`);
            values.push(value);
        }
        
        // Add updated_at timestamp
        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        // Add rule_id to values array
        values.push(ruleId);

        const stmt = this.db.prepare(`
            UPDATE rule_settings 
            SET ${updates.join(', ')}
            WHERE rule_id = ?
        `);

        return stmt.run(...values);
    }

    async deleteRuleSettings(ruleId) {
        const stmt = this.db.prepare('DELETE FROM rule_settings WHERE rule_id = ?');
        return stmt.run(ruleId);
    }

    async updateRuleStatus(ruleId, isActive) {
        const stmt = this.db.prepare(`
            UPDATE rules 
            SET is_active = ? 
            WHERE id = ?
        `);
        return stmt.run(isActive, ruleId);
    }

    async deactivateAllRulesForUser(userId) {
        const stmt = this.db.prepare(`
            UPDATE rules 
            SET is_active = 0 
            WHERE user_id = ?
        `);
        return stmt.run(userId);
    }

    async updateRuleLastCheck(ruleId) {
        const stmt = this.db.prepare(`
            UPDATE rules 
            SET last_check = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        return stmt.run(ruleId);
    }

    async createRuleCondition(ruleId, conditionType, conditionValue) {
        const stmt = this.db.prepare(`
            INSERT INTO rule_conditions (rule_id, condition_type, condition_value)
            VALUES (?, ?, ?)
        `);
        return stmt.run(ruleId, conditionType, conditionValue);
    }

    async getRuleConditions(ruleId) {
        const stmt = this.db.prepare(`
            SELECT * FROM rule_conditions 
            WHERE rule_id = ?
        `);
        return stmt.all(ruleId);
    }

    async updateRule(ruleId, updateData) {
        const fields = [];
        const values = [];
        
        if (updateData.name !== undefined) {
            fields.push('name = ?');
            values.push(updateData.name);
        }
        
        if (updateData.type !== undefined) {
            fields.push('type = ?');
            values.push(updateData.type);
        }
        
        if (updateData.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(updateData.is_active ? 1 : 0);
        }
        
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }
        
        values.push(ruleId);
        
        const query = `UPDATE rules SET ${fields.join(', ')} WHERE id = ?`;
        const stmt = this.db.prepare(query);
        return stmt.run(...values);
    }

    async updateRuleCondition(conditionId, conditionType, conditionValue, operator = 'equals') {
        const stmt = this.db.prepare(`
            UPDATE rule_conditions 
            SET condition_type = ?, condition_value = ?, operator = ?
            WHERE id = ?
        `);
        return stmt.run(conditionType, conditionValue, operator, conditionId);
    }

    async getRuleConditionById(conditionId) {
        const stmt = this.db.prepare('SELECT * FROM rule_conditions WHERE id = ?');
        return stmt.get(conditionId);
    }

    async deleteRuleCondition(conditionId) {
        const stmt = this.db.prepare('DELETE FROM rule_conditions WHERE id = ?');
        return stmt.run(conditionId);
    }

    async deleteRule(ruleId) {
        const transaction = this.db.transaction(() => {
            try {
                // Delete rule conditions (this table exists)
            const deleteConditions = this.db.prepare('DELETE FROM rule_conditions WHERE rule_id = ?');
            deleteConditions.run(ruleId);

                // Delete rule settings (this table exists)
                const deleteSettings = this.db.prepare('DELETE FROM rule_settings WHERE rule_id = ?');
                deleteSettings.run(ruleId);

                // Delete from rule_criteria table
                const deleteCriteria = this.db.prepare('DELETE FROM rule_criteria WHERE rule_id = ?');
                deleteCriteria.run(ruleId);

                // Delete from rule_metrics table
                const deleteMetrics = this.db.prepare('DELETE FROM rule_metrics WHERE rule_id = ?');
                deleteMetrics.run(ruleId);

                // Delete from rule_history table
                const deleteHistory = this.db.prepare('DELETE FROM rule_history WHERE rule_id = ?');
                deleteHistory.run(ruleId);

            // Delete the rule
            const deleteRule = this.db.prepare('DELETE FROM rules WHERE id = ?');
            deleteRule.run(ruleId);
            } catch (error) {
                console.error('Error in deleteRule transaction:', error);
                throw error;
            }
        });

        transaction();
    }

    // Rule criteria operations
    async createRuleCriteria(ruleId, criteriaType, operator, value, secondaryValue = null) {
        const stmt = this.db.prepare(`
            INSERT INTO rule_criteria (rule_id, criteria_type, operator, value, secondary_value)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(ruleId, criteriaType, operator, value, secondaryValue);
    }

    async getRuleCriteria(ruleId) {
        const stmt = this.db.prepare('SELECT * FROM rule_criteria WHERE rule_id = ?');
        return stmt.all(ruleId);
    }

    async updateRuleCriteria(criteriaId, criteriaType, operator, value, secondaryValue = null) {
        const stmt = this.db.prepare(`
            UPDATE rule_criteria 
            SET criteria_type = ?, operator = ?, value = ?, secondary_value = ?
            WHERE id = ?
        `);
        return stmt.run(criteriaType, operator, value, secondaryValue, criteriaId);
    }

    async deleteRuleCriteria(criteriaId) {
        const stmt = this.db.prepare('DELETE FROM rule_criteria WHERE id = ?');
        return stmt.run(criteriaId);
    }

    // Rule metrics operations
    async createRuleMetrics(ruleId, metricType, threshold, timeframe, direction) {
        const stmt = this.db.prepare(`
            INSERT INTO rule_metrics (rule_id, metric_type, threshold, timeframe, direction)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(ruleId, metricType, threshold, timeframe, direction);
    }

    async getRuleMetrics(ruleId) {
        const stmt = this.db.prepare('SELECT * FROM rule_metrics WHERE rule_id = ?');
        return stmt.all(ruleId);
    }

    async updateRuleMetrics(metricsId, metricType, threshold, timeframe, direction) {
        const stmt = this.db.prepare(`
            UPDATE rule_metrics 
            SET metric_type = ?, threshold = ?, timeframe = ?, direction = ?
            WHERE id = ?
        `);
        return stmt.run(metricType, threshold, timeframe, direction, metricsId);
    }

    async deleteRuleMetrics(metricsId) {
        const stmt = this.db.prepare('DELETE FROM rule_metrics WHERE id = ?');
        return stmt.run(metricsId);
    }

    // Rule history operations
    async createRuleHistory(ruleId, tokenAddress, tokenName, triggerPrice, triggerVolume, triggerMarketCap, triggerLiquidity, status) {
        const stmt = this.db.prepare(`
            INSERT INTO rule_history (
                rule_id, token_address, token_name, trigger_price, trigger_volume, 
                trigger_market_cap, trigger_liquidity, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(ruleId, tokenAddress, tokenName, triggerPrice, triggerVolume, triggerMarketCap, triggerLiquidity, status);
    }

    async getRuleHistory(ruleId, limit = 50) {
        const stmt = this.db.prepare(`
            SELECT * FROM rule_history 
            WHERE rule_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `);
        return stmt.all(ruleId, limit);
    }

    async getRuleHistoryByToken(tokenAddress, limit = 50) {
        const stmt = this.db.prepare(`
            SELECT * FROM rule_history 
            WHERE token_address = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `);
        return stmt.all(tokenAddress, limit);
    }

    async updateRuleHistoryStatus(historyId, status) {
        const stmt = this.db.prepare(`
            UPDATE rule_history 
            SET status = ? 
            WHERE id = ?
        `);
        return stmt.run(status, historyId);
    }

    // External wallet operations
    async addExternalWallet(userId, walletAddress, name = null) {
        const stmt = this.db.prepare(`
            INSERT INTO external_wallets (user_id, wallet_address, name)
            VALUES (?, ?, ?)
        `);
        return stmt.run(userId, walletAddress, name);
    }

    async getExternalWallets(userId) {
        const stmt = this.db.prepare(`
            SELECT * FROM external_wallets 
            WHERE user_id = ? 
            ORDER BY is_active DESC, created_at DESC
        `);
        return stmt.all(userId);
    }

    async toggleExternalWallet(walletId) {
        const stmt = this.db.prepare(`
            UPDATE external_wallets 
            SET is_active = NOT is_active 
            WHERE id = ?
        `);
        return stmt.run(walletId);
    }

    async removeExternalWallet(walletId) {
        const stmt = this.db.prepare('DELETE FROM external_wallets WHERE id = ?');
        return stmt.run(walletId);
    }

    async updateExternalWalletLastTrade(walletId) {
        const stmt = this.db.prepare(`
            UPDATE external_wallets 
            SET last_trade_time = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        return stmt.run(walletId);
    }

    async deleteExternalWallet(walletId) {
        const stmt = this.db.prepare('DELETE FROM external_wallets WHERE id = ?');
        return stmt.run(walletId);
    }

    async getExternalWalletById(walletId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM external_wallets 
                WHERE id = ?
            `);
            return stmt.get(walletId);
        } catch (error) {
            console.error('Error getting external wallet by ID:', error);
            throw error;
        }
    }

    async getExternalWalletByAddress(walletAddress) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM external_wallets 
                WHERE wallet_address = ?
            `);
            return stmt.get(walletAddress);
        } catch (error) {
            console.error('Error getting external wallet by address:', error);
            throw error;
        }
    }

    async updateExternalWallet(walletId, updates) {
        const updateFields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            let processedValue = value;
            if (typeof value === 'boolean') {
                processedValue = value ? 1 : 0;
            }
            updateFields.push(`${key} = ?`);
            values.push(processedValue);
        }
        
        values.push(walletId);

        const stmt = this.db.prepare(`
            UPDATE external_wallets 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `);

        return stmt.run(...values);
    }

    // User settings operations
    async getUserSettings(userId) {
        const stmt = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
        let settings = stmt.get(userId);
        
        if (!settings) {
            // Create default settings if none exist
            settings = await this.createUserSettings(userId);
        }
        
        return settings;
    }

    async createUserSettings(userId, settings = {}) {
        const defaultSettings = {
            max_trade_amount: 10, // 10 SOL default
            min_trade_amount: 0.1, // 0.1 SOL default
            max_daily_trades: 10,
            auto_confirm_trades: 0,
            notify_on_trade: 1,
            default_stop_loss: 10.0,
            default_take_profit: 20.0,
            trailing_stop_enabled: false,
            trailing_stop_threshold: 5.0
        };

        const finalSettings = { ...defaultSettings, ...settings };

        // Convert boolean values to integers
        if (typeof finalSettings.auto_confirm_trades === 'boolean') {
            finalSettings.auto_confirm_trades = finalSettings.auto_confirm_trades ? 1 : 0;
        }
        if (typeof finalSettings.notify_on_trade === 'boolean') {
            finalSettings.notify_on_trade = finalSettings.notify_on_trade ? 1 : 0;
        }
        if (typeof finalSettings.trailing_stop_enabled === 'boolean') {
            finalSettings.trailing_stop_enabled = finalSettings.trailing_stop_enabled ? 1 : 0;
        }

        const stmt = this.db.prepare(`
            INSERT INTO user_settings (
                user_id,
                max_trade_amount,
                min_trade_amount,
                max_daily_trades,
                auto_confirm_trades,
                notify_on_trade,
                default_stop_loss,
                default_take_profit,
                trailing_stop_enabled,
                trailing_stop_threshold
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            userId,
            finalSettings.max_trade_amount,
            finalSettings.min_trade_amount,
            finalSettings.max_daily_trades,
            finalSettings.auto_confirm_trades,
            finalSettings.notify_on_trade,
            finalSettings.default_stop_loss,
            finalSettings.default_take_profit,
            finalSettings.trailing_stop_enabled,
            finalSettings.trailing_stop_threshold
        );

        return this.getUserSettings(userId);
    }

    async updateUserSettings(userId, settings) {
        try {
            // First check if settings exist
            const existingSettings = await this.getUserSettings(userId);
            
            if (!existingSettings) {
                // Create new settings if they don't exist
                return this.createUserSettings(userId, settings);
            }

            // Build update query dynamically based on provided settings
            const updates = [];
            const values = [];
            
            for (const [key, value] of Object.entries(settings)) {
                // Convert boolean values to integers
                let processedValue = value;
                if (typeof value === 'boolean') {
                    processedValue = value ? 1 : 0;
                }
                updates.push(`${key} = ?`);
                values.push(processedValue);
            }
            
            // Add updated_at timestamp
            updates.push('updated_at = CURRENT_TIMESTAMP');
            
            // Add user_id to values array
            values.push(userId);

            const stmt = this.db.prepare(`
                UPDATE user_settings 
                SET ${updates.join(', ')}
                WHERE user_id = ?
            `);

            const result = stmt.run(...values);
            
            if (result.changes === 0) {
                console.error('No settings were updated for user:', userId);
                throw new Error('Failed to update settings');
            }

            console.log('Settings updated successfully for user:', userId, 'Changes:', result.changes);
            return this.getUserSettings(userId);
        } catch (error) {
            console.error('Error updating user settings:', error);
            throw error;
        }
    }

    // Strategy settings operations
    async getStrategySettings(userId, strategyType) {
        const stmt = this.db.prepare(`
            SELECT strategy_json 
            FROM strategies 
            WHERE user_id = ? AND strategy_json LIKE ?
        `);
        const result = stmt.get(userId, `%${strategyType}%`);
        return result ? JSON.parse(result.strategy_json) : null;
    }

    async updateStrategySettings(userId, strategyType, settings) {
        try {
            // First check if strategy settings exist
            const existingSettings = await this.getStrategySettings(userId, strategyType);
            
            if (!existingSettings) {
                // Create new strategy settings
                return this.createStrategy(userId, {
                    type: strategyType,
                    params: settings,
                    active: false
                });
            }

            // Update existing strategy settings
            const stmt = this.db.prepare(`
                UPDATE strategies 
                SET strategy_json = ? 
                WHERE user_id = ? AND strategy_json LIKE ?
            `);

            // Ensure we preserve the existing structure and only update the params
            const updatedSettings = {
                type: strategyType,
                params: {
                    ...existingSettings.params,
                    ...settings
                },
                active: existingSettings.active || false
            };

            const result = stmt.run(
                JSON.stringify(updatedSettings),
                userId,
                `%${strategyType}%`
            );

            if (result.changes === 0) {
                throw new Error('Failed to update strategy settings');
            }

            return updatedSettings;
        } catch (error) {
            console.error('Error updating strategy settings:', error);
            throw error;
        }
    }

    // Trade history and statistics
    getTradesByUser(userId, limit = 20) {
        const stmt = this.db.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?');
        return stmt.all(userId, limit);
    }

    getTradesByWallet(userId, walletAddress, limit = 20) {
        const stmt = this.db.prepare('SELECT * FROM trades WHERE user_id = ? AND token_address = ? ORDER BY timestamp DESC LIMIT ?');
        return stmt.all(userId, walletAddress, limit);
    }

    getTradeStatsByUser(userId) {
        const stmt = this.db.prepare(`
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) as buy_trades,
                SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sell_trades,
                SUM(CASE WHEN side = 'SELL' AND price > 0 THEN amount * price ELSE 0 END) - SUM(CASE WHEN side = 'BUY' AND price > 0 THEN amount * price ELSE 0 END) as total_pnl
            FROM trades WHERE user_id = ?
        `);
        return stmt.get(userId);
    }

    getTradeStatsByWallet(userId, walletAddress) {
        const stmt = this.db.prepare(`
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN side = 'BUY' THEN 1 ELSE 0 END) as buy_trades,
                SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sell_trades,
                SUM(CASE WHEN side = 'SELL' AND price > 0 THEN amount * price ELSE 0 END) - SUM(CASE WHEN side = 'BUY' AND price > 0 THEN amount * price ELSE 0 END) as total_pnl
            FROM trades WHERE user_id = ? AND token_address = ?
        `);
        return stmt.get(userId, walletAddress);
    }

    // --- Sold token tracking for manual management ---
    markTokenAsSold(userId, tokenAddress) {
        try {
            const stmt = this.db.prepare(
                'INSERT OR REPLACE INTO sold_tokens (user_id, token_address, sold_at) VALUES (?, ?, ?)' 
            );
            return stmt.run(userId, tokenAddress, new Date().toISOString());
        } catch (error) {
            console.error('Error marking token as sold:', error);
            throw error;
        }
    }

    getSoldTokens(userId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM sold_tokens WHERE user_id = ? ORDER BY sold_at DESC');
            return stmt.all(userId);
        } catch (error) {
            console.error('Error getting sold tokens:', error);
            return [];
        }
    }

    // --- Active positions tracking for autonomous trading ---
    getActivePositions(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    token_address,
                    amount,
                    price as entryPrice,
                    timestamp as entryTime
                FROM trades 
                WHERE user_id = ? 
                AND side = 'BUY' 
                AND token_address NOT IN (
                    SELECT DISTINCT token_address 
                    FROM trades 
                    WHERE user_id = ? AND side = 'SELL'
                )
                ORDER BY timestamp DESC
            `);
            return stmt.all(userId, userId);
        } catch (error) {
            console.error('Error getting active positions:', error);
            return [];
        }
    }

    isTokenSold(userId, tokenAddress) {
        try {
            const stmt = this.db.prepare(
                'SELECT 1 FROM sold_tokens WHERE user_id = ? AND token_address = ?'
            );
            return !!stmt.get(userId, tokenAddress);
        } catch (error) {
            console.error('Error checking if token is sold:', error);
            return false;
        }
    }
}

module.exports = DatabaseManager;