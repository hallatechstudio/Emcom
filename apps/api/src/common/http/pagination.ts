import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor returned as nextCursor by the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/** Cursor = base64url(createdAt|id) for stable keyset pagination on (createdAt desc, id desc). */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor?: string): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    const createdAt = new Date(iso!);
    if (!id || Number.isNaN(createdAt.getTime())) return undefined;
    return { createdAt, id };
  } catch {
    return undefined;
  }
}

export function keysetWhere(cursor?: string) {
  const c = decodeCursor(cursor);
  if (!c) return {};
  return {
    OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }],
  };
}

export function page<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}
