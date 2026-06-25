/**
 * Spinner — 零依赖手动旋转动画
 *
 * 只使用 \r（回车） + ES2020 字符逐帧刷新 stderr，
 * 不触碰任何 TTY 光标控制码（如 \x1b[?25l），
 * 不会与 Node.js readline 冲突。
 */
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TICK_MS = 80;

export function createSpinner(text: string) {
  let frameIdx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentText = text;

  return {
    start() {
      frameIdx = 0;
      timer = setInterval(() => {
        const frame = BRAILLE[frameIdx % BRAILLE.length]!;
        process.stderr.write(`\r\x1b[K${frame} ${currentText}`);
        frameIdx++;
      }, TICK_MS);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      process.stderr.write(`\r\x1b[K`);
    },
    update(newText: string) {
      currentText = newText;
    },
  };
}
