import { createContext, useContext, useState, useCallback } from 'react'
import { MOCK_CAMPAIGNS, MOCK_TEMPLATES } from '../data/mockCampaigns'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Leads start empty — populated by real discovery runs only
  const [leads, setLeads] = useState([])
  const [campaigns, setCampaigns] = useState(MOCK_CAMPAIGNS)
  const [templates, setTemplates] = useState(MOCK_TEMPLATES)
  const [replies, setReplies] = useState([])
  const [theme, setTheme] = useState('dark')
  const [toasts, setToasts] = useState([])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('light', next === 'light')
      return next
    })
  }, [])

  const addToast = useCallback((message, type = 'default') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const toggleLeadSelection = useCallback((leadId) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, selected: !l.selected } : l))
  }, [])

  const selectAllLeads = useCallback((selected) => {
    setLeads(prev => prev.map(l => ({ ...l, selected })))
  }, [])

  const updateLeadStatus = useCallback((leadId, status, outreachStatus = null) => {
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, status, outreachStatus: outreachStatus ?? l.outreachStatus } : l
    ))
  }, [])

  const addCampaign = useCallback((campaign) => {
    setCampaigns(prev => [campaign, ...prev])
  }, [])

  const updateCampaign = useCallback((id, updates) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [])

  const addTemplate = useCallback((template) => {
    setTemplates(prev => [template, ...prev])
  }, [])

  const updateTemplate = useCallback((id, updates) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const deleteTemplate = useCallback((id) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  const stats = {
    totalLeads: leads.length,
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.status === 'active').length,
    totalSent: campaigns.reduce((acc, c) => acc + c.sent, 0),
    totalReplied: campaigns.reduce((acc, c) => acc + c.replied, 0),
    avgReplyRate: campaigns.filter(c => c.sent > 0).length > 0
      ? (campaigns.filter(c => c.sent > 0).reduce((acc, c) => acc + c.replyRate, 0) /
         campaigns.filter(c => c.sent > 0).length).toFixed(1)
      : 0,
    leadsWithWebsite: leads.filter(l => l.hasWebsite).length,
    leadsWithEmail: leads.filter(l => l.hasEmail).length,
    inboxUnread: replies.filter(r => r.status === 'replied').length,
  }

  return (
    <AppContext.Provider value={{
      leads, setLeads,
      campaigns, setCampaigns,
      templates, setTemplates,
      replies, setReplies,
      theme, toggleTheme,
      toasts, addToast,
      toggleLeadSelection,
      selectAllLeads,
      updateLeadStatus,
      addCampaign,
      updateCampaign,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      stats,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
