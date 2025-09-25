require('dotenv').config();

/**
 * Production Configuration for 4T-Bot
 * Optimized for maximum performance and reliability
 */
const productionConfig = {
    // Environment
    NODE_ENV: 'production',
    
    // Database Optimization
    database: {
        // SQLite optimizations
        pragma: {
            journal_mode: 'WAL',           // Write-Ahead Logging for better concurrency
            synchronous: 'NORMAL',         // Balance between safety and performance
            cache_size: -64000,            // 64MB cache
            temp_store: 'MEMORY',          // Store temp tables in memory
            mmap_size: 268435456,          // 256MB memory mapping
            page_size: 4096,               // Optimal page size
            auto_vacuum: 'INCREMENTAL',    // Incremental vacuum for better performance
            wal_autocheckpoint: 1000,     // Checkpoint every 1000 pages
            checkpoint_fullfsync: false,   // Don't fsync on checkpoint
            cache_spill: false,            // Don't spill cache to disk
            secure_delete: false,          // Disable secure delete for performance
            cell_size_check: false,        // Disable cell size checking
            query_only: false,             // Enable write operations
            read_uncommitted: false,       // Don't read uncommitted data
            recursive_triggers: false,     // Disable recursive triggers
            foreign_keys: true,            // Enable foreign key constraints
            ignore_check_constraints: false, // Don't ignore check constraints
            legacy_alter_table: false,     // Use modern alter table
            legacy_file_format: false,     // Use modern file format
            synchronous: 'NORMAL'          // Normal synchronous mode
        },
        
        // Connection pool settings
        pool: {
            min: 5,                        // Minimum connections
            max: 20,                       // Maximum connections
            acquireTimeoutMillis: 30000,   // 30 seconds to acquire connection
            createTimeoutMillis: 30000,    // 30 seconds to create connection
            destroyTimeoutMillis: 5000,    // 5 seconds to destroy connection
            idleTimeoutMillis: 30000,      // 30 seconds idle timeout
            reapIntervalMillis: 1000,     // Check for idle connections every second
            createRetryIntervalMillis: 200 // Retry connection creation every 200ms
        },
        
        // Query optimization
        query: {
            timeout: 30000,                // 30 second query timeout
            maxRetries: 3,                 // Maximum retry attempts
            retryDelay: 1000,             // 1 second delay between retries
            batchSize: 100,                // Batch size for bulk operations
            cacheSize: 1000,               // Number of cached queries
            cacheTTL: 300000,             // 5 minutes cache TTL
            slowQueryThreshold: 1000      // Log queries taking more than 1 second
        }
    },
    
    // Redis Configuration
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        
        // Connection pool settings
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxLoadingTimeout: 10000,
        
        // Performance settings
        lazyConnect: false,
        keepAlive: 30000,
        family: 4,
        db: 0,
        
        // Cluster settings (if using Redis Cluster)
        enableOfflineQueue: false,
        enableAutoPipelining: true,
        maxAutoPipelining: 32,
        
        // Memory optimization
        maxMemoryPolicy: 'allkeys-lru',
        maxMemory: '2gb',
        save: '',
        appendonly: false
    },
    
    // Trading Service Optimization
    trading: {
        // Connection pool
        connectionPool: {
            min: 3,
            max: 8,
            acquireTimeout: 30000,
            idleTimeout: 30000
        },
        
        // Request batching
        batching: {
            enabled: true,
            batchSize: 10,
            batchTimeout: 100,             // 100ms batch timeout
            maxQueueSize: 1000
        },
        
        // Circuit breaker
        circuitBreaker: {
            failureThreshold: 5,
            recoveryTimeout: 60000,        // 1 minute recovery timeout
            monitorInterval: 10000         // Check every 10 seconds
        },
        
        // RPC endpoints with fallbacks
        rpcEndpoints: [
            process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana',
            'https://mainnet.rpcpool.com',
            'https://solana.public-rpc.com'
        ],
        
        // Rate limiting
        rateLimit: {
            requestsPerSecond: 100,
            burstSize: 200,
            windowMs: 60000                // 1 minute window
        }
    },
    
    // API Performance
    api: {
        // Response caching
        cache: {
            enabled: true,
            ttl: 300,                      // 5 minutes default TTL
            maxSize: 1000,                 // Maximum cache entries
            checkPeriod: 600               // Cleanup every 10 minutes
        },
        
        // Rate limiting
        rateLimit: {
            windowMs: 15 * 60 * 1000,     // 15 minutes
            max: 100,                      // 100 requests per window
            message: 'Too many requests, please try again later.',
            standardHeaders: true,
            legacyHeaders: false
        },
        
        // Compression
        compression: {
            enabled: true,
            threshold: 1024,               // Compress responses > 1KB
            level: 6,                      // Compression level (0-9)
            memLevel: 8                    // Memory usage level
        },
        
        // CORS
        cors: {
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
            credentials: true,
            maxAge: 86400                  // 24 hours
        }
    },
    
    // Logging Optimization
    logging: {
        level: 'info',
        maxFiles: 5,                      // Keep 5 log files
        maxSize: '10m',                   // Maximum 10MB per file
        tailable: true,                   // Enable log rotation
        compress: true,                    // Compress old log files
        
        // Performance logging
        performance: {
            enabled: true,
            slowQueryThreshold: 1000,     // Log queries > 1 second
            slowResponseThreshold: 2000,  // Log responses > 2 seconds
            logInterval: 60000             // Log metrics every minute
        }
    },
    
    // Memory Management
    memory: {
        // Garbage collection
        gc: {
            enabled: true,
            interval: 300000,              // Run GC every 5 minutes
            threshold: 100 * 1024 * 1024  // 100MB threshold
        },
        
        // Memory limits
        limits: {
            maxHeapSize: '1gb',
            maxOldSpaceSize: '512mb',
            maxNewSpaceSize: '256mb'
        }
    },
    
    // Monitoring and Health Checks
    monitoring: {
        enabled: true,
        interval: 30000,                  // Check every 30 seconds
        timeout: 10000,                   // 10 second timeout
        
        // Metrics collection
        metrics: {
            enabled: true,
            interval: 60000,               // Collect metrics every minute
            retention: 24 * 60 * 60 * 1000 // Keep 24 hours of data
        },
        
        // Alerting
        alerts: {
            enabled: true,
            thresholds: {
                cpuUsage: 80,              // Alert if CPU > 80%
                memoryUsage: 80,           // Alert if memory > 80%
                responseTime: 5000,        // Alert if response > 5 seconds
                errorRate: 5               // Alert if error rate > 5%
            }
        }
    },
    
    // Security
    security: {
        // Rate limiting
        rateLimit: {
            enabled: true,
            windowMs: 15 * 60 * 1000,     // 15 minutes
            max: 100                       // 100 requests per window
        },
        
        // Request validation
        validation: {
            enabled: true,
            maxBodySize: '10mb',
            maxUrlLength: 2048
        },
        
        // Headers
        headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        }
    }
};

module.exports = productionConfig; 