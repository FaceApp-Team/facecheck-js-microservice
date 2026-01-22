import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStatus } from '../../generated/prisma/enums';
import { Logger } from '@nestjs/common';

@Processor('image')
export class ImageConsumer extends WorkerHost {
  logger = new Logger(ImageConsumer.name);
  constructor(
    private readonly helpers: HelpersService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      this.logger.log(`Processing image job: ${job.name}`);

      const { imageUrl, userId } = job.data;

      if (!imageUrl || !userId) {
        throw new Error('Missing imageUrl or userId in job data');
      }

      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          imageStatus: ImageStatus.PROCESSING,
          embeddingStatus: ImageStatus.PROCESSING,
        },
      });

      const result = await this.helpers.enrollFace(userId, imageUrl);

      this.logger.log(`Image processed for user ${userId}`);
      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          faceEmbedding: '',
          embeddingStatus: ImageStatus.UPLOADED,
        },
      });

      return { imageUrl: imageUrl, status: result.status };
    } catch (error) {
      this.logger.error(`Image processing failed: ${error.message}`);
      await this.prisma.user.update({
        where: {
          id: job.data.userId,
        },
        data: {
          imageStatus: ImageStatus.FAILED,
        },
      });
      throw error;
    }
  }
}
