// NOTE: You need to create the following table in your DB for per-token 24h changes:
/*
CREATE TABLE IF NOT EXISTS token_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    usd_value REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
*/

// Fee Management Operations
class FeeOperations {
    constructor(db) {
        this.db = db;
    }

    async createFeeRecord(record) {
        const query = `
            INSERT INTO fee_records (total_fee, marketing_amount, treasury_amount, timestamp)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [record.total_fee, record.marketing_amount, record.treasury_amount, record.timestamp];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async createSnapshot(snapshot) {
        const query = `
            INSERT INTO snapshots (timestamp, holders)
            VALUES ($1, $2)
            RETURNING *;
        `;
        const values = [snapshot.timestamp, snapshot.holders];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getLatestSnapshot() {
        const query = `
            SELECT * FROM snapshots
            ORDER BY timestamp DESC
            LIMIT 1;
        `;
        const result = await this.db.query(query);
        return result.rows[0];
    }

    async getLastSnapshotTime() {
        const query = `
            SELECT timestamp FROM snapshots
            ORDER BY timestamp DESC
            LIMIT 1;
        `;
        const result = await this.db.query(query);
        return result.rows[0]?.timestamp;
    }

    async createClaim(claim) {
        const query = `
            INSERT INTO claims (address, timestamp)
            VALUES ($1, $2)
            RETURNING *;
        `;
        const values = [claim.address, claim.timestamp];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getLastClaimTime(address) {
        const query = `
            SELECT timestamp FROM claims
            WHERE address = $1
            ORDER BY timestamp DESC
            LIMIT 1;
        `;
        const values = [address];
        const result = await this.db.query(query, values);
        return result.rows[0]?.timestamp;
    }

    async createBlacklist(blacklist) {
        const query = `
            INSERT INTO blacklist (address, reasons, timestamp)
            VALUES ($1, $2, $3)
            ON CONFLICT (address) DO UPDATE
            SET reasons = $2, timestamp = $3
            RETURNING *;
        `;
        const values = [blacklist.address, blacklist.reasons, blacklist.timestamp];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async isBlacklisted(address) {
        const query = `
            SELECT * FROM blacklist
            WHERE address = $1;
        `;
        const values = [address];
        const result = await this.db.query(query, values);
        return result.rows.length > 0;
    }

    async getTotalCollectedFees(sinceTimestamp) {
        const query = `
            SELECT SUM(total_fee) as total
            FROM fee_records
            WHERE timestamp > $1;
        `;
        const values = [sinceTimestamp];
        const result = await this.db.query(query, values);
        return result.rows[0]?.total || 0;
    }
}

// Strategy Operations
class StrategyOperations {
    constructor(db) {
        this.db = db;
    }

    async createStrategy(strategy) {
        const query = `
            INSERT INTO strategies (id, user_id, type, params, status, created_at, last_executed, performance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [
            strategy.id,
            strategy.userId,
            strategy.type,
            strategy.params,
            strategy.status,
            strategy.createdAt,
            strategy.lastExecuted,
            strategy.performance
        ];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getStrategy(strategyId) {
        const query = `
            SELECT * FROM strategies
            WHERE id = $1;
        `;
        const values = [strategyId];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getUserStrategies(userId) {
        const query = `
            SELECT * FROM strategies
            WHERE user_id = $1
            ORDER BY created_at DESC;
        `;
        const values = [userId];
        const result = await this.db.query(query, values);
        return result.rows;
    }

    async updateStrategy(strategy) {
        const query = `
            UPDATE strategies
            SET params = $1,
                status = $2,
                last_executed = $3,
                performance = $4
            WHERE id = $5
            RETURNING *;
        `;
        const values = [
            strategy.params,
            strategy.status,
            strategy.lastExecuted,
            strategy.performance,
            strategy.id
        ];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async deleteStrategy(strategyId) {
        const query = `
            DELETE FROM strategies
            WHERE id = $1
            RETURNING *;
        `;
        const values = [strategyId];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async recordStrategyExecution(execution) {
        const query = `
            INSERT INTO strategy_executions (strategy_id, execution_time, result)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const values = [
            execution.strategyId,
            execution.executionTime,
            execution.result
        ];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getStrategyExecutions(strategyId, limit = 10) {
        const query = `
            SELECT * FROM strategy_executions
            WHERE strategy_id = $1
            ORDER BY execution_time DESC
            LIMIT $2;
        `;
        const values = [strategyId, limit];
        const result = await this.db.query(query, values);
        return result.rows;
    }

    async updateStrategyPerformance(performance) {
        const query = `
            INSERT INTO strategy_performance (
                strategy_id,
                total_trades,
                successful_trades,
                failed_trades,
                total_profit
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (strategy_id) DO UPDATE
            SET total_trades = strategy_performance.total_trades + $2,
                successful_trades = strategy_performance.successful_trades + $3,
                failed_trades = strategy_performance.failed_trades + $4,
                total_profit = strategy_performance.total_profit + $5,
                last_updated = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const values = [
            performance.strategyId,
            performance.totalTrades,
            performance.successfulTrades,
            performance.failedTrades,
            performance.totalProfit
        ];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }

    async getStrategyPerformance(strategyId) {
        const query = `
            SELECT * FROM strategy_performance
            WHERE strategy_id = $1;
        `;
        const values = [strategyId];
        const result = await this.db.query(query, values);
        return result.rows[0];
    }
}

// Portfolio Operations
class PortfolioOperations {
    constructor(db) {
        this.db = db;
    }

    async savePortfolioSnapshot(userId, value) {
        const stmt = this.db.db.prepare(
            'INSERT INTO portfolio_snapshots (user_id, value, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)'
        );
        stmt.run(userId, value);
    }

    async getPortfolioValue24hAgo(userId) {
        const stmt = this.db.db.prepare(
            `SELECT value FROM portfolio_snapshots WHERE user_id = ? AND timestamp <= datetime('now', '-24 hours') ORDER BY timestamp DESC LIMIT 1`
        );
        const row = stmt.get(userId);
        return row ? row.value : null;
    }

    // --- NEW: Save per-token USD values for each snapshot ---
    async saveTokenSnapshots(userId, tokenValues) {
        // tokenValues: { "SOL": 4.67, "XBT": 0.22, ... }
        const stmt = this.db.db.prepare(
            'INSERT INTO token_snapshots (user_id, token_symbol, usd_value, timestamp) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
        );
        for (const [symbol, value] of Object.entries(tokenValues)) {
            stmt.run(userId, symbol, value);
        }
    }

    // --- NEW: Get per-token USD value from 24h ago for each token ---
    async getTokenValues24hAgo(userId) {
        // Returns { "SOL": 4.67, "XBT": 0.22, ... }
        const stmt = this.db.db.prepare(
            `SELECT token_symbol, usd_value
             FROM token_snapshots
             WHERE user_id = ? AND timestamp <= datetime('now', '-24 hours')
             ORDER BY token_symbol, timestamp DESC`
        );
        const rows = stmt.all(userId);
        const tokenMap = {};
        for (const row of rows) {
            if (!tokenMap[row.token_symbol]) {
                tokenMap[row.token_symbol] = row.usd_value;
            }
        }
        return tokenMap;
    }
}

// Add to exports
module.exports = {
    FeeOperations,
    StrategyOperations,
    PortfolioOperations
};