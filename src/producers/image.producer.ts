import { Injectable, NotFoundException } from '@nestjs/common';
import { Job, JobState, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class ImageProducer {
  constructor(@InjectQueue('image') private imageQueue: Queue) {}

  async addImageJob(
    imageData: Record<string, any>,
  ): Promise<Job<any, any, string>> {
    const job = await this.imageQueue.add('process-image', imageData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    return job;
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  async getJobStatus(jobId: string): Promise<JobState | unknown> {
    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return await job.getState();
  }
}
