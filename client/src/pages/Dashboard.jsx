import { useNavigate } from 'react-router-dom'
import { Megaphone, Users, Send, MessageSquare, Globe, Mail, TrendingUp, ArrowRight, Zap, Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Header from '../components/layout/Header'
import { useApp } from '../context/AppContext'
import { cn, formatNumber } from '../lib/utils'

const CHART_DATA = [
  { day: 'Mon', sent: 42, replied: 5 },
  { day: 'Tue', sent: 78, replied: 9 },
  { day: 'Wed', sent: 115, replied: 14 },
  { day: 'Thu', sent: 91, replied: 11 },
  { day: 'Fri', sent: 142, replied: 18 },
  { day: 'Sat', sent: 67, replied: 8 },
  { day: 'Sun', sent: 33, replied: 4 },
]

function StatCard({ icon: Icon, label, value, sub, color = 'primary', onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-xl p-5 text-left w-full',
        'hover:border-primary/40 hover:bg-card/80 transition-all duration-200 group',
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center mb-4',
          color === 'primary' && 'bg-primary/10',
          color === 'emerald' && 'bg-emerald-500/10',
          color === 'blue' && 'bg-blue-500/10',
          color === 'amber' && 'bg-amber-500/10',
          color === 'violet' && 'bg-violet-500/10',
          color === 'pink' && 'bg-pink-500/10',
        )}>
          <Icon className={cn(
            'w-5 h-5',
            color === 'primary' && 'text-primary',
            color === 'emerald' && 'text-emerald-400',
            color === 'blue' && 'text-blue-400',
            color === 'amber' && 'text-amber-400',
            color === 'violet' && 'text-violet-400',
            color === 'pink' && 'text-pink-400',
          )} />
        </div>
        {onClick && (
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/60 mt-1">{sub}</div>}
    </button>
  )
}

export default function Dashboard() {
  const { stats, campaigns } = useApp()
  const navigate = useNavigate()

  const recentCampaigns = campaigns.slice(0, 3)

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <Header
        title="Dashboard"
        subtitle="Welcome back — here's what's happening with your outreach"
        actions={
          <button
            onClick={() => navigate('/campaigns?new=true')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Zap className="w-4 h-4" />
            New Campaign
          </button>
        }
      />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Megaphone} label="Active Campaigns" value={stats.activeCampaigns} color="primary" onClick={() => navigate('/campaigns')} />
          <StatCard icon={Users} label="Total Leads" value={formatNumber(stats.totalLeads)} sub="India" color="blue" onClick={() => navigate('/leads')} />
          <StatCard icon={Send} label="Messages Sent" value={formatNumber(stats.totalSent)} color="amber" />
          <StatCard icon={MessageSquare} label="Replies" value={stats.totalReplied} color="emerald" onClick={() => navigate('/inbox')} />
          <StatCard icon={TrendingUp} label="Avg Reply Rate" value={`${stats.avgReplyRate}%`} color="violet" />
          <StatCard icon={Globe} label="Has Website" value={stats.leadsWithWebsite} sub="higher quality" color="pink" />
        </div>

        {/* Chart + Recent campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display font-semibold text-foreground">Outreach Activity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Last 7 days — sent vs replied</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary inline-block" />Sent</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Replied</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={CHART_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(271 91% 65%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(271 91% 65%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(240 5% 58%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(240 5% 58%)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(240 10% 6%)', border: '1px solid hsl(240 5% 14%)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(0 0% 98%)' }}
                />
                <Area type="monotone" dataKey="sent" stroke="hsl(271 91% 65%)" strokeWidth={2} fill="url(#gradSent)" />
                <Area type="monotone" dataKey="replied" stroke="#4ade80" strokeWidth={2} fill="url(#gradReplied)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Recent campaigns */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground">Recent Campaigns</h3>
              <button onClick={() => navigate('/campaigns')} className="text-xs text-primary hover:underline">View all</button>
            </div>
            <div className="space-y-3">
              {recentCampaigns.map(camp => (
                <div key={camp.id} className="flex items-start gap-3 p-3 bg-secondary rounded-lg">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    camp.status === 'active' && 'bg-emerald-400',
                    camp.status === 'completed' && 'bg-muted-foreground',
                    camp.status === 'draft' && 'bg-amber-400',
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{camp.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {camp.sent} sent · {camp.replyRate}% reply rate
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-display font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Start New Campaign', icon: Megaphone, desc: 'Discover & outreach', onClick: () => navigate('/campaigns?new=true') },
              { label: 'Review Leads', icon: Users, desc: `${stats.totalLeads} leads waiting`, onClick: () => navigate('/leads') },
              { label: 'Check Inbox', icon: MessageSquare, desc: `${stats.inboxUnread} new replies`, onClick: () => navigate('/inbox') },
              { label: 'Manage Templates', icon: Activity, desc: 'Edit message formats', onClick: () => navigate('/templates') },
            ].map(({ label, icon: Icon, desc, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex items-center gap-3 p-4 bg-secondary hover:bg-border rounded-lg text-left transition-colors group"
              >
                <Icon className="w-5 h-5 text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
