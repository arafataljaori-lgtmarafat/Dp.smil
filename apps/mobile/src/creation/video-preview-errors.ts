export class VideoPreviewRuntimeInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VideoPreviewRuntimeInputError';
  }
}

export class VideoPreviewMonotonicClockError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VideoPreviewMonotonicClockError';
  }
}
