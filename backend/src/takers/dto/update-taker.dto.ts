import { PartialType } from '@nestjs/mapped-types';
import { CreateBulkTakerDto } from './create-bulk-taker.dto';

/**
 * Profile fields only. `status` is deliberately not editable here — every status change
 * now needs an audit trail (statusReason / statusChangedBy / statusChangedAt), which only
 * the dedicated /approve, /decline, /suspend, /reinstate endpoints populate correctly.
 */
export class UpdateTakerDto extends PartialType(CreateBulkTakerDto) {}
