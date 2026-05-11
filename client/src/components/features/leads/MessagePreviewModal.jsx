import { useState, useEffect } from 'react'
import { X, Sparkles, Edit2, Check, Send, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { cn, fillTemplate } from '../../../lib/utils'

const EXAMPLE_AI_FILLS = {
  'Rang Bhoomi': { brand_name: 'Rang Bhoomi', platform: 'Instagram', product_style: 'handcrafted Banarasi ethnic wear', niche: 'heritage craft fashion', city: 'Jaipur', follower_count: '48.2K', website: 'rangbhoomi.in' },
  'Naksha Studio': { brand_name: 'Naksha Studio', platform: 'Instagram', product_style: 'contemporary Indo-western fusion', niche: 'contemporary Indian fashion', city: 'Mumbai', follower_count: '125K', website: 'nakshastudio.com' },
  'Dhaga & Co': { brand_name: 'Dhaga & Co', platform: 'Instagram', product_style: 'slow fashion & natural fabric', niche: 'sustainable fashion', city: 'Bangalore', follower_count: '32.4K', website: 'dhagaandco.com' },
  'Zaffron Label': { brand_name: 'Zaffron Label', platform: 'Instagram', product_style: 'luxury bridal lehenga', niche: 'luxury bridal wear', city: 'Delhi', follower_count: '289K', website: 'zaffronlabel.in' },
  'Streetka': { brand_name: 'Streetka', platform: 'Instagram', product_style: 'Indian streetwear', niche: 'urban streetwear', city: 'Mumbai', follower_count: '187K', website: 'streetka.in' },
}

const DEFAULT_FILL = (lead) => ({
  brand_name: lead.brandName,
  platform: lead.platform,
  product_style: lead.niches[0] || 'fashion',
  niche: lead.niches[0] || 'fashion',
  city: lead.city,
  follower_count: lead.followerCount,
  website: lead.website || '',
})

function generateMessage(template, lead) {
  const vars = EXAMPLE_AI_FILLS[lead.brandName] || DEFAULT_FILL(lead)
  return fillTemplate(template, vars)
}

export default function MessagePreviewModal({ leads, campaign, onClose, onConfirm }) {
  const [previewLeads, setPreviewLeads] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  const template = campaign?.template || ''
  const previewCount = Math.min(5, leads.length)

  useEffect(() => {
    // Simulate AI personalization delay
    setLoading(true)
    setTimeout(() => {
      const previews = leads.slice(0, previewCount).map(lead => ({
        ...lead,
        personalizedMessage: generateMessage(template, lead),
      }))
      setPreviewLeads(previews)
      setLoading(false)
    }, 1200)
  }, [leads, template])

  const current = previewLeads[currentIndex]

  const startEdit = (lead) => {
    setEditingId(lead.id)
    setEditText(lead.personalizedMessage)
  }

  const saveEdit = () => {
    setPreviewLeads(prev => prev.map(l =>
      l.id === editingId ? { ...l, personalizedMessage: editText } : l
    ))
    setEditingId(null)
  }

  const handleConfirm = async () => {
    setConfirming(true)
    await new Promise(r => setTimeout(r, 800))
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold text-foreground">Message Preview</h2>
              <p className="text-xs text-muted-foreground">
                AI-personalized messages for {leads.length} selected brands
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex items-center gap-6 px-6 py-3 bg-secondary border-b border-border text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Total selected:</span>
            <span className="text-foreground font-semibold">{leads.length} brands</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-muted-foreground">With website:</span>
            <span className="text-foreground font-semibold">{leads.filter(l => l.hasWebsite).length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-muted-foreground">With email:</span>
            <span className="text-foreground font-semibold">{leads.filter(l => l.hasEmail).length}</span>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-sm font-medium text-foreground">AI is personalizing your messages...</p>
              <p className="text-xs text-muted-foreground mt-1">Analyzing brand profiles and filling in template variables</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Showing {previewCount} of {leads.length} messages
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You can edit any message before approving
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                    className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">{currentIndex + 1} / {previewLeads.length}</span>
                  <button
                    onClick={() => setCurrentIndex(i => Math.min(previewLeads.length - 1, i + 1))}
                    disabled={currentIndex === previewLeads.length - 1}
                    className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {current && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Brand info */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <img src={current.avatar} alt={current.brandName} className="w-9 h-9 rounded-full bg-secondary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{current.brandName}</p>
                      <p className="text-xs text-muted-foreground">{current.handle} · {current.platform}</p>
                    </div>
                    <button
                      onClick={() => editingId === current.id ? saveEdit() : startEdit(current)}
                      className={cn(
                        'ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                        editingId === current.id
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                      )}
                    >
                      {editingId === current.id ? <><Check className="w-3.5 h-3.5" /> Save</> : <><Edit2 className="w-3.5 h-3.5" /> Edit</>}
                    </button>
                  </div>

                  {/* Message */}
                  <div className="p-4">
                    {editingId === current.id ? (
                      <textarea
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={10}
                        className="w-full bg-secondary border border-primary/30 rounded-lg p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono leading-relaxed scrollbar-thin"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {current.personalizedMessage}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/80">
                  This preview shows {previewCount} sample messages. The remaining {leads.length - previewCount} will be auto-personalized using the same template before sending.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-background">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel — go back
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || confirming}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirming ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Launching...</>
            ) : (
              <><Send className="w-4 h-4" /> Approve & Send to {leads.length} Brands</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
