import {useEffect,useRef,useState} from 'react';
import {auth} from '../authApi.js';
import {toSquare} from '../roles/owner/ui.jsx';

// Both card views apply only a confirmed photo; other patient fields may have
// changed while the request was in flight.
export function usePetPhoto(petId,setDb) {
  const fileInputRef=useRef(null),photoFlight=useRef(false);
  const [photoBusy,setPhotoBusy]=useState(false),[photoError,setPhotoError]=useState(''),[photoStatus,setPhotoStatus]=useState('');
  useEffect(()=>{setPhotoError('');setPhotoStatus('');},[petId]);
  useEffect(()=>{
    if(!photoBusy)return;
    const leave=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',leave);
    return()=>window.removeEventListener('beforeunload',leave);
  },[photoBusy]);
  const savePhoto = async (file = null) => {
    if (photoFlight.current) return;
    photoFlight.current = true; setPhotoBusy(true); setPhotoError(""); setPhotoStatus("");
    try {
      let photo = "";
      if (file) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Error("Only JPG, PNG or WEBP pictures are allowed.");
        if (file.size > 5 * 1024 * 1024) throw Error("That picture is too big. The limit is 5 MB.");
        try { photo = await toSquare(file); }
        catch (error) { throw Error(error.message === "small" ? "Picture is too small. Use at least 64 × 64 pixels." : "We couldn’t read that picture. Try another one."); }
      }
      const result = await auth.petPhoto(petId, photo);
      if (!result?.success || result.pet?.id !== petId || result.pet.photo !== photo) {
        throw Error("The clinic did not confirm the photo change. Refresh the patient record before retrying.");
      }
      // A photo response must not overwrite newer measurements or patient details.
      setDb(d => ({...d,pets:(d.pets || []).map(x => x.id === petId ? {...x,photo:result.pet.photo} : x)}));
      setPhotoStatus(photo ? "Pet photo saved." : "Pet photo removed.");
    } catch (error) { setPhotoError(error.message || "The photo could not be saved. Please try again."); }
    finally { photoFlight.current = false; setPhotoBusy(false); }
  };

  const handlePhotoFileChange = e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void savePhoto(file);
  };

  return {fileInputRef,photoFlight,photoBusy,photoError,photoStatus,savePhoto,handlePhotoFileChange};
}
