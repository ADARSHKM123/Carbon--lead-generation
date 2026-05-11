import { Sun, Moon, Bell, Search } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { cn } from '../../lib/utils'

export default function Header({ title, subtitle, actions }) {
  const { theme, toggleTheme, stats } = useApp()

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div>
        <h1 className="font-display font-bold text-xl text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="relative">
          <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          {stats.inboxUnread > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
          )}
        </div>
      </div>
    </header>
  )
}
