import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CourseJobs {
  private readonly logger = new Logger(CourseJobs.name);

  constructor(private readonly prisma: PrismaService) {}

  // Placeholder for course-related jobs
  // Example: Archive old courses, sync course data, etc.
}
