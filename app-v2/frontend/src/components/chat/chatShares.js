// CHAT-SHARE (03/10/2026): the reference types a chat message can carry in
// chat_messages.attachments ({ type, id, name }), with their icon - one list read by the composer
// (CpInput) and by the message (CpMessages), so a type cannot be offered by one and ignored by
// the other.
export const SHARE_ICONS = { client: '💼', task: '⚡', quote: '📄' }
