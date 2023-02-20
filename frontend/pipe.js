import { PUSH_PUBLIC_KEY } from '/vars.js';
import { urlB64ToUint8Array } from '/b64.js';

async function main() {
  if (!('serviceWorker' in navigator)) {
    showError("You might have an old or restricted browser that can't support notifications.");
    return;
  }

  try {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.link) {
        window.location.hash = event.data.link;
      }
    });

    const registration = await navigator.serviceWorker.register('/sw.js');
    const button = document.getElementById('subscription-button');

    const subscription = await registration.pushManager.getSubscription();

    if (subscription !== null) {
      const { subscribed } = await fetch(location.href, {
        method: 'POST',
        headers: { 'snd-action': 'check', },
        body: JSON.stringify(subscription),
      }).then(r => r.json());

      if (subscribed) {
        button.textContent = 'Stop notifications for this snd';
        button.onclick = unsubscribe(registration);
        return;
      }
    }

    button.textContent = 'Get notifications for this snd';
    button.onclick = subscribe(registration);
  } catch (e) {
    showError(JSON.stringify(e));
  }
}

function showError(text) {
  const error = document.getElementById('error');
  error.style.display = 'initial';
  error.textContent = text;
}

// Called on "get notifications" button click
function subscribe(registration) {
  return async (event) => {
    const button = event.target;
    button.textContent = 'Subscribing...';
    button.onclick = null;
    button.disabled = true;

    try {
      const subscription = await registration.pushManager.getSubscription();
      const newSubscription = subscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(PUSH_PUBLIC_KEY),
      });

      await fetch(location.href, {
        method: 'POST',
        headers: { 'snd-action': 'subscribe', },
        body: JSON.stringify(newSubscription),
      });

      button.textContent = 'Subscribed! Click again to unsubscribe';
      button.onclick = unsubscribe(registration);
      button.disabled = false;
    } catch (e) {
      if (Notification.permission === 'denied') {
        button.textContent = 'Notifications request denied';
        button.title = 'If this was a mistake, you can undo it with one of the settings buttons near your address bar. Refresh the page after doing so.'
      } else {
        throw e;
      }
    }
  }
}

// Called on "stop notifications" button click
function unsubscribe(registration) {
  return async (event) => {
    const button = event.target;
    button.textContent = 'Unsubscribing...';
    button.onclick = null;
    button.disabled = true;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await Promise.all([
        fetch(location.href, {
          method: 'POST',
          headers: { 'snd-action': 'unsubscribe', },
          body: JSON.stringify(subscription),
        }),
      ]);
    }

    button.textContent = 'Unsubscribed. Click again to re-subscribe';
    button.onclick = subscribe(registration);
    button.disabled = false;
  }
}

main();