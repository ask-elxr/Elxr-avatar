import CircuitBreaker from 'opossum';
import { logger } from './logger';
import { metrics } from './metrics';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  name?: string;
}

const DEFAULT_OPTIONS = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

export function createCircuitBreaker<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  serviceName: string,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<T, R> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const name = opts.name || serviceName;

  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    name,
  });

  breaker.on('open', () => {
    logger.error({ service: serviceName, circuit: 'open' }, 
      `Circuit breaker OPEN for ${serviceName} - requests will fail fast`
    );
    metrics.recordCircuitBreakerStateChange(serviceName, 'open');
  });

  breaker.on('halfOpen', () => {
    logger.warn({ service: serviceName, circuit: 'half-open' },
      `Circuit breaker HALF-OPEN for ${serviceName} - testing recovery`
    );
    metrics.recordCircuitBreakerStateChange(serviceName, 'half-open');
  });

  breaker.on('close', () => {
    logger.info({ service: serviceName, circuit: 'closed' },
      `Circuit breaker CLOSED for ${serviceName} - normal operation resumed`
    );
    metrics.recordCircuitBreakerStateChange(serviceName, 'closed');
  });

  breaker.on('success', (_result: any) => {
    logger.debug({ service: serviceName }, `${serviceName} call succeeded`);
    metrics.recordExternalCallSuccess(serviceName);
  });

  breaker.on('failure', (error: any) => {
    logger.error({ 
      service: serviceName, 
      error: error.message,
      stack: error.stack 
    }, `${serviceName} call failed`);
    metrics.recordExternalCallFailure(serviceName, error.message);
  });

  breaker.on('timeout', () => {
    logger.error({ service: serviceName, timeout: opts.timeout },
      `${serviceName} call timed out after ${opts.timeout}ms`
    );
    metrics.recordExternalCallTimeout(serviceName);
  });

  breaker.on('reject', () => {
    logger.warn({ service: serviceName },
      `${serviceName} call rejected - circuit breaker is open`
    );
    metrics.recordCircuitBreakerRejection(serviceName);
  });

  return breaker;
}

export interface WrappedServiceCall<T> {
  execute: (...args: any[]) => Promise<T>;
  isOpen: () => boolean;
  getStats: () => any;
  reset: () => void;
}

const registeredBreakers = new Map<string, CircuitBreaker<any, any>>();

export function resetCircuitBreaker(serviceName: string): boolean {
  const breaker = registeredBreakers.get(serviceName);
  if (breaker) {
    breaker.close();
    logger.info({ service: serviceName }, `Circuit breaker manually reset for ${serviceName}`);
    return true;
  }
  return false;
}

export function getAllBreakerStatuses(): Record<string, { open: boolean; stats: any }> {
  const statuses: Record<string, { open: boolean; stats: any }> = {};
  registeredBreakers.forEach((breaker, name) => {
    statuses[name] = { open: breaker.opened, stats: breaker.stats };
  });
  return statuses;
}

export function wrapServiceCall<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  serviceName: string,
  options: CircuitBreakerOptions = {}
): WrappedServiceCall<R> {
  const breaker = createCircuitBreaker(fn, serviceName, options);
  registeredBreakers.set(serviceName, breaker);

  return {
    execute: async (...args: T): Promise<R> => {
      const startTime = Date.now();
      try {
        const result = await breaker.fire(...args);
        const duration = Date.now() - startTime;
        metrics.recordExternalCallDuration(serviceName, duration);
        return result;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        metrics.recordExternalCallDuration(serviceName, duration);
        
        if (error.message?.includes('Breaker is open')) {
          throw new Error(`${serviceName} is currently unavailable (circuit breaker open). Please try again later.`);
        }
        throw error;
      }
    },
    isOpen: () => breaker.opened,
    getStats: () => breaker.stats,
    reset: () => {
      breaker.close();
      logger.info({ service: serviceName }, `Circuit breaker manually reset for ${serviceName}`);
    },
  };
}
