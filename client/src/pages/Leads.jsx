import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Users, Globe, Mail, Phone, MessageCircle, Instagram, Facebook, Linkedin,
  ChevronDown, Filter, CheckSquare, Square, X, ExternalLink,
  Send, Sparkles, Loader2, CheckCircle2, AlertCircle, Eye,
  Search, SlidersHorizontal, ArrowUpDown, BadgeCheck, Tag, MapPin,
  Package, CreditCard, Truck, User, Languages, IndianRupee, Download
} from 'lucide-react'
import Header from '../components/layout/Header'
import MessagePreviewModal from '../components/features/leads/MessagePreviewModal'
import { useApp } from '../context/AppContext'
import { cn, formatNumber, PLATFORM_COLORS, STATUS_COLORS } from '../lib/utils'
import { enrichLead } from '../lib/api'

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }

const STATIC_URL_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.webp']
const PLATFORM_INFRA_DOMAINS = [
  'facebook.com', 'fb.com', 'fb.me', 'fbcdn.net',
  'instagram.com', 'cdninstagram.com',
  'about.meta.com', 'meta.com', 'developers.facebook.com',
  'help.instagram.com', 'privacycenter.instagram.com',
]
const NON_WEBSITE_DOMAINS = ['wa.me', 'whatsapp.com', 'api.whatsapp.com']
const SOCIAL_DOMAINS = [
  'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'tiktok.com',
  'threads.net', 'threads.com', 'linkedin.com', 'pinterest.com', 't.me', 'telegram.me',
]

function normalizePhone(value) {
  const raw = String(value || '').trim()
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.startsWith('91') && digits.length === 12 && /^[6-9]/.test(digits.slice(2))) {
    return `+91${digits.slice(2)}`
  }
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return ''
}

function extractPhone(text, allowUnlabeled = true) {
  const value = String(text || '').replace(/\\n/g, '\n')
  const labeled = value.match(/(?:contact|call|phone|mobile|mob|tel|telephone|ph|enquir(?:y|ies)|order|booking)\s*(?:us|now)?\s*(?:[:=\-–—]|\s)\s*(\+?[\d][\d\s().\-+]{7,24}\d)/i)
  const labeledPhone = normalizePhone(labeled?.[1])
  if (labeledPhone) return labeledPhone
  if (!allowUnlabeled) return ''
  const plain = value.match(/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/)
  return normalizePhone(plain?.[0])
}

function extractWhatsapp(text) {
  const value = String(text || '')
  const linked = value.match(/(?:wa\.me\/|(?:api\.)?whatsapp\.com\/send\?phone=)(\+?\d{6,15})/i)
  const linkedPhone = normalizePhone(linked?.[1])
  if (linkedPhone) return linkedPhone
  const labeled = value.match(/(?:whats\s*app|whatsapp|wa)\s*(?:[:=\-–—]|\s)\s*(\+?[\d][\d\s().\-+]{7,24}\d)/i)
  return normalizePhone(labeled?.[1])
}

function extractEmail(text) {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match?.[0] || ''
}

function normalizeLeadUrl(raw) {
  if (!raw) return ''
  let url = String(raw).trim().replace(/\\\//g, '/').replace(/&amp;/g, '&')
  url = url.replace(/[),.;:]+$/g, '').replace(/^['"<]+|['">]+$/g, '')
  if (!url || url.startsWith('mailto:') || url.startsWith('tel:')) return ''
  if (url.startsWith('//')) url = `https:${url}`
  if (url.startsWith('www.')) url = `https://${url}`
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('.')) return ''
    if (STATIC_URL_EXTENSIONS.some(ext => parsed.pathname.toLowerCase().endsWith(ext))) return ''
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '')
    parsed.hash = ''
    if (!domainMatches(domain, NON_WEBSITE_DOMAINS)) parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function domainOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return ''
  }
}

function domainMatches(domain, blocked) {
  return blocked.some(item => domain === item || domain.endsWith(`.${item}`))
}

function isOwnedUrl(url) {
  const domain = domainOf(url)
  return domain && !domainMatches(domain, PLATFORM_INFRA_DOMAINS)
}

function isPrimaryWebsite(url) {
  const domain = domainOf(url)
  return domain && !domainMatches(domain, [
    ...PLATFORM_INFRA_DOMAINS,
    ...NON_WEBSITE_DOMAINS,
    ...SOCIAL_DOMAINS,
  ])
}

