import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
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

export default api
