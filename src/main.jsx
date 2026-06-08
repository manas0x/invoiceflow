import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BusinessProvider } from './context/BusinessContext'
import { initializeData } from './data/mockData'

initializeData();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BusinessProvider>
      <App />
    </BusinessProvider>
  </StrictMode>,
)
