// Hook: subscribe to python events
import { useEffect, useState, useCallback } from 'react';

export function usePythonEvents() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    // console.log('use py event')
    const off = window.pybridge.onPythonEvent((evt: any) => {
      setEvents((prev) => [evt, ...prev].slice(0, 200));
    });
    return () => off();
  }, []);

  const send = useCallback((payload: any) => {
    return window.pybridge.sendToPython(payload);
  }, []);

  return { events, send};
}

// import { useEffect, useMemo, useState, useCallback } from 'react';

// type Bridge = {
//   sendToPython?: (payload: any) => Promise<boolean>;
//   onPythonEvent?: (listener: (event: any) => void) => () => void;
// };

// export function usePythonEvents() {
//   const bridge: Bridge | undefined = useMemo(() => (window as any)?.pybridge, []);

//   const [events, setEvents] = useState<any[]>([]);

//   useEffect(() => {
//     if (!bridge?.onPythonEvent) return;               // no-op if not exposed yet
//     const off = bridge.onPythonEvent((evt: any) => {
//       setEvents(prev => [evt, ...prev].slice(0, 200));
//     });
//     return () => off?.();
//   }, [bridge]);

//   const send = useCallback((payload: any) => {
//     return bridge?.sendToPython ? bridge.sendToPython(payload) : Promise.resolve(false); 
//     console.log('yes')
//   }, [bridge]);

//   return { events, send, hasBridge: !!bridge };
// }
