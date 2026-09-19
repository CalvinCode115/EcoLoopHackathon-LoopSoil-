import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A business-rule violation with a stable machine-readable `code` the frontend can
 * switch on (e.g. INSUFFICIENT_POOL, INVALID_TRANSITION). Rendered by HttpExceptionFilter
 * as `{ statusCode, code, message }` — the one error shape for the whole API (§15).
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ statusCode: status, code, message }, status);
  }
}

export function invalidTransition(
  entity: string,
  from: string,
  to: string,
): DomainException {
  return new DomainException(
    'INVALID_TRANSITION',
    `${entity} cannot go from ${from} to ${to}`,
    HttpStatus.CONFLICT,
  );
}

/**
 * Enforce a state machine (CLAUDE.md §11). `transitions` lists the allowed targets per
 * current state; anything missing is a terminal state.
 */
export function assertTransition<S extends string>(
  entity: string,
  transitions: Record<S, readonly S[]>,
  from: S,
  to: S,
): void {
  if (!transitions[from]?.includes(to)) {
    throw invalidTransition(entity, from, to);
  }
}
