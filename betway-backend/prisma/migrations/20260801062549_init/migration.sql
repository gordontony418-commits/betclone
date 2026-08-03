-- CreateTable
CREATE TABLE "Sport" (
    "sportId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "isEsport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Region" (
    "regionId" TEXT NOT NULL PRIMARY KEY,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultName" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 999,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Region_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("sportId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "League" (
    "leagueId" TEXT NOT NULL PRIMARY KEY,
    "regionId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultName" TEXT NOT NULL,
    "friendlyName" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "shouldDisplay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "League_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("regionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "eventId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "isTwoUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shouldDisplay" BOOLEAN NOT NULL DEFAULT true,
    "isProducerActive" BOOLEAN NOT NULL DEFAULT true,
    "homeTeam" TEXT,
    "awayTeam" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("sportId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("leagueId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Market" (
    "marketId" TEXT NOT NULL PRIMARY KEY,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "isCashOutAllowed" BOOLEAN NOT NULL DEFAULT false,
    "isSquashedMarket" BOOLEAN NOT NULL DEFAULT false,
    "shouldDisplay" BOOLEAN NOT NULL DEFAULT true,
    "originalMarketId" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Market_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Outcome" (
    "outcomeId" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "sbv" TEXT,
    "index" INTEGER NOT NULL DEFAULT 0,
    "handicap" REAL NOT NULL DEFAULT 0,
    "shouldDisplay" BOOLEAN NOT NULL DEFAULT true,
    "originalMarketId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Outcome_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("marketId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Price" (
    "outcomeId" TEXT NOT NULL PRIMARY KEY,
    "possibleWinnings" TEXT NOT NULL,
    "possibleWinningsNum" INTEGER NOT NULL DEFAULT 0,
    "possibleWinningsDen" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Price_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "Outcome" ("outcomeId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "scoreId" TEXT NOT NULL PRIMARY KEY,
    "eventId" INTEGER NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT,
    "minute" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Score_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "mobileNumber" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'NG',
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "defaultBetSize" REAL NOT NULL DEFAULT 100,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BetSlip" (
    "betSlipId" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalOdds" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "potentialWin" REAL NOT NULL,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "BetSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BetSelection" (
    "selectionId" TEXT NOT NULL PRIMARY KEY,
    "betSlipId" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "marketId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "isEachWay" BOOLEAN NOT NULL DEFAULT false,
    "numberOfLines" INTEGER NOT NULL DEFAULT 1,
    "priceDec" REAL NOT NULL,
    "priceNum" INTEGER NOT NULL,
    "priceDen" INTEGER NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "BetSelection_betSlipId_fkey" FOREIGN KEY ("betSlipId") REFERENCES "BetSlip" ("betSlipId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserFavourite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "favouriteType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sportId" TEXT,
    "title" TEXT,
    "region" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CronCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Score_eventId_key" ON "Score"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavourite_userId_favouriteType_itemId_key" ON "UserFavourite"("userId", "favouriteType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CronCache_cacheKey_key" ON "CronCache"("cacheKey");
