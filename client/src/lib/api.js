import axios from 'axios'

// In production (Vercel), VITE_API_URL points to the Render backend.
// In local dev, requests go to /api which Vite proxies to localhost:8000.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 90000,
})

api.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err?.response?.data || err)
)

export const personalizeMessages = async (leads, template) => {
  const res = await api.post('/personalize', { leads, template })
  return res
}

export const discoverLeads = async (params) => {
  const res = await api.post('/discover', params)
  return res
}

export const sendCampaign = async (campaignId, leadIds) => {
  const res = await api.post('/send', { campaignId, leadIds })
  return res
}

export const enrichLead = async ({ brandName, handle, bio, category, website, bioLinks }) => {
  const res = await api.post('/leads/enrich', { brandName, handle, bio, category, website, bioLinks })
  return res
}

export const checkDeepSeekStatus = async () => {
  const res = await api.get('/ai/deepseek/status')
  return res
}

// ─── HikerAPI proxy ──────────────────────────────────────────────
const HIKER_KEY_STORAGE = 'carbon_hiker_key'

export const getHikerKey = () => localStorage.getItem(HIKER_KEY_STORAGE) || ''
export const setHikerKey = (key) => localStorage.setItem(HIKER_KEY_STORAGE, key || '')
export const clearHikerKey = () => localStorage.removeItem(HIKER_KEY_STORAGE)

const withHikerHeader = () => {
  const key = getHikerKey()
  return key ? { 'x-hiker-key': key } : {}
}

export const testHikerKey = async () => {
  return await api.get('/hiker/test-key', { headers: withHikerHeader() })
}

export const scrapeHikerUser = async (username) => {
  return await api.get('/hiker/user', {
    params: { username },
    headers: withHikerHeader(),
  })
}

export const scrapeHikerHashtag = async (tag, kind = 'recent', limit = 30) => {
  return await api.get('/hiker/hashtag', {
    params: { tag, kind, limit },
    headers: withHikerHeader(),
  })
}

export default api
