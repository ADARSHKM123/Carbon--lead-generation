import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Megaphone, Eye, Clock, Instagram, Facebook, Linkedin,
  ChevronRight, X, Hash, AlertCircle, Zap, Search, Tag
} from 'lucide-react'
import Header from '../components/layout/Header'
import TemplateEditor from '../components/features/campaigns/TemplateEditor'
import DiscoveryPanel from '../components/features/campaigns/DiscoveryPanel'
import { useApp } from '../context/AppContext'
import { cn, formatDate, formatNumber } from '../lib/utils'

const STATUS_BADGE = {
  active:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  completed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  draft:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }

// ── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onDiscover }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-200 group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-semibold text-foreground">{campaign.name}</h3>
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border', STATUS_BADGE[campaign.status])}>
              {campaign.status}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {campaign.platforms.map(p => {
              const Icon = PLATFORM_ICON[p]
              return Icon ? <Icon key={p} className="w-3.5 h-3.5 text-muted-foreground" /> : null
            })}
            <span className="text-xs text-muted-foreground">
              {(campaign.searchTerms || campaign.hashtags || []).slice(0, 2).join(', ')}
              {(campaign.searchTerms || campaign.hashtags || []).length > 2 &&
                ` +${(campaign.searchTerms || campaign.hashtags || []).length - 2}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Discovered', value: campaign.leadsDiscovered },
          { label: 'Approved',   value: campaign.leadsApproved },
          { label: 'Sent',       value: campaign.sent },
          { label: 'Replied',    value: campaign.replied },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-lg font-display font-bold text-foreground">{formatNumber(value)}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{
              width: campaign.leadsApproved > 0
                ? `${(campaign.sent / campaign.leadsApproved) * 100}%`
                : '0%'
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {campaign.replyRate > 0 ? `${campaign.replyRate}% reply rate` : 'No data'}
        </span>
      </div>

      {/* Discover button — the main trigger */}
      <button
        onClick={() => onDiscover(campaign)}
        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors"
      >
        <Search className="w-4 h-4" />
        Discover Leads
      </button>

      {campaign.lastRun && (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Last run {formatDate(campaign.lastRun)}
        </p>
      )}
    </div>
  )
}

// ── Create campaign drawer ────────────────────────────────────────────────────

function CreateCampaignDrawer({ open, onClose, onSave }) {
  const { templates } = useApp()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    platforms: ['facebook'],
    searchTerms: [],
    termInput: '',
    dailyLimit: 100,
    template: templates[0]?.template || '',
  })

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const togglePlatform = (p) => {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p]
    }))
  }

  const addTerm = () => {
    const raw = form.termInput.trim()
    if (!raw) return
    // Accept both #hashtags and plain keywords
    const term = raw.startsWith('#') ? raw : raw
    if (!form.searchTerms.includes(term)) {
      updateForm('searchTerms', [...form.searchTerms, term])
    }
    updateForm('termInput', '')
  }

  const handleSave = () => {
    const campaign = {
      id: `camp-${Date.now()}`,
      name: form.name,
      status: 'draft',
      platforms: form.platforms,
      searchTerms: form.searchTerms,
      hashtags: form.searchTerms, // backwards compat
      dailyLimit: form.dailyLimit,
      template: form.template,
      leadsDiscovered: 0, leadsApproved: 0,
      sent: 0, replied: 0, replyRate: 0,
      createdAt: new Date().toISOString(),
      lastRun: null,
    }
    onSave(campaign)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-bold text-lg text-foreground">New Campaign</h2>
            <p className="text-sm text-muted-foreground">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex px-6 py-3 gap-2 border-b border-border">
          {['Campaign Setup', 'Message Template'].map((label, i) => (
            <button
              key={label}
              onClick={() => form.name && setStep(i + 1)}
              className={cn(
                'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                step === i + 1 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                step === i + 1 ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
              )}>{i + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
          {step === 1 && (
            <>
              {/* Campaign name */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Campaign Name *</label>
                <input
                  value={form.name}
                  onChange={e => updateForm('name', e.target.value)}
                  placeholder="e.g. Ethnic Wear Q4 Push"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Platforms */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Target Platforms *</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: 'facebook',  label: 'Facebook',  Icon: Facebook },
                    { id: 'instagram', label: 'Instagram', Icon: Instagram },
                    { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => togglePlatform(id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                        form.platforms.includes(id)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search terms — keywords + hashtags */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">
                  Search Terms *
                  <span className="text-muted-foreground font-normal ml-1">— keywords or #hashtags</span>
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Type a keyword like <code className="bg-secondary px-1 rounded">ethnic wear india</code> or a hashtag like <code className="bg-secondary px-1 rounded">#indianfashion</code> — both work.
                </p>

                <div className="flex gap-2 mb-2">
                  <div className="flex-1 relative">
                    <Tag className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={form.termInput}
                      onChange={e => updateForm('termInput', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTerm()}
                      placeholder="ethnic wear india  or  #indianfashion"
                      className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <button
                    onClick={addTerm}
                    className="px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {form.searchTerms.map(term => (
                    <span key={term} className={cn(
                      'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium',
                      term.startsWith('#')
                        ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    )}>
                      {term.startsWith('#') ? <Hash className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                      {term}
                      <button onClick={() => updateForm('searchTerms', form.searchTerms.filter(t => t !== term))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {form.searchTerms.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Suggestions: "ethnic wear india", "fashion brand mumbai", "#indianfashion", "#handloom"
                  </p>
                )}
              </div>

              {/* Daily limit */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Daily Outreach Limit: <span className="text-primary">{form.dailyLimit}</span>
                </label>
                <input
                  type="range" min={10} max={500} step={10}
                  value={form.dailyLimit}
                  onChange={e => updateForm('dailyLimit', parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                  <span>10/day</span>
                  <span className="text-amber-400">⚠ Keep ≤ 100 to avoid account flags</span>
                  <span>500/day</span>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <TemplateEditor
              value={form.template}
              onChange={v => updateForm('template', v)}
              templates={templates}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          {step === 2 ? (
            <>
              <button onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
              <button
                onClick={handleSave}
                disabled={!form.name || form.searchTerms.length === 0 || !form.template}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Zap className="w-4 h-4" /> Save Campaign
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button
                onClick={() => setStep(2)}
                disabled={!form.name || form.platforms.length === 0 || form.searchTerms.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next: Message Template <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Campaigns page ────────────────────────────────────────────────────────────

export default function Campaigns() {
  const [searchParams] = useSearchParams()
  const [showCreate, setShowCreate] = useState(false)
  const [discoveryCampaign, setDiscoveryCampaign] = useState(null)
  const { campaigns, addCampaign, setLeads, leads, addToast } = useApp()

  useEffect(() => {
    if (searchParams.get('new') === 'true') setShowCreate(true)
  }, [searchParams])

  const handleSave = (campaign) => {
    addCampaign(campaign)
    addToast('Campaign created! Click "Discover Leads" to start searching.', 'success')
  }

  const handleLeadsAdded = (newLeads) => {
    setLeads(prev => {
      const existingHandles = new Set(prev.map(l => l.handle))
      const fresh = newLeads.filter(l => !existingHandles.has(l.handle))
      return [...prev, ...fresh]
    })
    addToast(`${newLeads.length} leads added to your Leads list!`, 'success')
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <Header
        title="Campaigns"
        subtitle={`${campaigns.length} campaigns — create one, then click "Discover Leads" to start searching`}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        }
      />

      <div className="p-6 animate-fade-in">
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Megaphone className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-foreground text-lg mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Create a campaign with your search terms and message template, then click "Discover Leads" to find fashion brands.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create First Campaign
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map(camp => (
              <CampaignCard
                key={camp.id}
                campaign={camp}
                onDiscover={setDiscoveryCampaign}
              />
            ))}
          </div>
        )}
      </div>

      <CreateCampaignDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleSave}
      />

      <DiscoveryPanel
        campaign={discoveryCampaign}
        open={!!discoveryCampaign}
        onClose={() => setDiscoveryCampaign(null)}
        onLeadsAdded={handleLeadsAdded}
      />
    </div>
  )
}
