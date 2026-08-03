/**
 * seedCms.ts — Seeds real CMS content into CronCache.
 * Run with: npx ts-node prisma/seedCms.ts
 *
 * These fixtures were fetched from cms1.betwayafrica.com and are stored
 * locally so the SPA renders correctly without needing a live CMS connection.
 */

import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const prisma = new PrismaClient()

const TTL = 365 * 24 * 60 * 60 * 1000 // 1 year — effectively permanent

interface CmsFixture {
  cacheKey: string
  file: string
}

const fixtures: CmsFixture[] = [
  {
    cacheKey: 'cms-gmapi:/Content/SynapseV2/ZA/home:en-US',
    file: path.resolve(__dirname, '../cms_home.json'),
  },
  {
    cacheKey: 'cms-gmapi:/Content/SynapseV2/ZA/home-page-sponsorship:en-US',
    file: path.resolve(__dirname, '../cms_sponsorship.json'),
  },
  {
    cacheKey: 'cms-gmapi:/Content/SynapseV2/ZA/footer:en-US',
    file: path.resolve(__dirname, '../cms_footer.json'),
  },
]

async function main() {
  for (const fixture of fixtures) {
    if (!fs.existsSync(fixture.file)) {
      console.warn(`[seedCms] Skipping missing file: ${fixture.file}`)
      continue
    }

    const data = fs.readFileSync(fixture.file, 'utf-8').trim()

    await prisma.cronCache.upsert({
      where:  { cacheKey: fixture.cacheKey },
      update: { data, expiresAt: new Date(Date.now() + TTL), fetchedAt: new Date() },
      create: { cacheKey: fixture.cacheKey, data, expiresAt: new Date(Date.now() + TTL), fetchedAt: new Date() },
    })

    console.log(`[seedCms] ✅  Seeded: ${fixture.cacheKey}`)
  }

  console.log('[seedCms] Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
