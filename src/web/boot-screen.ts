/** DOM boot screen shared by manifest loading and Phaser's selection loader. */
export class BootScreen {
  private readonly root = document.getElementById('loading')!;
  private readonly label = document.getElementById('loading-status')!;
  private readonly value = document.getElementById('loading-percent')!;
  private readonly track = document.getElementById('loading-track')!;
  private readonly fill = document.getElementById('loading-fill')!;
  private shownAt = performance.now();

  show(label: string): void {
    this.shownAt = performance.now();
    this.root.classList.remove('failed');
    this.root.classList.remove('hidden');
    this.set(0, label);
  }

  set(progress: number, label: string): void {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    this.label.textContent = label;
    this.value.textContent = `${percent}%`;
    this.track.setAttribute('aria-valuenow', String(percent));
    this.fill.style.width = `${percent}%`;
  }

  async complete(): Promise<void> {
    this.set(1, '开局就绪');
    await new Promise(resolve => setTimeout(resolve, Math.max(350, 1250 - (performance.now() - this.shownAt))));
    this.root.classList.add('hidden');
  }

  fail(error: unknown): void {
    this.set(0, error instanceof Error ? error.message : String(error));
    this.root.classList.add('failed');
    document.getElementById('loading-help')!.textContent = `${this.label.textContent}。请检查资源后刷新重试`;
  }
}
