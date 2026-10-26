import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './submission-review.css';

function ReviewCard({ review, changed, finish }) {
  const dialog = useRef(null);
  const titleId = useId(), descriptionId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    element.querySelector('button').focus({preventScroll:true});
    const keyboard = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        element.close();
        finish(false);
      } else if (event.key === 'Tab') {
        const controls = [...element.querySelectorAll('[tabindex="0"], button:not(:disabled)')];
        const first = controls[0], last = controls.at(-1);
        if (!element.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      if (element.open) element.close();
    };
  }, []);
  const close = accepted => {
    dialog.current.close();
    finish(accepted);
  };
  return createPortal(
    <dialog ref={dialog} className="submission-review" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); close(false); }}
      onKeyDown={event => event.stopPropagation()}>
      <h3 id={titleId}>{review.title}</h3>
      <p id={descriptionId}>{review.description}</p>
      <dl tabIndex={0} aria-label="Details to review">{review.fields.map(([label, value], index) => <div key={index}>
        <dt>{label}</dt><dd>{value === '' || value === null || value === undefined ? 'Not provided' : value}</dd>
      </div>)}</dl>
      {changed && <p role="alert" className="err">The form or clinic record changed while you were reviewing. Go back and review the updated details before submitting.</p>}
      <div className="row end">
        <button type="button" className="btn ghost" autoFocus onClick={() => close(false)}>Back to edit</button>
        <button type="button" className="btn gold" disabled={changed} onClick={() => close(true)}>{review.confirmLabel}</button>
      </div>
    </dialog>, document.body
  );
}

// The context identifies the values and live records being reviewed. Changes
// invalidate approval; no API work begins until the caller receives true.
export function useSubmissionReview(context) {
  const key = JSON.stringify(context);
  const latestKey = useRef(key);
  latestKey.current = key;
  const pending = useRef(null);
  const [review, setReview] = useState(null);
  useEffect(() => () => { pending.current?.resolve(false); pending.current = null; }, []);
  const finish = accepted => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    setReview(null);
    current.resolve(accepted && current.key === latestKey.current);
  };
  const ask = details => {
    if (pending.current) return Promise.resolve(false);
    return new Promise(resolve => {
      pending.current = {key:latestKey.current, resolve};
      setReview({...details, key:latestKey.current});
    });
  };
  return {ask, card:review && <ReviewCard review={review} changed={review.key !== key} finish={finish} />};
}
