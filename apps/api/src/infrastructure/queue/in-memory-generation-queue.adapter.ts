import { GenerationError, ValidationError } from '@dentpilot/domain';
import type { GenerationQueueMessage, GenerationQueuePort } from '@dentpilot/application';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertQueueMessage(message: GenerationQueueMessage): void {
  if (
    message.schemaVersion !== 1 ||
    !uuidPattern.test(message.jobId) ||
    !uuidPattern.test(message.ownerUserId) ||
    message.correlationId.trim().length === 0 ||
    message.correlationId.length > 200
  ) {
    throw new ValidationError('Generation queue message is invalid.');
  }
}

/** Development-only, non-durable queue adapter. It intentionally carries no media bytes or secrets. */
export class InMemoryGenerationQueueAdapter implements GenerationQueuePort {
  private execute: ((message: GenerationQueueMessage) => Promise<void>) | null = null;

  public constructor(
    private readonly delayMs: number,
    private readonly onError: (error: unknown, message: GenerationQueueMessage) => void,
  ) {}

  public setExecutor(execute: (message: GenerationQueueMessage) => Promise<void>): void {
    this.execute = execute;
  }

  public enqueue(message: GenerationQueueMessage): Promise<void> {
    assertQueueMessage(message);
    if (this.execute === null) {
      return Promise.reject(new GenerationError('Generation queue has not been initialized.'));
    }
    const immutableMessage = Object.freeze({ ...message });
    setTimeout(() => {
      const executor = this.execute;
      if (executor !== null) {
        void executor(immutableMessage).catch((error: unknown) => this.onError(error, immutableMessage));
      }
    }, this.delayMs);
    return Promise.resolve();
  }
}
