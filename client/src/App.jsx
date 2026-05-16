import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import Leads from './pages/Leads'
import Scraper from './pages/Scraper'
import Inbox from './pages/Inbox'
import Templates from './pages/Templates'
import Settings from './pages/Settings'
import { cn } from './lib/utils'
  
function ToastContainer() {
  const { toasts } = useApp()
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium animate-fade-in pointer-events-auto',
            toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-card border-border text-foreground'
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 ml-[220px] flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/scraper" element={<Scraper />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  )
}
