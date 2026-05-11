import { useState, useEffect, useRef } from 'react'
import { Instagram, Facebook, Linkedin, Mail, CheckCircle2, XCircle, ExternalLink, Save, Eye, EyeOff, AlertCircle, Sparkles, ChevronDown, Loader2, X, MonitorPlay } from 'lucide-react'
import Header from '../components/layout/Header'
import { cn } from '../lib/utils'

const AI_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    logo: '🟣',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recommended)' },
      { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7 (Most capable)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
    ],
    envKey: 'ANTHROPIC_API_KEY',
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: '🔵',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek V3 (Recommended)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (Advanced reasoning)' },
    ],
    envKey: 'DEEPSEEK_API_KEY',
    keyPrefix: 'sk-',
    docsUrl: 'https://platform.deepseek.com',
  },
]

function AIProviderSelector() {
  const [activeProvider, setActiveProvider] = useState('anthropic')
  const [selectedModels, setSelectedModels] = useState({
    anthropic: 'claude-sonnet-4-6',
    deepseek: 'deepseek-chat',
  })
  const [keys, setKeys] = useState({ anthropic: '', deepseek: '' })
  const [showKeys, setShowKeys] = useState({ anthropic: false, deepseek: false })

  const provider = AI_PROVIDERS.find(p => p.id === activeProvider)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Provider tabs */}
      <div className="flex border-b border-border">
        {AI_PROVIDERS.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveProvider(p.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
              activeProvider === p.id
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{p.logo}</span>
            {p.name}
            {activeProvider === p.id && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">Active</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {/* Model selector */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Model</label>
          <div className="relative">
            <select
              value={selectedModels[activeProvider]}
              onChange={e => setSelectedModels(prev => ({ ...prev, [activeProvider]: e.target.value }))}
              className="w-full appearance-none bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-8"
            >
              {provider.models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Env var: <code className="font-mono bg-secondary px-1 rounded">
              {activeProvider === 'anthropic' ? 'ANTHROPIC_MODEL' : 'DEEPSEEK_MODEL'}
            </code>
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">
            API Key <span className="text-muted-foreground font-normal">({provider.envKey})</span>
          </label>
          <div className="relative">
            <input
              type={showKeys[activeProvider] ? 'text' : 'password'}
              value={keys[activeProvider]}
              onChange={e => setKeys(prev => ({ ...prev, [activeProvider]: e.target.value }))}
              placeholder={`${provider.keyPrefix}...`}
              className="w-full bg-secondary border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
            />
            <button
              onClick={() => setShowKeys(prev => ({ ...prev, [activeProvider]: !prev[activeProvider] }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKeys[activeProvider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-muted-foreground">
              Add to <code className="font-mono bg-secondary px-1 rounded">server/.env</code> as <code className="font-mono bg-secondary px-1 rounded">{provider.envKey}</code>
            </p>
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary hover:underline flex items-center gap-1"
            >
              Get API key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* .env snippet */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1.5">Add to <code className="font-mono bg-secondary px-1 rounded">server/.env</code></p>
          <pre className="bg-secondary rounded-lg p-3 text-[11px] text-muted-foreground font-mono leading-relaxed select-all">
{activeProvider === 'anthropic'
  ? `AI_PROVIDER=anthropic\nANTHROPIC_API_KEY=${keys.anthropic || 'sk-ant-...'}\nANTHROPIC_MODEL=${selectedModels.anthropic}`
  : `AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY=${keys.deepseek || 'sk-...'}\nDEEPSEEK_BASE_URL=https://api.deepseek.com\nDEEPSEEK_MODEL=${selectedModels.deepseek}`
}
          </pre>
        </div>

        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-primary/80">
            To switch providers, change <code className="font-mono bg-primary/10 px-1 rounded">AI_PROVIDER</code> in your <code className="font-mono bg-primary/10 px-1 rounded">.env</code> file and restart the backend. No code changes needed.
          </p>
        </div>
      </div>
    </div>
  )
}

const PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: Facebook,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    desc: 'Connect your Facebook profile to discover and message fashion brand pages.',
    note: 'Opens a real browser window. Log in once — sessions are saved automatically.',
    supportsLogin: true,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: Instagram,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
    desc: 'Connect your Instagram account to send DMs to fashion brands.',
    note: 'Opens a real browser window for one-time login. Keep the session active.',
    supportsLogin: true,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
    desc: 'Connect LinkedIn to reach fashion brand founders and owners.',
    note: 'LinkedIn limits connection requests. Use cautiously (max 20/day recommended).',
    supportsLogin: true,
  },
  {
    id: 'email',
    name: 'Email (SMTP)',
    icon: Mail,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    desc: 'Send cold emails to brands with a website. Configure SMTP credentials below.',
    note: 'No login required — uses your SMTP credentials from the settings below.',
    supportsLogin: false,
  },
]

// ── Login modal — shows WebSocket progress while browser opens ───────────────

function LoginModal({ platform, onClose, onConnected }) {
  const [log, setLog]       = useState([])
  const [status, setStatus] = useState('opening') // opening | waiting | done | error
  const wsRef               = useRef(null)
  const logEndRef           = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/api/ws/session/${platform}`)
    wsRef.current = ws

    ws.onopen = () => {
      setLog(p => [...p, '🔌 Connected to backend...'])
      setStatus('waiting')
    }
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'session') {
        setLog(p => [...p, data.message])
      }
      if (data.type === 'done') {
        if (data.connected) {
          setLog(p => [...p, '✅ Session saved successfully!'])
          setStatus('done')
          setTimeout(() => { onConnected(); onClose() }, 1200)
        } else {
          setLog(p => [...p, '❌ Login not detected — please try again.'])
          setStatus('error')
        }
      }
      if (data.type === 'error') {
        setLog(p => [...p, `❌ Error: ${data.message}`])
        setStatus('error')
      }
    }
    ws.onerror = () => {
      setLog(p => [...p, '❌ Cannot connect to backend. Make sure the server is running on port 8000.'])
      setStatus('error')
    }
    ws.onclose = () => {
      if (status === 'waiting') setStatus('error')
    }

    return () => ws.close()
  }, [platform])

  const platformName = PLATFORMS.find(p => p.id === platform)?.name || platform

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <MonitorPlay className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground">Connect {platformName}</h3>
              <p className="text-xs text-muted-foreground">One-time browser login</p>
            </div>
          </div>
          {status !== 'waiting' && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-2 mb-4">
          {[
            { label: 'Backend opens a real browser window', done: status !== 'opening' },
            { label: `You log in to ${platformName} in that window`, done: status === 'done' },
            { label: 'Session saved — browser closes automatically', done: status === 'done' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                step.done ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground border border-border'
              )}>
                {step.done ? '✓' : i + 1}
              </div>
              <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
            </div>
          ))}
        </div>

        {/* Live log */}
        <div className="bg-secondary rounded-xl p-3 min-h-[80px] max-h-36 overflow-y-auto scrollbar-thin font-mono text-xs space-y-1">
          {log.length === 0
            ? <span className="text-muted-foreground">Connecting to backend...</span>
            : log.map((line, i) => <div key={i} className="text-muted-foreground leading-relaxed">{line}</div>)
          }
          {status === 'waiting' && (
            <div className="flex items-center gap-2 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Waiting for you to log in... (3 min timeout)</span>
            </div>
          )}
          <div ref={logEndRef} />
        </div>

        {status === 'error' && (
          <button
            onClick={onClose}
            className="mt-3 w-full py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-border transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}

// ── Platform card ────────────────────────────────────────────────────────────

function PlatformCard({ platform }) {
  const { id, icon: Icon, name, color, bg, desc, note, supportsLogin } = platform
  const [connected, setConnected] = useState(false)
  const [checking, setChecking]   = useState(true)
  const [showLogin, setShowLogin] = useState(false)

  // Check real session status from backend on mount
  useEffect(() => {
    if (!supportsLogin) { setChecking(false); return }
    fetch(`http://localhost:8000/api/session/status/${id}`)
      .then(r => r.json())
      .then(data => { setConnected(data.connected); setChecking(false) })
      .catch(() => setChecking(false))
  }, [id, supportsLogin])

  const handleConnect = () => {
    if (!supportsLogin) return
    setShowLogin(true)
  }

  const handleDisconnect = () => {
    // Session disconnect: just mark as disconnected in UI
    // Full session wipe would delete the session folder on the backend
    setConnected(false)
  }

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className={cn('w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0', bg)}>
            <Icon className={cn('w-5 h-5', color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground">{name}</h3>
              {checking ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                </span>
              ) : connected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-full">
                  <XCircle className="w-3 h-3" /> Disconnected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            <p className="text-[11px] text-amber-400/80 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> {note}
            </p>
          </div>
          <button
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={checking || !supportsLogin}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              connected
                ? 'bg-secondary text-muted-foreground border-border hover:text-destructive hover:border-destructive/30'
                : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
            )}
          >
            {connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {showLogin && (
        <LoginModal
          platform={id}
          onClose={() => setShowLogin(false)}
          onConnected={() => setConnected(true)}
        />
      )}
    </>
  )
}

function ApiKeyInput({ label, placeholder, envKey }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-secondary border border-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
        />
        <button
          onClick={() => setShow(p => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Env var: <code className="font-mono bg-secondary px-1 rounded">{envKey}</code></p>
    </div>
  )
}

export default function Settings() {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <Header title="Settings" subtitle="Configure platform connections and API keys" />

      <div className="p-6 space-y-8 max-w-3xl animate-fade-in">
        {/* Platform connections */}
        <section>
          <h2 className="font-display font-semibold text-foreground mb-1">Platform Connections</h2>
          <p className="text-sm text-muted-foreground mb-4">Connect your social media accounts to enable outreach.</p>
          <div className="space-y-3">
            {PLATFORMS.map(p => <PlatformCard key={p.id} platform={p} />)}
          </div>
        </section>

        {/* AI Model Selector */}
        <section>
          <h2 className="font-display font-semibold text-foreground mb-1">AI Provider & Model</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which AI powers message personalization. Switch anytime by changing one line in your <code className="font-mono bg-secondary px-1 rounded text-xs">.env</code>.
          </p>
          <AIProviderSelector />
        </section>

        {/* Other API Keys */}
        <section>
          <h2 className="font-display font-semibold text-foreground mb-1">Other API Keys</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Keys stored locally in <code className="font-mono bg-secondary px-1 rounded text-xs">server/.env</code> — never sent to our servers.
          </p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <ApiKeyInput
              label="SendGrid API Key (for email outreach)"
              placeholder="SG...."
              envKey="SENDGRID_API_KEY"
            />
          </div>
        </section>

        {/* SMTP Settings */}
        <section>
          <h2 className="font-display font-semibold text-foreground mb-1">Email SMTP Settings</h2>
          <p className="text-sm text-muted-foreground mb-4">Configure SMTP for sending cold emails to brands with websites.</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {[
              { label: 'SMTP Host', placeholder: 'smtp.gmail.com', env: 'SMTP_HOST' },
              { label: 'SMTP Port', placeholder: '587', env: 'SMTP_PORT' },
              { label: 'SMTP Username / Email', placeholder: 'yourname@gmail.com', env: 'SMTP_USER' },
            ].map(({ label, placeholder, env }) => (
              <div key={env}>
                <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
                <input
                  placeholder={placeholder}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Env: <code className="font-mono bg-secondary px-1 rounded">{env}</code></p>
              </div>
            ))}
            <ApiKeyInput label="SMTP Password" placeholder="Your app password" envKey="SMTP_PASSWORD" />
          </div>
        </section>

        {/* Outreach safety */}
        <section>
          <h2 className="font-display font-semibold text-foreground mb-1">Outreach Safety</h2>
          <p className="text-sm text-muted-foreground mb-4">Protect your accounts from being flagged or banned.</p>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            {[
              { label: 'Min delay between messages (seconds)', placeholder: '30', note: 'Minimum gap between DMs. Lower = faster but riskier.' },
              { label: 'Max delay between messages (seconds)', placeholder: '120', note: 'Random delay is chosen between min and max.' },
              { label: 'Daily message limit per account', placeholder: '100', note: 'Instagram flags accounts sending 200+ DMs/day.' },
            ].map(({ label, placeholder, note }) => (
              <div key={label}>
                <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
                <input placeholder={placeholder} className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 w-48" />
                <p className="text-[11px] text-muted-foreground mt-1">{note}</p>
              </div>
            ))}
          </div>
        </section>

        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all',
            saved ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Settings</>}
        </button>
      </div>
    </div>
  )
}
