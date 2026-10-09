import type { User } from '@prisma/client';
import type { UserDto } from '@emcom/shared-types';

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt.toISOString(),
  };
}
