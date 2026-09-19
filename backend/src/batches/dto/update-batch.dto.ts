import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateBatchDto } from './create-batch.dto';

/** Everything editable except `reference` (a stable human label) and `status` (own endpoints). */
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, ['reference'] as const),
) {}
