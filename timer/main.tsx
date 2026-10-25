import React from 'react'
import ReactDOM from 'react-dom/client'
import { TimerApp } from './TimerApp'
import '../src/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TimerApp />
  </React.StrictMode>
)
