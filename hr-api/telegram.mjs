// Send the finished PDF to HR through the Telegram Bot API. The token never reaches the browser.
export async function sendResume({ token, chatId, pdf, filename, position }) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `Новая анкета: ${position}`);
  form.append('document', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(25000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error('telegram_send_failed');
  }
  return true;
}
