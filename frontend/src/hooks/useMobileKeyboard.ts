import { useEffect, useState } from 'react';
import { setupKeyboardListeners, isNative } from '../lib/capacitor';

export function useMobileKeyboard() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!isNative()) return;

    return setupKeyboardListeners({
      onShow: (height) => {
        setKeyboardHeight(height);
        setKeyboardVisible(true);
      },
      onHide: () => {
        setKeyboardHeight(0);
        setKeyboardVisible(false);
      },
    });
  }, []);

  return { keyboardHeight, keyboardVisible };
}
