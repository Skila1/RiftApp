const MESSAGE_JUMP_HIGHLIGHT_CLASS = 'rift-message-jump-highlight';
const MESSAGE_JUMP_TIMER_DATASET_KEY = 'riftMessageJumpTimer';
const MESSAGE_JUMP_TIMEOUT_MS = 1800;

function readExistingTimer(target: HTMLElement) {
  const rawValue = target.dataset[MESSAGE_JUMP_TIMER_DATASET_KEY];
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function jumpToMessageElement(target: HTMLElement) {
  const previousTimer = readExistingTimer(target);
  if (previousTimer != null) {
    window.clearTimeout(previousTimer);
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove(MESSAGE_JUMP_HIGHLIGHT_CLASS);
  void target.offsetWidth;
  target.classList.add(MESSAGE_JUMP_HIGHLIGHT_CLASS);

  const timer = window.setTimeout(() => {
    target.classList.remove(MESSAGE_JUMP_HIGHLIGHT_CLASS);
    delete target.dataset[MESSAGE_JUMP_TIMER_DATASET_KEY];
  }, MESSAGE_JUMP_TIMEOUT_MS);

  target.dataset[MESSAGE_JUMP_TIMER_DATASET_KEY] = String(timer);
  return true;
}

export function jumpToMessageId(messageId: string) {
  const target = document.getElementById(`message-${messageId}`) as HTMLElement | null;
  if (!target) {
    return false;
  }

  return jumpToMessageElement(target);
}