import prisma from '@/lib/db'

export const UNKNOWN_SUBMISSION_PREFIX = 'submission_unknown:'

/** A lost RPC response or post-send write is never evidence that funds stayed put. */
export async function holdUnknownWithdrawal(
  id: string,
  status: string,
  operationId?: string
): Promise<void> {
  try {
    await prisma.transaction.updateMany({
      where: { id, type: 'withdrawal', status },
      data: {
        failReason: `${UNKNOWN_SUBMISSION_PREFIX} Manual wallet reconciliation required before refund or retry.`,
        ...(operationId ? { operationId } : {}),
      },
    })
  } catch (error) {
    // The pre-send reservation remains durable even when this diagnostic write fails.
    console.error('[Withdrawal] Unable to record uncertain submission', { id, operationId, error })
  }
}
