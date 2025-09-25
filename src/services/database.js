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

        console.log('Database tables initialized successfully');
    }

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
}

module.exports = new DatabaseService(); 