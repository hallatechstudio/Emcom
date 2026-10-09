import type { Community, CommunityIdentificationField, CommunityMembership } from '@prisma/client';
import type { CommunityDto, CommunityPreviewDto, MembershipDto } from '@emcom/shared-types';
import { isAdminRole } from '@emcom/shared-types';

type CommunityWithField = Community & { identificationField: CommunityIdentificationField | null };

export function toPreviewDto(c: CommunityWithField): CommunityPreviewDto {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    location: c.location,
    description: c.description,
    identificationField: c.identificationField
      ? { label: c.identificationField.label, required: c.identificationField.required }
      : null,
  };
}

export function toCommunityDto(c: CommunityWithField, viewer?: CommunityMembership): CommunityDto {
  const showCode = viewer?.status === 'APPROVED' && isAdminRole(viewer.role);
  return {
    ...toPreviewDto(c),
    whatsappUrl: c.whatsappUrl,
    createdAt: c.createdAt.toISOString(),
    ...(showCode ? { inviteCode: c.inviteCode, inviteCodeRotatedAt: c.inviteCodeRotatedAt.toISOString() } : {}),
  };
}

export function toMembershipDto(m: CommunityMembership): MembershipDto {
  return {
    id: m.id,
    communityId: m.communityId,
    userId: m.userId,
    role: m.role,
    status: m.status,
    identificationValue: m.identificationValue,
    requestedAt: m.requestedAt.toISOString(),
    decidedAt: m.decidedAt?.toISOString() ?? null,
    updatedAt: m.updatedAt.toISOString(),
  };
}
