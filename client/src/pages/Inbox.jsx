import { useState } from 'react'
import { MessageSquare, Send, Instagram, Facebook, Linkedin, Clock, ChevronRight, Circle } from 'lucide-react'
import Header from '../components/layout/Header'
import { useApp } from '../context/AppContext'
import { cn, PLATFORM_COLORS } from '../lib/utils'

const PLATFORM_ICON = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin }

function formatTime(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const diffHr = diffMs / (1000 * 60 * 60)
  if (diffHr < 1) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffHr < 24) return `${Math.floor(diffHr)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function Inbox() {
  const { replies, setReplies } = useApp()
  const [selected, setSelected] = useState(replies[0] || null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!replyText.trim() || !selected) return
    setSending(true)
    await new Promise(r => setTimeout(r, 600))

    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: 'us',
      message: replyText,
      time: new Date().toISOString(),
    }

    setReplies(prev => prev.map(r =>
      r.id === selected.id
        ? { ...r, thread: [...r.thread, newMsg], lastMessage: replyText, lastMessageTime: newMsg.time, status: 'in conversation' }
        : r
    ))
    setSelected(prev => ({
      ...prev,
      thread: [...prev.thread, newMsg],
      lastMessage: replyText,
      status: 'in conversation',
    }))
    setReplyText('')
    setSending(false)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Thread list */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col">
        <Header title="Inbox" subtitle={`${replies.length} conversations`} />

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {replies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-foreground mb-1">No replies yet</h3>
              <p className="text-sm text-muted-foreground">When brands reply to your DMs, conversations will appear here.</p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {replies.map(reply => {
                const PlatformIcon = PLATFORM_ICON[reply.platform]
                const isSelected = selected?.id === reply.id
                return (
                  <button
                    key={reply.id}
                    onClick={() => setSelected(reply)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
                      isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-secondary border border-transparent'
                    )}
                  >
                    <div className="relative flex-shrink-0">
                      <img src={reply.avatar} alt={reply.brandName} className="w-10 h-10 rounded-full bg-secondary" />
                      {reply.status === 'replied' && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-foreground truncate">{reply.brandName}</p>
                        <p className="text-[10px] text-muted-foreground flex-shrink-0">{formatTime(reply.lastMessageTime)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{reply.lastMessage}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {PlatformIcon && <PlatformIcon className="w-3 h-3 text-muted-foreground" />}
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                          reply.status === 'replied' && 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                          reply.status === 'in conversation' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                        )}>
                          {reply.status}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Conversation panel */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Conversation header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-background/80 sticky top-0">
            <img src={selected.avatar} alt={selected.brandName} className="w-9 h-9 rounded-full bg-secondary" />
            <div>
              <p className="font-semibold text-foreground text-sm">{selected.brandName}</p>
              <p className="text-xs text-muted-foreground">{selected.handle} · {selected.platform}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-full border',
                selected.status === 'replied' && 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                selected.status === 'in conversation' && 'bg-blue-500/10 text-blue-400 border-blue-500/20',
              )}>
                {selected.status}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-4">
            {selected.thread.map(msg => (
              <div key={msg.id} className={cn('flex', msg.sender === 'us' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.sender === 'us'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-card border border-border text-foreground rounded-tl-sm'
                )}>
                  <p>{msg.message}</p>
                  <p className={cn(
                    'text-[10px] mt-1.5',
                    msg.sender === 'us' ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'
                  )}>
                    {formatTime(msg.time)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Reply box */}
          <div className="px-6 py-4 border-t border-border bg-background">
            <div className="flex items-start gap-3 bg-card border border-border rounded-xl p-3">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                rows={3}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none scrollbar-thin"
              />
              <button
                onClick={handleSend}
                disabled={!replyText.trim() || sending}
                className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 mt-0.5"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              You are replying manually. The agent will never auto-reply on your behalf.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Select a conversation to view</p>
          </div>
        </div>
      )}
    </div>
  )
}
