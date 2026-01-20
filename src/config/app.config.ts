export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT || '3000', 10) || 3000,
    jwtSecret: process.env.JWT_SECRET || '',
    name: process.env.APP_NAME || 'FaceCheck',
    env: process.env.NODE_ENV || 'development',
    secretCode: process.env.FACE_CHECK_SECRET_CODE || '',
    prodUrl: process.env.APP_PROD_URL || 'http://localhost:3000',
    devUrl: process.env.APP_DEV_URL || 'http://localhost:3000',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
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
  face: {
    enrollUrl: process.env.FACE_ENROLL_ENDPOINT || '',
    minConfidenceThreshold:
      parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.6') || 0.6,
    recognizeUrl: process.env.FACE_RECOGNITION_ENDPOINT || '',
  },
});
