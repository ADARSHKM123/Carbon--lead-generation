import { useState, useRef } from 'react'
import { Sparkles, Plus, Eye, EyeOff, ChevronDown, Info } from 'lucide-react'
import { cn, extractVariables } from '../../../lib/utils'

const SUGGESTED_VARIABLES = [
  { key: 'brand_name', desc: 'The brand\'s name' },
  { key: 'platform', desc: 'Platform (Instagram, Facebook, etc.)' },
  { key: 'product_style', desc: 'Their product style / niche' },
  { key: 'niche', desc: 'Fashion niche (ethnic, streetwear, etc.)' },
  { key: 'city', desc: 'Their city (Mumbai, Delhi, etc.)' },
  { key: 'follower_count', desc: 'Their follower count' },
  { key: 'website', desc: 'Their website URL' },
]

export default function TemplateEditor({ value, onChange, templates = [] }) {
  const [showPreview, setShowPreview] = useState(false)
  const [showVarHelper, setShowVarHelper] = useState(true)
  const textareaRef = useRef(null)

  const variables = extractVariables(value)

  const insertVariable = (varKey) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const insertion = `{{${varKey}}}`
    const newVal = value.slice(0, start) + insertion + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + insertion.length, start + insertion.length)
    }, 0)
  }

  const previewText = value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const examples = {
      brand_name: 'Rang Bhoomi',
      platform: 'Instagram',
      product_style: 'handcrafted ethnic wear',
      niche: 'sustainable fashion',
      city: 'Jaipur',
      follower_count: '48.2K',
      website: 'rangbhoomi.in',
    }
    return examples[key] || match
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Message Template</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Write your message. Use {'{{variable}}'} for AI-filled fields.</p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <select
              onChange={e => { if (e.target.value) { const t = templates.find(x => x.id === e.target.value); if (t) onChange(t.template) } }}
              className="text-xs bg-secondary border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              defaultValue=""
            >
              <option value="">Load template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowPreview(p => !p)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
              showPreview ? 'bg-primary/10 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-border'
            )}
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="bg-secondary border border-border rounded-xl p-4 min-h-[220px]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Preview with example brand data</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{previewText || 'Start typing your template to see a preview here...'}</p>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Hi {{brand_name}}! 👋\n\nI came across your {{product_style}} collection on {{platform}} and was really impressed...\n\nWe help fashion brands like yours accelerate online sales. Would love to show you how!\n\nBest,\nCarbon Team`}
          rows={10}
          className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono leading-relaxed scrollbar-thin"
        />
      )}

      {/* Variable helper */}
      <div className="bg-secondary border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowVarHelper(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-border/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Variables
            {variables.length > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                {variables.length} in use
              </span>
            )}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showVarHelper ? 'rotate-180' : '')} />
        </button>

        {showVarHelper && (
          <div className="px-4 pb-4 space-y-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground pt-3 mb-3">
              Click to insert a variable. The AI fills these in per brand using their profile data.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED_VARIABLES.map(({ key, desc }) => {
                const inUse = variables.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => insertVariable(key)}
                    className={cn(
                      'flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all',
                      inUse
                        ? 'border-primary/30 bg-primary/5 text-primary'
                        : 'border-border bg-background hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-mono font-medium">{`{{${key}}}`}</p>
                      <p className="text-[10px] opacity-70">{desc}</p>
                    </div>
                    {inUse && <span className="ml-auto text-[9px] text-primary font-medium">✓ IN USE</span>}
                  </button>
                )
              })}
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg mt-3">
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400/80">
                Variables not found in a brand's profile will be left blank or gracefully omitted by the AI. Always preview before sending.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Character count */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{value.length} characters</span>
        <span>{variables.length > 0 ? `${variables.length} variable${variables.length > 1 ? 's' : ''} detected` : 'No variables — add some for personalization'}</span>
      </div>
    </div>
  )
}
