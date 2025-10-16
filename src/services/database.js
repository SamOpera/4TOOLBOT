const Database = require('better-sqlite3');
const path = require('path');

class DatabaseService {
    constructor() {
        this.db = new Database(path.join(__dirname, '../../db/4tool.db'));
        this.init();
    }

    init() {
        // Create user_states table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_states (
                user_id INTEGER PRIMARY KEY,
                state TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create rules table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                rule_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user_states(user_id)
            )
        `);

        // Create trades table for trade history
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                wallet TEXT,
                token_address TEXT,
                trade_type TEXT,
                amount REAL,
                price REAL,
                total_value REAL,
                fee_amount REAL,
                status TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Database tables initialized successfully');
    }

    // --- User State Methods ---

    async getUserState(userId) {
        try {
            const stmt = this.db.prepare('SELECT state FROM user_states WHERE user_id = ?');
            const result = stmt.get(userId);
            return result ? JSON.parse(result.state) : null;
        } catch (error) {
            console.error('Error getting user state:', error);
            return null;
        }
    }

    async updateUserState(userId, state) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO user_states (user_id, state, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                state = excluded.state,
                updated_at = CURRENT_TIMESTAMP
            `);
            stmt.run(userId, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Error updating user state:', error);
            return false;
        }
    }

    async deleteUserState(userId) {
        try {
            const stmt = this.db.prepare('DELETE FROM user_states WHERE user_id = ?');
            stmt.run(userId);
            return true;
        } catch (error) {
            console.error('Error deleting user state:', error);
            return false;
        }
    }

    // --- Rules Methods ---

    async saveRule(userId, rule) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO rules (user_id, rule_data, created_at, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `);
            stmt.run(userId, JSON.stringify(rule));
            return true;
        } catch (error) {
            console.error('Error saving rule:', error);
            return false;
        }
    }

    async getRules(userId) {
        try {
            const stmt = this.db.prepare('SELECT rule_data FROM rules WHERE user_id = ?');
            const results = stmt.all(userId);
            return results.map(row => JSON.parse(row.rule_data));
        } catch (error) {
            console.error('Error getting rules:', error);
            return [];
        }
    }

    async getRule(userId, ruleId) {
        try {
            const stmt = this.db.prepare('SELECT rule_data FROM rules WHERE user_id = ? AND id = ?');
            const result = stmt.get(userId, ruleId);
            return result ? JSON.parse(result.rule_data) : null;
        } catch (error) {
            console.error('Error getting rule:', error);
            return null;
        }
    }

    async updateRule(userId, ruleId, updates) {
        try {
            const stmt = this.db.prepare(`
                UPDATE rules 
                SET rule_data = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND id = ?
            `);
            stmt.run(JSON.stringify(updates), userId, ruleId);
            return true;
        } catch (error) {
            console.error('Error updating rule:', error);
            return false;
        }
    }

    async deleteRule(userId, ruleId) {
        try {
            const stmt = this.db.prepare('DELETE FROM rules WHERE user_id = ? AND id = ?');
            stmt.run(userId, ruleId);
            return true;
        } catch (error) {
            console.error('Error deleting rule:', error);
            return false;
        }
    }

    // --- Trade History Methods ---

    async createTradeHistory(trade) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO trades (user_id, wallet, token_address, trade_type, amount, price, total_value, fee_amount, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                trade.user_id,
                trade.wallet || null,
                trade.token_address,
                trade.trade_type,
                trade.amount,
                trade.price,
                trade.total_value,
                trade.fee_amount,
                trade.status
            );
            return true;
        } catch (error) {
            console.error('Error saving trade:', error);
            return false;
        }
    }

    async getTradesByUser(userId, limit = 10) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
            `);
            return stmt.all(userId, limit);
        } catch (error) {
            console.error('Error fetching trades:', error);
            return [];
        }
    }

    async getTradeStatsByUser(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    COUNT(*) AS total_trades,
                    SUM(CASE WHEN trade_type = 'BUY' THEN 1 ELSE 0 END) AS buy_trades,
                    SUM(CASE WHEN trade_type = 'SELL' THEN 1 ELSE 0 END) AS sell_trades,
                    SUM(CASE WHEN status = 'EXECUTED' THEN 1 ELSE 0 END) AS successful_trades,
                    SUM(CASE WHEN trade_type = 'SELL' THEN total_value ELSE 0 END) 
                        - SUM(CASE WHEN trade_type = 'BUY' THEN total_value ELSE 0 END) AS total_pnl
                FROM trades
                WHERE user_id = ?
            `);
            const stats = stmt.get(userId) || {};
            // Calculate win rate
            stats.win_rate = stats.successful_trades && stats.total_trades
                ? ((stats.successful_trades / stats.total_trades) * 100).toFixed(2)
                : "0.00";
            return stats;
        } catch (error) {
            console.error('Error calculating trade stats:', error);
            return {
                total_trades: 0,
                buy_trades: 0,
                sell_trades: 0,
                successful_trades: 0,
                total_pnl: 0,
                win_rate: "0.00"
            };
        }
    }
}

module.exports = new DatabaseService();