function extractUrlsFromText(text) {
  const value = String(text || '')
  const matches = [
    ...value.matchAll(/\b(?:https?:\/\/|www\.)[^\s"'<>]+/gi),
    ...value.matchAll(/(?<!@)\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|in|co|net|org|store|shop|boutique|fashion|io|ai|app)(?:\/[^\s"'<>]*)?/gi),
  ].map(m => m[0])

  return [...new Set(matches.map(normalizeLeadUrl).filter(Boolean).filter(isOwnedUrl))]
}

function deriveLeadFields(lead) {
  const urls = [
    lead.website,
    ...(lead.bioLinks || []),
    ...extractUrlsFromText(lead.bio),
  ].map(normalizeLeadUrl).filter(Boolean).filter(isOwnedUrl)
  const allUrls = [...new Set(urls)]
  const currentWebsite = normalizeLeadUrl(lead.website)
  const website = (currentWebsite && isPrimaryWebsite(currentWebsite) ? currentWebsite : '') || allUrls.find(isPrimaryWebsite) || ''
  const email = lead.email || extractEmail(lead.bio)
  const phone = lead.phone || extractPhone(lead.bio)
  const whatsapp = lead.whatsapp || extractWhatsapp(lead.bio)
  return { website, allUrls, email, phone, whatsapp }
}

function LeadCard({ lead, onToggle, onView, isSelected }) {
  const PlatformIcon = PLATFORM_ICON[lead.platform]
  const derived = deriveLeadFields(lead)

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
            {(lead.hasWebsite || derived.website) && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium">Has Website</span>
            )}
            {(lead.hasEmail || derived.email) && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <Mail className="w-2.5 h-2.5" /> Email
              </span>
            )}
            {(lead.hasPhone || derived.phone) && (
              <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" /> Phone
              </span>
            )}
            {(lead.hasWhatsapp || derived.whatsapp) && (
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

/**
 * Single name/value row used throughout the detail panel.
 * Keeps the layout consistent and skips rendering when value is empty.
 */
function DetailRow({ icon: Icon, label, children, mono = false }) {
  if (children === null || children === undefined || children === '' || children === 0) return null
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="w-28 flex-shrink-0 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground pt-0.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={cn(
        'flex-1 min-w-0 text-xs text-foreground leading-relaxed break-words',
        mono && 'font-mono'
      )}>
        {children}
      </div>
    </div>
  )
}

function LeadDetailPanel({ lead, onClose }) {
  const PlatformIcon = PLATFORM_ICON[lead.platform]
  const [enrichment, setEnrichment] = useState(null)
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState('')
  const derived = useMemo(() => deriveLeadFields(lead), [lead])

  // Reset enrichment state whenever the open lead changes
  useEffect(() => {
    setEnrichment(null)
    setEnrichError('')
    setEnriching(false)
  }, [lead.id])

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichError('')
    try {
      const res = await enrichLead({
        brandName: lead.brandName,
        handle: lead.handle,
        bio: lead.bio,
        category: lead.category || '',
        website: derived.website,
        bioLinks: derived.allUrls,
      })
      setEnrichment(res?.enrichment || {})
    } catch (err) {
      setEnrichError(err?.detail || err?.message || 'Enrichment failed')
    } finally {
      setEnriching(false)
    }
  }

  const platformLabel = lead.platform.charAt(0).toUpperCase() + lead.platform.slice(1)
  const extraLinks = derived.allUrls.filter(u => u !== derived.website)

  return (
    <div className="w-96 flex-shrink-0 bg-card border-l border-border flex flex-col overflow-y-auto scrollbar-thin animate-slide-in">
      <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
        <h3 className="font-display font-semibold text-foreground text-sm">Brand Details</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Identity card */}
        <div className="flex items-center gap-3">
          <img src={lead.avatar} alt={lead.brandName} className="w-14 h-14 rounded-full bg-secondary flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-foreground truncate">{lead.brandName}</h4>
              {lead.isVerified && (
                <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" title="Verified" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{lead.handle}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {PlatformIcon && (
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1', PLATFORM_COLORS[lead.platform])}>
                  <PlatformIcon className="w-3 h-3" /> {platformLabel}
                </span>
              )}
              {lead.category && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border bg-secondary text-muted-foreground flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" /> {lead.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View profile CTA */}
        {lead.pageUrl && (
          <a
            href={lead.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            {PlatformIcon && <PlatformIcon className="w-4 h-4" />}
            View Profile on {platformLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Stats tiles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-secondary rounded-lg p-2.5 text-center">
            <div className="text-base font-display font-bold text-foreground">{formatNumber(lead.followerCount) || '—'}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Followers</div>
          </div>
          <div className="bg-secondary rounded-lg p-2.5 text-center">
            <div className="text-base font-display font-bold text-foreground">{lead.postCount > 0 ? formatNumber(lead.postCount) : '—'}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Posts</div>
          </div>
          <div className="bg-secondary rounded-lg p-2.5 text-center">
            <div className="text-base font-display font-bold text-foreground">{lead.followingCount > 0 ? formatNumber(lead.followingCount) : '—'}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Following</div>
          </div>
        </div>

        {/* Profile facts — structured name/value rows */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Profile</p>
          <div className="bg-secondary/30 border border-border rounded-lg px-3">
            <DetailRow icon={User} label="Name">{lead.brandName}</DetailRow>
            <DetailRow icon={Tag} label="Handle" mono>{lead.handle}</DetailRow>
            <DetailRow icon={PlatformIcon} label="Platform">{platformLabel}</DetailRow>
            {lead.category && <DetailRow icon={Tag} label="Category">{lead.category}</DetailRow>}
            <DetailRow icon={MapPin} label="Location">{lead.city || 'India'}</DetailRow>
            {lead.bio && lead.bio !== `Indian fashion brand on ${platformLabel}` && (
              <DetailRow icon={MessageCircle} label="Bio">
                <span className="whitespace-pre-wrap">{lead.bio}</span>
              </DetailRow>
            )}
            {lead.niches?.length > 0 && (
              <DetailRow icon={Tag} label="Niches">
                <div className="flex flex-wrap gap-1">
                  {lead.niches.map(n => (
                    <span key={n} className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              </DetailRow>
            )}
          </div>
        </div>

        {/* Contact & Links — structured name/value rows */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Contact & Links</p>
          <div className="bg-secondary/30 border border-border rounded-lg px-3">
            {derived.website ? (
              <DetailRow icon={Globe} label="Website">
                <a href={derived.website} target="_blank" rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                  {derived.website.replace(/^https?:\/\//, '')}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </DetailRow>
            ) : (
              <DetailRow icon={Globe} label="Website">
                <span className="text-muted-foreground italic">Not listed</span>
              </DetailRow>
            )}
            {extraLinks.length > 0 && (
              <DetailRow icon={ExternalLink} label="More Links">
                <div className="space-y-1">
                  {extraLinks.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      className="block text-primary hover:underline break-all">
                      {url.replace(/^https?:\/\//, '')}
                    </a>
                  ))}
                </div>
              </DetailRow>
            )}
            <DetailRow icon={Mail} label="Email">
              {derived.email ? (
                <a href={`mailto:${derived.email}`} className="text-amber-400 hover:underline break-all">{derived.email}</a>
              ) : (
                <span className="text-muted-foreground italic">Not found</span>
              )}
            </DetailRow>
            <DetailRow icon={Phone} label="Phone">
              {derived.phone ? (
                <a href={`tel:${derived.phone}`} className="text-sky-400 hover:underline">{derived.phone}</a>
              ) : (
                <span className="text-muted-foreground italic">Not found</span>
              )}
            </DetailRow>
            <DetailRow icon={MessageCircle} label="WhatsApp">
              {derived.whatsapp ? (
                <a href={`https://wa.me/${derived.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer"
                  className="text-green-400 hover:underline inline-flex items-center gap-1">
                  {derived.whatsapp}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-muted-foreground italic">Not found</span>
              )}
            </DetailRow>
          </div>
        </div>

        {/* AI Enrichment section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI Insights</p>
            {!enrichment && (
              <button
                onClick={handleEnrich}
                disabled={enriching}
                className="flex items-center gap-1 text-[11px] px-2 py-1 bg-primary/10 text-primary border border-primary/30 rounded-md hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {enriching
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                  : <><Sparkles className="w-3 h-3" /> Enrich with AI</>
                }
              </button>
            )}
          </div>

          {enrichError && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-md px-2 py-1.5 mb-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> {enrichError}
            </div>
          )}

          {enrichment ? (
            <div className="bg-secondary/30 border border-border rounded-lg px-3">
              {enrichment.description && <DetailRow icon={Sparkles} label="Summary">{enrichment.description}</DetailRow>}
              {enrichment.products && <DetailRow icon={Package} label="Products">{enrichment.products}</DetailRow>}
              {enrichment.priceRange && (
                <DetailRow icon={IndianRupee} label="Price Tier">
                  <span className="capitalize">{enrichment.priceRange}</span>
                </DetailRow>
              )}
              {enrichment.paymentMethods && <DetailRow icon={CreditCard} label="Payment">{enrichment.paymentMethods}</DetailRow>}
              {enrichment.shippingPolicy && <DetailRow icon={Truck} label="Shipping">{enrichment.shippingPolicy}</DetailRow>}
              {enrichment.ownerHandle && (
                <DetailRow icon={User} label="Owner" mono>{enrichment.ownerHandle}</DetailRow>
              )}
              {enrichment.city && <DetailRow icon={MapPin} label="AI City">{enrichment.city}</DetailRow>}
              {enrichment.language && <DetailRow icon={Languages} label="Language">{enrichment.language}</DetailRow>}
              {enrichment.website && <DetailRow icon={Globe} label="AI Link">{enrichment.website}</DetailRow>}
              {enrichment.email && <DetailRow icon={Mail} label="AI Email">{enrichment.email}</DetailRow>}
              {enrichment.phone && <DetailRow icon={Phone} label="AI Phone">{enrichment.phone}</DetailRow>}
              {enrichment.whatsapp && <DetailRow icon={MessageCircle} label="AI WA">{enrichment.whatsapp}</DetailRow>}
              {enrichment.urls && <DetailRow icon={ExternalLink} label="AI URLs">{enrichment.urls}</DetailRow>}
              {!Object.values(enrichment).some(v => v) && (
                <p className="text-xs text-muted-foreground italic py-2">AI couldn't extract anything new from this profile.</p>
              )}
            </div>
          ) : (
            !enriching && (
              <p className="text-[11px] text-muted-foreground italic">
                Click "Enrich with AI" to extract products, payment, shipping & more from the bio.
              </p>
            )
          )}
        </div>

        {lead.posts?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recent Posts</p>
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
        const derived = deriveLeadFields(l)
        const hasWebsite = Boolean(l.hasWebsite || derived.website)
        if (filterWebsite === 'yes' && !hasWebsite) return false
        if (filterWebsite === 'no' && hasWebsite) return false
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

  /**
   * Export the current leads (selected → selected only; otherwise → filtered list)
   * as a CSV with Brand, Handle, Platform, Website, Email, Phone, WhatsApp.
   * RFC 4180-ish: wrap every field in quotes and escape inner quotes as "".
   */
  const handleExportCsv = () => {
    const rows = selectedLeads.length > 0 ? selectedLeads : filtered
    if (rows.length === 0) {
      addToast('No leads to export', 'error')
      return
    }

    const headers = [
      'Brand Name', 'Handle', 'Platform', 'Followers', 'Bio', 'Website',
      'All URLs', 'Email', 'Phone', 'WhatsApp', 'Profile URL',
    ]
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

    // Excel reads "+918191977777" as a number and drops the "+", converting
    // to scientific notation. Wrapping as ="..." forces text mode in Excel,
    // Google Sheets, and LibreOffice — the cell shows the exact string.
    const asText = (v) => {
      const s = String(v ?? '').trim()
      return s ? `="${s.replace(/"/g, '""')}"` : ''
    }

    const lines = [headers.map(escape).join(',')]
    for (const l of rows) {
      const derived = deriveLeadFields(l)
      // Phone & WhatsApp use the text-formula form; everything else uses
      // standard quoted CSV escaping.
      lines.push([
        escape(l.brandName),
        escape(l.handle),
        escape(l.platform),
        escape(l.followerCount || ''),
        escape(l.bio || ''),
        escape(derived.website),
        escape(derived.allUrls.join(' | ')),
        escape(derived.email),
        derived.phone ? asText(derived.phone) : escape(''),
        derived.whatsapp ? asText(derived.whatsapp) : escape(''),
        escape(l.pageUrl || ''),
      ].join(','))
    }

    // Prepend BOM so Excel opens UTF-8 emoji/Indic text correctly
    const csv = '﻿' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `carbon-leads-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addToast(`Exported ${rows.length} lead${rows.length === 1 ? '' : 's'} to CSV`, 'success')
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Leads"
          subtitle={`${leads.length} fashion brand${leads.length === 1 ? '' : 's'} discovered`}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-secondary text-foreground border border-border rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={selectedLeads.length > 0
                  ? `Export ${selectedLeads.length} selected leads`
                  : `Export ${filtered.length} filtered leads`}
              >
                <Download className="w-4 h-4" />
                Export CSV
                {selectedLeads.length > 0 && (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                    {selectedLeads.length}
                  </span>
                )}
              </button>
              {selectedLeads.length > 0 && (
                <button
                  onClick={() => setShowPreview(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors animate-fade-in"
                >
                  <Send className="w-4 h-4" />
                  Approve & Send ({selectedLeads.length})
                </button>
              )}
            </div>
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
              <span>{selectedLeads.filter(l => l.hasWebsite || deriveLeadFields(l).website).length} have websites</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{selectedLeads.filter(l => l.hasEmail || deriveLeadFields(l).email).length} have emails</span>
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
