import {noteChoiceError} from './formValidation.js';

export const noteLines=text=>text.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);

export function readNoteOptions(data) {
  const options={};
  if(!Number.isSafeInteger(data?.revision) || data.revision<0 || !data.options || Array.isArray(data.options))throw Error('The clinic did not return the saved choices and revision. Reload saved choices before continuing.');
  for(const key of ['diagnosis','treatment']) {
    const list=data.options[key];
    if(!Array.isArray(list) || list.some(value=>typeof value!=='string' || !value.trim() || /[\r\n]/.test(value)) || noteChoiceError(list.join('\n')))throw Error('The clinic returned incomplete diagnosis or treatment choices. Reload saved choices before continuing.');
    options[key]=list.map(value=>value.trim());
  }
  return {revision:data.revision,options};
}

export function savedNoteOptions(data,revision,options) {
  try {
    const result=readNoteOptions(data);
    if(result.revision!==revision+1 || !['diagnosis','treatment'].every(key=>JSON.stringify(result.options[key])===JSON.stringify(options[key])))throw Error();
    return result;
  } catch {
    throw Object.assign(Error('The clinic did not confirm these saved choices. Your entries are retained; reload saved choices to check the result before saving again.'),{unconfirmed:true});
  }
}
