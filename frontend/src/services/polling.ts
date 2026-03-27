/**
 * Polling service for REST API calls with smart updates (only on value changes)
 */
class PollingService {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastData: Map<string, any> = new Map();

  /**
   * Start polling an endpoint at regular intervals
   * @param key Unique identifier for this polling task
   * @param interval Interval in milliseconds
   * @param fetchFn Function that returns a promise with the data
   * @param onUpdate Callback function called when data changes
   * @param onError Optional error callback
   */
  startPolling(
    key: string,
    interval: number,
    fetchFn: () => Promise<any>,
    onUpdate: (data: any) => void,
    onError?: (error: Error) => void
  ): void {
    // Clear any existing interval for this key
    if (this.intervals.has(key)) {
      clearInterval(this.intervals.get(key)!);
    }

    console.log(`[POLLING] Starting polling for ${key} at ${interval}ms interval`);

    // Initial fetch
    this.fetchAndUpdate(key, fetchFn, onUpdate, onError);

    // Set up recurring interval
    const intervalId = setInterval(
      () => this.fetchAndUpdate(key, fetchFn, onUpdate, onError),
      interval
    );

    this.intervals.set(key, intervalId);
  }

  /**
   * Stop polling for a specific key
   */
  stopPolling(key: string): void {
    if (this.intervals.has(key)) {
      clearInterval(this.intervals.get(key)!);
      this.intervals.delete(key);
      this.lastData.delete(key);
      console.log(`[POLLING] Stopped polling for ${key}`);
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    this.intervals.forEach((intervalId) => clearInterval(intervalId));
    this.intervals.clear();
    this.lastData.clear();
    console.log('[POLLING] Stopped all polling');
  }

  /**
   * Fetch data and compare with last known data
   */
  private async fetchAndUpdate(
    key: string,
    fetchFn: () => Promise<any>,
    onUpdate: (data: any) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      const newData = await fetchFn();

      // Compare with last known data to avoid unnecessary updates
      const lastKnownData = this.lastData.get(key);
      if (this.hasDataChanged(lastKnownData, newData)) {
        console.log(`[POLLING] Data changed for ${key}, triggering update`);
        this.lastData.set(key, this.deepClone(newData));
        onUpdate(newData);
      } else {
        console.debug(`[POLLING] No changes detected for ${key}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[POLLING] Error fetching data for ${key}:`, err);
      if (onError) {
        onError(err);
      }
    }
  }

  /**
   * Deep compare two objects to detect changes
   */
  private hasDataChanged(oldData: any, newData: any): boolean {
    if (oldData === undefined || oldData === null) {
      return true; // First time, always trigger update
    }

    // Simple JSON comparison for objects
    try {
      return JSON.stringify(oldData) !== JSON.stringify(newData);
    } catch {
      // Fallback to reference comparison
      return oldData !== newData;
    }
  }

  /**
   * Deep clone an object
   */
  private deepClone(obj: any): any {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return obj;
    }
  }

  /**
   * Get polling status
   */
  getStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    this.intervals.forEach((_, key) => {
      status[key] = 1; // Simple status indicator
    });
    return status;
  }
}

// Export singleton instance
export const pollingService = new PollingService();
