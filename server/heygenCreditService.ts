import { storage } from './storage';
import { logger } from './logger';

export interface CreditCheckResult {
  allowed: boolean;
  reason?: string;
  balance: {
    totalUsed: number;
    last24h: number;
    last7d: number;
  };
}

class HeygenCreditService {
  private creditLimit: number;
  private warningThreshold: number;
  private criticalThreshold: number;

  constructor() {
    this.creditLimit = parseInt(process.env.HEYGEN_CREDIT_LIMIT || '1000', 10);
    this.warningThreshold = parseInt(process.env.HEYGEN_WARNING_THRESHOLD || '20', 10);
    this.criticalThreshold = parseInt(process.env.HEYGEN_CRITICAL_THRESHOLD || '10', 10);
  }

  async checkCreditBalance(): Promise<CreditCheckResult> {
    const log = logger.child({ service: 'heygen-credit' });

    try {
      const balance = await storage.getHeygenCreditBalance();
      const remaining = this.creditLimit - balance.totalUsed;

      log.debug({
        totalUsed: balance.totalUsed,
        remaining,
        limit: this.creditLimit,
      }, 'Credit balance checked');

      // Critical: Block if below critical threshold
      if (remaining < this.criticalThreshold) {
        log.error({
          remaining,
          criticalThreshold: this.criticalThreshold,
        }, 'CRITICAL: HeyGen credits exhausted - blocking new requests');

        return {
          allowed: false,
          reason: `Insufficient credits (${remaining} remaining). Contact administrator to increase limit.`,
          balance,
        };
      }

      // Warning: Log but allow if below warning threshold
      if (remaining < this.warningThreshold) {
        log.warn({
          remaining,
          warningThreshold: this.warningThreshold,
        }, 'WARNING: HeyGen credits running low');
      }

      return {
        allowed: true,
        balance,
      };
    } catch (error: any) {
      log.error({ error: error.message }, 'Error checking credit balance');
      return {
        allowed: true,
        balance: { totalUsed: 0, last24h: 0, last7d: 0 },
      };
    }
  }

  async logCreditUsage(userId: string | null, operation: string, creditsUsed: number = 1, successful: boolean = true): Promise<void> {
    const log = logger.child({ service: 'heygen-credit', operation });

    try {
      // Convert temp user IDs to null to avoid FK constraint violations
      // Temp users (temp_*) are client-side anonymous sessions never persisted to users table
      const persistedUserId = userId?.startsWith('temp_') ? null : userId;

      await storage.logHeygenCredit({
        userId: persistedUserId,
        operation,
        creditsUsed,
        successful,
      });

      log.info({
        userId,
        creditsUsed,
        successful,
      }, `Logged ${creditsUsed} credit(s) for ${operation}`);

      const balance = await storage.getHeygenCreditBalance();
      const remaining = this.creditLimit - balance.totalUsed;

      if (remaining < this.warningThreshold) {
        log.warn({
          remaining,
          totalUsed: balance.totalUsed,
          limit: this.creditLimit,
        }, 'HeyGen credits running low after usage');
      }
    } catch (error: any) {
      log.error({ error: error.message }, 'Error logging credit usage');
    }
  }

  async getCreditStats(userId?: string) {
    try {
      const balance = await storage.getHeygenCreditBalance();
      const remaining = this.creditLimit - balance.totalUsed;

      let userUsage;
      if (userId) {
        userUsage = await storage.getHeygenCreditUsage(userId);
      }

      return {
        limit: this.creditLimit,
        totalUsed: balance.totalUsed,
        remaining,
        last24h: balance.last24h,
        last7d: balance.last7d,
        warningThreshold: this.warningThreshold,
        criticalThreshold: this.criticalThreshold,
        status: remaining < this.criticalThreshold
          ? 'critical'
          : remaining < this.warningThreshold
          ? 'warning'
          : 'ok',
        userUsage,
      };
    } catch (error: any) {
      logger.error({ error: error.message, service: 'heygen-credit' }, 'Error getting credit stats');
      throw error;
    }
  }
}

export const heygenCreditService = new HeygenCreditService();
