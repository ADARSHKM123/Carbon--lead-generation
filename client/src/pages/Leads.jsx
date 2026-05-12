import { useState, useMemo, useCallback } from 'react'
import {
  Users, Globe, Mail, Phone, MessageCircle, Instagram, Facebook, Linkedin,
  ChevronDown, Filter, CheckSquare, Square, X, ExternalLink,
  Send, Sparkles, Loader2, CheckCircle2, AlertCircle, Eye,
  Search, SlidersHorizontal, ArrowUpDown
} from 'lucide-react'
import Header from '../components/layout/Header'
import MessagePreviewModal from '../components/features/leads/MessagePreviewModal'
import { useApp } from '../context/AppContext'
import { cn, formatNumber, PLATFORM_COLORS, STATUS_COLORS } from '../lib/utils'

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }

function LeadCard({ lead, onToggle, onView, isSelected }) {
  const PlatformIcon = PLATFORM_ICON[lead.platform]

  return (
    <div
      className={cn(
        'bg-card border rounded-xl p-4 transition-all duration-150 group relative cursor-pointer',
        isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
      )}
      onClick={() => onView(lead)}
    >
      {/* Select checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(lead.id) }}
        className="absolute top-3 right-3 z-10"
      >
        {isSelected
          ? <CheckSquare className="w-5 h-5 text-primary" />
          : <Square className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </button>

      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <img
            src={lead.avatar}
            alt={lead.brandName}
            className="w-11 h-11 rounded-full bg-secondary"
          />
          <div className={cn(
            'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-card',
            lead.platform === 'instagram' && 'bg-pink-500',
            lead.platform === 'facebook' && 'bg-blue-600',
            lead.platform === 'linkedin' && 'bg-sky-600',
          )}>
            {PlatformIcon && <PlatformIcon className="w-2.5 h-2.5 text-white" />}
          </div>
        </div>

        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-semibold text-sm text-foreground">{lead.brandName}</h4>
            {lead.hasWebsite && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium">Has Website</span>
            )}
            {lead.hasEmail && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <Mail className="w-2.5 h-2.5" /> Email
              </span>
            )}
            {lead.hasPhone && (
              <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" /> Phone
              </span>
            )}
            {lead.hasWhatsapp && (
              <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.handle}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{lead.bio}</p>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {lead.followerCount > 0 ? `${formatNumber(lead.followerCount)} followers` : 'followers hidden'}
            </span>
            <span className="text-xs text-muted-foreground">{lead.city}</span>
            {lead.niches.slice(0, 2).map(n => (
              <span key={n} className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">{n}</span>
            ))}
            {lead.pageUrl && (
              <a
                href={lead.pageUrl}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
              >
                View Profile <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LeadDetailPanel({ lead, onClose }) {
  const PlatformIcon = PLATFORM_ICON[lead.platform]

  return (
    <div className="w-80 flex-shrink-0 bg-card border-l border-border flex flex-col overflow-y-auto scrollbar-thin animate-slide-in">
      <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
        <h3 className="font-display font-semibold text-foreground text-sm">Brand Details</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <img src={lead.avatar} alt={lead.brandName} className="w-14 h-14 rounded-full bg-secondary" />
          <div>
            <h4 className="font-semibold text-foreground">{lead.brandName}</h4>
            <p className="text-xs text-muted-foreground">{lead.handle}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {PlatformIcon && (
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1', PLATFORM_COLORS[lead.platform])}>
                  <PlatformIcon className="w-3 h-3" /> {lead.platform}
                </span>
              )}
            </div>
          </div>
        </div>

        {lead.pageUrl && (
          <a
            href={lead.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            {PlatformIcon && <PlatformIcon className="w-4 h-4" />}
            View Profile on {lead.platform.charAt(0).toUpperCase() + lead.platform.slice(1)}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary rounded-lg p-3 text-center">
            <div className="text-lg font-display font-bold text-foreground">{formatNumber(lead.followerCount)}</div>
            <div className="text-[11px] text-muted-foreground">Followers</div>
          </div>
          <div className="bg-secondary rounded-lg p-3 text-center">
            <div className="text-lg font-display font-bold text-foreground">{lead.city}</div>
            <div className="text-[11px] text-muted-foreground">{lead.state}</div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-foreground mb-1.5">Bio</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{lead.bio}</p>
        </div>

        <div>
          <p className="text-xs font-medium text-foreground mb-1.5">Niche Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {lead.niches.map(n => (
              <span key={n} className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">{n}</span>
            ))}
          </div>
        </div>

        {lead.website && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Website</p>
            <a href={lead.website} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Globe className="w-3.5 h-3.5" />
              {lead.website.replace('https://', '')}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {(lead.email || lead.phone || lead.whatsapp) && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Contact Info</p>
            <div className="space-y-1.5">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-amber-400 hover:underline break-all">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  {lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-xs text-sky-400 hover:underline">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  {lead.phone}
                </a>
              )}
              {lead.whatsapp && (
                <a href={`https://wa.me/${lead.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-green-400 hover:underline">
                  <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {lead.whatsapp}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {lead.posts?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Recent Posts</p>
            <div className="space-y-2">
              {lead.posts.map((post, i) => (
                <div key={i} className="bg-secondary rounded-lg p-2.5 text-xs text-muted-foreground leading-relaxed">
                  "{post}"
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Leads() {
  const { leads, toggleLeadSelection, selectAllLeads, addToast, campaigns } = useApp()
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterWebsite, setFilterWebsite] = useState('all')
  const [filterFollowers, setFilterFollowers] = useState('all')
  const [sortBy, setSortBy] = useState('discoveredAt')
  const [detailLead, setDetailLead] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const selectedLeads = leads.filter(l => l.selected)

  const filtered = useMemo(() => {
    return leads
      .filter(l => {
        if (search && !l.brandName.toLowerCase().includes(search.toLowerCase()) &&
          !l.handle.toLowerCase().includes(search.toLowerCase()) &&
          !l.bio.toLowerCase().includes(search.toLowerCase())) return false
        if (filterPlatform !== 'all' && l.platform !== filterPlatform) return false
        if (filterWebsite === 'yes' && !l.hasWebsite) return false
        if (filterWebsite === 'no' && l.hasWebsite) return false
        if (filterFollowers === '1k-10k' && !(l.followerCount >= 1000 && l.followerCount < 10000)) return false
        if (filterFollowers === '10k-100k' && !(l.followerCount >= 10000 && l.followerCount < 100000)) return false
        if (filterFollowers === '100k+' && l.followerCount < 100000) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'followers') return b.followerCount - a.followerCount
        if (sortBy === 'discoveredAt') return new Date(b.discoveredAt) - new Date(a.discoveredAt)
        return 0
      })
  }, [leads, search, filterPlatform, filterWebsite, filterFollowers, sortBy])

  const allFilteredSelected = filtered.length > 0 && filtered.every(l => l.selected)

  const handleSelectAllFiltered = () => {
    filtered.forEach(l => {
      if (allFilteredSelected ? l.selected : !l.selected) toggleLeadSelection(l.id)
    })
  }

  const activeCampaign = campaigns.find(c => c.status === 'active') || campaigns[0]

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Leads"
          subtitle={`${leads.length} fashion brands discovered in India`}
          actions={
            selectedLeads.length > 0 ? (
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors animate-fade-in"
              >
                <Send className="w-4 h-4" />
                Approve & Send ({selectedLeads.length})
              </button>
            ) : null
          }
        />

        {/* Filters bar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-background/60 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search brands..."
              className="bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 w-44"
            />
          </div>

          {[
            {
              value: filterPlatform, onChange: setFilterPlatform, options: [
                ['all', 'All Platforms'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn']
              ]
            },
            {
              value: filterWebsite, onChange: setFilterWebsite, options: [
                ['all', 'All Leads'], ['yes', 'Has Website'], ['no', 'No Website']
              ]
            },
            {
              value: filterFollowers, onChange: setFilterFollowers, options: [
                ['all', 'All Followers'], ['1k-10k', '1K–10K'], ['10k-100k', '10K–100K'], ['100k+', '100K+']
              ]
            },
            {
              value: sortBy, onChange: setSortBy, options: [
                ['discoveredAt', 'Sort: Recent'], ['followers', 'Sort: Followers']
              ]
            },
          ].map(({ value, onChange, options }, i) => (
            <select
              key={i}
              value={value}
              onChange={e => onChange(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleSelectAllFiltered}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
              {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
            {selectedLeads.length > 0 && (
              <span className="text-xs text-primary font-medium bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                {selectedLeads.length} selected
              </span>
            )}
          </div>
        </div>

        {/* Lead grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="w-10 h-10 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-foreground mb-1">No leads match your filters</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isSelected={lead.selected}
                  onToggle={toggleLeadSelection}
                  onView={setDetailLead}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom action bar when leads selected */}
        {selectedLeads.length > 0 && (
          <div className="border-t border-border bg-card px-6 py-3 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span><span className="text-foreground font-medium">{selectedLeads.length}</span> brands selected for outreach</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{selectedLeads.filter(l => l.hasWebsite).length} have websites</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{selectedLeads.filter(l => l.hasEmail).length} have emails</span>
            </div>
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Preview & Approve Campaign
            </button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detailLead && (
        <LeadDetailPanel lead={detailLead} onClose={() => setDetailLead(null)} />
      )}

      {/* Message preview & approval modal */}
      {showPreview && (
        <MessagePreviewModal
          leads={selectedLeads}
          campaign={activeCampaign}
          onClose={() => setShowPreview(false)}
          onConfirm={() => {
            setShowPreview(false)
            addToast(`Campaign approved! Sending to ${selectedLeads.length} brands...`, 'success')
          }}
        />
      )}
    </div>
  )
}
