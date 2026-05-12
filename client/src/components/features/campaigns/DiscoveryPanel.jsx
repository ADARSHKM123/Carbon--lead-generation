import { useState, useRef, useEffect, useMemo } from 'react'
import {
  X, Search, Loader2, CheckCircle2, AlertCircle, Wifi, WifiOff,
  Instagram, Facebook, Linkedin, Globe, Mail, Send, Sparkles,
  CheckSquare, Square, SlidersHorizontal, Users, Filter,
  ChevronRight, ExternalLink, Zap, Play, StopCircle
} from 'lucide-react'
import { cn, formatNumber } from '../../../lib/utils'
import MessagePreviewModal from '../leads/MessagePreviewModal'

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }

// ── Lead card shown inside discovery panel ──────────────────────────────────

function DiscoveredLeadCard({ lead, selected, onToggle }) {
  const PlatformIcon = PLATFORM_ICON[lead.platform]
  return (
    <div
      onClick={() => onToggle(lead.id)}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 group',
        selected
          ? 'border-primary/50 bg-primary/5'
          : 'border-border bg-card hover:border-primary/20 hover:bg-card/80'
      )}
    >
      <button className="flex-shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onToggle(lead.id) }}>
        {selected
          ? <CheckSquare className="w-4 h-4 text-primary" />
          : <Square className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      <div className="relative flex-shrink-0">
        <img src={lead.avatar} alt={lead.brandName} className="w-10 h-10 rounded-full bg-secondary" />
        {PlatformIcon && (
          <div className={cn(
            'absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-card',
            lead.platform === 'facebook' && 'bg-blue-600',
            lead.platform === 'instagram' && 'bg-pink-500',
            lead.platform === 'linkedin' && 'bg-sky-600',
          )}>
            <PlatformIcon className="w-2 h-2 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{lead.brandName}</span>
          {lead.hasWebsite && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
              Website
            </span>
          )}
          {lead.pageUrl && (
            <a
              href={lead.pageUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 ml-auto"
            >
              View profile <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lead.handle} · {lead.followerCount > 0 ? `${formatNumber(lead.followerCount)} followers` : 'follower count hidden'}
        </p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{lead.bio}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {lead.niches?.slice(0, 2).map(n => (
            <span key={n} className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">{n}</span>
          ))}
          {lead.website && (
            <a
              href={lead.website}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
            >
              <Globe className="w-2.5 h-2.5" /> {lead.website.replace(/^https?:\/\//, '').split('/')[0]}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Progress log entry ──────────────────────────────────────────────────────

function ProgressEntry({ entry }) {
  return (
    <div className={cn(
      'flex items-start gap-2 text-xs py-1',
      entry.type === 'error' ? 'text-red-400' : 'text-muted-foreground'
    )}>
      {entry.type === 'lead'
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
        : entry.type === 'error'
          ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      }
      <span className="leading-relaxed">{entry.message}</span>
    </div>
  )
}

// ── Main DiscoveryPanel ─────────────────────────────────────────────────────

export default function DiscoveryPanel({ campaign, open, onClose, onLeadsAdded }) {
  const [status, setStatus] = useState('idle') // idle | connecting | running | done | error
  const [progressLog, setProgressLog] = useState([])
  const [discoveredLeads, setDiscoveredLeads] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [stats, setStats] = useState({ found: 0, total: 0 })
  const [showPreview, setShowPreview] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  // Filters
  const [minFollowers, setMinFollowers] = useState(1000)
  const [mustHaveWebsite, setMustHaveWebsite] = useState(false)
  const [maxResults, setMaxResults] = useState(15)

  const wsRef = useRef(null)
  const logEndRef = useRef(null)

  // Auto-scroll progress log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progressLog])

  // Auto-select all newly found leads
  useEffect(() => {
    setSelectedIds(new Set(discoveredLeads.map(l => l.id)))
  }, [discoveredLeads.length])

  const filteredLeads = useMemo(() => {
    return discoveredLeads
      // Only filter on followers if we actually have a count (>0 means known)
      .filter(l => l.followerCount === 0 || l.followerCount >= minFollowers)
      .filter(l => !mustHaveWebsite || l.hasWebsite)
  }, [discoveredLeads, minFollowers, mustHaveWebsite])

  const selectedLeads = filteredLeads.filter(l => selectedIds.has(l.id))

  const toggleLead = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)))
    }
  }

  const startDiscovery = () => {
    if (!campaign?.searchTerms?.length) return

    setDiscoveredLeads([])
    setProgressLog([])
    setStats({ found: 0, total: 0 })
    setStatus('connecting')

    const ws = new WebSocket('ws://localhost:8000/api/ws/discover')
    wsRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      setStatus('running')
      addLog('Connected to discovery engine...')

      ws.send(JSON.stringify({
        search_terms: campaign.searchTerms,
        platforms: campaign.platforms?.length ? campaign.platforms : ['facebook'],
        filters: { min_followers: minFollowers, must_have_website: mustHaveWebsite },
        max_results: maxResults,
      }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'progress') {
        addLog(data.message)
        setStats({ found: data.found ?? 0, total: data.total ?? 0 })
      }

      if (data.type === 'lead') {
        setDiscoveredLeads(prev => {
          // Deduplicate by handle
          const exists = prev.some(l => l.handle === data.lead.handle)
          if (exists) return prev
          return [...prev, data.lead]
        })
        addLog(`Found: ${data.lead.brandName} (${formatNumber(data.lead.followerCount)} followers)`, 'lead')
      }

      if (data.type === 'complete') {
        setStatus('done')
        addLog(`Discovery complete — ${data.total} brands found.`)
        setWsConnected(false)
      }

      if (data.type === 'error') {
        setStatus('error')
        addLog(`Error: ${data.message}`, 'error')
        setWsConnected(false)
      }

      if (data.type === 'session') {
        addLog(data.message)
      }
    }

    ws.onerror = () => {
      setStatus('error')
      addLog('Connection failed — make sure the backend server is running on port 8000.', 'error')
      setWsConnected(false)
    }

    ws.onclose = () => {
      setWsConnected(false)
      if (status === 'running') setStatus('done')
    }
  }

  const stopDiscovery = () => {
    wsRef.current?.close()
    setStatus('done')
    addLog('Discovery stopped by user.')
  }

  const addLog = (message, type = 'info') => {
    setProgressLog(prev => [...prev, { message, type, id: Date.now() + Math.random() }])
  }

  const handleAddToLeads = () => {
    if (onLeadsAdded) onLeadsAdded(selectedLeads)
    onClose()
  }

  if (!open) return null

  const isRunning = status === 'running' || status === 'connecting'

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={!isRunning ? onClose : undefined} />

      <div className="w-full max-w-3xl bg-background border-l border-border flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Facebook className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="font-display font-bold text-foreground">Discover Leads</h2>
              <p className="text-xs text-muted-foreground">{campaign?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border',
              wsConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-secondary text-muted-foreground border-border'
            )}>
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {wsConnected ? 'Live' : 'Idle'}
            </div>
            {!isRunning && (
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search terms preview */}
        <div className="px-6 py-3 border-b border-border bg-secondary/50 flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2">Search terms from campaign:</p>
          <div className="flex flex-wrap gap-1.5">
            {campaign?.searchTerms?.map(term => (
              <span key={term} className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                {term}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: config + progress */}
          <div className="w-72 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b border-border space-y-4 flex-shrink-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Discovery Filters
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Min. Followers: <span className="text-primary">{formatNumber(minFollowers)}</span>
                </label>
                <input
                  type="range" min={0} max={100000} step={500}
                  value={minFollowers}
                  onChange={e => setMinFollowers(parseInt(e.target.value))}
                  disabled={isRunning}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>Any</span><span>100K+</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Must have website</p>
                  <p className="text-[10px] text-muted-foreground">Higher quality B2B leads</p>
                </div>
                <button
                  onClick={() => setMustHaveWebsite(p => !p)}
                  disabled={isRunning}
                  className={cn(
                    'w-10 h-5 rounded-full transition-colors relative flex-shrink-0',
                    mustHaveWebsite ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow',
                    mustHaveWebsite ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Max results: <span className="text-primary">{maxResults}</span>
                </label>
                <input
                  type="range" min={5} max={100} step={5}
                  value={maxResults}
                  onChange={e => setMaxResults(parseInt(e.target.value))}
                  disabled={isRunning}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>5</span><span>100 total</span>
                </div>
              </div>

              {/* Run button */}
              {isRunning ? (
                <button
                  onClick={stopDiscovery}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
                >
                  <StopCircle className="w-4 h-4" /> Stop Discovery
                </button>
              ) : (
                <button
                  onClick={startDiscovery}
                  disabled={!campaign?.searchTerms?.length}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'idle'
                    ? <><Play className="w-4 h-4" /> Start Discovery</>
                    : <><Search className="w-4 h-4" /> Search Again</>
                  }
                </button>
              )}
            </div>

            {/* Progress log */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Live Progress
              </p>

              {progressLog.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {status === 'idle'
                    ? 'Configure filters and click Start Discovery.'
                    : 'Waiting for updates...'}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {progressLog.map(entry => (
                    <ProgressEntry key={entry.id} entry={entry} />
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-2 text-xs text-primary pt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Searching...</span>
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>

            {/* Stats bar */}
            {(status !== 'idle') && (
              <div className="px-4 py-3 border-t border-border bg-secondary/50 flex-shrink-0">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Pages found</span>
                  <span className="font-semibold text-foreground">{discoveredLeads.length}</span>
                </div>
                {stats.total > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{stats.found}/{stats.total}</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: stats.total > 0 ? `${(stats.found / stats.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: discovered leads */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Leads toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/30 flex-shrink-0">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {selectedIds.size === filteredLeads.length && filteredLeads.length > 0
                  ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  : <Square className="w-3.5 h-3.5" />
                }
                {selectedIds.size === filteredLeads.length && filteredLeads.length > 0
                  ? 'Deselect all'
                  : `Select all (${filteredLeads.length})`
                }
              </button>

              {selectedLeads.length > 0 && (
                <span className="text-xs text-primary font-medium bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  {selectedLeads.length} selected
                </span>
              )}
            </div>

            {/* Lead list */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
              {filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  {isRunning ? (
                    <>
                      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                      <p className="text-sm text-muted-foreground">Searching selected platforms...</p>
                      <p className="text-xs text-muted-foreground mt-1">Leads will appear here as they are found</p>
                    </>
                  ) : (
                    <>
                      <Users className="w-8 h-8 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {status === 'idle' ? 'Start discovery to find fashion brands' : 'No leads match your filters'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                filteredLeads.map(lead => (
                  <DiscoveredLeadCard
                    key={lead.id}
                    lead={lead}
                    selected={selectedIds.has(lead.id)}
                    onToggle={toggleLead}
                  />
                ))
              )}
            </div>

            {/* Bottom action bar */}
            {filteredLeads.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-card flex-shrink-0 flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{selectedLeads.length}</span> selected ·{' '}
                  <span className="text-emerald-400">{selectedLeads.filter(l => l.hasWebsite).length} with website</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddToLeads}
                    disabled={selectedLeads.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-foreground border border-border rounded-lg text-xs font-medium hover:bg-border disabled:opacity-40 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Add to Leads
                  </button>
                  <button
                    onClick={() => setShowPreview(true)}
                    disabled={selectedLeads.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Message Selected ({selectedLeads.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message preview modal */}
      {showPreview && (
        <MessagePreviewModal
          leads={selectedLeads}
          campaign={campaign}
          onClose={() => setShowPreview(false)}
          onConfirm={() => {
            setShowPreview(false)
            handleAddToLeads()
          }}
        />
      )}
    </div>
  )
}
