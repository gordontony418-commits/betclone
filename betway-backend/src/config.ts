import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

function getEnv(key: string, defaultValue: string): string {
  const value = process.env[key]
  if (!value) {
    console.warn(`[config] WARNING: ${key} is not set — using default: "${defaultValue}"`)
    return defaultValue
  }
  return value
}

export const config = {
  DATABASE_URL:    getEnv('DATABASE_URL',    'file:./prisma/betway.db'),
  PORT:            parseInt(getEnv('PORT',   '4000'), 10),
  BACKEND_URL:     getEnv('BACKEND_URL',     'http://localhost:4000'),
  SPORTS_DOMAIN:   getEnv('SPORTS_DOMAIN',   'https://feeds-roa2.betwayafrica.com/br/_apis/sport'),
  AUTH_DOMAIN:     getEnv('AUTH_DOMAIN',     'https://api.betwayafrica.com'),
  PLAYER_DOMAIN:   getEnv('PLAYER_DOMAIN',   'https://api.betwayafrica.com'),
  BETTING_DOMAIN:  getEnv('BETTING_DOMAIN',  'https://api.betwayafrica.com'),
  CMS_DOMAIN:      getEnv('CMS_DOMAIN',      'https://cms1.betwayafrica.com'),
  API_DOMAIN:      getEnv('API_DOMAIN',      'https://api.betwayafrica.com/api'),
  APIC_DOMAIN:     getEnv('APIC_DOMAIN',     'https://apic.betwayafrica.com/api'),
  CASINO_API_DOMAIN: getEnv('CASINO_API_DOMAIN', 'https://casinoapi.betwayafrica.com/api'),
  CONFIG_DOMAIN:   getEnv('CONFIG_DOMAIN',   'https://config.betwayafrica.com'),
  SIGNALR_DOMAIN:  getEnv('SIGNALR_DOMAIN',  'https://signalrapi.betwayafrica.com'),
  PROMO_API_DOMAIN: getEnv('PROMO_API_DOMAIN', 'https://promoapi.betwayafrica.com'),
} as const

export type Config = typeof config
