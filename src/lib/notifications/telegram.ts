type TelegramSendMessagePayload = {
  chat_id: string
  text: string
  disable_web_page_preview?: boolean
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096

function chunkTelegramMessage(text: string, chunkSize = 3500): string[] {
  // Telegram hard-limit is 4096 chars; keep a buffer for safety.
  const safeSize = Math.max(1, Math.min(chunkSize, TELEGRAM_MAX_MESSAGE_LENGTH))
  const chunks: string[] = []

  for (let i = 0; i < text.length; i += safeSize) {
    chunks.push(text.slice(i, i + safeSize))
  }

  return chunks.length > 0 ? chunks : ['']
}

export async function sendTelegramMessageToChat(
  chatId: string,
  text: string,
  options?: { disableWebPagePreview?: boolean }
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return

  const url = `https://api.telegram.org/bot${token}/sendMessage`

  try {
    const chunks = chunkTelegramMessage(text)
    for (const chunk of chunks) {
      const payload: TelegramSendMessagePayload = {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: options?.disableWebPagePreview ?? true,
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[Telegram] sendMessage failed:', res.status, body)
      }
    }
  } catch (error) {
    console.error('[Telegram] sendMessage error:', error)
  }
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!chatId) return
  await sendTelegramMessageToChat(chatId, text, { disableWebPagePreview: true })
}
