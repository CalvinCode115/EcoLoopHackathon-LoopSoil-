import type { PaginationQueryDto } from './dto/pagination-query.dto';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Prisma `skip` / `take` for a page query. */
export function pageArgs(q: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paginated<T>(
  data: T[],
  total: number,
  q: PaginationQueryDto,
): Paginated<T> {
  return {
    data,
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  };
}
