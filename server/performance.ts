// Performance optimizations and monitoring for latency reduction
import { Request, Response, NextFunction } from 'express';

// Request timeout middleware
export function timeoutMiddleware(timeoutMs: number = 10000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set response timeout
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ 
          error: 'Request timeout',
          message: 'The request took too long to process' 
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// Performance monitoring middleware
export function performanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      
      // Log slow requests (over 1 second)
      if (duration > 1000) {
        console.warn(`Slow request: ${req.method} ${req.path} - ${duration.toFixed(2)}ms`);
      }
      
      // Add performance header if headers haven't been sent
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
      }
    });
    
    next();
  };
}

// Connection keep-alive optimization
export function keepAliveConfig() {
  return {
    keepAlive: true,
    keepAliveMsecs: 30000, // 30 seconds
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000, // 60 seconds
    freeSocketTimeout: 30000, // 30 seconds  
  };
}

// Compression middleware setup
export function compressionConfig() {
  return {
    level: 6, // Good balance between compression ratio and speed
    threshold: 1024, // Only compress responses larger than 1KB
    filter: (req: Request, res: Response) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Compress everything else
      return true;
    }
  };
}

// Rate limiting for expensive operations
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimitMiddleware(maxRequests: number = 10, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientData = rateLimitMap.get(clientId);
    
    if (!clientData || now > clientData.resetTime) {
      // Reset or create new entry
      rateLimitMap.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }
    
    if (clientData.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait before making more requests',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
      return;
    }
    
    clientData.count++;
    next();
  };
}

// Health check endpoint for monitoring
export function healthCheck() {
  return (req: Request, res: Response) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime)}s`,
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      nodeVersion: process.version,
      platform: process.platform
    });
  };
}