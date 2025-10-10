// import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes} from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import CalConnect from '../components/CalConnect.tsx'


ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <Routes>
      <Route path='/' element={<App/>} />
      <Route path='/calendar' element={<CalConnect/>} />
    </Routes>
  </HashRouter>
)
