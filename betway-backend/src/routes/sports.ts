/**
 * sports.ts — Sports feed router
 * Mounted at /br/_apis/sport
 */

import { Router } from 'express'
import { getSports, getEsports } from '../controllers/SportsController'
import { getMarkets, getFavouriteMarkets } from '../controllers/MarketsController'
import { createProxy } from '../middleware/proxy'
import { config } from '../config'

export const sportsRouter: Router = Router()

// Cache-first routes
sportsRouter.get('/cron/sports/:brand/:locale',   getSports)
sportsRouter.get('/cron/esports/:brand/:locale',  getEsports)
sportsRouter.get('/MarketGroupings/MarketGroupNamesAndMarketsForEvent', getMarkets)
sportsRouter.get('/FeedsMarket', getFavouriteMarkets)

// Anything else on the sports domain → proxy upstream
sportsRouter.use(
  createProxy({
    pathPrefix:  '/br/_apis/sport',
    target:      config.SPORTS_DOMAIN,
    stripPrefix: '/br/_apis/sport',
  })
)
