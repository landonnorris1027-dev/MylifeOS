/** One ordering boundary for IPC mutations, timer completion, flush and shutdown. */
export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private count = 0;
  get pending() { return this.count; }
  enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    this.count++;
    const result = this.tail.then(operation);
    this.tail = result.then(() => { this.count--; }, () => { this.count--; });
    return result;
  }
  async drain(): Promise<void> { await this.tail; }
}
