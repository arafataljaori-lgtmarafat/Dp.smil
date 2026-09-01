import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';

export interface VideoEncoderOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly outputFilePath?: string;
}

export interface VideoEncoderPort {
  /** Pushes raw RGBA pixel data for a single frame. */
  pushFrame(rgbaBuffer: Uint8Array): void;
  /** Closes the stream and resolves with the final output file path. */
  finish(): Promise<string>;
}

export class FFmpegVideoEncoder implements VideoEncoderPort {
  private readonly ffmpeg: ReturnType<typeof spawn>;
  private readonly outputPath: string;
  private isFinished = false;
  private readonly completionPromise: Promise<string>;

  public constructor(options: VideoEncoderOptions) {
    this.outputPath = options.outputFilePath ?? path.join(os.tmpdir(), `export-${randomUUID()}.mp4`);
    
    // FFmpeg expects raw RGBA pixels over stdin
    this.ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'rawvideo',
      '-vcodec', 'rawvideo',
      '-s', `${options.width}x${options.height}`,
      '-pix_fmt', 'rgba',
      '-r', `${options.fps}`,
      '-i', '-', // Read from stdin
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      this.outputPath
    ]);

    this.completionPromise = new Promise((resolve, reject) => {
      this.ffmpeg.on('close', (code) => {
        if (code === 0) resolve(this.outputPath);
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      this.ffmpeg.on('error', reject);
    });
  }

  public pushFrame(rgbaBuffer: Uint8Array): void {
    if (this.isFinished) throw new Error('Encoder is already finished.');
    if (!this.ffmpeg.stdin) throw new Error("No stdin"); this.ffmpeg.stdin.write(rgbaBuffer);
  }

  public async finish(): Promise<string> {
    if (this.isFinished) return this.completionPromise;
    this.isFinished = true;
    if (!this.ffmpeg.stdin) throw new Error("No stdin"); this.ffmpeg.stdin.end();
    return this.completionPromise;
  }
}
