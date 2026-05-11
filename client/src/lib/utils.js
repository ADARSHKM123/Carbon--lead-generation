import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function fillTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match
  })
}

export function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
}

export const PLATFORM_COLORS = {
  instagram: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  facebook: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  linkedin: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  email: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

export const STATUS_COLORS = {
  queued: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  sending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  replied: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'in conversation': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  converted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
}
