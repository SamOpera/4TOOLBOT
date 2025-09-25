const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@project-serum/anchor');
const winston = require('winston');
const { TOKEN_PROGRAM_ID, NATIVE_MINT } = require('@solana/spl-token');
const axios = require('axios');

/**
 * Optimized Trading Service for Production
 * Features: Connection pooling, request batching, circuit breaker, and performance monitoring
 */
class OptimizedTradingService {
    constructor(config) {
        this.config = config;
        this.connectionPool = new Map();
        this.requestQueue = [];
        this.circuitBreaker = {
            failureCount: 0,
            lastFailureTime: 0,
            isOpen: false,
            threshold: 5,
            timeout: 60000
        };
        this.performanceMetrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            slowRequests: []
        };
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'trading-service.log', level: 'error' }),
                new winston.transports.File({ filename: 'trading-service.log' })
            ]
        });
        
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }
        
        this.initializeConnectionPool();
        this.startRequestProcessor();
        this.setupPerformanceMonitoring();
    }
    
    /**
     * Initialize connection pool for multiple RPC endpoints
     */
    initializeConnectionPool() {
        const endpoints = this.getRpcEndpoints();
        const poolSize = Math.max(3, Math.min(endpoints.length, 8));
        
        for (let i = 0; i < poolSize; i++) {
            const endpoint = endpoints[i % endpoints.length];
            const connection = new Connection(endpoint, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000,
                disableRetryOnRateLimit: false,
                httpHeaders: {
                    'User-Agent': '4T-Bot-Trading-Service/1.0.0'
                }
            });
            
            this.connectionPool.set(i, {
                connection,
                endpoint,
                inUse: false,
                lastUsed: Date.now(),
                failureCount: 0,
                lastFailureTime: 0
            });
        }
        
        this.logger.info(`🔗 Trading service connection pool initialized with ${poolSize} connections`);
    }
    
    /**
     * Get RPC endpoints with fallbacks
     */
    getRpcEndpoints() {
        const endpoints = [
            this.config.rpcEndpoint || 'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana',
            'https://mainnet.rpcpool.com'
        ];
        
        // Remove duplicates and filter valid endpoints
        return [...new Set(endpoints)].filter(endpoint => endpoint && endpoint.startsWith('http'));
    }
    
    /**
     * Get available connection from pool
     */
    getConnection() {
        // Try to get a healthy connection
        for (const [id, connInfo] of this.connectionPool) {
            if (!connInfo.inUse && 
                connInfo.failureCount < 3 && 
                (Date.now() - connInfo.lastFailureTime) > 30000) {
                
                connInfo.inUse = true;
                connInfo.lastUsed = Date.now();
                return { id, connection: connInfo.connection, connInfo };
            }
        }
        
        // If no healthy connections, get any available one
        for (const [id, connInfo] of this.connectionPool) {
            if (!connInfo.inUse) {
                connInfo.inUse = true;
                connInfo.lastUsed = Date.now();
                return { id, connection: connInfo.connection, connInfo };
            }
        }
        
        // Create temporary connection if pool is exhausted
        const endpoints = this.getRpcEndpoints();
        const tempConnection = new Connection(endpoints[0], { commitment: 'confirmed' });
        
        return { 
            id: 'temp', 
            connection: tempConnection, 
            connInfo: { isTemporary: true },
            isTemporary: true 
        };
    }
    
    /**
     * Release connection back to pool
     */
    releaseConnection(connInfo) {
        if (connInfo.isTemporary) {
            return;
        }
        
        const poolConn = this.connectionPool.get(connInfo.id);
        if (poolConn) {
            poolConn.inUse = false;
            poolConn.lastUsed = Date.now();
        }
    }
    
    /**
     * Mark connection as failed
     */
    markConnectionFailed(connInfo, error) {
        if (connInfo.isTemporary) {
            return;
        }
        
        const poolConn = this.connectionPool.get(connInfo.id);
        if (poolConn) {
            poolConn.failureCount++;
            poolConn.lastFailureTime = Date.now();
            
            this.logger.warn(`⚠️ Connection ${connInfo.id} marked as failed: ${error.message}`);
        }
    }
    
    /**
     * Start request processor for batching
     */
    startRequestProcessor() {
        setInterval(() => {
            this.processRequestQueue();
        }, 100); // Process every 100ms
    }
    
    /**
     * Process queued requests in batches
     */
    async processRequestQueue() {
        if (this.requestQueue.length === 0) return;
        
        const batchSize = Math.min(10, this.requestQueue.length);
        const batch = this.requestQueue.splice(0, batchSize);
        
        // Group requests by type for better batching
        const groupedRequests = this.groupRequestsByType(batch);
        
        for (const [requestType, requests] of Object.entries(groupedRequests)) {
            await this.processBatch(requestType, requests);
        }
    }
    
    /**
     * Group requests by type for optimal batching
     */
    groupRequestsByType(requests) {
        const grouped = {};
        
        for (const request of requests) {
            const type = request.type || 'default';
            if (!grouped[type]) {
                grouped[type] = [];
            }
            grouped[type].push(request);
        }
        
        return grouped;
    }
    
    /**
     * Process batch of requests
     */
    async processBatch(requestType, requests) {
        const connInfo = this.getConnection();
        
        try {
            switch (requestType) {
                case 'balance':
                    await this.processBalanceBatch(connInfo.connection, requests);
                    break;
                case 'tokenBalance':
                    await this.processTokenBalanceBatch(connInfo.connection, requests);
                    break;
                case 'transaction':
                    await this.processTransactionBatch(connInfo.connection, requests);
                    break;
                default:
                    await this.processDefaultBatch(connInfo.connection, requests);
            }
        } catch (error) {
            this.logger.error(`❌ Batch processing failed for ${requestType}:`, error);
            this.markConnectionFailed(connInfo, error);
            
            // Mark all requests in batch as failed
            for (const request of requests) {
                if (request.reject) {
                    request.reject(error);
                }
            }
        } finally {
            this.releaseConnection(connInfo);
        }
    }
    
    /**
     * Process balance check batch
     */
    async processBalanceBatch(connection, requests) {
        const publicKeys = requests.map(req => req.publicKey);
        
        try {
            const balances = await connection.getMultipleAccountsInfo(publicKeys);
            
            // Resolve each request with its balance
            for (let i = 0; i < requests.length; i++) {
                const request = requests[i];
                const balance = balances[i];
                
                if (request.resolve) {
                    request.resolve(balance ? balance.lamports : 0);
                }
            }
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Process token balance batch
     */
    async processTokenBalanceBatch(connection, requests) {
        const tokenAccounts = requests.map(req => req.tokenAccount);
        
        try {
            const tokenBalances = await connection.getMultipleAccountsInfo(tokenAccounts);
            
            // Resolve each request with its token balance
            for (let i = 0; i < requests.length; i++) {
                const request = requests[i];
                const tokenBalance = tokenBalances[i];
                
                if (request.resolve) {
                    request.resolve(tokenBalance ? tokenBalance.data : null);
                }
            }
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Process transaction batch
     */
    async processTransactionBatch(connection, requests) {
        const signatures = requests.map(req => req.signature);
        
        try {
            const transactions = await connection.getMultipleAccountsInfo(signatures);
            
            // Resolve each request with its transaction
            for (let i = 0; i < requests.length; i++) {
                const request = requests[i];
                const transaction = transactions[i];
                
                if (request.resolve) {
                    request.resolve(transaction);
                }
            }
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Process default batch (individual processing)
     */
    async processDefaultBatch(connection, requests) {
        for (const request of requests) {
            try {
                const result = await this.executeRequest(connection, request);
                if (request.resolve) {
                    request.resolve(result);
                }
            } catch (error) {
                if (request.reject) {
                    request.reject(error);
                }
            }
        }
    }
    
    /**
     * Execute individual request
     */
    async executeRequest(connection, request) {
        const startTime = Date.now();
        
        try {
            let result;
            
            switch (request.method) {
                case 'getBalance':
                    result = await connection.getBalance(request.publicKey);
                    break;
                case 'getTokenAccountsByOwner':
                    result = await connection.getTokenAccountsByOwner(request.owner, request.filter);
                    break;
                case 'getAccountInfo':
                    result = await connection.getAccountInfo(request.publicKey);
                    break;
                case 'sendTransaction':
                    result = await connection.sendTransaction(request.transaction, request.signers, request.options);
                    break;
                case 'confirmTransaction':
                    result = await connection.confirmTransaction(request.signature, request.commitment);
                    break;
                default:
                    throw new Error(`Unknown method: ${request.method}`);
            }
            
            // Record success metrics
            this.recordSuccess(startTime);
            
            return result;
            
        } catch (error) {
            // Record failure metrics
            this.recordFailure(startTime, error);
            
            // Check circuit breaker
            this.checkCircuitBreaker(error);
            
            throw error;
        }
    }
    
    /**
     * Add request to queue for batching
     */
    addToQueue(request) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                ...request,
                resolve,
                reject,
                timestamp: Date.now()
            });
        });
    }
    
    /**
     * Get balance with queuing
     */
    async getBalance(publicKey) {
        return this.addToQueue({
            type: 'balance',
            method: 'getBalance',
            publicKey
        });
    }
    
    /**
     * Get token accounts with queuing
     */
    async getTokenAccountsByOwner(owner, filter) {
        return this.addToQueue({
            type: 'tokenBalance',
            method: 'getTokenAccountsByOwner',
            owner,
            filter
        });
    }
    
    /**
     * Send transaction with queuing
     */
    async sendTransaction(transaction, signers, options) {
        return this.addToQueue({
            type: 'transaction',
            method: 'sendTransaction',
            transaction,
            signers,
            options
        });
    }
    
    /**
     * Check circuit breaker status
     */
    checkCircuitBreaker(error) {
        const now = Date.now();
        
        if (this.circuitBreaker.isOpen) {
            if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failureCount = 0;
                this.logger.info('✅ Circuit breaker closed');
            }
            return;
        }
        
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = now;
        
        if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
            this.circuitBreaker.isOpen = true;
            this.logger.warn('🚨 Circuit breaker opened');
        }
    }
    
    /**
     * Record successful request
     */
    recordSuccess(startTime) {
        const responseTime = Date.now() - startTime;
        
        this.performanceMetrics.totalRequests++;
        this.performanceMetrics.successfulRequests++;
        
        this.updatePerformanceMetrics(responseTime);
    }
    
    /**
     * Record failed request
     */
    recordFailure(startTime, error) {
        const responseTime = Date.now() - startTime;
        
        this.performanceMetrics.totalRequests++;
        this.performanceMetrics.failedRequests++;
        
        this.updatePerformanceMetrics(responseTime);
        
        this.logger.error('❌ Request failed:', error.message);
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(responseTime) {
        const totalRequests = this.performanceMetrics.totalRequests;
        const currentAvg = this.performanceMetrics.averageResponseTime;
        
        this.performanceMetrics.averageResponseTime = 
            ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
        
        // Log slow requests
        if (responseTime > 1000) {
            this.logSlowRequest(responseTime);
        }
    }
    
    /**
     * Log slow requests
     */
    logSlowRequest(responseTime) {
        this.performanceMetrics.slowRequests.push({
            time: responseTime,
            timestamp: Date.now()
        });
        
        // Keep only last 100 slow requests
        if (this.performanceMetrics.slowRequests.length > 100) {
            this.performanceMetrics.slowRequests.shift();
        }
        
        if (responseTime > 5000) {
            this.logger.warn(`🐌 Very slow request detected: ${responseTime}ms`);
        }
    }
    
    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        setInterval(() => {
            this.logPerformanceMetrics();
        }, 60000); // Log every minute
    }
    
    /**
     * Log performance metrics
     */
    logPerformanceMetrics() {
        const metrics = this.getPerformanceMetrics();
        
        this.logger.info('📊 Trading Service Performance:', {
            totalRequests: metrics.totalRequests,
            successRate: metrics.successRate,
            averageResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
            circuitBreakerStatus: this.circuitBreaker.isOpen ? 'OPEN' : 'CLOSED',
            connectionPoolSize: this.connectionPool.size,
            activeConnections: Array.from(this.connectionPool.values()).filter(c => c.inUse).length
        });
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            successRate: this.performanceMetrics.totalRequests > 0 
                ? (this.performanceMetrics.successfulRequests / this.performanceMetrics.totalRequests * 100).toFixed(2)
                : 0,
            failureRate: this.performanceMetrics.totalRequests > 0 
                ? (this.performanceMetrics.failedRequests / this.performanceMetrics.totalRequests * 100).toFixed(2)
                : 0,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus() {
        return {
            isOpen: this.circuitBreaker.isOpen,
            failureCount: this.circuitBreaker.failureCount,
            threshold: this.circuitBreaker.threshold,
            lastFailureTime: this.circuitBreaker.lastFailureTime,
            timeout: this.circuitBreaker.timeout
        };
    }
    
    /**
     * Reset circuit breaker
     */
    resetCircuitBreaker() {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.lastFailureTime = 0;
        
        this.logger.info('🔄 Circuit breaker reset');
    }
    
    /**
     * Health check
     */
    async healthCheck() {
        try {
            const connInfo = this.getConnection();
            
            try {
                await connInfo.connection.getLatestBlockhash();
                
                return {
                    status: 'healthy',
                    circuitBreaker: this.getCircuitBreakerStatus(),
                    connectionPool: {
                        total: this.connectionPool.size,
                        active: Array.from(this.connectionPool.values()).filter(c => c.inUse).length
                    },
                    performance: this.getPerformanceMetrics()
                };
                
            } finally {
                this.releaseConnection(connInfo);
            }
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                circuitBreaker: this.getCircuitBreakerStatus()
            };
        }
    }
    
    /**
     * Close all connections
     */
    async close() {
        try {
            // Close all pool connections
            for (const [_, connInfo] of this.connectionPool) {
                if (connInfo.connection) {
                    connInfo.connection.disconnect();
                }
            }
            
            this.logger.info('✅ Trading service connections closed');
            
        } catch (error) {
            this.logger.error('❌ Error closing connections:', error);
        }
    }
}

module.exports = OptimizedTradingService; 