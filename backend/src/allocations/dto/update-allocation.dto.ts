import { PickType, PartialType } from '@nestjs/mapped-types';
import { CreateAllocationDto } from './create-allocation.dto';

/** Only the amount and note can change; batch/taker are fixed — cancel and re-create instead. */
export class UpdateAllocationDto extends PartialType(
  PickType(CreateAllocationDto, ['allocatedKg', 'note'] as const),
) {}
