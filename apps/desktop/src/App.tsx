import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import CardsPanel from './components/cardsPanel.tsx';
// import { usePythonEvents } from './usePythonEvents';



export default function App() {
  // const { events, send } = usePythonEvents();

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Python Bridge Demo</h1>
      <button>Prefix Map</button>
      <button>Upload Google Calendar</button>
      <div>
        <CardsPanel/>
      </div>
    </div>
  );
}
