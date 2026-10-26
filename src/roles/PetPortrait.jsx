import { Camera, X } from "lucide-react";
import { Avatar, Icon } from "./owner/ui.jsx";
import "./pet-portrait.css";

export default function PetPortrait({ pet, inputRef, onChange, onRemove }) {
  return <div className="pet-portrait">
    <button type="button" className="pet-portrait-photo" onClick={() => inputRef.current?.click()} aria-label={`Choose photo for ${pet.name}`}>
      <Avatar src={pet.photo} fallback={<Icon n="paw" size={48} />} size={104} />
    </button>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} hidden />
    <button type="button" className="pet-portrait-camera vc-noprint" onClick={() => inputRef.current?.click()} aria-label="Upload pet photo"><Camera size={16} aria-hidden="true" /></button>
    {pet.photo && <button type="button" className="pet-portrait-remove vc-noprint" onClick={onRemove} aria-label="Remove pet photo"><X size={14} aria-hidden="true" /></button>}
  </div>;
}
