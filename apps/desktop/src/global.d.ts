declare global {
  interface Window {
    barback: { ping: () => Promise<{ msg: string; electron: string; pid: number }> };
  }
}
export {};
