import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route (or whole controller) out of the global auth guard. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
