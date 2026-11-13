import "server-only";

export type InviteDeliveryInput = {
  email: string;
  inviteUrl: string;
  inviterName: string;
};

/**
 * How an invitation reaches its recipient. Version 1 ships link delivery only
 * (the inviter copies the link). An email-sending implementation can replace
 * `linkDelivery` later without touching the invitation service.
 */
export interface InviteDelivery {
  deliver(invite: InviteDeliveryInput): Promise<{ method: "link" }>;
}

/** No sending: the UI shows the link for the inviter to copy and share. */
export const linkDelivery: InviteDelivery = {
  async deliver() {
    return { method: "link" };
  },
};
