import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { BillingProvider } from './context/BillingContext'
import { ToastProvider } from './components/Toast'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider><AuthProvider><BillingProvider><App /></BillingProvider></AuthProvider></ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
