export class CustomWebhookNotifier {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async send(payload: string, headers?: Record<string, string>): Promise<void> {
    if (!this.url) return;
    if (!this.url.startsWith('https://')) {
      console.warn('[qa-sentinel] Webhook URL must use HTTPS');
      return;
    }

    try {
      await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: payload,
      });
      console.log('📤 Custom webhook notification sent');
    } catch (err) {
      console.error('Failed to send custom webhook notification:', err);
    }
  }
}
