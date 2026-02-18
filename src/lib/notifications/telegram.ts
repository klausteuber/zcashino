type TelegramSendMessagePayload = {
  chat_id: string
  text: string
  disable_web_page_preview?: boolean
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const payload: TelegramSendMessagePayload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[Telegram] sendMessage failed:', res.status, body)
    }
  } catch (error) {
    console.error('[Telegram] sendMessage error:', error)
  }
}

