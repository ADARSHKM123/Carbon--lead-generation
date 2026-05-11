import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Megaphone, Users, Inbox,
  FileText, Settings, Zap, ChevronRight, Bell
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useApp } from '../../context/AppContext'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/inbox', icon: Inbox, label: 'Inbox', badge: true },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { stats } = useApp()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] flex flex-col bg-sidebar border-r border-sidebar-border z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-display font-bold text-sm text-foreground tracking-tight">Carbon</p>
          <p className="text-[10px] text-muted-foreground">Outreach</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {NAV.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-primary' : '')} />
                <span className="flex-1">{label}</span>
                {badge && stats.inboxUnread > 0 && (
                  <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                    {stats.inboxUnread}
                  </span>
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-primary opacity-60" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom info */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="bg-secondary rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Quick Stats</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Sent today</span>
              <span className="text-foreground font-medium">47</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Reply rate</span>
              <span className="text-emerald-400 font-medium">{stats.avgReplyRate}%</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
