export interface MusicPreloader {
  prepare(url: string, progress: (fraction: number) => void): Promise<string>;
  dispose(): void;
}

/** Fetch the entire recording; media preload and canplaythrough are only hints. */
export class DownloadedMusic implements MusicPreloader {
  private urls = new Set<string>();
  private requests = new Set<AbortController>();
  private disposed = false;

  async prepare(url: string, progress: (fraction: number) => void): Promise<string> {
    if (this.disposed) throw new Error('音乐加载已停止');
    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      progress(0);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`背景音乐下载失败（HTTP ${response.status}）`);
      const total = Number(response.headers.get('content-length'));
      let blob: Blob;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let received = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(new Uint8Array(value));
            received += value.byteLength;
            if (total > 0) progress(Math.min(0.99, received / total));
          }
        } finally { reader.releaseLock(); }
        blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'audio/mpeg' });
      } else blob = await response.blob();
      if (this.disposed || controller.signal.aborted) throw new Error('音乐加载已停止');
      if (!blob.size) throw new Error('背景音乐文件为空');
      const localUrl = URL.createObjectURL(blob);
      this.urls.add(localUrl);
      progress(1);
      return localUrl;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('背景音乐下载中断或超时，请刷新重试');
      throw error;
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
