import { sequence } from 'astro/middleware'

import logger from './logger'

export const onRequest = sequence(logger)
