import {useState} from 'react';
import {TEXT_SIZES, getTextSize, setTextSize} from '../textSize.js';

// Three-step text size picker for the account menus.
export default function TextSize() {
  const [size, setSize] = useState(getTextSize);
  return <div className="ts-pick" role="group" aria-label="Text size">
    <span>Text size</span>
    <div>{TEXT_SIZES.map(([key, label], i) => <button key={key} type="button" aria-pressed={size === key} aria-label={label} title={label} style={{fontSize: `${14 + i * 4}px`}} onClick={() => { setTextSize(key); setSize(key); }}>A</button>)}</div>
  </div>;
}
