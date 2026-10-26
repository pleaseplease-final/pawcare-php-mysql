import {visitNextStep} from '../visitProgress.js';
export default function VisitNextStep({visit}) {
 const next=visitNextStep(visit);
 return <p className="visit-next-step"><b>Next · {next.by}:</b> {next.text}</p>;
}
