import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { HelpersService } from '../helpers/helpers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStatus } from '../../generated/prisma/enums';

@Processor('image')
export class ImageConsumer extends WorkerHost {
  constructor(
    private readonly helpers: HelpersService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      if (job.name === 'process-image') {
        const { imageUrl, userId } = job.data;

        await this.prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            imageStatus: ImageStatus.PROCESSING,
            embeddingStatus: ImageStatus.PROCESSING,
          },
        });

        await this.helpers.getFaceEmbedding();

        await this.prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            faceEmbedding: '',
            embeddingStatus: ImageStatus.UPLOADED,
          },
        });

        return { imageUrl: imageUrl, embedding: '' };
      }
    } catch (error) {
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
