// import { useEffect } from 'react'
import './App.css'
import CardsPanel from './components/CardsPanel.tsx';
// import { usePythonEvents } from './usePythonEvents';



export default function App() {
  // const { events, send } = usePythonEvents();
//   useEffect(() => {
//   window.dbg.listIpc()
//     .then(names => console.log('[RENDERER] IPCs in main:', names))
//     .catch(err => console.error('dbg:listIpc failed', err));
// }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Python Bridge Demo</h1>
      <button>Prefix Map</button>
      <button
        onClick={() => window.gcal.googleConnectAndOpenUpload()}
      >
        Upload Google Calendar</button>
      <div>
        <CardsPanel/>
      </div>
    </div>
  );
}
