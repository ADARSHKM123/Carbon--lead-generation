import { useState } from 'react'
import { Plus, FileText, Edit2, Trash2, Copy, Clock, X, Save, Sparkles } from 'lucide-react'
import Header from '../components/layout/Header'
import TemplateEditor from '../components/features/campaigns/TemplateEditor'
import { useApp } from '../context/AppContext'
import { cn, formatDate, extractVariables } from '../lib/utils'

function TemplateCard({ template, onEdit, onDelete, onDuplicate }) {
  const variables = extractVariables(template.template)
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-foreground">{template.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onDuplicate(template)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Duplicate">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onEdit(template)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-primary transition-colors" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(template.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="bg-secondary rounded-lg p-3 mb-3 max-h-28 overflow-hidden relative">
        <p className="text-xs text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap">
          {template.template.slice(0, 200)}{template.template.length > 200 ? '...' : ''}
        </p>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-secondary to-transparent" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {variables.slice(0, 4).map(v => (
            <span key={v} className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full font-mono">
              {`{{${v}}}`}
            </span>
          ))}
          {variables.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{variables.length - 4} more</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {template.usageCount > 0 && <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{template.usageCount} uses</span>}
          {template.lastUsed && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(template.lastUsed)}</span>}
        </div>
      </div>
    </div>
  )
}

function TemplateDrawer({ template, open, onClose, onSave }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    description: template?.description || '',
    template: template?.template || '',
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border flex flex-col overflow-hidden animate-slide-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-bold text-lg text-foreground">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Template Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Standard Ethnic Wear Outreach"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Description</label>
            <input
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Short description of when to use this template"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <TemplateEditor
            value={form.template}
            onChange={v => setForm(p => ({ ...p, template: v }))}
          />
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={() => { onSave(form); onClose() }}
            disabled={!form.name || !form.template}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" /> Save Template
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Templates() {
  const { templates, addTemplate, updateTemplate, deleteTemplate, addToast } = useApp()
  const [editTemplate, setEditTemplate] = useState(null)
  const [showDrawer, setShowDrawer] = useState(false)

  const handleSave = (form) => {
    if (editTemplate) {
      updateTemplate(editTemplate.id, form)
      addToast('Template updated', 'success')
    } else {
      addTemplate({ id: `tmpl-${Date.now()}`, ...form, usageCount: 0, lastUsed: null, createdAt: new Date().toISOString() })
      addToast('Template created', 'success')
    }
    setEditTemplate(null)
  }

  const handleEdit = (t) => { setEditTemplate(t); setShowDrawer(true) }
  const handleNew = () => { setEditTemplate(null); setShowDrawer(true) }
  const handleDuplicate = (t) => {
    addTemplate({ ...t, id: `tmpl-${Date.now()}`, name: `${t.name} (Copy)`, usageCount: 0, lastUsed: null, createdAt: new Date().toISOString() })
    addToast('Template duplicated', 'success')
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <Header
        title="Templates"
        subtitle="Manage your message templates — the AI fills in brand-specific variables"
        actions={
          <button onClick={handleNew} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> New Template
          </button>
        }
      />

      <div className="p-6 animate-fade-in">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-foreground text-lg mb-2">No templates yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Create message templates to reuse across campaigns. Add {'{{variables}}'} for AI personalization.
            </p>
            <button onClick={handleNew} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> Create First Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(t => (
              <TemplateCard key={t.id} template={t} onEdit={handleEdit} onDelete={(id) => { deleteTemplate(id); addToast('Template deleted') }} onDuplicate={handleDuplicate} />
            ))}
          </div>
        )}
      </div>

      <TemplateDrawer
        template={editTemplate}
        open={showDrawer}
        onClose={() => { setShowDrawer(false); setEditTemplate(null) }}
        onSave={handleSave}
      />
    </div>
  )
}
