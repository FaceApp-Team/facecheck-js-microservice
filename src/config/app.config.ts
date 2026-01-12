export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT || '3000', 10) || 3000,
    jwtSecret: process.env.JWT_SECRET || '',
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
  mailer: {
    brevoApiKey: process.env.BREVO_API_KEY || '',
    brevoPort: parseInt(process.env.BREVO_PORT || '587', 10) || 587,
    brevoServer: process.env.BREVO_SERVER || '',
    brevoSmtpKey: process.env.BREVO_SMTP_KEY || '',
    brevoUser: process.env.BREVO_USER || '',
  },
  arkesel: {
    key: process.env.ARKESEL_SMS_API_KEY || '',
    url: process.env.ARKESEL_SMS_URL || '',
  },
});
