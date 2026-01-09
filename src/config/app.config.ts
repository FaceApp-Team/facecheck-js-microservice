export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT || '3000', 10) || 3000,
    jwtSecret: process.env.JWT_SECRET || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
});
