import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { SearchProvider } from './context/SearchContext'
import { PageChromeProvider } from './context/PageChromeContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SearchProvider>
          <PageChromeProvider>
            <App />
          </PageChromeProvider>
        </SearchProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
