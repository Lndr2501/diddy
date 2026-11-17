/**
 * Taking a notification back once its message is read: here or on another device of the same
 * account (#256). Pure rules without browser or Matrix client so they can be tested.
 */
import type { ReceiptContent } from 'matrix-js-sdk/lib/@types/read_receipts';

/**
 * Whether a receipt event carries a receipt of this user. Any type counts (public or private),
 * in any thread: another device of the account may send either.
 */
export const hasReceiptOf = (content: ReceiptContent, userId: string): boolean =>
  Object.values(content ?? {}).some((byType) =>
    Object.values(byType ?? {}).some(
      (byUser) => !!byUser && Object.prototype.hasOwnProperty.call(byUser, userId)
    )
  );

/**
 * The newest event Diddy notified about per room (system notification or in-app toast), so the
 * notification can go once that event is read.
 */
export class NotifiedEvents {
  private readonly rooms = new Map<string, string>();

  note(roomId: string, eventId: string): void {
    this.rooms.set(roomId, eventId);
  }

  forget(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /** Still the room's newest notified event, not read yet. */
  isNoted(roomId: string, eventId: string): boolean {
    return this.rooms.get(roomId) === eventId;
  }

  /**
   * True when the room has a notification whose event `isRead` reports as read now. The room is
   * forgotten then, so the notification is taken back once.
   */
  takeRead(roomId: string, isRead: (eventId: string) => boolean): boolean {
    const eventId = this.rooms.get(roomId);
    if (!eventId || !isRead(eventId)) return false;
    this.rooms.delete(roomId);
    return true;
  }
}
