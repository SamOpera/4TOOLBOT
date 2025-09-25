const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const LRU = require('lru-cache');

/**
 * Optimized Database Manager for Production
 * Features: Connection pooling, query caching, prepared statements, and performance monitoring
 */
class OptimizedDatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, '../../db/4tool.db');
        this.connectionPool = new Map();
        this.queryCache = new LRU({
            max: 1000, // Cache up to 1000 queries
            maxAge: 5 * 60 * 1000, // 5 minutes TTL
            updateAgeOnGet: true
        });
        this.preparedStatements = new Map();
        this.performanceMetrics = {
            totalQueries: 0,
            cacheHits: 0,
            cacheMisses: 0,
            slowQueries: [],
            averageQueryTime: 0
        };
        
        this.initializeDatabase();
        this.initializePreparedStatements();
        this.setupPerformanceMonitoring();
    }
    
    /**
     * Initialize database with optimized settings
     */
    initializeDatabase() {
        try {
            // Create main database connection with optimized settings
            this.mainDb = new Database(this.dbPath, {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null,
                fileMustExist: false
            });
            
            // Optimize SQLite settings for production
            this.mainDb.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
            this.mainDb.pragma('synchronous = NORMAL'); // Balance between safety and performance
            this.mainDb.pragma('cache_size = -64000'); // 64MB cache
            this.mainDb.pragma('temp_store = MEMORY'); // Store temp tables in memory
            this.mainDb.pragma('mmap_size = 268435456'); // 256MB memory mapping
            this.mainDb.pragma('page_size = 4096'); // Optimal page size
            this.mainDb.pragma('auto_vacuum = INCREMENTAL'); // Incremental vacuum for better performance
            
            // Create connection pool for concurrent operations
            this.createConnectionPool();
            
            this.initializeTables();
            this.createOptimizedIndexes();
            
            console.log('✅ Optimized database initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize optimized database:', error);
            throw error;
        }
    }
    
    /**
     * Create connection pool for concurrent operations
     */
    createConnectionPool() {
        const poolSize = Math.max(4, require('os').cpus().length);
        
        for (let i = 0; i < poolSize; i++) {
            const connection = new Database(this.dbPath, {
                verbose: false,
                fileMustExist: true
            });
            
            // Apply same optimizations to pool connections
            connection.pragma('journal_mode = WAL');
            connection.pragma('synchronous = NORMAL');
            connection.pragma('cache_size = -32000'); // 32MB per connection
            connection.pragma('temp_store = MEMORY');
            
            this.connectionPool.set(i, {
                connection,
                inUse: false,
                lastUsed: Date.now()
            });
        }
        
        console.log(`🔗 Database connection pool created with ${poolSize} connections`);
    }
    
    /**
     * Get available connection from pool
     */
    getConnection() {
        for (const [id, connInfo] of this.connectionPool) {
            if (!connInfo.inUse) {
                connInfo.inUse = true;
                connInfo.lastUsed = Date.now();
                return { id, connection: connInfo.connection };
            }
        }
        
        // If no connections available, create a temporary one
        const tempConnection = new Database(this.dbPath, { verbose: false });
        tempConnection.pragma('journal_mode = WAL');
        tempConnection.pragma('synchronous = NORMAL');
        
        return { id: 'temp', connection: tempConnection, isTemporary: true };
    }
    
    /**
     * Release connection back to pool
     */
    releaseConnection(connInfo) {
        if (connInfo.isTemporary) {
            connInfo.connection.close();
            return;
        }
        
        const poolConn = this.connectionPool.get(connInfo.id);
        if (poolConn) {
            poolConn.inUse = false;
            poolConn.lastUsed = Date.now();
        }
    }
    
    /**
     * Initialize prepared statements for common queries
     */
    initializePreparedStatements() {
        try {
            // User queries
            this.preparedStatements.set('getUserByTelegramId', 
                this.mainDb.prepare('SELECT * FROM users WHERE telegram_id = ?'));
            
            this.preparedStatements.set('getUserById', 
                this.mainDb.prepare('SELECT * FROM users WHERE id = ?'));
            
            this.preparedStatements.set('createUser', 
                this.mainDb.prepare('INSERT OR IGNORE INTO users (telegram_id) VALUES (?)'));
            
            // Wallet queries
            this.preparedStatements.set('getUserWallets', 
                this.mainDb.prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY is_active DESC, created_at DESC'));
            
            this.preparedStatements.set('getActiveWallet', 
                this.mainDb.prepare('SELECT * FROM wallets WHERE user_id = ? AND is_active = 1 LIMIT 1'));
            
            // Trade queries
            this.preparedStatements.set('getUserTrades', 
                this.mainDb.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?'));
            
            this.preparedStatements.set('getTokenTrades', 
                this.mainDb.prepare('SELECT * FROM trades WHERE user_id = ? AND token_address = ? ORDER BY timestamp DESC LIMIT ?'));
            
            // Rule queries
            this.preparedStatements.set('getUserRules', 
                this.mainDb.prepare('SELECT * FROM rules WHERE user_id = ? AND active = 1'));
            
            this.preparedStatements.set('getRuleById', 
                this.mainDb.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?'));
            
            // Settings queries
            this.preparedStatements.set('getUserSettings', 
                this.mainDb.prepare('SELECT * FROM user_settings WHERE user_id = ?'));
            
            this.preparedStatements.set('updateUserSettings', 
                this.mainDb.prepare('UPDATE user_settings SET settings_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'));
            
            console.log('✅ Prepared statements initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize prepared statements:', error);
        }
    }
    
    /**
     * Execute query with caching and performance monitoring
     */
    async executeQuery(queryKey, queryFn, cacheKey = null, ttl = 300000) {
        const startTime = Date.now();
        this.performanceMetrics.totalQueries++;
        
        try {
            // Check cache first
            if (cacheKey && this.queryCache.has(cacheKey)) {
                this.performanceMetrics.cacheHits++;
                return this.queryCache.get(cacheKey);
            }
            
            this.performanceMetrics.cacheMisses++;
            
            // Execute query
            const result = await queryFn();
            
            // Cache result if cacheKey provided
            if (cacheKey && result) {
                this.queryCache.set(cacheKey, result, { ttl });
            }
            
            // Record performance metrics
            const queryTime = Date.now() - startTime;
            this.updatePerformanceMetrics(queryTime);
            
            // Log slow queries
            if (queryTime > 100) { // Log queries taking more than 100ms
                this.logSlowQuery(queryKey, queryTime);
            }
            
            return result;
            
        } catch (error) {
            console.error(`❌ Query execution failed for ${queryKey}:`, error);
            throw error;
        }
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(queryTime) {
        const totalQueries = this.performanceMetrics.totalQueries;
        const currentAvg = this.performanceMetrics.averageQueryTime;
        
        this.performanceMetrics.averageQueryTime = 
            ((currentAvg * (totalQueries - 1)) + queryTime) / totalQueries;
    }
    
    /**
     * Log slow queries for optimization
     */
    logSlowQuery(queryKey, queryTime) {
        this.performanceMetrics.slowQueries.push({
            query: queryKey,
            time: queryTime,
            timestamp: Date.now()
        });
        
        // Keep only last 100 slow queries
        if (this.performanceMetrics.slowQueries.length > 100) {
            this.performanceMetrics.slowQueries.shift();
        }
        
        if (queryTime > 500) { // Log very slow queries
            console.warn(`🐌 Slow query detected: ${queryKey} took ${queryTime}ms`);
        }
    }
    
    /**
     * Get user by Telegram ID with caching
     */
    async getUserByTelegramId(telegramId) {
        const cacheKey = `user:${telegramId}`;
        
        return this.executeQuery('getUserByTelegramId', async () => {
            const stmt = this.preparedStatements.get('getUserByTelegramId');
            return stmt.get(telegramId);
        }, cacheKey, 60000); // Cache for 1 minute
    }
    
    /**
     * Get user wallets with optimized query
     */
    async getUserWallets(userId) {
        const cacheKey = `wallets:${userId}`;
        
        return this.executeQuery('getUserWallets', async () => {
            const stmt = this.preparedStatements.get('getUserWallets');
            return stmt.all(userId);
        }, cacheKey, 30000); // Cache for 30 seconds
    }
    
    /**
     * Get user trades with pagination and caching
     */
    async getUserTrades(userId, limit = 50) {
        const cacheKey = `trades:${userId}:${limit}`;
        
        return this.executeQuery('getUserTrades', async () => {
            const stmt = this.preparedStatements.get('getUserTrades');
            return stmt.all(userId, limit);
        }, cacheKey, 15000); // Cache for 15 seconds
    }
    
    /**
     * Batch insert trades for better performance
     */
    async batchInsertTrades(trades) {
        const connInfo = this.getConnection();
        
        try {
            const transaction = connInfo.connection.transaction((trades) => {
                const stmt = connInfo.connection.prepare(`
                    INSERT INTO trades (user_id, token_address, amount, price, side, timestamp)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `);
                
                for (const trade of trades) {
                    stmt.run(trade.userId, trade.tokenAddress, trade.amount, trade.price, trade.side);
                }
            });
            
            transaction(trades);
            return true;
            
        } catch (error) {
            console.error('❌ Batch insert failed:', error);
            throw error;
        } finally {
            this.releaseConnection(connInfo);
        }
    }
    
    /**
     * Optimized portfolio calculation with caching
     */
    async calculateUserPortfolio(userId) {
        const cacheKey = `portfolio:${userId}`;
        
        return this.executeQuery('calculatePortfolio', async () => {
            const connInfo = this.getConnection();
            
            try {
                // Use a single optimized query instead of multiple queries
                const portfolioQuery = `
                    SELECT 
                        t.token_address,
                        SUM(CASE WHEN t.side = 'BUY' THEN t.amount ELSE -t.amount END) as net_amount,
                        AVG(CASE WHEN t.side = 'BUY' THEN t.price ELSE NULL END) as avg_buy_price,
                        MAX(t.timestamp) as last_trade_time
                    FROM trades t
                    WHERE t.user_id = ?
                    GROUP BY t.token_address
                    HAVING net_amount > 0
                `;
                
                const stmt = connInfo.connection.prepare(portfolioQuery);
                const portfolio = stmt.all(userId);
                
                return portfolio;
                
            } finally {
                this.releaseConnection(connInfo);
            }
        }, cacheKey, 30000); // Cache for 30 seconds
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            cacheHitRate: this.performanceMetrics.totalQueries > 0 
                ? (this.performanceMetrics.cacheHits / this.performanceMetrics.totalQueries * 100).toFixed(2)
                : 0,
            timestamp: Date.now()
        };
    }
    
    /**
     * Clear query cache
     */
    clearCache() {
        this.queryCache.clear();
        console.log('🧹 Query cache cleared');
    }
    
    /**
     * Optimize database (run periodically)
     */
    async optimizeDatabase() {
        try {
            console.log('🔧 Optimizing database...');
            
            // Analyze tables for better query planning
            this.mainDb.pragma('analyze');
            
            // Vacuum database to reclaim space
            this.mainDb.pragma('vacuum');
            
            // Update statistics
            this.mainDb.pragma('optimize');
            
            console.log('✅ Database optimization completed');
            
        } catch (error) {
            console.error('❌ Database optimization failed:', error);
        }
    }
    
    /**
     * Close all connections
     */
    async close() {
        try {
            // Close main connection
            if (this.mainDb) {
                this.mainDb.close();
            }
            
            // Close pool connections
            for (const [_, connInfo] of this.connectionPool) {
                if (connInfo.connection) {
                    connInfo.connection.close();
                }
            }
            
            console.log('✅ Database connections closed');
            
        } catch (error) {
            console.error('❌ Error closing database connections:', error);
        }
    }
}

module.exports = OptimizedDatabaseManager; 