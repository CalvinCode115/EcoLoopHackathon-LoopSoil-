import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import { PHOTO_MAX_BYTES } from '../supabase/supabase.service';
import {
  CreateHandoverDto,
  ListHandoversQueryDto,
  UpdateHandoverDto,
} from './dto/handover.dto';
import { HandoversService, type UploadedPhoto } from './handovers.service';

/** multipart/form-data with the image under the `photo` field; memory storage, 10 MB cap. */
const photoUpload = () =>
  FileInterceptor('photo', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } });

@Controller('handovers')
export class HandoversController {
  constructor(private readonly handovers: HandoversService) {}

  /**
   * Record a handover: multipart/form-data with `bookingId`, `actualKg` (NET), optional
   * `note`, `takerConfirmed`, `handedOverAt`, and the `photo` file.
   */
  @Roles(UserRole.MANAGER)
  @Post()
  @UseInterceptors(photoUpload())
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateHandoverDto,
    @UploadedFile() photo?: UploadedPhoto,
  ) {
    return this.handovers.create(dto, photo, user);
  }

  /** Attach or replace the photo — the follow-up when the upload failed at the bay. */
  @Roles(UserRole.MANAGER)
  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(photoUpload())
  attachPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo?: UploadedPhoto,
  ) {
    if (!photo) throw new BadRequestException('A `photo` file is required');
    return this.handovers.attachPhoto(id, photo);
  }

  /** Manager: all (filter by batch, taker, date range, missingPhoto). Taker: own. */
  @Get()
  list(@CurrentUser() user: User, @Query() q: ListHandoversQueryDto) {
    return this.handovers.list(q, user);
  }

  @Get(':id')
  getById(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.handovers.getById(id, user);
  }

  /** The taker confirms receipt of their own handover. */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.handovers.confirm(id, user);
  }

  @Roles(UserRole.MANAGER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHandoverDto,
  ) {
    return this.handovers.update(id, dto);
  }
}
