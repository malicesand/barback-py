import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import CardsPanel from './components/cardsPanel.tsx';
// import { usePythonEvents } from './usePythonEvents';

// function App() {
//   // const [count, setCount] = useState(0)
//     // const { events, send } = usePythonEvents();
//     // const {  send } = usePythonEvents();

//   return (
//     <>
//       <div> 
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div> 
//       <h1>Vite + React</h1>
//       <div className="card">
//         {/* <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button> */}
//         <button onClick={() => send({ command: 'ping' })}>Ping</button>
//         <p>
//           Edit <code>src/App.tsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

// export default App
// src/App.tsx


// function App() {
//   const { events, send } = usePythonEvents();

//   return (
//     <>
//       <div style={{ padding: 16, fontFamily: 'system-ui' }}>
//         <h1>Python Bridge Demo</h1>

//         <div >
//           <button onClick={() => send({ command: 'ping' })}>Ping</button>
//           <button onClick={() => send({ command: 'check_volumes' })}>Check Volumes</button>
//           <button onClick={() => send({ command: 'start_watch' })}>Start Watch</button>
//           <button onClick={() => send({ command: 'stop_watch' })}>Stop Watch</button>
//         </div>

//         <pre style={{ background: '#111', color: '#ddd', padding: 12, borderRadius: 8, maxHeight: 400, overflow: 'auto' }}>
//           {events.map((e, i) => (
//             <div key={i}>{JSON.stringify(e)}</div>
//           ))}
//         </pre>
//       </div>
     
//      </>
    
//   );
// }
// export default App
// import { usePythonEvents } from './usePythonEvents';

export default function App() {
  // const { events, send } = usePythonEvents();

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Python Bridge Demo</h1>
      <div>
        <CardsPanel/>
      </div>
      {/* <div>
        <button onClick={() => send({ command: 'ping' })}>Ping</button>
        <button onClick={() => send({ command: 'check_volumes' })}>Check Volumes</button>
        <button onClick={() => send({ command: 'start_watch' })}>Start Watch</button>
        <button onClick={() => send({ command: 'stop_watch' })}>Stop Watch</button>
      </div> */}

      {/* <pre style={{ background: '#111', color: '#ddd', padding: 12, borderRadius: 8, maxHeight: 400, overflow: 'auto' }}>
{events.map(e => JSON.stringify(e, null, 2)).join('\n')}
      </pre> */}
    </div>
  );
}
