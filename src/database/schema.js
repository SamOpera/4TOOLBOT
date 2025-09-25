const { Database } = require('sqlite3').verbose();

class DatabaseSchema {
    constructor(db) {
        this.db = db;
    }

    async initialize() {
        await this.createRulesTable();
        await this.createRuleCriteriaTable();
        await this.createRuleMetricsTable();
        await this.createRuleHistoryTable();
        await this.createPortfolioSnapshotsTable();
    }

    async createRulesTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT NOT NULL, -- 'filter' or 'strategy'
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_check_at DATETIME,
                success_count INTEGER DEFAULT 0,
                failure_count INTEGER DEFAULT 0
            )
        `;
        await this.db.run(query);
    }

    async createRuleCriteriaTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS rule_criteria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                criteria_type TEXT NOT NULL, -- 'category', 'market_cap', 'price', 'volume', 'liquidity', 'timeframe'
                operator TEXT NOT NULL, -- '>', '<', '=', '>=', '<=', 'between'
                value TEXT NOT NULL, -- JSON string for complex values
                secondary_value TEXT, -- For 'between' operations
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
            )
        `;
        await this.db.run(query);
    }

    async createRuleMetricsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS rule_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                metric_type TEXT NOT NULL, -- 'volume_change', 'price_change', 'market_cap', 'liquidity'
                threshold REAL NOT NULL,
                timeframe TEXT NOT NULL, -- '1h', '24h', '7d'
                direction TEXT NOT NULL, -- 'increase', 'decrease'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
            )
        `;
        await this.db.run(query);
    }

    async createRuleHistoryTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS rule_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                token_address TEXT NOT NULL,
                token_name TEXT,
                trigger_price REAL,
                trigger_volume REAL,
                trigger_market_cap REAL,
                trigger_liquidity REAL,
                status TEXT NOT NULL, -- 'triggered', 'executed', 'failed'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
            )
        `;
        await this.db.run(query);
    }

    async createPortfolioSnapshotsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await this.db.run(query);
    }
}

module.exports = DatabaseSchema; 