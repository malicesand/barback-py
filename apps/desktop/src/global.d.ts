// Global Types
declare global {
  interface Window {
    pybridge: {
      sendToPython: (payload: unknown) => Promise<boolean>;
      onPythonEvent: (listener: (event: any) => void) => () => void;
      onPythonStderr: (cb: (chunk: string) => void) => () => void;
      ping: () => Promise<string>;
    };
  }
}
export {};
