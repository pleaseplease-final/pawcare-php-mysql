import { useLayoutEffect, useRef } from 'react';
import './clinic-dialog.css';

// Native modal dialogs make the workspace inert and support stacked review dialogs.
export default function ClinicDialog({children, onClose, label, labelledBy, style}) {
  const dialog = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element.showModal();
    const first = element.querySelector('[data-dialog-autofocus]') || element.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
    (first || element).focus({preventScroll:true});
    return () => {
      element.close();
      // Wait until React removes nested dialogs before restoring focus. The
      // original action can disappear when a visit changes status asynchronously.
      queueMicrotask(() => {
        const usable = opener?.isConnected && opener !== document.body && opener !== document.documentElement
          && !opener.matches(':disabled') && !opener.closest('dialog:not([open])');
        const activeDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
        const target = usable && (!activeDialog || activeDialog.contains(opener)) ? opener
          : activeDialog?.querySelector('button:not(:disabled), [tabindex="0"]') || document.querySelector('#portal-main');
        target?.focus({preventScroll:true});
      });
    };
  }, []);
  return <dialog ref={dialog} tabIndex={-1} className="clinic-dialog" aria-label={label} aria-labelledby={labelledBy}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close.current?.(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.target.closest('dialog') !== dialog.current) return;
      const controls = [...dialog.current.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')]
        .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length && el.closest('dialog') === dialog.current);
      const first = controls[0], last = controls.at(-1);
      if (!first || (event.shiftKey ? document.activeElement === first : document.activeElement === last) || !dialog.current.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }}>
    <div className="scrim" style={style} onMouseDown={event => { if (event.target === event.currentTarget) close.current?.(); }}>{children}</div>
  </dialog>;
}
