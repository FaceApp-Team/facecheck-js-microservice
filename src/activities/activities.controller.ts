import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Patch,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateModuleDto,
  UpdateModuleDto,
  CreateSubtopicDto,
  UpdateSubtopicDto,
  CreateTimetableDto,
  UpdateTimetableDto,
  CreateTimetableSlotDto,
  UpdateTimetableSlotDto,
} from '../dto/activities.dto';
import { Request } from 'express';

@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ============================================
  // MODULES ENDPOINTS
  // ============================================

  /**
   * GET /activities/modules
   * List all modules (with optional filters: level, semester)
   */
  @Get('modules')
  async getModules(
    @Query('level') level?: string,
    @Query('semester') semester?: string,
  ) {
    return this.activitiesService.getModules(
      level ? parseInt(level) : undefined,
      semester ? parseInt(semester) : undefined,
    );
  }

  /**
   * GET /activities/modules/:id
   * Get single module with subtopics and timetables
   */
  @Get('modules/:id')
  async getModuleById(@Param('id') id: string) {
    return this.activitiesService.getModuleById(id);
  }

  /**
   * POST /activities/modules
   * Create new module (Admin/System Admin only)
   */
  @Post('create-modules')
  async createModule(@Body() dto: CreateModuleDto, @Req() req: Request) {
    const email = await (req.user as any)?.email;
    return this.activitiesService.createModule(dto, email);
  }

  /**
   * PUT /activities/modules/:id
   * Update module (Admin/System Admin only)
   */
  @Patch('update-modules/:id')
  async updateModule(
    @Param('id') id: string,
    @Body() dto: UpdateModuleDto,
    @Req() req: Request,
  ) {
    const email = await (req.user as any)?.email;
    return this.activitiesService.updateModule(id, dto, email);
  }

  /**
   * DELETE /activities/modules/:id
   * Delete module (cascades to subtopics, timetables, slots)
   */
  @Delete('modules/:id')
  async deleteModule(@Param('id') id: string, @Req() req: any) {
    return this.activitiesService.deleteModule(id, req.user.email);
  }

  // ============================================
  // SUBTOPICS ENDPOINTS
  // ============================================

  /**
   * GET /activities/modules/:moduleId/subtopics
   * List subtopics for a module
   */
  @Get('modules/:moduleId/get-subtopics')
  async getSubtopics(@Param('moduleId') moduleId: string) {
    return this.activitiesService.getSubtopics(moduleId);
  }

  /**
   * POST /activities/modules/:moduleId/subtopics
   * Add subtopic to module (Admin/System Admin only)
   */
  @Post('modules/:moduleId/create-subtopic')
  async createSubtopic(
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateSubtopicDto,
    @Req() req: any,
  ) {
    return this.activitiesService.createSubtopic(moduleId, dto, req.user.email);
  }

  /**
   * PUT /activities/modules/:moduleId/subtopics/:id
   * Update subtopic (Admin/System Admin only)
   */
  @Patch('modules/:moduleId/update-subtopic/:id')
  async updateSubtopic(
    @Param('moduleId') moduleId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubtopicDto,
    @Req() req: any,
  ) {
    return this.activitiesService.updateSubtopic(
      moduleId,
      id,
      dto,
      req.user.email,
    );
  }

  /**
   * DELETE /activities/modules/:moduleId/subtopics/:id
   * Remove subtopic (Admin/System Admin only)
   */
  @Delete('modules/:moduleId/subtopics/:id')
  async deleteSubtopic(
    @Param('moduleId') moduleId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.activitiesService.deleteSubtopic(moduleId, id, req.user.email);
  }

  // ============================================
  // TIMETABLES ENDPOINTS
  // ============================================

  /**
   * GET /activities/timetables
   * List timetables (with optional filters: level, semester, academicYear)
   */
  @Get('timetables')
  async getTimetables(
    @Query('level') level?: string,
    @Query('semester') semester?: string,
    @Query('academicYear') academicYear?: string,
  ) {
    return this.activitiesService.getTimetables(
      level ? parseInt(level) : undefined,
      semester ? parseInt(semester) : undefined,
      academicYear,
    );
  }

  /**
   * GET /activities/timetables/:id
   * Get timetable with all slots
   */
  @Get('timetables/:id')
  async getTimetableById(@Param('id') id: string) {
    return this.activitiesService.getTimetableById(id);
  }

  /**
   * GET /activities/modules/:moduleId/timetable
   * Get timetable for a specific module
   */
  @Get('modules/:moduleId/timetable')
  async getModuleTimetable(
    @Param('moduleId') moduleId: string,
    @Query('academicYear') academicYear?: string,
  ) {
    return this.activitiesService.getModuleTimetable(moduleId, academicYear);
  }

  /**
   * POST /activities/timetables
   * Create/update timetable metadata (Admin/System Admin only)
   */
  @Post('create-timetable')
  async createTimetable(@Body() dto: CreateTimetableDto, @Req() req: Request) {
    const email = await (req.user as any)?.email;
    return this.activitiesService.createTimetable(dto, email);
  }

  /**
   * PUT /activities/timetables/:id
   * Update timetable settings (Admin/System Admin only)
   */
  @Patch('update-timetable/:id')
  async updateTimetable(
    @Param('id') id: string,
    @Body() dto: UpdateTimetableDto,
    @Req() req: any,
  ) {
    return this.activitiesService.updateTimetable(id, dto, req.user.email);
  }

  /**
   * DELETE /activities/timetables/:id
   * Delete timetable (cascades to slots)
   */
  @Delete('timetables/:id')
  async deleteTimetable(@Param('id') id: string, @Req() req: any) {
    return this.activitiesService.deleteTimetable(id, req.user.email);
  }

  // ============================================
  // TIMETABLE SLOTS ENDPOINTS
  // ============================================

  /**
   * GET /activities/timetables/:timetableId/slots
   * List slots for a timetable (with optional week filter)
   */
  @Get('timetables/:timetableId/slots')
  async getTimetableSlots(
    @Param('timetableId') timetableId: string,
    @Query('week') week?: string,
  ) {
    return this.activitiesService.getTimetableSlots(
      timetableId,
      week ? parseInt(week) : undefined,
    );
  }

  /**
   * POST /activities/timetables/:timetableId/slots
   * Add time slot to timetable (Admin/System Admin only)
   */
  @Post('timetables/:timetableId/slots')
  async createTimetableSlot(
    @Param('timetableId') timetableId: string,
    @Body() dto: CreateTimetableSlotDto,
    @Req() req: any,
  ) {
    return this.activitiesService.createTimetableSlot(
      timetableId,
      dto,
      req.user.email,
    );
  }

  /**
   * PUT /activities/timetables/:timetableId/slots/:id
   * Update time slot (Admin/System Admin only)
   */
  @Patch('timetables/:timetableId/slots/:id')
  async updateTimetableSlot(
    @Param('timetableId') timetableId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTimetableSlotDto,
    @Req() req: any,
  ) {
    return this.activitiesService.updateTimetableSlot(
      timetableId,
      id,
      dto,
      req.user.email,
    );
  }

  /**
   * DELETE /activities/timetables/:timetableId/slots/:id
   * Remove time slot (Admin/System Admin only)
   */
  @Delete('timetables/:timetableId/slots/:id')
  async deleteTimetableSlot(
    @Param('timetableId') timetableId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.activitiesService.deleteTimetableSlot(
      timetableId,
      id,
      req.user.email,
    );
  }

  // ============================================
  // LECTURER SCHEDULE
  // ============================================

  /**
   * GET /activities/lecturers/:lecturerId/schedule
   * Get lecturer's teaching schedule
   */
  @Get('lecturers/:lecturerId/schedule')
  async getLecturerSchedule(@Param('lecturerId') lecturerId: string) {
    return this.activitiesService.getLecturerSchedule(lecturerId);
  }
}
