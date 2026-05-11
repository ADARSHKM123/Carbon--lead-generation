export const MOCK_CAMPAIGNS = [
  {
    id: 'camp-1',
    name: 'Ethnic Wear Q4 Push',
    status: 'active',
    platforms: ['instagram', 'facebook'],
    hashtags: ['#indianfashion', '#ethnicwear', '#indianbrand', '#handloom'],
    dailyLimit: 150,
    template: `Hi {{brand_name}}! 👋

I came across your {{product_style}} collection on {{platform}} and I'm genuinely impressed — the craftsmanship and quality really stand out.

I work with fashion brands like yours across India, and I wanted to reach out because we've built a tool that helps brands like {{brand_name}} accelerate online sales and reach more customers.

Would you be open to a 15-minute chat to see if it could be useful for you?

Best,
The Carbon Team`,
    leadsDiscovered: 230,
    leadsApproved: 187,
    sent: 142,
    replied: 18,
    replyRate: 12.7,
    createdAt: '2024-10-28T09:00:00Z',
    lastRun: '2024-11-04T10:30:00Z',
  },
  {
    id: 'camp-2',
    name: 'Sustainable Fashion Outreach',
    status: 'completed',
    platforms: ['instagram', 'linkedin'],
    hashtags: ['#sustainablefashion', '#slowfashion', '#consciousfashion', '#ecofashion'],
    dailyLimit: 100,
    template: `Hi {{brand_name}}! 🌿

Your commitment to {{niche}} really resonates with us. It's inspiring to see Indian brands like yours leading the way in conscious fashion.

We've built a platform specifically designed to help sustainable fashion brands scale their reach and grow their B2B sales — without compromising their values.

Many brands similar to yours have seen a 3x increase in wholesale inquiries using our tool. Would love to show you how!

Warm regards,
Carbon Team`,
    leadsDiscovered: 89,
    leadsApproved: 71,
    sent: 71,
    replied: 11,
    replyRate: 15.5,
    createdAt: '2024-10-15T09:00:00Z',
    lastRun: '2024-10-25T18:00:00Z',
  },
  {
    id: 'camp-3',
    name: 'Bridal Season Campaign',
    status: 'draft',
    platforms: ['instagram'],
    hashtags: ['#bridalwear', '#indianbridal', '#weddingseason', '#lehenga'],
    dailyLimit: 200,
    template: `Hi {{brand_name}}! 💒

Wedding season is here, and your bridal collection is absolutely stunning!

We help bridal fashion brands like {{brand_name}} connect with more brides-to-be and wedding stylists. Our platform has helped 3 bridal brands increase their enquiries by over 40% this season.

Would you be interested in learning more? Happy to share a quick demo!

Best,
Carbon Outreach`,
    leadsDiscovered: 0,
    leadsApproved: 0,
    sent: 0,
    replied: 0,
    replyRate: 0,
    createdAt: '2024-11-03T15:00:00Z',
    lastRun: null,
  },
]

export const MOCK_TEMPLATES = [
  {
    id: 'tmpl-1',
    name: 'Standard Outreach',
    description: 'Generic B2B intro message for any fashion brand',
    template: `Hi {{brand_name}}! 👋

I came across your {{product_style}} collection on {{platform}} and I'm genuinely impressed — the craftsmanship really stands out.

We've built a tool that helps fashion brands like {{brand_name}} accelerate their online sales and reach more customers across India.

Would you be open to a quick 15-minute chat?

Best,
The Carbon Team`,
    variables: ['brand_name', 'product_style', 'platform'],
    usageCount: 142,
    lastUsed: '2024-11-04T10:30:00Z',
    createdAt: '2024-10-20T09:00:00Z',
  },
  {
    id: 'tmpl-2',
    name: 'Sustainable Brand Pitch',
    description: 'Tailored for eco-conscious / sustainable fashion brands',
    template: `Hi {{brand_name}}! 🌿

Your work in {{niche}} is truly inspiring — it's amazing to see Indian brands championing conscious fashion.

We've built a platform that helps sustainable brands scale their reach without compromising their values. Brands like yours have seen 3x growth in B2B inquiries.

Would love to share more — are you open to a quick chat?`,
    variables: ['brand_name', 'niche'],
    usageCount: 71,
    lastUsed: '2024-10-25T18:00:00Z',
    createdAt: '2024-10-14T09:00:00Z',
  },
  {
    id: 'tmpl-3',
    name: 'Premium / Luxury Pitch',
    description: 'For high-end and luxury fashion labels',
    template: `Dear {{brand_name}},

I had the pleasure of discovering your {{product_style}} collection, and the quality and artistry truly set you apart in the Indian luxury fashion space.

We partner with premium fashion labels to help them grow their B2B sales and reach the right buyers — without diluting their brand.

Would you be open to a brief conversation to explore if there's a fit?

Warm regards,
Carbon Outreach`,
    variables: ['brand_name', 'product_style'],
    usageCount: 0,
    lastUsed: null,
    createdAt: '2024-11-01T09:00:00Z',
  },
]
