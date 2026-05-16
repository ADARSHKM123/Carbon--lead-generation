import { useState, useEffect } from 'react'
import {
  Instagram, Search, Hash, AtSign, KeyRound, Loader2, CheckCircle2,
  AlertCircle, ExternalLink, BadgeCheck, Plus, Users, Globe, Mail,
  Phone, Eye, EyeOff, Save, Trash2, Sparkles, X, Lock, Download
} from 'lucide-react'
import Header from '../components/layout/Header'
import { cn, formatNumber } from '../lib/utils'
import { useApp } from '../context/AppContext'
import {
  getHikerKey, setHikerKey, clearHikerKey, testHikerKey,
  scrapeHikerUser, scrapeHikerHashtag,
} from '../lib/api'

const QUERY_KIND = { USERNAME: 'username', HASHTAG: 'hashtag' }

/**
 * Card for a single Instagram profile returned by HikerAPI.
 * Shows a compact summary + "Add to Leads" button.
 */
function ScrapedProfileCard({ profile, isAdded, onAdd }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <img
          src={profile.avatar}
          alt={profile.brandName}
          className="w-12 h-12 rounded-full bg-secondary flex-shrink-0 object-cover"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = `https://api.dicebear.com/9.x/initials/svg?seed=${profile.username}&backgroundColor=ec4899&fontColor=ffffff`
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{profile.brandName}</p>
            {profile.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />}
            {profile.isPrivate && <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />}
          </div>
          <a
            href={profile.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            {profile.handle}
            <ExternalLink className="w-3 h-3" />
          </a>
          {profile.category && (
            <p className="text-[10px] uppercase tracking-wider text-primary mt-0.5">{profile.category}</p>
          )}
        </div>
      </div>

      {profile.bio && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed line-clamp-3 whitespace-pre-wrap">
          {profile.bio}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="bg-secondary rounded-lg py-1.5">
          <div className="text-xs font-bold text-foreground">{formatNumber(profile.followerCount) || '—'}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Followers</div>
        </div>
        <div className="bg-secondary rounded-lg py-1.5">
          <div className="text-xs font-bold text-foreground">{profile.postCount > 0 ? formatNumber(profile.postCount) : '—'}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Posts</div>
        </div>
        <div className="bg-secondary rounded-lg py-1.5">
          <div className="text-xs font-bold text-foreground">{profile.followingCount > 0 ? formatNumber(profile.followingCount) : '—'}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Following</div>
        </div>
      </div>

      {/* Inline contact info — actual values, not just badges */}
      {(profile.website || profile.email || profile.phone) && (
        <div className="mt-3 space-y-1 text-[11px]">
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-emerald-400 hover:underline break-all"
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{profile.website.replace(/^https?:\/\//, '')}</span>
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </a>
          )}
          {profile.email && (
            <a
              href={`mailto:${profile.email}`}
              className="flex items-center gap-1.5 text-amber-400 hover:underline break-all"
            >
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{profile.email}</span>
            </a>
          )}
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="flex items-center gap-1.5 text-sky-400 hover:underline"
            >
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span>{profile.phone}</span>
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {profile.isBusiness && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
            Business
          </span>
        )}
        {(profile.bioLinks?.length > 1) && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground border border-border px-2 py-0.5 rounded-full">
            +{profile.bioLinks.length - 1} more link{profile.bioLinks.length > 2 ? 's' : ''}
          </span>
        )}
      </div>

      <button
        onClick={() => onAdd(profile)}
        disabled={isAdded}
        className={cn(
          'mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border transition-colors',
          isAdded
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-default'
            : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
        )}
      >
        {isAdded ? (
          <><CheckCircle2 className="w-3.5 h-3.5" /> Added to Leads</>
        ) : (
          <><Plus className="w-3.5 h-3.5" /> Add to Leads</>
        )}
      </button>
    </div>
  )
}

/**
 * HikerAPI access-key panel — collapsed pill when a valid key is saved,
 * expanded form when missing or being edited.
 */
function ApiKeyPanel({ keyValue, onSave, onClear, onTest, status }) {
  const [editing, setEditing] = useState(!keyValue)
  const [draft, setDraft] = useState(keyValue || '')
  const [reveal, setReveal] = useState(false)

  useEffect(() => { setDraft(keyValue || '') }, [keyValue])

  const masked = keyValue ? `${keyValue.slice(0, 4)}…${keyValue.slice(-4)}` : ''

  if (!editing) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">HikerAPI Access Key</p>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {reveal ? keyValue : masked}
          </p>
        </div>
        <button onClick={() => setReveal(v => !v)} className="text-muted-foreground hover:text-foreground p-1.5" title={reveal ? 'Hide' : 'Reveal'}>
          {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onTest} disabled={status === 'testing'} className="text-[11px] px-2.5 py-1 rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50">
          {status === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
        </button>
        <button onClick={() => setEditing(true)} className="text-[11px] px-2.5 py-1 rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground">
          Edit
        </button>
        <button onClick={onClear} className="text-red-400 hover:text-red-300 p-1.5" title="Remove key">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">HikerAPI Access Key</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Get your key at{' '}
        <a href="https://hikerapi.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
          hikerapi.com <ExternalLink className="w-3 h-3" />
        </a>
        {' '}— it's stored only in your browser's localStorage.
      </p>
      <div className="flex items-center gap-2">
        <input
          type={reveal ? 'text' : 'password'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="gwzejeuuw8ptkeje3fqmwm1qpgig48yr"
          className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={() => setReveal(v => !v)}
          className="px-2 py-2 rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground"
          title={reveal ? 'Hide' : 'Show'}
        >
          {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { onSave(draft.trim()); if (draft.trim()) setEditing(false) }}
          disabled={!draft.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        {keyValue && (
          <button onClick={() => { setDraft(keyValue); setEditing(false) }} className="text-muted-foreground hover:text-foreground p-2">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function Scraper() {
  const { leads, setLeads, addToast } = useApp()

  const [apiKey, setApiKeyState] = useState(getHikerKey())
  const [keyStatus, setKeyStatus] = useState('idle') // idle | testing | valid | invalid
  const [keyError, setKeyError] = useState('')

  const [queryKind, setQueryKind] = useState(QUERY_KIND.USERNAME)
  const [query, setQuery] = useState('')
  const [hashtagKind, setHashtagKind] = useState('recent') // recent | top
  const [limit, setLimit] = useState(30)

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [lastSearch, setLastSearch] = useState(null) // for the result-summary bar

  // Lead handles already added — used to disable "Add to Leads" button
  const addedHandles = new Set(leads.map(l => (l.handle || '').toLowerCase()))

  const handleSaveKey = (key) => {
    setHikerKey(key)
    setApiKeyState(key)
    setKeyStatus('idle')
    setKeyError('')
    if (key) addToast('Access key saved', 'success')
  }

  const handleClearKey = () => {
    clearHikerKey()
    setApiKeyState('')
    setKeyStatus('idle')
    setKeyError('')
    addToast('Access key removed', 'default')
  }

  const handleTestKey = async () => {
    setKeyStatus('testing')
    setKeyError('')
    try {
      const res = await testHikerKey()
      if (res?.valid) {
        setKeyStatus('valid')
        addToast('Access key is valid', 'success')
      } else {
        setKeyStatus('invalid')
        setKeyError(res?.error || 'Invalid key')
        addToast('Access key rejected', 'error')
      }
    } catch (err) {
      setKeyStatus('invalid')
      setKeyError(err?.detail || err?.message || 'Test failed')
      addToast('Could not validate key', 'error')
    }
  }

  const handleSearch = async () => {
    if (!apiKey) {
      addToast('Save your HikerAPI key first', 'error')
      return
    }
    const cleaned = query.trim().replace(/^[@#]/, '')
    if (!cleaned) {
      addToast('Enter a username or hashtag', 'error')
      return
    }
    setLoading(true)
    setSearchError('')
    setResults([])
    try {
      if (queryKind === QUERY_KIND.USERNAME) {
        const res = await scrapeHikerUser(cleaned)
        setResults(res?.user ? [res.user] : [])
        setLastSearch({ kind: 'username', term: cleaned, count: res?.user ? 1 : 0 })
      } else {
        const res = await scrapeHikerHashtag(cleaned, hashtagKind, limit)
        setResults(res?.users || [])
        setLastSearch({ kind: 'hashtag', term: cleaned, sort: hashtagKind, count: res?.users?.length || 0 })
      }
    } catch (err) {
      const msg = typeof err?.detail === 'string'
        ? err.detail
        : err?.detail?.message || err?.message || 'Scrape failed'
      setSearchError(msg)
      addToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const addProfileToLeads = (profile) => {
    // Map HikerAPI profile to the app's Lead shape used elsewhere
    const newLead = {
      id: `hiker_${profile.username}_${Date.now()}`,
      brandName: profile.brandName,
      handle: profile.handle,
      platform: profile.platform,
      avatar: profile.avatar,
      bio: profile.bio,
      category: profile.category,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      postCount: profile.postCount,
      isVerified: profile.isVerified,
      website: profile.website,
      bioLinks: profile.bioLinks,
      hasWebsite: !!profile.website,
      hasEmail: !!profile.email,
      email: profile.email,
      phone: profile.phone,
      whatsapp: null,
      city: profile.city || 'India',
      state: 'India',
      niches: profile.category ? [profile.category.toLowerCase()] : [],
      posts: [],
      pageUrl: profile.pageUrl,
      status: 'discovered',
      outreachStatus: null,
      selected: false,
      discoveredAt: new Date().toISOString(),
      source: 'hikerapi',
    }
    setLeads(prev => {
      // Skip duplicates by handle
      if (prev.some(l => (l.handle || '').toLowerCase() === newLead.handle.toLowerCase())) return prev
      return [newLead, ...prev]
    })
    addToast(`${profile.brandName} added to Leads`, 'success')
  }

  const addAllToLeads = () => {
    const fresh = results.filter(p => !addedHandles.has(p.handle.toLowerCase()))
    if (fresh.length === 0) {
      addToast('All profiles already in Leads', 'default')
      return
    }
    fresh.forEach(addProfileToLeads)
  }

  /**
   * Export the full scraped dataset for every result currently on screen
   * as a CSV. Includes every field HikerAPI gives us, not just the trio of
   * website/email/phone — so the file is useful for spreadsheets, CRMs, or
   * importing into another tool.
   *
   * RFC 4180: every field wrapped in quotes, inner quotes escaped as "".
   * UTF-8 BOM prepended so Excel renders emoji and Hindi/Indic text.
   */
  const handleExportCsv = () => {
    if (results.length === 0) {
      addToast('Nothing to export — scrape some profiles first', 'error')
      return
    }

    /**
     * Excel mangles long numeric strings (phone numbers, IG user IDs):
     * "+918191977777" becomes 9.19198E+11, and leading "+" or zeros disappear.
     * Wrapping the value as ="..." tells Excel/Sheets/LibreOffice to treat it
     * as a literal text formula — the cell shows the exact string the user
     * sees on the web page.
     */
    const asText = (v) => {
      const s = String(v ?? '').trim()
      if (!s) return ''
      // Escape any inner quotes the same way as the outer escape() does
      return `="${s.replace(/"/g, '""')}"`
    }

    // Column order is intentional: identity → URL → contact info → numbers → flags
    const columns = [
      { header: 'Brand Name',     get: p => p.brandName || '' },
      { header: 'Username',       get: p => p.username || '' },
      { header: 'Handle',         get: p => p.handle || '' },
      { header: 'Profile URL',    get: p => p.pageUrl || (p.username ? `https://instagram.com/${p.username}` : '') },
      { header: 'Website',        get: p => p.website || '' },
      { header: 'All Bio Links',  get: p => (p.bioLinks || []).join(' | ') },
      { header: 'Email',          get: p => p.email || '' },
      // Phone & WhatsApp wrapped as text-formula so Excel keeps the leading "+"
      // and the full digit count instead of converting to scientific notation.
      { header: 'Phone',          get: p => p.phone ? asText(p.phone) : '', raw: true },
      { header: 'WhatsApp',       get: p => p.whatsapp ? asText(p.whatsapp) : '', raw: true },
      { header: 'Category',       get: p => p.category || '' },
      { header: 'Bio',            get: p => (p.bio || '').replace(/\r?\n/g, ' \\n ') },
      { header: 'Followers',      get: p => p.followerCount ?? 0 },
      { header: 'Following',      get: p => p.followingCount ?? 0 },
      { header: 'Posts',          get: p => p.postCount ?? 0 },
      { header: 'Verified',       get: p => p.isVerified ? 'Yes' : 'No' },
      { header: 'Business',       get: p => p.isBusiness ? 'Yes' : 'No' },
      { header: 'Private',        get: p => p.isPrivate ? 'Yes' : 'No' },
      { header: 'City',           get: p => p.city || '' },
      { header: 'Platform',       get: p => p.platform || 'instagram' },
      { header: 'Avatar URL',     get: p => p.avatar || '' },
      // IG User IDs are 10–15 digit numbers Excel would also munge — same fix.
      { header: 'IG User ID',     get: p => p.pk ? asText(p.pk) : '', raw: true },
      { header: 'Source Query',   get: () => lastSearch
        ? `${lastSearch.kind === 'hashtag' ? '#' : '@'}${lastSearch.term}`
        : ''
      },
      { header: 'Scraped At',     get: () => new Date().toISOString() },
    ]

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    // Pre-formatted text-formula values (Phone, WhatsApp, IG User ID) are
    // emitted as-is — wrapping them in another set of quotes would defeat
    // the ="..." trick and Excel would just show the raw string.
    const emit = (col, profile) => {
      const v = col.get(profile)
      if (col.raw && typeof v === 'string' && v.startsWith('="')) return v
      return escape(v)
    }
    const lines = [columns.map(c => escape(c.header)).join(',')]
    for (const profile of results) {
      lines.push(columns.map(c => emit(c, profile)).join(','))
    }

    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    const tag = lastSearch
      ? `${lastSearch.kind === 'hashtag' ? 'tag' : 'user'}-${lastSearch.term.replace(/[^a-z0-9_]/gi, '')}`
      : 'scrape'
    a.href = url
    a.download = `carbon-ig-${tag}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addToast(`Exported ${results.length} profile${results.length === 1 ? '' : 's'} to CSV`, 'success')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header
        title="Instagram Scraper"
        subtitle="Pull profile data directly from HikerAPI — usernames or hashtags"
        actions={
          results.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                title={`Export ${results.length} profile${results.length === 1 ? '' : 's'} as CSV`}
              >
                <Download className="w-4 h-4" />
                Export CSV
                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                  {results.length}
                </span>
              </button>
              <button
                onClick={addAllToLeads}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add All to Leads ({results.length})
              </button>
            </div>
          )
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
        {/* API key */}
        <ApiKeyPanel
          keyValue={apiKey}
          onSave={handleSaveKey}
          onClear={handleClearKey}
          onTest={handleTestKey}
          status={keyStatus}
        />

        {keyError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {keyError}
          </div>
        )}

        {/* Search box */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Scrape Instagram</p>
          </div>

          <div className="flex gap-2 mb-3">
            {[
              { kind: QUERY_KIND.USERNAME, icon: AtSign, label: 'By Username' },
              { kind: QUERY_KIND.HASHTAG, icon: Hash, label: 'By Hashtag' },
            ].map(({ kind, icon: Icon, label }) => (
              <button
                key={kind}
                onClick={() => { setQueryKind(kind); setResults([]); setSearchError('') }}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                  queryKind === kind
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              {queryKind === QUERY_KIND.USERNAME
                ? <AtSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                : <Hash className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              }
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={queryKind === QUERY_KIND.USERNAME ? 'tshirts_collection.india' : 'indianfashion'}
                className="w-full bg-secondary border border-border rounded-lg pl-10 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            {queryKind === QUERY_KIND.HASHTAG && (
              <>
                <select
                  value={hashtagKind}
                  onChange={e => setHashtagKind(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  <option value="recent">Recent posts</option>
                  <option value="top">Top posts</option>
                </select>
                <select
                  value={limit}
                  onChange={e => setLimit(Number(e.target.value))}
                  className="bg-secondary border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none"
                >
                  {[10, 20, 30, 50, 75].map(n => <option key={n} value={n}>{n} profiles</option>)}
                </select>
              </>
            )}

            <button
              onClick={handleSearch}
              disabled={loading || !apiKey}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scraping...</>
                : <><Search className="w-4 h-4" /> Scrape</>
              }
            </button>
          </div>

          {searchError && (
            <div className="flex items-start gap-2 mt-3 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="break-words">{searchError}</span>
            </div>
          )}
        </div>

        {/* Result summary */}
        {lastSearch && !loading && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>
                Found <span className="text-foreground font-semibold">{lastSearch.count}</span>{' '}
                profile{lastSearch.count === 1 ? '' : 's'} for{' '}
                <span className="text-foreground font-mono">
                  {lastSearch.kind === 'hashtag' ? '#' : '@'}{lastSearch.term}
                </span>
                {lastSearch.kind === 'hashtag' && ` (${lastSearch.sort})`}
              </span>
            </div>
          </div>
        )}

        {/* Results grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
            <p className="text-sm font-medium">
              {queryKind === QUERY_KIND.HASHTAG
                ? `Fetching #${query.replace(/^[#@]/, '')} posts & enriching profiles...`
                : 'Fetching profile from HikerAPI...'}
            </p>
            {queryKind === QUERY_KIND.HASHTAG && (
              <p className="text-xs mt-1">This pulls full bio + website + followers for each user — takes 5–15s.</p>
            )}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(profile => (
              <ScrapedProfileCard
                key={profile.pk || profile.username}
                profile={profile}
                isAdded={addedHandles.has(profile.handle.toLowerCase())}
                onAdd={addProfileToLeads}
              />
            ))}
          </div>
        ) : !lastSearch && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Instagram className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Ready to scrape Instagram</p>
            <p className="text-xs text-muted-foreground max-w-md">
              Save your HikerAPI access key, pick "By Username" or "By Hashtag", and hit Scrape.
              Profiles you add will appear under <span className="text-primary font-medium">Leads</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
