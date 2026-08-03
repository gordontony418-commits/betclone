/**
 * prisma/seed.ts
 *
 * Seed Nigerian sports data for local development.
 * Uses upserts throughout so it is safe to run multiple times.
 *
 * Run with: npx ts-node prisma/seed.ts
 *       or: npm run seed
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Sport IDs ───────────────────────────────────────────────────────────────
const SPORT_FOOTBALL    = 'sr:sport:1'
const SPORT_BASKETBALL  = 'sr:sport:2'
const SPORT_TENNIS      = 'sr:sport:5'

// ─── Region IDs ──────────────────────────────────────────────────────────────
const REGION_NIGERIA    = 'sr:category:68'
const REGION_ENGLAND    = 'sr:category:1'
const REGION_EUROPE     = 'sr:category:4'
const REGION_NBA        = 'sr:category:132'
const REGION_TENNIS_INT = 'sr:category:3'

// ─── League IDs ──────────────────────────────────────────────────────────────
const LEAGUE_NPFL        = 'sr:tournament:767'
const LEAGUE_LALIGA_NG   = 'sr:tournament:99001'  // fictional local cup
const LEAGUE_EPL         = 'sr:tournament:17'
const LEAGUE_CHAMPIONS   = 'sr:tournament:7'
const LEAGUE_NBA         = 'sr:tournament:132'
const LEAGUE_ATP_MASTERS = 'sr:tournament:2480'

async function main() {
  console.log('🌱  Seeding betway-backend database…')

  // ── Sports ───────────────────────────────────────────────────────────────
  await prisma.sport.upsert({
    where:  { sportId: SPORT_FOOTBALL },
    update: { name: 'Football', alias: 'soccer', sortIndex: 1 },
    create: { sportId: SPORT_FOOTBALL, name: 'Football', alias: 'soccer', sortIndex: 1 },
  })

  await prisma.sport.upsert({
    where:  { sportId: SPORT_BASKETBALL },
    update: { name: 'Basketball', alias: 'basketball', sortIndex: 2 },
    create: { sportId: SPORT_BASKETBALL, name: 'Basketball', alias: 'basketball', sortIndex: 2 },
  })

  await prisma.sport.upsert({
    where:  { sportId: SPORT_TENNIS },
    update: { name: 'Tennis', alias: 'tennis', sortIndex: 5 },
    create: { sportId: SPORT_TENNIS, name: 'Tennis', alias: 'tennis', sortIndex: 5 },
  })

  // ── Regions ──────────────────────────────────────────────────────────────
  await prisma.region.upsert({
    where:  { regionId: REGION_NIGERIA },
    update: { name: 'Nigeria', defaultName: 'Nigeria', sortIndex: 1 },
    create: { regionId: REGION_NIGERIA, sportId: SPORT_FOOTBALL, name: 'Nigeria', defaultName: 'Nigeria', sortIndex: 1 },
  })

  await prisma.region.upsert({
    where:  { regionId: REGION_ENGLAND },
    update: { name: 'England', defaultName: 'England', sortIndex: 2 },
    create: { regionId: REGION_ENGLAND, sportId: SPORT_FOOTBALL, name: 'England', defaultName: 'England', sortIndex: 2 },
  })

  await prisma.region.upsert({
    where:  { regionId: REGION_EUROPE },
    update: { name: 'Europe', defaultName: 'Europe', sortIndex: 3 },
    create: { regionId: REGION_EUROPE, sportId: SPORT_FOOTBALL, name: 'Europe', defaultName: 'Europe', sortIndex: 3 },
  })

  await prisma.region.upsert({
    where:  { regionId: REGION_NBA },
    update: { name: 'USA', defaultName: 'USA', sortIndex: 1 },
    create: { regionId: REGION_NBA, sportId: SPORT_BASKETBALL, name: 'USA', defaultName: 'USA', sortIndex: 1 },
  })

  await prisma.region.upsert({
    where:  { regionId: REGION_TENNIS_INT },
    update: { name: 'International', defaultName: 'International', sortIndex: 1 },
    create: { regionId: REGION_TENNIS_INT, sportId: SPORT_TENNIS, name: 'International', defaultName: 'International', sortIndex: 1 },
  })

  // ── Leagues ──────────────────────────────────────────────────────────────
  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_NPFL },
    update: { name: 'Nigeria Premier Football League', defaultName: 'NPFL', friendlyName: 'NPFL', sortIndex: 1 },
    create: {
      leagueId: LEAGUE_NPFL,
      regionId: REGION_NIGERIA,
      sportId:  SPORT_FOOTBALL,
      name: 'Nigeria Premier Football League',
      defaultName: 'NPFL',
      friendlyName: 'NPFL',
      sortIndex: 1,
    },
  })

  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_LALIGA_NG },
    update: { name: 'Nigeria FA Cup', defaultName: 'Nigeria FA Cup', friendlyName: 'Nigeria FA Cup', sortIndex: 2 },
    create: {
      leagueId: LEAGUE_LALIGA_NG,
      regionId: REGION_NIGERIA,
      sportId:  SPORT_FOOTBALL,
      name: 'Nigeria FA Cup',
      defaultName: 'Nigeria FA Cup',
      friendlyName: 'Nigeria FA Cup',
      sortIndex: 2,
    },
  })

  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_EPL },
    update: { name: 'English Premier League', defaultName: 'Premier League', friendlyName: 'EPL', sortIndex: 1 },
    create: {
      leagueId: LEAGUE_EPL,
      regionId: REGION_ENGLAND,
      sportId:  SPORT_FOOTBALL,
      name: 'English Premier League',
      defaultName: 'Premier League',
      friendlyName: 'EPL',
      sortIndex: 1,
    },
  })

  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_CHAMPIONS },
    update: { name: 'UEFA Champions League', defaultName: 'Champions League', friendlyName: 'UCL', sortIndex: 1 },
    create: {
      leagueId: LEAGUE_CHAMPIONS,
      regionId: REGION_EUROPE,
      sportId:  SPORT_FOOTBALL,
      name: 'UEFA Champions League',
      defaultName: 'Champions League',
      friendlyName: 'UCL',
      sortIndex: 1,
    },
  })

  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_NBA },
    update: { name: 'NBA', defaultName: 'NBA', friendlyName: 'NBA', sortIndex: 1 },
    create: {
      leagueId: LEAGUE_NBA,
      regionId: REGION_NBA,
      sportId:  SPORT_BASKETBALL,
      name: 'NBA',
      defaultName: 'NBA',
      friendlyName: 'NBA',
      sortIndex: 1,
    },
  })

  await prisma.league.upsert({
    where:  { leagueId: LEAGUE_ATP_MASTERS },
    update: { name: 'ATP Masters 1000', defaultName: 'ATP Masters', friendlyName: 'ATP Masters', sortIndex: 1 },
    create: {
      leagueId: LEAGUE_ATP_MASTERS,
      regionId: REGION_TENNIS_INT,
      sportId:  SPORT_TENNIS,
      name: 'ATP Masters 1000',
      defaultName: 'ATP Masters',
      friendlyName: 'ATP Masters',
      sortIndex: 1,
    },
  })

  // ── Sample Events (Football) ──────────────────────────────────────────────
  const footballEvents = [
    {
      eventId: 10001,
      sportId: SPORT_FOOTBALL,
      leagueId: LEAGUE_NPFL,
      name: 'Enyimba vs Rivers United',
      homeTeam: 'Enyimba',
      awayTeam: 'Rivers United',
      startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 h from now
    },
    {
      eventId: 10002,
      sportId: SPORT_FOOTBALL,
      leagueId: LEAGUE_NPFL,
      name: 'Kano Pillars vs Lobi Stars',
      homeTeam: 'Kano Pillars',
      awayTeam: 'Lobi Stars',
      startTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
    },
    {
      eventId: 10003,
      sportId: SPORT_FOOTBALL,
      leagueId: LEAGUE_EPL,
      name: 'Arsenal vs Chelsea',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      startTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
    },
    {
      eventId: 10004,
      sportId: SPORT_FOOTBALL,
      leagueId: LEAGUE_EPL,
      name: 'Manchester City vs Liverpool',
      homeTeam: 'Manchester City',
      awayTeam: 'Liverpool',
      startTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
    {
      eventId: 10005,
      sportId: SPORT_FOOTBALL,
      leagueId: LEAGUE_CHAMPIONS,
      name: 'Real Madrid vs Bayern Munich',
      homeTeam: 'Real Madrid',
      awayTeam: 'Bayern Munich',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  ]

  for (const ev of footballEvents) {
    await prisma.event.upsert({
      where:  { eventId: ev.eventId },
      update: { name: ev.name, startTime: ev.startTime },
      create: {
        eventId:  ev.eventId,
        sportId:  ev.sportId,
        leagueId: ev.leagueId,
        name:     ev.name,
        homeTeam: ev.homeTeam,
        awayTeam: ev.awayTeam,
        startTime: ev.startTime,
      },
    })
  }

  // ── Sample Events (Basketball) ────────────────────────────────────────────
  const basketballEvents = [
    {
      eventId: 20001,
      sportId: SPORT_BASKETBALL,
      leagueId: LEAGUE_NBA,
      name: 'Los Angeles Lakers vs Boston Celtics',
      homeTeam: 'Los Angeles Lakers',
      awayTeam: 'Boston Celtics',
      startTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
    },
    {
      eventId: 20002,
      sportId: SPORT_BASKETBALL,
      leagueId: LEAGUE_NBA,
      name: 'Golden State Warriors vs Miami Heat',
      homeTeam: 'Golden State Warriors',
      awayTeam: 'Miami Heat',
      startTime: new Date(Date.now() + 5 * 60 * 60 * 1000),
    },
  ]

  for (const ev of basketballEvents) {
    await prisma.event.upsert({
      where:  { eventId: ev.eventId },
      update: { name: ev.name, startTime: ev.startTime },
      create: {
        eventId:  ev.eventId,
        sportId:  ev.sportId,
        leagueId: ev.leagueId,
        name:     ev.name,
        homeTeam: ev.homeTeam,
        awayTeam: ev.awayTeam,
        startTime: ev.startTime,
      },
    })
  }

  // ── Sample Events (Tennis) ────────────────────────────────────────────────
  const tennisEvents = [
    {
      eventId: 30001,
      sportId: SPORT_TENNIS,
      leagueId: LEAGUE_ATP_MASTERS,
      name: 'Carlos Alcaraz vs Novak Djokovic',
      homeTeam: 'Carlos Alcaraz',
      awayTeam: 'Novak Djokovic',
      startTime: new Date(Date.now() + 10 * 60 * 60 * 1000),
    },
    {
      eventId: 30002,
      sportId: SPORT_TENNIS,
      leagueId: LEAGUE_ATP_MASTERS,
      name: 'Jannik Sinner vs Rafael Nadal',
      homeTeam: 'Jannik Sinner',
      awayTeam: 'Rafael Nadal',
      startTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  ]

  for (const ev of tennisEvents) {
    await prisma.event.upsert({
      where:  { eventId: ev.eventId },
      update: { name: ev.name, startTime: ev.startTime },
      create: {
        eventId:  ev.eventId,
        sportId:  ev.sportId,
        leagueId: ev.leagueId,
        name:     ev.name,
        homeTeam: ev.homeTeam,
        awayTeam: ev.awayTeam,
        startTime: ev.startTime,
      },
    })
  }

  // ── Sample Markets & Outcomes for NPFL event ─────────────────────────────
  const mktMatchResult = 'mkt:10001:1x2'
  const mktBothScore   = 'mkt:10001:btts'

  await prisma.market.upsert({
    where:  { marketId: mktMatchResult },
    update: { displayName: 'Match Result', isSuspended: false },
    create: {
      marketId:    mktMatchResult,
      eventId:     10001,
      name:        '1X2',
      displayName: 'Match Result',
      sortIndex:   1,
    },
  })

  await prisma.market.upsert({
    where:  { marketId: mktBothScore },
    update: { displayName: 'Both Teams to Score', isSuspended: false },
    create: {
      marketId:    mktBothScore,
      eventId:     10001,
      name:        'BTTS',
      displayName: 'Both Teams to Score',
      sortIndex:   2,
    },
  })

  // Outcomes for 1X2
  const outcomes = [
    { outcomeId: 'out:10001:home', marketId: mktMatchResult, displayName: 'Enyimba',     num: 8,  den: 5  },
    { outcomeId: 'out:10001:draw', marketId: mktMatchResult, displayName: 'Draw',          num: 5,  den: 2  },
    { outcomeId: 'out:10001:away', marketId: mktMatchResult, displayName: 'Rivers United', num: 11, den: 4  },
    { outcomeId: 'out:10001:btts_yes', marketId: mktBothScore, displayName: 'Yes',         num: 8,  den: 11 },
    { outcomeId: 'out:10001:btts_no',  marketId: mktBothScore, displayName: 'No',          num: 11, den: 10 },
  ]

  for (const o of outcomes) {
    await prisma.outcome.upsert({
      where:  { outcomeId: o.outcomeId },
      update: { displayName: o.displayName },
      create: {
        outcomeId:   o.outcomeId,
        marketId:    o.marketId,
        eventId:     10001,
        displayName: o.displayName,
      },
    })

    // Fractional → decimal conversion for possibleWinnings
    const dec = (o.num / o.den + 1).toFixed(2)
    await prisma.price.upsert({
      where:  { outcomeId: o.outcomeId },
      update: { possibleWinnings: dec, possibleWinningsNum: o.num, possibleWinningsDen: o.den },
      create: {
        outcomeId:           o.outcomeId,
        possibleWinnings:    dec,
        possibleWinningsNum: o.num,
        possibleWinningsDen: o.den,
      },
    })
  }

  console.log('✅  Seed complete.')
  console.log(`   Sports:   3  (Football, Basketball, Tennis)`)
  console.log(`   Regions:  5`)
  console.log(`   Leagues:  6  (NPFL, Nigeria FA Cup, EPL, UCL, NBA, ATP Masters)`)
  console.log(`   Events:   9  (5 football, 2 basketball, 2 tennis)`)
  console.log(`   Markets:  2  (Match Result, BTTS — on first NPFL match)`)
  console.log(`   Outcomes: 5  + Prices`)
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
