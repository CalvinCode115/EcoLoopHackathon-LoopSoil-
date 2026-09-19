import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { TakerStatus } from '../../generated/prisma/client';
import { CreateBulkTakerDto } from './create-bulk-taker.dto';

export class UpdateTakerDto extends PartialType(CreateBulkTakerDto) {
  /** Manager can suspend / re-approve a taker. Vetting flow for individuals comes with claims. */
  @IsOptional()
  @IsEnum(TakerStatus)
  status?: TakerStatus;
}
