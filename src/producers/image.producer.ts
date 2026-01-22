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
      removeOnComplete: false,
      removeOnFail: false,
    });
    return job;
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  async getJobStatus(jobId: string): Promise<JobState | unknown> {
    const job = await this.imageQueue.getJob(jobId);
    if (!jobId) {
      throw new NotFoundException('Job not found');
    }
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const state = await job.getState();
    const values = await job.returnvalue;
    return {
      state,
      values,
    };
  }
}
